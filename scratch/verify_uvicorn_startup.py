import os
import sys
import time
import urllib.request
import subprocess

def test_uvicorn_startup():
    port = "8095"
    env = os.environ.copy()
    env["PORT"] = port
    env["DEMO_MODE"] = "false"
    
    python_exe = sys.executable
    cmd = [python_exe, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", port]
    
    print(f"Launching production start command: {' '.join(cmd)}")
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
    proc = subprocess.Popen(
        cmd,
        cwd=backend_dir,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )
    
    try:
        # Give uvicorn a couple seconds to complete startup lifespan
        time.sleep(3)
        
        # Check if process crashed immediately
        poll_res = proc.poll()
        if poll_res is not None:
            stdout, stderr = proc.communicate()
            print(f"Server exited prematurely with code {poll_res}!")
            print("STDOUT:\n", stdout)
            print("STDERR:\n", stderr)
            return False
        
        # Test health endpoints
        url_health = f"http://127.0.0.1:{port}/health"
        url_api_health = f"http://127.0.0.1:{port}/api/health"
        
        with urllib.request.urlopen(url_health, timeout=5) as r1:
            data1 = r1.read().decode()
            print(f"GET /health: {data1}")
            assert r1.status == 200
            
        with urllib.request.urlopen(url_api_health, timeout=5) as r2:
            data2 = r2.read().decode()
            print(f"GET /api/health: {data2}")
            assert r2.status == 200
            
        print("FastAPI application started up and served traffic successfully!")
        return True
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()

if __name__ == "__main__":
    success = test_uvicorn_startup()
    sys.exit(0 if success else 1)
