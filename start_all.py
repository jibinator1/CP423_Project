import subprocess
import os
import sys
import time
import signal
import urllib.request
import urllib.error

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

        # Wait for Backend to be healthy
        print("Waiting for Backend to initialize (loading ML models)...")
        max_retries = 30
        backend_ready = False
        for i in range(max_retries):
            try:
                with urllib.request.urlopen("http://localhost:8000/health", timeout=2) as response:
                    if response.getcode() == 200:
                        print("Backend is HEALTHY.")
                        backend_ready = True
                        break
            except Exception:
                pass
            if i % 5 == 0 and i > 0:
                print(f"  ...still waiting ({i}/{max_retries}s)")
            time.sleep(1)
        
        if not backend_ready:
            print("WARNING: Backend did not respond to health check in time. Proceeding anyway...")

        # 4. Start LiveKit Transcription Agent
        print("Starting LiveKit Transcription Agent in a NEW window...")
        agent_process = subprocess.Popen(
            [venv_python, "transcription_agent.py"],
            cwd=project_dir,
            creationflags=0x00000010
        )
        processes.append(agent_process)

        print("\n" + "="*50)
        print("ALL SERVICES ARE STARTING.")
        print(" - n8n: http://localhost:5678")
        print(" - Frontend: http://localhost:5173 (usually)")
        print(" - Backend: http://localhost:8000")
        print("Press Ctrl+C to stop all services.")
        print("="*50 + "\n")

        # Keep the script running and monitor processes
        while True:
            for p in processes:
                if p.poll() is not None:
                    # A process exited!
                    print(f"\nCRITICAL: One of the services (PID {p.pid}) stopped unexpectedly!")
                    # Check if it was n8n or backend
                    if p == n8n_process: print("Service: n8n")
                    elif p == backend_process: print("Service: Backend")
                    elif p == frontend_process: print("Service: Frontend")
                    raise KeyboardInterrupt # Trigger cleanup
            time.sleep(2)

    except KeyboardInterrupt:
        print("\n--- Stopping all services ---")
        for p in processes:
            print(f"Stopping process {p.pid} and its children...")
            try:
                # Use taskkill on Windows to ensure the whole tree (including shell children) is killed
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], 
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            except Exception as e:
                print(f"Error stopping process {p.pid}: {e}")
                p.terminate()
        
        print("All services stopped.")

if __name__ == "__main__":
    start_services()
