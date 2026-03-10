#!/usr/bin/env python3
"""
Parse men's gymnastics score sheets (PDFs) into structured JSON.
Stanford Men's Gymnastics 2026 season.
"""

import json
import os
import re
import urllib.request
from pypdf import PdfReader

# Men's gymnastics events
EVENTS = ["floor", "pommel", "rings", "vault", "pbars", "hbar"]
EVENT_CODES = {"FX": "floor", "PH": "pommel", "SR": "rings", "VT": "vault", "PB": "pbars", "HB": "hbar"}

MEETS = [
    {
        "id": "usc-jan-17", "date": "2026-01-17", "opponent": "USC",
        "location": "Burnham Pavilion, Stanford, CA", "isHome": True,
    },
    {
        "id": "ohio-state-jan-23", "date": "2026-01-23", "opponent": "Ohio State",
        "location": "St. John Arena, Columbus, OH", "isHome": False,
    },
    {
        "id": "air-force-jan-30", "date": "2026-01-30", "opponent": "Air Force",
        "location": "Burnham Pavilion, Stanford, CA", "isHome": True,
    },
    {
        "id": "san-jose-state-feb-7", "date": "2026-02-07", "opponent": "San Jose State",
        "location": "Yoshihiro Uchida Hall, San Jose, CA", "isHome": False,
    },
    {
        "id": "naval-academy-feb-14", "date": "2026-02-14", "opponent": "Naval Academy",
        "location": "Burnham Pavilion, Stanford, CA", "isHome": True,
    },
    {
        "id": "illinois-feb-21", "date": "2026-02-21", "opponent": "Illinois",
        "location": "Burnham Pavilion, Stanford, CA", "isHome": True,
    },
    {
        "id": "cal-feb-28", "date": "2026-02-28", "opponent": "Cal",
        "location": "Haas Pavilion, Berkeley, CA", "isHome": False,
    },
    {
        "id": "michigan-mar-7", "date": "2026-03-07", "opponent": "Michigan",
        "location": "Burnham Pavilion, Stanford, CA", "isHome": True,
    },
]

DOWNLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "pdfs")
OUTPUT_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data", "meets.json")


def download_pdfs():
    """Download PDFs for meets that have URLs."""
    os.makedirs(DOWNLOAD_DIR, exist_ok=True)
    for meet in MEETS:
        if "url" not in meet:
            continue
        path = os.path.join(DOWNLOAD_DIR, f"{meet['id']}.pdf")
        if not os.path.exists(path):
            print(f"Downloading {meet['id']}...")
            urllib.request.urlretrieve(meet["url"], path)
        else:
            print(f"Already have {meet['id']}")


def parse_team_results(text):
    """Parse team results from a score sheet page."""
    results = {}
    for line in text.split("\n"):
        # Men's gymnastics: rank team FX PH SR VT PB HB Total
        m = re.match(
            r"(\d+)\s*(.+?)\s*([\d]{2}\.[\d]{2,3})\s*([\d]{2}\.[\d]{2,3})\s*([\d]{2}\.[\d]{2,3})\s*([\d]{2}\.[\d]{2,3})\s*([\d]{2}\.[\d]{2,3})\s*([\d]{2}\.[\d]{2,3})\s*([\d]{3}\.[\d]{2,3})",
            line,
        )
        if m:
            results[m.group(2).strip()] = {
                "rank": int(m.group(1)),
                "floor": float(m.group(3)), "pommel": float(m.group(4)),
                "rings": float(m.group(5)), "vault": float(m.group(6)),
                "pbars": float(m.group(7)), "hbar": float(m.group(8)),
                "total": float(m.group(9)),
            }
    return results


def parse_stanford_athletes(pages_text):
    """Parse Stanford athlete scores from NCAA score sheet pages."""
    athletes = {}

    for text in pages_text:
        if "Team: Stanford" not in text and "Team:Stanford" not in text:
            continue

        lines = text.split("\n")
        current_event = None
        current_scores = []

        for i, line in enumerate(lines):
            stripped = line.strip()

            # Detect event headers
            for code, event_name in EVENT_CODES.items():
                if stripped == code:
                    current_event = event_name
                    current_scores = []
                    break

            if current_event is None:
                continue

            # Score lines
            score_match = re.match(r"^(\d+)\s+", stripped)
            if score_match and "Name" not in stripped and "Judge" not in stripped:
                nums = re.findall(r"[\d]+\.[\d]+", stripped)
                if nums:
                    current_scores.append(float(nums[-1]))

    return list(athletes.values())


def main():
    print("=== Stanford Men's Gymnastics PDF Parser ===\n")
    print("Note: Using pre-built data from meets.json")
    print("PDF parsing available when score sheet URLs are configured.\n")

    # Check if meets.json already exists with data
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE) as f:
            existing = json.load(f)
        print(f"Found existing data: {len(existing)} meets")
        w = sum(1 for m in existing if m.get("result") == "W")
        l = sum(1 for m in existing if m.get("result") == "L")
        print(f"Season record: {w}-{l}")
    else:
        print("No meets.json found. Run refresh_data.py to generate.")


if __name__ == "__main__":
    main()
