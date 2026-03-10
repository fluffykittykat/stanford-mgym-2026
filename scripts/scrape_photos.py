#!/usr/bin/env python3
"""Scrape Stanford Men's Gymnastics roster headshots from gostanford.com"""

import json
import re
import urllib.request
import os

ROSTER_URL = "https://gostanford.com/sports/mens-gymnastics/roster"
OUT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "photos.json")

# Load bios to know which athletes we need
BIOS_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "bios.json")
with open(BIOS_FILE) as f:
    bios = json.load(f)
athlete_names = set(bios.keys())


def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  Failed to fetch {url}: {e}")
        return ""


def main():
    photos = {}

    # Step 1: Get roster page and find individual athlete page links
    print(f"Fetching {ROSTER_URL}...")
    html = fetch(ROSTER_URL)
    if not html:
        print("Failed to fetch roster page")
        return

    print(f"Got {len(html)} bytes")

    # Extract url= attributes from img tags (Vue lazy-loaded images with real URLs)
    # Pattern: <img ... url="https://gostanford.com/imgproxy/..." ... alt="Name" ...>
    url_attr_pattern = r'<img[^>]*\burl="([^"]+)"[^>]*\balt="([^"]*)"[^>]*>'
    url_alt_matches = re.findall(url_attr_pattern, html, re.IGNORECASE)
    # Also try reversed order
    url_attr_pattern2 = r'<img[^>]*\balt="([^"]*)"[^>]*\burl="([^"]+)"[^>]*>'
    alt_url_matches = re.findall(url_attr_pattern2, html, re.IGNORECASE)

    print(f"Found {len(url_alt_matches)} url+alt matches, {len(alt_url_matches)} alt+url matches")

    for url, alt in url_alt_matches:
        if alt.strip() and 'logo' not in url.lower():
            for athlete in athlete_names:
                if athlete.lower() == alt.strip().lower() or all(p in alt.lower() for p in athlete.lower().split()):
                    if athlete not in photos:
                        photos[athlete] = url
                        print(f"  Found (url attr): {athlete}")

    for alt, url in alt_url_matches:
        if alt.strip() and 'logo' not in url.lower():
            for athlete in athlete_names:
                if athlete.lower() == alt.strip().lower() or all(p in alt.lower() for p in athlete.lower().split()):
                    if athlete not in photos:
                        photos[athlete] = url
                        print(f"  Found (alt+url attr): {athlete}")

    # Step 2: Find individual athlete page links and scrape og:image
    roster_links = re.findall(r'href="(/sports/mens-gymnastics/roster/player/[^"]*)"', html, re.IGNORECASE)
    roster_links = list(set(roster_links))
    print(f"\nFound {len(roster_links)} individual athlete pages")

    for link in roster_links:
        url = f"https://gostanford.com{link}"
        page_html = fetch(url)
        if not page_html:
            continue

        # Get og:image
        og_match = re.search(r'property="og:image"[^>]*content="([^"]+)"', page_html)
        if not og_match:
            og_match = re.search(r'content="([^"]+)"[^>]*property="og:image"', page_html)

        # Get page name from title or h1
        name_match = re.search(r'<title>([^<|–-]+)', page_html)
        page_name = name_match.group(1).strip() if name_match else ""

        # Also try extracting url= attribute from hero image
        hero_url_match = re.search(r'<img[^>]*class="[^"]*roster-player-hero[^"]*"[^>]*url="([^"]+)"', page_html)
        if not hero_url_match:
            hero_url_match = re.search(r'<img[^>]*url="([^"]+)"[^>]*class="[^"]*roster-player-hero[^"]*"', page_html)

        img_url = None
        if hero_url_match:
            img_url = hero_url_match.group(1)
        elif og_match:
            img_url = og_match.group(1)

        if not img_url:
            # Try any imgproxy URL with headshot in title context
            headshot_match = re.search(r'title="[^"]*[Hh]eadshot[^"]*"[^>]*url="([^"]+)"', page_html)
            if not headshot_match:
                headshot_match = re.search(r'url="([^"]+)"[^>]*title="[^"]*[Hh]eadshot[^"]*"', page_html)
            if headshot_match:
                img_url = headshot_match.group(1)

        if not img_url:
            continue

        # Match to athlete name
        matched = None
        for athlete in athlete_names:
            if athlete in photos:
                continue
            parts = athlete.lower().split()
            # Check URL slug
            slug = link.lower()
            if all(p in slug for p in parts):
                matched = athlete
                break
            # Check page name
            if page_name and all(p in page_name.lower() for p in parts):
                matched = athlete
                break

        if matched:
            # Resize for headshots - use smaller size
            img_url = img_url.replace("rs:fit:1980:0", "rs:fit:400:0")
            photos[matched] = img_url
            print(f"  Found (individual page): {matched}")

    print(f"\nTotal: {len(photos)} photos for {len(athlete_names)} athletes")
    for name in sorted(athlete_names):
        status = "OK" if name in photos else "MISSING"
        print(f"  [{status}] {name}")

    with open(OUT_FILE, "w") as f:
        json.dump(photos, f, indent=2)
    print(f"\nWrote {OUT_FILE}")


if __name__ == "__main__":
    main()
