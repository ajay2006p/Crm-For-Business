import asyncio
import io
import json
import os
import threading
import uuid

import pandas as pd
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from scraper_logic import run_scraper, JOB_STATES, CITY_AREAS, COUNTRY_CITIES, COUNTRY_DISPLAY
from location_service import search_locations, fetch_areas
from messaging_service import (
    get_templates, save_templates, get_settings, save_settings,
    render_message, build_campaign,
)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("static", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")


# ── Models ────────────────────────────────────────────────────────────────────

class ScrapeRequest(BaseModel):
    searches: str
    total: int
    output_folder: str = "output"
    no_website_only: bool = False
    location_scope: str = "city"  # city | country

class ControlRequest(BaseModel):
    job_id: str
    action: str  # pause | resume | stop

class SaveRequest(BaseModel):
    filepath: str
    data: list

class RenameRequest(BaseModel):
    old_path: str
    new_name: str

class TemplateSaveRequest(BaseModel):
    templates: list

class SettingsSaveRequest(BaseModel):
    your_name: str | None = None
    company: str | None = None
    default_country_code: str | None = None
    twilio_account_sid: str | None = None
    twilio_auth_token: str | None = None
    twilio_from_number: str | None = None
    whatsapp_delay_sec: int | None = None

class PreviewRequest(BaseModel):
    template_body: str
    lead: dict

class CampaignRequest(BaseModel):
    leads: list
    template_id: str
    channel: str = "whatsapp"
    mark_contacted: bool = True

class StatsRequest(BaseModel):
    leads: list = []


# ── Scrape ────────────────────────────────────────────────────────────────────

@app.post("/api/scrape")
def scrape_endpoint(req: ScrapeRequest):
    search_list = [s.strip() for s in req.searches.split('\n') if s.strip()]
    job_id = str(uuid.uuid4())
    JOB_STATES[job_id] = {
        'status': 'pending', 'progress': 'Queued...', 'data': [], 'log': [],
        'found': 0, 'target': req.total, 'current_area': '',
    }
    t = threading.Thread(
        target=run_scraper,
        args=(job_id, search_list, req.total, req.output_folder,
              req.no_website_only, req.location_scope),
        daemon=True,
    )
    t.start()
    return {"status": "success", "job_id": job_id}


# ── SSE stream — live log lines ───────────────────────────────────────────────

@app.get("/api/stream/{job_id}")
async def stream_job(job_id: str):
    async def generate():
        sent = 0
        while True:
            await asyncio.sleep(0.4)
            state = JOB_STATES.get(job_id, {})
            log_list = state.get('log', [])

            while sent < len(log_list):
                safe = log_list[sent].replace('\n', ' ').replace('\r', '')
                yield f"data: {safe}\n\n"
                sent += 1

            status = state.get('status', 'pending')
            if status in ('completed', 'stopped', 'error'):
                yield f"data: __DONE__{status}\n\n"
                return

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Status (polling fallback + data updates) ──────────────────────────────────

@app.get("/api/status/{job_id}")
def get_status(job_id: str):
    if job_id not in JOB_STATES:
        return JSONResponse(status_code=404,
                            content={"status": "error", "message": "Job not found"})
    state = JOB_STATES[job_id]
    return {
        "status":       state['status'],
        "progress":     state['progress'],
        "data_length":  len(state['data']),
        "data":         state['data'],
        "found":        state.get('found', len(state['data'])),
        "target":       state.get('target', 0),
        "current_area": state.get('current_area', ''),
    }


# ── Control (pause / resume / stop) ──────────────────────────────────────────

@app.post("/api/control")
def control_job(req: ControlRequest):
    if req.job_id not in JOB_STATES:
        return JSONResponse(status_code=404,
                            content={"status": "error", "message": "Job not found"})
    action = req.action
    if action == 'resume':
        JOB_STATES[req.job_id]['status'] = 'running'
    elif action == 'pause':
        JOB_STATES[req.job_id]['status'] = 'paused'
    elif action == 'stop':
        JOB_STATES[req.job_id]['status'] = 'stopped'
    else:
        return JSONResponse(status_code=400,
                            content={"status": "error", "message": "Invalid action"})
    return {"status": "success", "job_status": JOB_STATES[req.job_id]['status']}


# ── Cities list (for frontend autocomplete) ───────────────────────────────────

@app.get("/api/cities")
def cities():
    return sorted(CITY_AREAS.keys())


@app.get("/api/countries")
def countries():
    return [
        {"key": k, "name": COUNTRY_DISPLAY.get(k, k.title()), "cities": len(v)}
        for k, v in sorted(COUNTRY_CITIES.items(), key=lambda x: COUNTRY_DISPLAY.get(x[0], x[0]))
    ]


# ── Location API (OpenStreetMap Nominatim) ────────────────────────────────────

@app.get("/api/locations/search")
def location_search(q: str = "", limit: int = 8):
    return {"status": "success", "results": search_locations(q, limit=limit)}


@app.get("/api/locations/areas")
def location_areas(city: str, country: str = "", state: str = ""):
    if not city.strip():
        return JSONResponse(status_code=400,
                            content={"status": "error", "message": "City is required"})
    data = fetch_areas(city.strip(), country.strip(), state.strip())
    return {"status": "success", **data}


# ── Templates & messaging ─────────────────────────────────────────────────────

@app.get("/api/templates")
def list_templates():
    return {"status": "success", "templates": get_templates()}


@app.post("/api/templates")
def update_templates(req: TemplateSaveRequest):
    save_templates(req.templates)
    return {"status": "success", "templates": get_templates()}


@app.get("/api/settings")
def read_settings():
    s = get_settings()
    safe = {k: v for k, v in s.items() if k != "twilio_auth_token"}
    safe["twilio_configured"] = bool(s.get("twilio_account_sid") and s.get("twilio_auth_token"))
    return {"status": "success", "settings": safe}


@app.post("/api/settings")
def update_settings(req: SettingsSaveRequest):
    data = {k: v for k, v in req.model_dump().items() if v is not None}
    current = get_settings()
    if not data.get("twilio_auth_token") and current.get("twilio_auth_token"):
        data["twilio_auth_token"] = current["twilio_auth_token"]
    save_settings(data)
    return read_settings()


@app.post("/api/messages/preview")
def preview_message(req: PreviewRequest):
    body = render_message(req.template_body, req.lead)
    return {"status": "success", "message": body}


@app.post("/api/messages/campaign")
def create_campaign(req: CampaignRequest):
    if not req.leads:
        return JSONResponse(status_code=400,
                            content={"status": "error", "message": "No leads selected"})
    result = build_campaign(
        req.leads, req.template_id, req.channel, req.mark_contacted)
    if result.get("status") == "error":
        return JSONResponse(status_code=400, content=result)
    return result


@app.post("/api/dashboard/stats")
def dashboard_stats(req: StatsRequest):
    leads = req.leads or []
    with_phone = sum(1 for l in leads if l.get("phone_number"))
    no_website = sum(1 for l in leads if not l.get("website"))
    statuses = {}
    for l in leads:
        st = l.get("status") or "New"
        statuses[st] = statuses.get(st, 0) + 1
    ratings = [l.get("reviews_average") for l in leads if l.get("reviews_average")]
    avg_rating = round(sum(ratings) / len(ratings), 1) if ratings else 0

    folder_stats = {"files": 0, "total_leads": 0}
    if os.path.exists("output"):
        for f in os.listdir("output"):
            if f.endswith(".json"):
                folder_stats["files"] += 1
                try:
                    with open(os.path.join("output", f), encoding="utf-8") as fh:
                        folder_stats["total_leads"] += len(json.load(fh))
                except Exception:
                    pass

    return {
        "status": "success",
        "loaded": len(leads),
        "with_phone": with_phone,
        "no_website": no_website,
        "avg_rating": avg_rating,
        "statuses": statuses,
        "folder": folder_stats,
    }


# ── File management ───────────────────────────────────────────────────────────

@app.get("/api/files")
def list_files(folder: str = "output"):
    if not os.path.exists(folder):
        return {"status": "success", "files": []}
    files = []
    for f in os.listdir(folder):
        if f.endswith('.json'):
            path = os.path.join(folder, f)
            files.append({"name": f, "path": path, "size": os.path.getsize(path)})
    return {"status": "success", "files": files}


@app.post("/api/save_file")
def save_file(req: SaveRequest):
    try:
        if not req.filepath.endswith('.json'):
            return JSONResponse(status_code=400,
                                content={"status": "error", "message": "Can only save JSON files"})
        os.makedirs(os.path.dirname(req.filepath) or '.', exist_ok=True)
        with open(req.filepath, 'w', encoding='utf-8') as f:
            json.dump(req.data, f, indent=4, ensure_ascii=False)
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


@app.get("/api/read_file")
def read_file(filepath: str):
    try:
        if not os.path.exists(filepath):
            return JSONResponse(status_code=404,
                                content={"status": "error", "message": "File not found"})
        with open(filepath, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return {"status": "success", "data": data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


@app.post("/api/rename_file")
def rename_file(req: RenameRequest):
    try:
        if not os.path.exists(req.old_path):
            return JSONResponse(status_code=404,
                                content={"status": "error", "message": "File not found"})
        dir_name = os.path.dirname(req.old_path)
        new_path = os.path.join(dir_name, req.new_name)
        if not new_path.endswith('.json'):
            new_path += '.json'
        os.rename(req.old_path, new_path)
        return {"status": "success", "new_path": new_path}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


@app.post("/api/import")
def import_excel(file: UploadFile = File(...)):
    try:
        contents = file.file.read()
        df = pd.read_excel(io.BytesIO(contents))
        df = df.fillna("")
        data = df.to_dict(orient="records")
        return {"status": "success", "data": data}
    except Exception as e:
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})


# ── Root ──────────────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return FileResponse("static/index.html")


if __name__ == "__main__":
    import uvicorn
    print("Server running at http://127.0.0.1:8080")
    uvicorn.run(app, host="127.0.0.1", port=8080)
