"""Location search — Nominatim (live) with local fallback when unavailable."""

import json
import logging
import ssl
import time
import urllib.parse
import urllib.request

logger = logging.getLogger("recruitkr.location")

# ── SSL context: prefer certifi, fall back to unverified (dev-only) ──────────
def _make_ssl_ctx() -> ssl.SSLContext:
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        pass
    try:
        return ssl.create_default_context()
    except Exception:
        pass
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    return ctx

SSL_CTX = _make_ssl_ctx()

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "RecruitKrBusinessOS/1.0 (internal; contact@recruitkr.com)"
_TIMEOUT = 8  # seconds — keep short so the thread completes quickly
_last_request = 0.0
_cache: dict[str, list] = {}

try:
    from scraper_logic import CITY_AREAS, CITY_META, COUNTRY_DISPLAY, get_city_meta
except Exception:
    CITY_AREAS: dict = {}
    CITY_META: dict = {}
    COUNTRY_DISPLAY: dict = {}

    def get_city_meta(city_key: str) -> dict:
        return {"display": city_key.title(), "country_display": "", "state": "", "lat": None, "lng": None}


def _throttle() -> None:
    """Throttle to ≥1 req/s for Nominatim ToS compliance."""
    global _last_request
    wait = 1.05 - (time.time() - _last_request)
    if wait > 0:
        time.sleep(wait)
    _last_request = time.time()


def _fetch_nominatim(params: dict) -> list:
    key = json.dumps(params, sort_keys=True)
    if key in _cache:
        return _cache[key]
    _throttle()
    qs = urllib.parse.urlencode(params)
    req = urllib.request.Request(
        f"{NOMINATIM_URL}?{qs}",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT, context=SSL_CTX) as resp:
            data = json.loads(resp.read().decode())
        _cache[key] = data
        return data
    except Exception as exc:
        logger.warning("Nominatim request failed: %s", exc)
        return []


def _search_local(query: str, limit: int = 8) -> list[dict]:
    q = query.lower().strip()
    results: list[dict] = []
    seen: set = set()

    for city_key in CITY_AREAS:
        meta = get_city_meta(city_key)
        display = meta.get("display", city_key.title())
        country = meta.get("country_display", "")
        state = meta.get("state") or ""
        hay = f"{city_key} {display} {country} {state}".lower()
        if q not in hay and not any(part in city_key for part in q.split() if len(part) > 2):
            continue
        key = city_key.lower()
        if key in seen:
            continue
        seen.add(key)
        results.append({
            "name": display,
            "display": ", ".join(p for p in [display, state, country] if p),
            "city": display,
            "city_key": city_key,
            "state": state,
            "country": country,
            "lat": meta.get("lat"),
            "lng": meta.get("lng"),
            "source": "local",
        })

    for country_key, label in COUNTRY_DISPLAY.items():
        if q in country_key or q in label.lower():
            results.append({
                "name": label,
                "display": label,
                "city": "",
                "city_key": "",
                "state": "",
                "country": label,
                "lat": None,
                "lng": None,
                "source": "local-country",
            })
    return results[:limit]


def search_locations(query: str, limit: int = 8) -> list[dict]:
    if not query or len(query.strip()) < 2:
        return []
    local = _search_local(query, limit)
    remote: list[dict] = []
    try:
        hits = _fetch_nominatim({
            "q": query.strip(),
            "format": "json",
            "addressdetails": 1,
            "limit": str(limit),
        })
        seen = {r["display"].lower() for r in local}
        for r in hits:
            addr = r.get("address", {})
            city = (
                addr.get("city") or addr.get("town") or addr.get("village")
                or addr.get("municipality") or r.get("name", "")
            )
            country = addr.get("country", "")
            state = addr.get("state", "")
            display = ", ".join(p for p in [city, state, country] if p)
            if not city or display.lower() in seen:
                continue
            seen.add(display.lower())
            remote.append({
                "name": city,
                "display": display,
                "city": city,
                "city_key": city.lower(),
                "state": state,
                "country": country,
                "lat": float(r.get("lat", 0) or 0),
                "lng": float(r.get("lon", 0) or 0),
                "source": "nominatim",
            })
    except Exception as exc:
        logger.error("Remote location search error: %s", exc)

    merged = local + remote
    return merged[:limit] if merged else local


def _local_areas(city_key: str) -> list[str]:
    key = city_key.lower().strip()
    aliases = {"bengaluru": "bangalore", "bombay": "mumbai", "new delhi": "delhi"}
    key = aliases.get(key, key)
    return CITY_AREAS.get(key, [])


def fetch_areas(city: str, country: str = "", state: str = "") -> dict:
    city_key = city.lower().strip()
    for alias, canonical in {"bengaluru": "bangalore", "bombay": "mumbai"}.items():
        if city_key == alias:
            city_key = canonical

    local = _local_areas(city_key) or _local_areas(city)
    meta = get_city_meta(city_key) if city_key in CITY_META else get_city_meta(city.lower())

    location_parts = [city]
    st = state or meta.get("state") or ""
    co = country or meta.get("country_display", "")
    if st:
        location_parts.append(st)
    if co:
        location_parts.append(co)
    query = ", ".join(location_parts)

    nominatim_areas: list[str] = []
    try:
        for search_q in [f"neighbourhood {query}", f"suburb {query}"]:
            hits = _fetch_nominatim({
                "q": search_q,
                "format": "json",
                "addressdetails": 1,
                "limit": "25",
            })
            for h in hits:
                addr = h.get("address", {})
                area = (
                    addr.get("suburb") or addr.get("neighbourhood")
                    or addr.get("quarter") or addr.get("city_district")
                    or h.get("name", "")
                )
                if area and len(area) > 2 and area.lower() != city.lower():
                    nominatim_areas.append(area)
    except Exception as exc:
        logger.warning("Area enrichment failed: %s", exc)

    merged, seen = [], set()
    for a in local + nominatim_areas:
        norm = a.strip()
        k = norm.lower()
        if norm and k not in seen:
            seen.add(k)
            merged.append(norm)

    return {
        "city": city,
        "country": co,
        "state": st,
        "areas": merged,
        "local_count": len(local),
        "api_count": len(nominatim_areas),
        "total": len(merged),
        "lat": meta.get("lat"),
        "lng": meta.get("lng"),
        "source": "local+api" if nominatim_areas else "local",
        "live": bool(nominatim_areas),
    }
