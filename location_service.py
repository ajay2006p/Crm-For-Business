"""Backward-compatible shim — use app.services.location_service."""
from app.services.location_service import fetch_areas, search_locations

__all__ = ["search_locations", "fetch_areas"]
