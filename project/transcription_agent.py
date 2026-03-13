import logging
import os
import asyncio
import requests
import aiohttp
from dotenv import load_dotenv
from livekit import rtc, api
from livekit.agents import stt
from livekit.plugins import groq, silero
from livekit.agents.utils import http_context

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("transcription-agent")

# Load environment variables
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(root_dir, ".env"))

# n8n Webhook URL (from environment or local default)
N8N_WEBHOOK_URL = os.getenv("N8N_WEBHOOK_URL", "http://localhost:5678/webhook/livekit-segment-ingest")
INGEST_TOKEN = os.getenv("LIVEKIT_INGEST_TOKEN", "my_secret_ingest_token")

async def run_agent():
    print("ENTRY: Starting run_agent loop...", flush=True)
    # Fix the RuntimeError: Attempted to use an http session outside of a job context
    try:
        session_factory = http_context._new_session_ctx()
        print("DEBUG: session_factory initialized.", flush=True)
    except Exception as e:
        print(f"ERROR: Failed to initialize session_factory: {e}", flush=True)
        return
    
    url = os.getenv("LIVEKIT_URL")
    api_key = os.getenv("LIVEKIT_API_KEY")
    api_secret = os.getenv("LIVEKIT_API_SECRET")
    
    print(f"DEBUG: Credentials - URL: {url}, Key present: {bool(api_key)}", flush=True)

    if not all([url, api_key, api_secret]):
        print("ERROR: Missing LiveKit credentials in .env", flush=True)
        logger.error("Missing LiveKit credentials in .env")
        return

    # Generate token for direct participation in 'clinical-room'
    try:
        token = api.AccessToken(api_key, api_secret) \
            .with_identity("TranscriptionBot") \
            .with_name("Transcription Bot") \
            .with_grants(api.VideoGrants(room_join=True, room="clinical-room")) \
            .to_jwt()
        print("DEBUG: Token generated successfully.", flush=True)
    except Exception as e:
        print(f"ERROR: Failed to generate token: {e}", flush=True)
        return

    room = rtc.Room()
    print(f"--- ATTEMPTING CONNECTION to LiveKit at {url} ---", flush=True)
    
    try:
        await room.connect(url, token)
        print(f"--- SUCCESS: Connected to Room: {room.name} ---", flush=True)
    except Exception as e:
        print(f"ERROR: Failed to connect to room: {e}", flush=True)
        logger.error(f"Failed to connect to room: {e}")
        return

    # STT Instance - Using Turbo for faster response
    # Use StreamAdapter to avoid the broken OpenAI Realtime/WebSocket implementation in Groq plugin
    try:
        raw_stt = groq.STT(model="whisper-large-v3-turbo")
        stt_engine = stt.StreamAdapter(stt=raw_stt, vad=silero.VAD.load())
        print("DEBUG: STT Engine (Adapted) initialized.", flush=True)
    except Exception as e:
        print(f"ERROR: Failed to initialize STT Engine: {e}", flush=True)
        return

    @room.on("participant_connected")
    def on_participant_connected(participant):
        print(f"EVENT: Participant CONNECTED: {participant.identity}", flush=True)
        logger.info(f"Participant connected: {participant.identity}")

    @room.on("participant_disconnected")
    def on_participant_disconnected(participant):
        print(f"EVENT: Participant DISCONNECTED: {participant.identity}", flush=True)
        logger.info(f"Participant disconnected: {participant.identity}")

    @room.on("track_published")
    def on_track_published(publication, participant):
        print(f"EVENT: Track PUBLISHED: {publication.sid} ({publication.kind}) from {participant.identity}", flush=True)
        if publication.kind == rtc.TrackKind.KIND_AUDIO:
            # LiveKit auto-subscribes by default, but we can be explicit if needed
            print(f"DEBUG: Setting track {publication.sid} to subscribed=True", flush=True)
            publication.set_subscribed(True)

    @room.on("track_subscribed")
    def on_track_subscribed(track, publication, participant):
        print(f"EVENT: Track SUBSCRIBED: {track.sid} from {participant.identity}", flush=True)
        if track.kind == rtc.TrackKind.KIND_AUDIO:
            logger.info(f"Subscribed to audio track {track.sid} from {participant.identity}")
            asyncio.create_task(transcribe_track(room, track, participant, stt_engine))

    @room.on("track_unsubscribed")
    def on_track_unsubscribed(track, publication, participant):
        print(f"EVENT: Track UNSUBSCRIBED: {track.sid} from {participant.identity}", flush=True)

    async def transcribe_track(room, track, participant, stt_engine):
        logger.info(f"--- Starting transcription for {participant.identity} ---")
        stt_stream = stt_engine.stream()
        audio_stream = rtc.AudioStream(track)
        
        async def pipe_audio():
            logger.info(f"--- Audio pipe STARTED for {participant.identity} (Track: {track.sid}) ---")
            frame_count = 0
            try:
                # audio_stream yields AudioFrameEvent, we need to pass event.frame
                async for event in audio_stream:
                    stt_stream.push_frame(event.frame)
                    frame_count += 1
                    if frame_count % 50 == 0:
                        logger.info(f"FEEDBACK: Received {frame_count} frames from {participant.identity}")
            except Exception as e:
                logger.error(f"CRITICAL Pipe failure for {participant.identity}: {e}")
            stt_stream.end_input()
            logger.info(f"--- Audio pipe CLOSED for {participant.identity}. Total frames: {frame_count} ---")

        async def handle_results():
            logger.info(f"--- Result handler STARTED for {participant.identity} ---")
            try:
                async for event in stt_stream:
                    logger.debug(f"STT Event received: {event.type}")
                    if event.type == stt.SpeechEventType.INTERIM_TRANSCRIPT or event.type == stt.SpeechEventType.FINAL_TRANSCRIPT:
                        is_final = (event.type == stt.SpeechEventType.FINAL_TRANSCRIPT)
                        transcript = event.alternatives[0].text.strip()
                        if not transcript:
                            continue
                        
                        logger.info(f"STT HIT ({'FINAL' if is_final else 'INTERIM'}): \"{transcript}\" from {participant.identity}")

                        # Publish to Room
                        try:
                            segment = rtc.TranscriptionSegment(
                                id=f"seg-{participant.identity}-{asyncio.get_event_loop().time()}",
                                text=transcript,
                                final=is_final,
                                start_time=0,
                                end_time=0,
                                language="en",
                            )
                            transcription = rtc.Transcription(
                                participant_identity=participant.identity,
                                track_sid=track.sid,
                                segments=[segment],
                            )
                            await room.local_participant.publish_transcription(transcription)
                            logger.info(f"PUBLISHED transcript to room for {participant.identity}")
                        except Exception as e:
                            logger.error(f"PUBLISH FAILED for {participant.identity}: {e}")
                        
                        if is_final:
                            # Forward to n8n
                            try:
                                payload = {
                                    "content": transcript,
                                    "speaker_role": "PATIENT" if "Patient" in participant.identity else "CLINICIAN",
                                    "speaker_label": participant.identity,
                                    "session_id": room.name,
                                    "participant_id": participant.identity,
                                    "start": 0,
                                    "end": 0
                                }
                                logger.info(f"n8n SENDING: {transcript}")
                                async with aiohttp.ClientSession() as session:
                                    async with session.post(N8N_WEBHOOK_URL, json=payload, headers={"x-api-key": INGEST_TOKEN}, timeout=5) as resp:
                                        logger.info(f"n8n RESPONSE: {resp.status}")
                            except Exception as e:
                                logger.error(f"n8n FORWARD FAILED: {e}")
            except Exception as e:
                logger.error(f"CRITICAL Error in handle_results for {participant.identity}: {e}")

        await asyncio.gather(pipe_audio(), handle_results())

    # Handle existing participants
    for p in room.remote_participants.values():
        for publication in p.track_publications.values():
            if publication.track and publication.track.kind == rtc.TrackKind.KIND_AUDIO:
                logger.info(f"Found existing audio track from {p.identity}")
                asyncio.create_task(transcribe_track(room, publication.track, p, stt_engine))

    # Periodic room status
    async def log_room_status():
        while True:
            try:
                participants = list(room.remote_participants.values())
                identities = [p.identity for p in participants]
                logger.info(f"HEARTBEAT: Room '{room.name}' has {len(participants)} remote participants: {identities}")
            except Exception as e:
                logger.error(f"Heartbeat error: {e}")
            await asyncio.sleep(10)

    asyncio.create_task(log_room_status())

    # Keep alive
    try:
        while True:
            await asyncio.sleep(1)
    finally:
        await session_factory().close()

if __name__ == "__main__":
    try:
        asyncio.run(run_agent())
    except Exception as e:
        print(f"CRITICAL: Agent died with error: {e}", flush=True)
        import traceback
        traceback.print_exc()
    finally:
        print("\n" + "="*40)
        input("Process finished. Press ENTER to close this window...")
