import csv
import re
import sys
import os
import time
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# ─── City → areas/colonies list ───────────────────────────────────────────────
CITY_AREAS = {
    "jaipur": [
        "Malviya Nagar", "Vaishali Nagar", "Mansarovar", "Pratap Nagar",
        "Raja Park", "C-Scheme", "Tonk Road", "Ajmer Road", "Sodala",
        "Sanganer", "Murlipura", "Jhotwara", "Shastri Nagar", "Nirman Nagar",
        "Durgapura", "Lalkothi", "Sitapura", "Jagatpura", "Vidyadhar Nagar",
        "Bapu Nagar", "Triveni Nagar", "Kanakpura", "Kukas", "Khatipura",
        "Adarsh Nagar", "Sindhi Camp", "Johari Bazar", "Chitrakoot",
        "Vidhayak Nagar", "Tonk Phatak", "Sodala", "Hasanpura",
        "Bajaj Nagar", "Narayan Singh Circle", "Kartarpura",
        "Bani Park", "Aambabari", "Ramganj", "Chandpole", "Imli Phatak",
        "Govind Marg", "Station Road", "MI Road", "80 Feet Road Mansarovar",
        "Sukhdeonagar", "Gopalpura", "New Sanganer Road",
    ],
    "delhi": [
        "Connaught Place", "Lajpat Nagar", "Saket", "Dwarka", "Rohini",
        "Pitampura", "Janakpuri", "Karol Bagh", "Vasant Kunj", "Greater Kailash",
        "South Extension", "Defence Colony", "Hauz Khas", "Nehru Place",
        "Okhla", "Shahdara", "Preet Vihar", "Vikas Marg", "Mayur Vihar",
        "Uttam Nagar", "Paschim Vihar", "Rajouri Garden", "Tilak Nagar",
        "Vikaspuri", "Dwarka Sector 10", "Dwarka Sector 12", "Patparganj",
        "Laxmi Nagar", "Krishna Nagar", "Geeta Colony",
    ],
    "mumbai": [
        "Andheri West", "Andheri East", "Bandra West", "Bandra East",
        "Borivali", "Dadar", "Kurla", "Malad", "Goregaon", "Jogeshwari",
        "Kandivali", "Thane", "Powai", "Vikhroli", "Ghatkopar", "Mulund",
        "Vashi", "Nerul", "Belapur", "Worli", "Lower Parel", "Chembur",
        "Versova", "Oshiwara", "Juhu", "Santacruz", "Khar",
    ],
    "bangalore": [
        "Koramangala", "Indiranagar", "Whitefield", "JP Nagar", "Jayanagar",
        "BTM Layout", "HSR Layout", "Electronic City", "Marathahalli",
        "Bellandur", "Sarjapur Road", "Banashankari", "Rajajinagar",
        "Malleshwaram", "Yelahanka", "Hebbal", "KR Puram", "Bommanahalli",
        "Brookefield", "Mahadevapura", "Varthur", "Domlur", "Richmond Town",
    ],
    "hyderabad": [
        "Banjara Hills", "Jubilee Hills", "Madhapur", "Gachibowli",
        "Kondapur", "Hitech City", "Begumpet", "Secunderabad", "Ameerpet",
        "Kukatpally", "Miyapur", "Nizampet", "LB Nagar", "Dilsukhnagar",
        "Uppal", "Kompally", "Bachupally", "Alwal", "Trimulgherry",
    ],
    "chennai": [
        "Anna Nagar", "T Nagar", "Velachery", "Adyar", "Besant Nagar",
        "Nungambakkam", "Egmore", "Perambur", "Tambaram", "Porur",
        "Chromepet", "Madipakkam", "Sholinganallur", "Perungudi", "OMR",
        "Mogappair", "Avadi", "Ambattur", "Guindy",
    ],
    "pune": [
        "Koregaon Park", "Viman Nagar", "Wakad", "Baner", "Aundh",
        "Kothrud", "Hadapsar", "Kondhwa", "Katraj", "Shivajinagar",
        "FC Road", "Kharadi", "Magarpatta", "Pimple Saudagar",
        "Bavdhan", "Pashan", "Hinjewadi", "Warje", "Deccan",
    ],
    "ahmedabad": [
        "Navrangpura", "Satellite", "Vastrapur", "Maninagar", "Bopal",
        "Prahlad Nagar", "Chandkheda", "Naroda", "Gota", "Thaltej",
        "Bodakdev", "Paldi", "Isanpur", "Nikol", "Naranpura",
        "SG Road", "Drive-in Road", "Ambawadi", "Vejalpur",
    ],
}

