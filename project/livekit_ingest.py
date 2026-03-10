import base64
import os
from typing import Any

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException, File, UploadFile
from pydantic import BaseModel, Field

try:
    from .clinical_ir import ClinicalIRSystem
except ImportError:
    from clinical_ir import ClinicalIRSystem


class SegmentPayload(BaseModel):
    content: str = Field(..., min_length=1)
    speaker_role: str = Field(..., min_length=1)
    session_id: str | None = None
    participant_id: str | None = None
    start: float | None = None
    end: float | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class AudioPayload(BaseModel):
    audio_b64: str = Field(..., min_length=1)
    speaker_role: str = Field(..., min_length=1)
    filename: str = "livekit_chunk.wav"
    session_id: str | None = None
    participant_id: str | None = None
    start_offset: float = 0.0
    metadata: dict[str, Any] = Field(default_factory=dict)


load_dotenv()
app = FastAPI(title="Clinical IR LiveKit Ingest Service")
bot: ClinicalIRSystem | None = None
ingest_token = os.getenv("LIVEKIT_INGEST_TOKEN", "").strip()


def _authorize(x_api_key: str | None) -> None:
    if ingest_token and x_api_key != ingest_token:
        raise HTTPException(status_code=401, detail="Unauthorized ingest request")


def _get_bot() -> ClinicalIRSystem:
    global bot
    if bot is None:
        bot = ClinicalIRSystem()
    return bot


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/livekit/segment")
def ingest_segment(payload: SegmentPayload, x_api_key: str | None = Header(default=None)) -> dict:
    _authorize(x_api_key)
    runtime_bot = _get_bot()

    role = payload.speaker_role.strip().upper()
    md = dict(payload.metadata or {})
    if payload.session_id:
        md["session_id"] = payload.session_id
    if payload.participant_id:
        md["participant_id"] = payload.participant_id
    if payload.start is not None:
        md["start"] = payload.start
    if payload.end is not None:
        md["end"] = payload.end
    md["source"] = "livekit"

    record = runtime_bot.index_segment(content=payload.content, speaker_role=role, metadata=md)
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
    for seg in transcribed_segments:
        md = dict(payload.metadata or {})
        md["source"] = "livekit"
        if payload.session_id:
            md["session_id"] = payload.session_id
        if payload.participant_id:
            md["participant_id"] = payload.participant_id
        md["start"] = payload.start_offset + float(seg["start"])
        md["end"] = payload.start_offset + float(seg["end"])

        runtime_bot.index_segment(content=seg["text"], speaker_role=role, metadata=md)
        indexed_count += 1

    return {
        "status": "indexed",
        "speaker_role": role,
        "segments_indexed": indexed_count,
    }


import shutil
import tempfile

@app.post("/api/upload_mp3")
async def upload_mp3(audio_file: UploadFile = File(...)):
    runtime_bot = _get_bot()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as tmp_file:
        shutil.copyfileobj(audio_file.file, tmp_file)
        tmp_path = tmp_file.name

    try:
        roles = {"SPEAKER_00": "CLINICIAN", "SPEAKER_01": "PATIENT"}
        runtime_bot.process_audio_file(tmp_path, roles)
        
        full_transcript = runtime_bot.get_full_transcript()
        summary = "No content to summarize."
        if full_transcript.strip():
            summary = runtime_bot.generate_clinical_summary(full_transcript)
            
        return {"summary": summary, "top_result": "Indexed processed successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)

@app.post("/api/process_live_audio")
async def process_live_audio(audio_chunk: UploadFile = File(...)):
    runtime_bot = _get_bot()
    
    try:
        audio_bytes = await audio_chunk.read()
        transcribed_segments = runtime_bot.transcribe_audio_bytes(audio_bytes, filename=audio_chunk.filename)
        
        role = "CLINICIAN" 
        indexed_count = 0
        full_text = ""
        for seg in transcribed_segments:
            runtime_bot.index_segment(content=seg["text"], speaker_role=role, metadata={"source": "live_recording"})
            indexed_count += 1
            full_text += seg["text"] + " "
            
        summary = f"Recorded and indexed {indexed_count} segment(s)."
        top_result = None
        if full_text.strip():
            # Generate the true clinical summary using the LLM method
            summary = runtime_bot.generate_clinical_summary(full_text)
            
            results = runtime_bot.search_segments(query_text=full_text, top_k=1)
            if results:
                top_result = results[0]
                
        return {"summary": summary, "top_result": top_result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

