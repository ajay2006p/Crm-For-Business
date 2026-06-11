import asyncio
import logging

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.security import get_current_user
from app.services.location_service import fetch_areas, search_locations

logger = logging.getLogger("recruitkr")
router = APIRouter(prefix="/api/locations", tags=["locations"])


@router.get("/search")
async def search(
    q: str = Query("", min_length=0),
    limit: int = Query(8, ge=1, le=20),
    user=Depends(get_current_user),
):
    if len(q.strip()) < 2:
        raise HTTPException(status_code=400, detail="Enter at least 2 characters")
    try:
        results = await asyncio.to_thread(search_locations, q.strip(), limit=limit)
        has_live = any(r.get("source") == "nominatim" for r in results)
        return {
            "status": "success",
            "results": results,
            "count": len(results),
            "live": has_live,
        }
    except Exception as exc:
        logger.exception("Location search failed")
        raise HTTPException(status_code=502, detail=f"Location search failed: {exc}") from exc


@router.get("/areas")
async def areas(
    city: str = Query(..., min_length=2),
    country: str = "",
    state: str = "",
    user=Depends(get_current_user),
):
    try:
        data = await asyncio.to_thread(fetch_areas, city.strip(), country.strip(), state.strip())
        if data["total"] == 0:
            return {
                "status": "success",
                "message": "No areas found — try another city spelling",
                **data,
            }
        return {"status": "success", **data}
    except Exception as exc:
        logger.exception("Area fetch failed")
        raise HTTPException(status_code=502, detail=f"Area fetch failed: {exc}") from exc
