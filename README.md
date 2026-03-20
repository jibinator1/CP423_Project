# CP423 Clinical IR System 

An end-to-end conversational medical interview system designed for the **Information Retrieval & Search Engines** course project. The system processes spoken clinical interviews, enabling speaker-aware indexing, structured summarization, symptom-based question answering, and comprehensive IR evaluation.

## 🌟 Key Features (100% Free Tier APIs)

- 🎙️ **Live & Offline Diarization**: Separates Patient vs. Clinician audio using Pyannote (offline) and LiveKit tracks (real-time).
- 🧠 **Speech-to-Text**: High-accuracy medical transcription powered by **Groq Whisper** (`whisper-large-v3-turbo`).
- 🔍 **Multi-Model Search Engine**: Provides side-by-side comparison of **Hybrid (Vector + BM25)**, **Classic BM25**, **Vector Space Model (VSM)**, and **Boolean** retrieval.
- 📊 **IR Evaluation Dashboard**: Calculates **Precision@K, Recall@K, F1@K, and MAP** across multiple $K$ values and speaker roles.
- 🤖 **LLM Clinical Summarization**: Generates grounded medical summaries, structured follow-up plans, and answers clinical queries with timestamped citations.
- 🔄 **n8n Orchestration**: Decentralized webhook workflow for routing transcription segments.

---

## 🏗️ System Architecture

```text
Clinician Browser
    │  (WebRTC Audio Tracks)
    ▼
LiveKit Cloud ─────────────────────────────────────────────────────────┐
    │  (Patient & Clinician Tracks)     │  (Transcription Events)      │
    ▼                                   ▼                              │
Python Transcription Agent         React Frontend (localhost:5173)     │
 - Groq Whisper STT                  - Speaker-Aware Search            │
 - Silero VAD                        - Model Comparison UI             │
 - Publishes text back to Room       - Evaluation Dashboard            │
    │                                                                  │
    │  (Webhook POST)                                                  │
    ▼                                                                  │
n8n (localhost:5678)                                                   │
    │  (Normalize Payload)                                             │
    ▼                                                                  │
FastAPI Backend (localhost:8000) ◄─────────────────────────────────────┘
 - BM25, VSM, Boolean, Hybrid IR logic (SentenceTransformers)
 - Supabase Vector Database (Indexes segments with speaker metadata)
 - LLM Summarization & Grounded QA (Llama 3 via Groq)
```

**Speaker Separation Strategy**:
1. **Offline Mode (`/api/upload_mp3`)**: Uses `pyannote.audio` to identify speaker boundaries in single MP3 files, mapping them to Whisper transcript segments.
2. **Live Mode (LiveKit)**: Assigns dedicated WebRTC audio tracks to the Clinician and Patient. No diarization required; LiveKit natively guarantees perfect speaker attribution.

---

## 🚀 Setup & Installation

### 1. Prerequisites
- **Python 3.10+**
- **Node.js 18+**
- **n8n** (installed globally via `npm i -g n8n` or run via `npx n8n`)

### 2. Free-Tier API Configuration
Copy the provided environment template:
```bash
cp .env.example .env
```

Open `.env` and configure the following free accounts:
1. **Groq (LLM & Whisper)**: Get a key at [console.groq.com](https://console.groq.com/)
2. **Supabase (Vector DB)**: Create a project at [supabase.com](https://supabase.com/) and paste the URL/Anon Key.
3. **Hugging Face (Pyannote)**: Create an access token at [huggingface.co](https://huggingface.co/settings/tokens) (Ensure you accept the Pyannote user conditions on HF).
4. **LiveKit Cloud (WebRTC)**: Create a free project at [livekit.io](https://livekit.io/) to get your URL, API Key, and Secret.

### 3. Backend Setup
```bash
# Create and activate virtual environment
python -m venv venv
# Windows
.\venv\Scripts\activate
# Mac/Linux
source venv/bin/activate

# Install dependencies (PyTorch, sentence-transformers, FastAPI, etc.)
pip install -r requirements.txt
```

### 4. Frontend Setup
```bash
cd frontend
npm install
```

### 5. n8n Workflow Configuration
1. Start n8n: `npx n8n`
2. Open `http://localhost:5678` in your browser.
3. Import the `n8n_workflow.json` file securely located in the project root.
4. Ensure the webhook node is active and points to `http://localhost:8000/livekit/segment`.

---

## 🏃 Running the System

Start all microservices instantly with the unified script:

```bash
# Make sure your venv is activated
python start_all.py
```
*This automatically launches the FastAPI backend, the React Vite frontend on port 5173, and the LiveKit Transcription Agent.*

Navigate to **http://localhost:5173** to access the UI.

---

## 📈 Evaluation Metrics (Rubric Requirement A2)

This system rigorously implements IR evaluation standards per the project requirements. 

- Navigate to the **"Metrics Setup"** tab in the UI.
- Click **"Run Full Evaluation"** to execute queries against the `sample_qrels.json` ground truth file.
- The dashboard calculates **Precision@K**, **Recall@K**, **F1@K**, and **MAP** (Mean Average Precision) for $K \in \{1, 3, 5, 10\}$.
- Results are heavily broken down by **Speaker Role** (Patient-only, Clinician-only, All) as required by the rubric.

You can also navigate to the **"Compare Models"** tab to run ad-hoc searches and see side-by-side rankings from BM25, VSM, Boolean, and Hybrid models.

---

## 📁 Repository Structure

```text
CP423_Project/
├── project/
│   ├── clinical_ir.py         # Core IR logic (BM25, VSM, Boolean, Hybrid), Evaluation logic
│   ├── livekit_ingest.py      # FastAPI backend, evaluation & LiveKit endpoints
│   ├── transcription_agent.py # LiveKit audio agent (Groq Whisper stream adapter)
│   └── sample_qrels.json      # Ground truth relevance judgments (12 diverse queries)
├── frontend/                  # React + Vite UI
│   └── src/components/
│       ├── EvaluationDashboard.jsx # Visualizes P@K, R@K, F1, MAP
│       ├── ModelComparison.jsx     # Side-by-side search ranker 
│       └── LiveRecording.jsx       # LiveKit Real-time UI
├── start_all.py               # Unified startup script
├── n8n_workflow.json          # n8n orchestration workflow
├── requirements.txt           # Python dependencies
└── .env.example               # Guided API setup template
```

---
*Created for CP423 Information Retrieval & Search Engines*
