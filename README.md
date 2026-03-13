# CP423 Clinical IR System — Live Medical Transcription & IR Pipeline

A real-time medical audio transcription and information retrieval system built for CP423. It features a **React + Vite** frontend, a **FastAPI** backend for IR/search, a **LiveKit-based transcription agent** (powered by Groq Whisper), and **n8n** for orchestration.

---

## Architecture

```
Browser (Clinician)
    │  (WebRTC Audio)
    ▼
LiveKit Cloud ─────────────────────────────────────────────────────────
    │  (Audio Stream)                   │  (Transcription Events)
    ▼                                   ▼
Python Transcription Agent         React Frontend (localhost:5173)
 - Groq Whisper STT                  - Displays transcript bubbles
 - Silero VAD                        - Microphone selector
 - Publishes transcription back       - Debug track info
    │
    │  (Webhook POST)
    ▼
n8n (localhost:5678)
    │
    │  (Normalized Payload)
    ▼
FastAPI Backend (localhost:8000)
 - BM25 + Vector Hybrid IR
 - Clinical Summary Generation
```

---

## Features

- 🎙️ **Live Transcription** — Real-time speech-to-text via Groq Whisper (`whisper-large-v3-turbo`) and Silero VAD
- 🔍 **Hybrid IR** — BM25 + vector search for speaker-aware clinical information retrieval
- 📊 **Precision@K / Recall@K** metrics
- 🧠 **Clinical Summary** — LLM-generated grounded answers and follow-up plans
- 🔄 **n8n Orchestration** — Normalizes and routes transcription segments
- 🎛️ **Microphone Selector** — Pick your exact audio input device in the UI
- 📤 **MP3 Upload** — Offline audio file analysis with diarization

---

## Setup

### 1. Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **n8n** (via `npx n8n`)
- A free [Groq API key](https://console.groq.com/)
- A free [LiveKit Cloud account](https://livekit.io/)

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

```ini
GROQ_API_KEY="your-groq-api-key"
LIVEKIT_URL="wss://your-project.livekit.cloud"
LIVEKIT_API_KEY="your-livekit-api-key"
LIVEKIT_API_SECRET="your-livekit-api-secret"
LIVEKIT_INGEST_TOKEN="optional-token-for-ingest-endpoint"
N8N_WEBHOOK_URL="http://localhost:5678/webhook/livekit-segment-ingest"
```

### 3. Python Backend & Transcription Agent

```powershell
# From the project root
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Frontend

```powershell
cd frontend
npm install
```

### 5. n8n Workflow

1. Start n8n: `npx n8n`
2. Open `http://localhost:5678`
3. Import `n8n_workflow.json` (drag & drop onto the canvas)
4. Set the workflow to **Active** (toggle in top-right)

---

## Running Everything

The easiest way is the unified startup script:

```powershell
python start_all.py
```

This automatically starts:
1. ⚙️ FastAPI backend on `:8000`
2. ⚛️ Vite frontend on `:5173`
3. 🎙️ LiveKit Transcription Agent (in a separate window)

> **Note:** Start n8n separately with `npx n8n` before running `start_all.py`.

Then open [http://localhost:5173](http://localhost:5173) in your browser.

---

## Usage

1. Click **"Enable Live Talk"**
2. Select your microphone from the dropdown (e.g., "Realtek 2")
3. Click **"Start Audio"** if prompted
4. Speak — transcriptions appear as bubbles in real-time

---

## Project Structure

```
CP423MedIR_n8n/
├── project/
│   ├── clinical_ir.py         # BM25 + vector IR pipeline
│   ├── livekit_ingest.py      # FastAPI backend / API endpoints
│   └── transcription_agent.py # LiveKit audio agent (Groq STT)
├── frontend/
│   └── src/
│       └── components/
│           ├── LiveRecording.jsx  # Live transcription UI
│           └── ...
├── start_all.py               # Unified startup script
├── n8n_workflow.json          # n8n orchestration workflow
├── requirements.txt
└── .env.example               # Environment variable template
```

---

## Dependencies

| Component | Technology |
|----------|-----------|
| Frontend | React, Vite, LiveKit Components |
| Backend | FastAPI, uvicorn |
| STT | Groq Whisper (whisper-large-v3-turbo) |
| VAD | Silero (via livekit-plugins-silero) |
| LiveKit | livekit-agents, livekit-rtc |
| Orchestration | n8n |
| IR | BM25, sentence-transformers |

---

## Troubleshooting

- **Blank browser page**: Check browser console. Make sure `.env` has correct `LIVEKIT_*` keys.
- **No transcription**: Ensure the LiveKit agent window says `STT HIT` when you speak.
- **n8n not receiving**: Make sure the workflow is set to **Active** (not Test Mode).
- **Microphone not detected**: Browser needs microphone permission. The dropdown will show real device names after permission is granted.