# Fallback areas for unknown cities
GENERIC_AREAS = [
    "North", "South", "East", "West", "Central", "Old City",
    "New Area", "Sector 1", "Sector 2", "Sector 3",
    "Main Market", "Bus Stand Area", "Railway Station Area",
]


def log(msg: str):
    print(msg, flush=True)


def build_search_queue(query: str, city: str) -> list[str]:
    """City-level search first, then area by area."""
    city_lower = city.strip().lower()
    areas = CITY_AREAS.get(city_lower, GENERIC_AREAS)
    queue = [f"{query} in {city}"]
    for area in areas:
        queue.append(f"{query} in {area} {city}")
    return queue


def scroll_and_collect(page, max_items: int = 9999) -> list[dict]:
    """Scroll the Google Maps results feed and collect all items."""
    results = []
    seen_keys = set()

    feed_selector = 'div[role="feed"]'

    try:
        page.wait_for_selector(feed_selector, timeout=10000)
    except PlaywrightTimeout:
        # No feed found — might be single result or error page
        return results

    stall = 0
    prev_count = 0

    while len(results) < max_items:
        # Grab all result links in the feed
        items = page.locator('div[role="feed"] a[href*="/maps/place/"]').all()

        for item in items:
            try:
                data = extract_from_link(item)
                if not data:
                    continue
                key = f"{data['name']}|{data['address']}"
                if key not in seen_keys:
                    seen_keys.add(key)
                    results.append(data)
                    if len(results) >= max_items:
                        return results
            except Exception:
                pass

        if len(results) == prev_count:
            stall += 1
            if stall >= 4:
                break
        else:
            stall = 0

        prev_count = len(results)

        # Scroll down
        try:
            page.evaluate(
                """() => {
                    const feed = document.querySelector('div[role="feed"]');
                    if (feed) feed.scrollTop += 2000;
                }"""
            )
            page.wait_for_timeout(1800)
        except Exception:
            break

        # Check end-of-list markers
        try:
            end_texts = ["You've reached the end of the list", "Reached end of list"]
            for et in end_texts:
                if page.locator(f'text="{et}"').count() > 0:
                    return results
        except Exception:
            pass

    return results


def extract_from_link(item) -> dict | None:
    """Extract name, address, rating, reviews, category, url from a result link."""
    try:
        aria = item.get_attribute("aria-label") or ""
        if not aria:
            return None
        name = aria.strip()

        href = item.get_attribute("href") or ""

        # Try to get rating & review count from inside the item
        rating = ""
        reviews = ""
        category = ""
        address = ""

        # Rating span
        try:
            r_span = item.locator('span.MW4etd').first
            if r_span.count():
                rating = r_span.inner_text().strip()
        except Exception:
            pass

        # Reviews span
        try:
            rv_span = item.locator('span.UY7F9').first
            if rv_span.count():
                reviews = rv_span.inner_text().strip().strip("()")
        except Exception:
            pass

        # Category & address from W4Efsd divs
        try:
            info_divs = item.locator("div.W4Efsd").all()
            texts = []
            for d in info_divs:
                t = d.inner_text().strip()
                if t:
                    texts.append(t)
            if texts:
                # First chunk is usually category · price range
                category = texts[0].split("·")[0].strip() if texts else ""
                # Look for address-like text (contains digits or keywords)
                for t in texts[1:]:
                    parts = [p.strip() for p in t.split("·") if p.strip()]
                    for part in parts:
                        if re.search(r'\d|nagar|road|street|colony|sector|marg|vihar|bazar|bazaar', part, re.I):
                            address = part
                            break
                    if address:
                        break
        except Exception:
            pass

        return {
            "name": name,
            "category": category,
            "rating": rating,
            "reviews": reviews,
            "address": address,
            "url": href,
        }
    except Exception:
        return None


