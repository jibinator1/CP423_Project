import base64
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, Request, BackgroundTasks, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from livekit import api
from pydantic import BaseModel, Field
import threading

try:
    from .clinical_ir import ClinicalIRSystem
except ImportError:
    from clinical_ir import ClinicalIRSystem


class SegmentPayload(BaseModel):
    content: str = Field(..., min_length=1)
    speaker_role: str = Field(..., min_length=1)
    patient_name: str | None = None
    speaker_label: str | None = None
    session_id: str | None = None
    participant_id: str | None = None
    start: float | None = None
    end: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AudioPayload(BaseModel):
    audio_b64: str = Field(..., min_length=1)
    speaker_role: str = Field(..., min_length=1)
    patient_name: str | None = None
    filename: str = "livekit_chunk.wav"
    session_id: str | None = None
    participant_id: str | None = None
    start_offset: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)


load_dotenv()
app = FastAPI(title="Clinical IR LiveKit Ingest Service")

# Add CORS middleware to allow the frontend to talk to the backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # For development; can be restricted to specific domains later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

bot: ClinicalIRSystem | None = None
ingest_token = os.getenv("LIVEKIT_INGEST_TOKEN", "").strip()

# In-memory store mapping session_id (room name) to patient_name for active livekit sessions
SESSION_PATIENTS: dict[str, str] = {}
_bot_lock = threading.Lock()

def _authorize(x_api_key: str | None) -> None:
    if ingest_token and x_api_key != ingest_token:
        raise HTTPException(status_code=401, detail="Unauthorized ingest request")


def _get_bot() -> ClinicalIRSystem:
    global bot
    if bot is None:
        with _bot_lock:
            if bot is None:
                bot = ClinicalIRSystem()
    return bot


@app.get("/health")
def health(background_tasks: BackgroundTasks) -> dict[str, str]:
    """Health check endpoint that also triggers model warmup in the background."""
    # Start warming up the models immediately in the background
    try:
        current_bot = _get_bot()
        background_tasks.add_task(current_bot.warmup)
    except Exception as e:
        print(f"Health check failed to start warmup: {e}")
        
    return {"status": "ok", "warmup": "started"}


@app.post("/livekit/segment")
def ingest_segment(payload: SegmentPayload, x_api_key: str | None = Header(default=None)) -> dict:
    _authorize(x_api_key)
    runtime_bot = _get_bot()

    role = payload.speaker_role.strip().upper()
    md = dict(payload.metadata or {})
    if payload.participant_id:
        md["participant_id"] = payload.participant_id

    # Resolve patient_name: use payload if provided, otherwise look up in session store
    session_id = payload.session_id or ""
    provided_name = (payload.patient_name or "").strip()
    if not provided_name or provided_name.lower() == "unknown":
        patient_name = SESSION_PATIENTS.get(session_id, "")
    else:
        patient_name = provided_name

    # Simple deduplication: don't index the same content for the same session twice in a row
    # This handles cases where both n8n and the agent might try to send the same segment
    last_indexed = getattr(runtime_bot, "_last_indexed_content", None)
    if last_indexed == (session_id, role, payload.content.strip()):
        return {"status": "skipped_duplicate"}
    
    record = runtime_bot.index_segment(
        content=payload.content,
        speaker_role=role,
        patient_name=patient_name,
        speaker_label=payload.speaker_label or "",
        session_id=session_id,
        start_time=payload.start or 0.0,
        end_time=payload.end or 0.0,
        source="livekit",
        metadata=md,
    )
    runtime_bot._last_indexed_content = (session_id, role, payload.content.strip())
    return {"status": "indexed", "record_id": record.get("id"), "speaker_role": role}


@app.post("/livekit/audio")
def ingest_audio(payload: AudioPayload, x_api_key: str | None = Header(default=None)) -> dict:
    _authorize(x_api_key)
    runtime_bot = _get_bot()

    try:
        audio_bytes = base64.b64decode(payload.audio_b64)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Invalid base64 audio payload: {exc}") from exc

    role = payload.speaker_role.strip().upper()
    transcribed_segments = runtime_bot.transcribe_audio_bytes(audio_bytes, filename=payload.filename)

    indexed_count = 0
    
    session_id = payload.session_id or ""
    patient_name = payload.patient_name or SESSION_PATIENTS.get(session_id, "")
    
    for seg in transcribed_segments:
        md = dict(payload.metadata or {})
        if payload.participant_id:
            md["participant_id"] = payload.participant_id

        runtime_bot.index_segment(
            content=seg["text"],
            speaker_role=role,
            patient_name=patient_name,
            speaker_label="",
            session_id=payload.session_id or "",
            start_time=payload.start_offset + float(seg["start"]),
            end_time=payload.start_offset + float(seg["end"]),
            source="livekit",
            metadata=md,
        )
        indexed_count += 1

    return {
        "status": "indexed",
        "speaker_role": role,
        "segments_indexed": indexed_count,
    }


import shutil
import tempfile

from fastapi import Form

