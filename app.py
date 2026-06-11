import asyncio
import os
import queue
import re
import sys
import threading
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, StreamingResponse, FileResponse, JSONResponse
from pydantic import BaseModel

from scraper import scrape, CITY_AREAS

app = FastAPI(title="Google Maps Scraper")

# ── Global job state ───────────────────────────────────────────────────────────
_log_q: queue.Queue = queue.Queue()
_job_thread: threading.Thread | None = None
_stop_event = threading.Event()
_job_running = False
_last_output = ""
_result_count = 0


class _QueueWriter:
    """Redirect print() → log queue during scrape."""
    def __init__(self, q: queue.Queue):
        self._q = q

    def write(self, text: str):
        if text and text != "\n":
            self._q.put(text.rstrip("\n"))

    def flush(self):
        pass


# ── Routes ─────────────────────────────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
async def index():
    html_path = Path(__file__).parent / "templates" / "index.html"
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.get("/cities")
async def cities():
    return JSONResponse(sorted(CITY_AREAS.keys()))


class StartRequest(BaseModel):
    query: str
    city: str
    target: int
    output: str = ""


@app.post("/start")
async def start(req: StartRequest):
    global _job_thread, _job_running, _last_output, _result_count

    if _job_running:
        return JSONResponse({"ok": False, "msg": "A job is already running."})

    # Reset state
    _stop_event.clear()
    while not _log_q.empty():
        try:
            _log_q.get_nowait()
        except Exception:
            pass
    _result_count = 0
    _last_output = req.output.strip()

    _job_running = True

    def _run():
        global _job_running, _last_output, _result_count
        old_stdout = sys.stdout
        sys.stdout = _QueueWriter(_log_q)
        try:
            results = scrape(
                req.query, req.city, req.target, req.output,
                stop_fn=lambda: _stop_event.is_set()
            )
            _result_count = len(results)
            if not _last_output:
                safe_q = re.sub(r"[^a-zA-Z0-9_]", "_", req.query)
                safe_c = re.sub(r"[^a-zA-Z0-9_]", "_", req.city)
                _last_output = f"{safe_q}_{safe_c}_results.csv"
        except Exception as e:
            _log_q.put(f"ERROR: {e}")
        finally:
            sys.stdout = old_stdout
            _job_running = False
            _log_q.put("__DONE__")

    _job_thread = threading.Thread(target=_run, daemon=True)
    _job_thread.start()
    return JSONResponse({"ok": True})


@app.post("/stop")
async def stop():
    _stop_event.set()
    return JSONResponse({"ok": True})


@app.get("/stream")
async def stream():
    """Server-Sent Events — streams log lines to the browser."""
    async def generate():
        while True:
            await asyncio.sleep(0.25)
            batch = []
            while True:
                try:
                    batch.append(_log_q.get_nowait())
                except queue.Empty:
                    break
            for msg in batch:
                safe = msg.replace("\n", " ")
                yield f"data: {safe}\n\n"
                if msg == "__DONE__":
                    return
            if not batch and not _job_running:
                yield "data: __DONE__\n\n"
                return

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache",
                                      "X-Accel-Buffering": "no"})


@app.get("/download")
async def download():
    path = Path(_last_output) if _last_output else None
    if not path or not path.exists():
        # Try to find any CSV in cwd
        csvs = list(Path(".").glob("*.csv"))
        if not csvs:
            return JSONResponse({"error": "No CSV file found."}, status_code=404)
        path = max(csvs, key=os.path.getmtime)
    return FileResponse(str(path), media_type="text/csv",
                        filename=path.name)


@app.get("/status")
async def status():
    return JSONResponse({
        "running": _job_running,
        "count": _result_count,
        "output": _last_output,
    })


if __name__ == "__main__":
    import uvicorn
    print("Starting Google Maps Scraper UI at http://127.0.0.1:8000")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=False)
