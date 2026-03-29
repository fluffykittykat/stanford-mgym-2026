#!/usr/bin/env python3
"""
Sync meets.json with GoStanford schedule data.
Deduplicates by date — updates existing meets rather than appending duplicates.

Deduplication Strategy:
- Meets are identified by date (unique key)
- When syncing, if a meet with the same date exists, merge data intelligently
- Preserves richer data: longer opponent strings, completed match results, etc.
- Never overwrites complete data with incomplete data

Usage:
  python3 sync_gostanford.py          # Validate current meets.json
  python3 -m sync_gostanford          # Run sync (when integrated with scraper)

Testing:
  python3 test_deduplication.py       # Run comprehensive test suite
"""

import json
import os
import sys
from datetime import datetime, timezone

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "data")
MEETS_FILE = os.path.join(DATA_DIR, "meets.json")


def load_meets():
    """Load existing meets.json."""
    if os.path.exists(MEETS_FILE):
        with open(MEETS_FILE, "r") as f:
            return json.load(f)
    return []


def save_meets(meets):
    """Save meets.json with consistent formatting."""
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(MEETS_FILE, "w") as f:
        json.dump(meets, f, indent=2)
        f.write("\n")


def merge_meet(existing, incoming):
    """Merge incoming meet data into existing meet, preserving richer data."""
    merged = dict(existing)
    for key, value in incoming.items():
        if key in merged:
            # Don't overwrite matchResults, athletes, or events with empty data
            if key in ("matchResults", "athletes", "events"):
                existing_val = merged.get(key)
                if existing_val and not value:
                    continue
            # For opponent, prefer more detailed/longer version (more opponents listed)
            if key == "opponent":
                existing_val = merged.get(key, "")
                # Keep existing if it's longer (more detailed)
                if existing_val and len(existing_val) >= len(value):
                    continue
            # Don't overwrite a real result with None or upcoming status
            if key == "result" and merged.get("result") and not value:
                continue
            if key == "status" and merged.get("result"):
                continue
        merged[key] = value
    return merged


def sync(incoming_meets):
    """
    Sync incoming meets with existing data.
    Deduplicates by date — updates existing meets, adds new ones.

    Args:
        incoming_meets: List of meet dicts from GoStanford scraper.

    Returns:
        Summary dict with counts.
    """
    existing = load_meets()

    # Index existing meets by date
    by_date = {}
    for meet in existing:
        by_date[meet["date"]] = meet

    added = 0
    updated = 0

    for incoming in incoming_meets:
        date = incoming["date"]
        if date in by_date:
            # Update existing meet — merge to preserve richer data
            by_date[date] = merge_meet(by_date[date], incoming)
            updated += 1
        else:
            # New meet
            by_date[date] = incoming
            added += 1

    # Sort by date
    merged = sorted(by_date.values(), key=lambda m: m["date"])

    save_meets(merged)

    return {
        "total": len(merged),
        "added": added,
        "updated": updated,
        "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }


if __name__ == "__main__":
    # When run directly, just validate and report on existing meets
    meets = load_meets()
    dates = [m["date"] for m in meets]
    duplicates = [d for d in dates if dates.count(d) > 1]

    if duplicates:
        print(f"WARNING: {len(set(duplicates))} duplicate date(s) found: {sorted(set(duplicates))}")
        sys.exit(1)
    else:
        print(f"OK: {len(meets)} meets, 0 duplicates")
