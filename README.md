# Clinical IR System

A comprehensive medical audio analysis and retrieval application featuring a modern React frontend and a FastAPI (Python) backend using Groq for audio transcription/summarization.

## Prerequisites

Ensure you have the following installed on your system:
- **Node.js**: Expected version v18+ (for running the React/Vite development server)
- **Python**: Expected version 3.10+ (for the FastAPI backend)
- **ffmpeg**: Required by underlying audio processing libraries like `pyannote.audio`. Note: Make sure ffmpeg is added to your system's PATH.

> **Environment Variables:**
> The backend relies on multiple external APIs. You must create a `.env` file in the root directory (where `requirements.txt` is located) with the following configured:
> ```ini
> GROQ_API_KEY="..."
> SUPABASE_URL="..."
> SUPABASE_KEY="..."
> HF_AUTH_TOKEN="..."
> LIVEKIT_INGEST_TOKEN="..." # optional
> ```

---

## 1. Setting up the Backend (Python/FastAPI)

The backend handles file uploads, live webm chunk processing, interactions with the Groq API for transcription/summarization, and embedding retrievals from Supabase.

1. **Navigate to the project root directory** (where `requirements.txt` is located).
   ```powershell
   cd "C:\Users\jibin\CP423\CP423MedIR copy"
   ```

2. **(Optional but recommended) Create and activate a virtual environment.**
   ```powershell
   python -m venv venv
   .\venv\Scripts\activate
   ```

3. **Install the required dependencies.**
   ```powershell
   pip install -r requirements.txt
   ```

4. **Start the FastAPI Server.**
   Navigate to the `project` directory to run the server. It must run on port `8000` because the frontend proxies `/api` requests to it.
   ```powershell
   cd "project"
   uvicorn livekit_ingest:app --reload --port 8000
   ```

---

## 2. Setting up the Frontend (React/Vite)

The frontend is a beautifully styled glassmorphism UI that provides the interface for uploading MP3s and recording microphone input.

1. **Open a NEW terminal window/tab.** (Leave the backend server running in the first one).

2. **Navigate to the `frontend` directory.**
   ```powershell
   cd "C:\Users\jibin\CP423\CP423MedIR copy\frontend"
   ```

3. **Install the Node dependencies.**
   ```powershell
   npm install
   ```
   *(Note: Vite and lucide-react should already be configured in the `package.json`)*.

4. **Start the Vite Development Server.**
   ```powershell
   npm run dev
   ```

5. **Access the Application**
   Open your browser and navigate to the Local URL provided in the terminal (usually `http://localhost:5173` or `http://localhost:5174`).

---

## Troubleshooting

- **`ImportError: attempted relative import with no known parent package`**: If you see this error when running the uvicorn server, it means Python is confused by the relative import `from .clinical_ir import ClinicalIRSystem` inside `livekit_ingest.py`. Ensure you execute `uvicorn` using the exact command: `uvicorn livekit_ingest:app --reload --port 8000` while *inside* the `project` directory.
- **Microphone Permissions**: If the Live Recording feature doesn't work, ensure your web browser has been granted permission to access your microphone.
- **ffmpeg Errors**: If `pyannote.audio` throws errors relating to missing libraries like `libtorchcodec`, make sure your Python environment is clean and that native operating system dependencies for PyTorch Audio are properly installed for Windows.
