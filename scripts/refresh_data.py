#!/usr/bin/env python3
"""
Smart refresh script for Stanford Men's Gymnastics data.
Outputs a JSON summary to stdout. Idempotent — safe to run multiple times.
"""

import json
import os
import sys
from datetime import datetime, timezone

# Paths
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(SCRIPT_DIR, "..", "data")
OUTPUT_FILE = os.path.join(DATA_DIR, "meets.json")


def load_existing_meets():
    """Load existing meets.json if it exists."""
    if os.path.exists(OUTPUT_FILE):
        with open(OUTPUT_FILE, "r") as f:
            return json.load(f)
    return []


def refresh():
    """Main refresh logic. Returns summary dict."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    existing = load_existing_meets()

    if not existing:
        summary = {
            "meetsTotal": 0,
            "meetsUpdated": 0,
            "meetsInProgress": 0,
            "newMeets": 0,
            "pdfsRefetched": 0,
            "timestamp": now,
        }
        return summary

    # Mark all meets with lastRefreshed timestamp
    meets_updated = 0
    for meet in existing:
        old_refreshed = meet.get("lastRefreshed")
        meet["lastRefreshed"] = now
        if not old_refreshed:
            meets_updated += 1

    # Write back
    os.makedirs(DATA_DIR, exist_ok=True)
    with open(OUTPUT_FILE, "w") as f:
        json.dump(existing, f, indent=2)

    meets_in_progress = sum(1 for m in existing if m.get("status") == "in_progress")

    summary = {
        "meetsTotal": len(existing),
        "meetsUpdated": meets_updated,
        "meetsInProgress": meets_in_progress,
        "newMeets": 0,
        "pdfsRefetched": 0,
        "timestamp": now,
    }

    return summary


if __name__ == "__main__":
    summary = refresh()
    print(json.dumps(summary))
