import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.core.database import close_db, connect_db
from app.core.logging_config import logger, setup_logging
from app.routers import analytics, auth, companies, dashboard, documents, finance, folders, hr, leads, locations, meetings, outreach, search, tasks
from app.routers import settings as settings_router

settings = get_settings()
setup_logging()


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await connect_db()
        from app.routers.auth import seed_admin
        await seed_admin()
        logger.info("%s started", settings.app_name)
    except Exception as exc:
        logger.error("Startup failed (is MongoDB running?): %s", exc)
        raise
    yield
    await close_db()


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s: %s", request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal server error. Please try again."},
    )


app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(leads.router)
app.include_router(folders.router)
app.include_router(search.router)
app.include_router(locations.router)
app.include_router(outreach.router)
app.include_router(meetings.router)
app.include_router(tasks.router)
app.include_router(hr.router)
app.include_router(finance.router)
app.include_router(documents.router)
app.include_router(analytics.router)
app.include_router(companies.router)
app.include_router(settings_router.router)

os.makedirs(settings.upload_dir, exist_ok=True)
os.makedirs("static/os", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
# Serve uploaded files (e.g. outreach images) at /uploads/...
app.mount("/uploads", StaticFiles(directory=settings.upload_dir), name="uploads")


@app.get("/health")
async def health():
    from app.core.database import _db
    return {
        "status": "ok" if _db is not None else "degraded",
        "app": settings.app_name,
        "mongodb": _db is not None,
    }


@app.get("/")
async def root():
    return FileResponse("static/os/index.html")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="127.0.0.1", port=8080, reload=True)