def scrape(query: str, city: str, target: int, output_file: str = "", stop_fn=None):
    if not output_file:
        safe_q = re.sub(r'[^a-zA-Z0-9_]', '_', query)
        safe_c = re.sub(r'[^a-zA-Z0-9_]', '_', city)
        output_file = f"{safe_q}_{safe_c}_results.csv"

    all_results: dict[str, dict] = {}
    search_queue = build_search_queue(query, city)
    total_searches = len(search_queue)

    log(f"\n{'='*60}")
    log(f"  Query   : {query}")
    log(f"  City    : {city}")
    log(f"  Target  : {target}")
    log(f"  Output  : {output_file}")
    log(f"  Areas   : {total_searches} searches queued")
    log(f"{'='*60}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False, args=["--start-maximized"])
        context = browser.new_context(viewport={"width": 1280, "height": 900})
        page = context.new_page()

        for idx, sq in enumerate(search_queue, 1):
            if stop_fn and stop_fn():
                log("\n Stopped by user.")
                break
            if len(all_results) >= target:
                log(f"\n Target of {target} reached!")
                break

            remaining = target - len(all_results)
            log(f"[{idx}/{total_searches}] Searching: \"{sq}\"  |  Have {len(all_results)}/{target}")

            try:
                url = "https://www.google.com/maps/search/" + sq.replace(" ", "+")
                page.goto(url, wait_until="domcontentloaded", timeout=30000)
                page.wait_for_timeout(3000)

                # Accept cookies / close popups if any
                for sel in ['button[aria-label="Accept all"]', 'button:has-text("Accept all")',
                            'button:has-text("I agree")', 'button[jsname="higCR"]']:
                    try:
                        btn = page.locator(sel).first
                        if btn.count():
                            btn.click()
                            page.wait_for_timeout(1000)
                            break
                    except Exception:
                        pass

                batch = scroll_and_collect(page, max_items=remaining + 50)
                new_count = 0
                for r in batch:
                    key = f"{r['name']}|{r['address']}"
                    if key not in all_results:
                        all_results[key] = r
                        new_count += 1
                        if len(all_results) >= target:
                            break

                log(f"  → +{new_count} new  |  Total: {len(all_results)}/{target}")

            except Exception as e:
                log(f"  → Error: {e}")
                continue

        browser.close()

    results_list = list(all_results.values())[:target]
    save_to_csv(results_list, output_file)

    log(f"\n{'='*60}")
    log(f"  Done! Saved {len(results_list)} results → {output_file}")
    log(f"{'='*60}\n")
    return results_list


def save_to_csv(results: list[dict], filename: str):
    if not results:
        log("No results to save.")
        return

    fields = ["name", "category", "rating", "reviews", "address", "url"]
    with open(filename, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in results:
            writer.writerow({k: row.get(k, "") for k in fields})


if __name__ == "__main__":
    # ── CLI usage ──────────────────────────────────────────────
    # python scraper.py "gym" "Jaipur" 500
    # python scraper.py "restaurant" "Delhi" 300 my_output.csv
    # ──────────────────────────────────────────────────────────
    if len(sys.argv) >= 4:
        _query = sys.argv[1]
        _city = sys.argv[2]
        _target = int(sys.argv[3])
        _out = sys.argv[4] if len(sys.argv) > 4 else ""
    else:
        print("\nGoogle Maps Scraper — Auto Area Expansion")
        print("-" * 42)
        _query = input("Search query  (e.g. gym):     ").strip()
        _city = input("City          (e.g. Jaipur):  ").strip()
        _target = int(input("Target count  (e.g. 500):    ").strip())
        _out = ""

    scrape(_query, _city, _target, _out)
