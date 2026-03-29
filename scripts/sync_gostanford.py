#!/usr/bin/env python3
"""
Sync meets.json with GoStanford schedule data.
Deduplicates by date — updates existing meets rather than appending duplicates.
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


def validate_meets(meets):
    """
    Validate meets data for integrity.
    Returns (is_valid, error_message).
    """
    if not meets:
        return False, "No meets loaded"
    
    dates = [m.get("date") for m in meets]
    
    # Check for missing dates
    missing_dates = [i for i, d in enumerate(dates) if d is None]
    if missing_dates:
        return False, f"Meets at indices {missing_dates} missing 'date' field"
    
    # Check for duplicates by date
    duplicates = [d for d in set(dates) if dates.count(d) > 1]
    if duplicates:
        return False, f"Duplicate date(s) found: {sorted(duplicates)}"
    
    # Check for missing image field
    no_images = [m.get("id", "?") for m in meets if not m.get("image")]
    if no_images:
        return False, f"Meets without images: {no_images}"
    
    # Validate date format (YYYY-MM-DD)
    import re
    bad_dates = [d for d in dates if not re.match(r'^\d{4}-\d{2}-\d{2}$', d)]
    if bad_dates:
        return False, f"Invalid date formats: {bad_dates}"
    
    return True, f"✓ Valid: {len(meets)} meets, 0 duplicates, all images present"


if __name__ == "__main__":
    # When run directly, validate and report on existing meets
    meets = load_meets()
    is_valid, message = validate_meets(meets)
    
    print(message)
    sys.exit(0 if is_valid else 1)