@app.post("/api/upload_mp3")
async def upload_mp3(
    audio_file: UploadFile = File(...),
    patient_name: str = Form(""),
):
    runtime_bot = _get_bot()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_file:
        shutil.copyfileobj(audio_file.file, tmp_file)
        tmp_path = tmp_file.name

    try:
        roles = {"SPEAKER_00": "CLINICIAN", "SPEAKER_01": "PATIENT"}
        runtime_bot.process_audio_file(tmp_path, roles, patient_name)
        
        full_transcript = runtime_bot.get_full_transcript()
        top_result = None
        if full_transcript.strip():
            summary = runtime_bot.generate_clinical_summary(full_transcript)
            
            # Execute a search to find the most relevant segment across the whole conversation
            results = runtime_bot.search_segments(
                query_text=full_transcript, 
                top_k=1,
                patient_name=patient_name if patient_name else None
            )
            if results:
                top_result = results[0]
            
        return {
            "summary": summary, 
            "top_result": top_result,
            "transcript": full_transcript
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/api/process_live_audio")
async def process_live_audio(
    audio_chunk: UploadFile = File(...),
    patient_name: str = Form(""),
):
    runtime_bot = _get_bot()
    
    try:
        audio_bytes = await audio_chunk.read()
        transcribed_segments = runtime_bot.transcribe_audio_bytes(audio_bytes, filename=audio_chunk.filename)
        
        role = "CLINICIAN" 
        indexed_count = 0
        full_text = ""
        for seg in transcribed_segments:
            runtime_bot.index_segment(
                content=seg["text"],
                speaker_role=role,
                patient_name=patient_name,
                speaker_label="live_upload",
                session_id="",
                start_time=float(seg["start"]),
                end_time=float(seg["end"]),
                source="live_recording",
            )
            indexed_count += 1
            full_text += seg["text"] + " "
            
        summary = f"Recorded and indexed {indexed_count} segment(s)."
        top_result = None
        if full_text.strip():
            # Generate the true clinical summary using the LLM method
            summary = runtime_bot.generate_clinical_summary(full_text)
            
            results = runtime_bot.search_segments(
                query_text=full_text, top_k=1, patient_name=patient_name if patient_name else None
            )
            if results:
                top_result = results[0]
                
        return {
            "summary": summary, 
            "top_result": top_result, 
            "transcript": full_text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/livekit/summary")
def get_livekit_summary(session_id: str = Form(...), patient_name: str = Form("")):
    runtime_bot = _get_bot()
    try:
        full_transcript = runtime_bot.get_full_transcript(session_id=session_id, patient_name=patient_name if patient_name else None)
        if not full_transcript.strip():
            return {"summary": "No transcript available for this session.", "top_result": None}

        # Fix the CLINICIAN/PATIENT speaker assignment based on context
        prompt_reassign = f"The following transcript was recorded via a single microphone, so the speakers might be incorrectly labeled as always CLINICIAN or PATIENT. Please read the conversation context and rewrite the transcript, replacing speaker labels accurately with '[CLINICIAN]' and '[PATIENT]' based on who is speaking. The patient's name might be {patient_name}. Return ONLY the fully corrected transcript text.\n\nTRANSCRIPT:\n{full_transcript}"
        completion_fix = runtime_bot.groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt_reassign}],
        )
        corrected_transcript = completion_fix.choices[0].message.content

        summary = runtime_bot.generate_clinical_summary(corrected_transcript)
        results = runtime_bot.search_segments(
            query_text=corrected_transcript, top_k=1, patient_name=patient_name if patient_name else None
        )
        top_result = results[0] if results else None
        
        return {"summary": summary, "top_result": top_result, "corrected_transcript": corrected_transcript}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/livekit/segments")
def get_livekit_segments(session_id: str = "clinical-room", patient_name: str | None = None, limit: int = 50):
    runtime_bot = _get_bot()
    try:
        query = runtime_bot.supabase.table("clinical_segments").select(
            "id, content, speaker_role"
        ).eq("session_id", session_id).order("id", desc=False)
        
        if patient_name:
            query = query.eq("patient_name", patient_name)
            
        response = query.execute()
        data = response.data or []
        
        # Use explicit loop to avoid slice typing errors in Pyre2
        all_data = list(data)
        length = len(all_data)
        segments = [all_data[i] for i in range(max(0, length - limit), length)]
        
        # Return only the last N segments so the UI isn't overwhelmed
        return {"segments": segments}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/search")
def search_api(query: str, patient_name: str | None = None, top_k: int = 5, model: str = "hybrid"):
    runtime_bot = _get_bot()
    try:
        results = runtime_bot.search_segments(
            query_text=query,
            top_k=top_k,
            patient_name=patient_name,
            model_type=model
        )
        return {"results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/livekit/token")
def get_livekit_token(participant_name: str = "Clinician", patient_name: str = ""):
    livekit_api_key = os.getenv("LIVEKIT_API_KEY")
    livekit_api_secret = os.getenv("LIVEKIT_API_SECRET")
    livekit_url = os.getenv("LIVEKIT_URL")
    
    if not livekit_api_key or not livekit_api_secret or not livekit_url:
        raise HTTPException(status_code=500, detail="LiveKit configuration missing from .env")
        
    room_name = "clinical-room"
    if patient_name.strip():
        SESSION_PATIENTS[room_name] = patient_name.strip()
        
    token = api.AccessToken(
        livekit_api_key, 
        livekit_api_secret
    ).with_identity(participant_name).with_name(participant_name).with_grants(
        api.VideoGrants(room_join=True, room=room_name)
    )
    return {
        "token": token.to_jwt(),
        "url": livekit_url
    }

