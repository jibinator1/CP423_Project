import subprocess
import os
import sys
import time
import signal

def start_services():
    root_dir = os.path.dirname(os.path.abspath(__file__))
    frontend_dir = os.path.join(root_dir, "frontend")
    project_dir = os.path.join(root_dir, "project")
    venv_python = os.path.join(root_dir, "venv", "Scripts", "python.exe")

    print("--- Starting Clinical IR Services ---")

    processes = []

    try:
        # 1. Start n8n
        print("Starting n8n...")
        n8n_process = subprocess.Popen(
            ["npx", "n8n"],
            cwd=root_dir,
            shell=True
        )
        processes.append(n8n_process)

        # 2. Start Frontend
        print("Starting Frontend (Vite)...")
        frontend_process = subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=frontend_dir,
            shell=True
        )
        processes.append(frontend_process)

        # 3. Start Backend (FastAPI/Uvicorn)
        print("Starting Backend (Uvicorn)...")
        backend_process = subprocess.Popen(
            [venv_python, "-m", "uvicorn", "livekit_ingest:app", "--reload", "--port", "8000"],
            cwd=project_dir,
            shell=True
        )
        processes.append(backend_process)

        # 4. Start LiveKit Transcription Agent
        print("Starting LiveKit Transcription Agent in a NEW window...")
        # On Windows, CREATE_NEW_CONSOLE (0x00000010) pops open a visible window
        agent_process = subprocess.Popen(
            [venv_python, "transcription_agent.py"],
            cwd=project_dir,
            creationflags=0x00000010
        )
        processes.append(agent_process)

        print("\nAll services are starting. Press Ctrl+C to stop all services.\n")

        # Keep the script running
        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n--- Stopping all services ---")
        for p in processes:
            # On Windows, we need to handle process trees properly if they were started with shell=True
            # But taskkill /f /t /pid works well for broad cleanup if needed.
            # For now, standard terminate/wait.
            print(f"Stopping process {p.pid}...")
            p.terminate()
        
        # Give them a moment to shut down
        for p in processes:
            try:
                p.wait(timeout=5)
            except subprocess.TimeoutExpired:
                p.kill()
        
        print("All services stopped.")

if __name__ == "__main__":
    start_services()
