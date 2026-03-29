#!/usr/bin/env python3
"""
Test suite for sync_gostanford.py deduplication logic.
Ensures meets are never duplicated by date when syncing.

Issue #8: Prevent duplicate meets in meets.json
"""

import json
import sys
import tempfile
import os
from sync_gostanford import merge_meet, sync

def test_merge_preserves_rich_data():
    """Test that merge_meet preserves athletes/events/matchResults over empty updates."""
    existing = {
        "date": "2026-01-17",
        "opponent": "Oklahoma / Nebraska / Air Force",
        "athletes": [{"name": "Athlete1", "scores": {}}],
        "events": {"floor": {"stanford": 54.3}},
        "matchResults": [{"opponent": "Team A", "result": "W"}],
        "result": "L",
    }
    
    incoming = {
        "date": "2026-01-17",
        "opponent": "Updated Opponent",  # Opponent can be updated
        "athletes": [],  # Empty - should preserve existing
        "events": {},  # Empty - should preserve existing
        "matchResults": [],  # Empty - should preserve existing
        "result": None,  # None result - should preserve existing
    }
    
    merged = merge_meet(existing, incoming)
    
    # Opponent can be updated
    assert merged["opponent"] == "Updated Opponent", "Should allow opponent update"
    # But rich structural data should be preserved
    assert len(merged["athletes"]) == 1, "Should preserve non-empty athletes data"
    assert "floor" in merged["events"], "Should preserve non-empty events data"
    assert len(merged["matchResults"]) == 1, "Should preserve non-empty matchResults"
    assert merged["result"] == "L", "Should preserve non-None result"
    print("✓ test_merge_preserves_rich_data passed")


def test_deduplication_by_date():
    """Test that sync() deduplicates meets by date."""
    existing = [
        {"date": "2026-01-17", "opponent": "Oklahoma", "id": "old-event"},
        {"date": "2026-02-28", "opponent": "Intl", "id": "intl-event"},
    ]
    
    incoming = [
        {"date": "2026-01-17", "opponent": "Oklahoma / Nebraska", "id": "updated-event"},
        {"date": "2026-03-14", "opponent": "Quad", "id": "new-event"},
    ]
    
    # Simulate sync with temp file
    with tempfile.TemporaryDirectory() as tmpdir:
        meets_file = os.path.join(tmpdir, "meets.json")
        
        # Save existing
        with open(meets_file, "w") as f:
            json.dump(existing, f)
        
        # Monkey-patch the path
        import sync_gostanford
        old_meets_file = sync_gostanford.MEETS_FILE
        sync_gostanford.MEETS_FILE = meets_file
        
        try:
            result = sync(incoming)
            
            # Should have 3 total (2 existing + 1 new), with 1 updated
            assert result["total"] == 3, f"Expected 3 meets, got {result['total']}"
            assert result["updated"] == 1, f"Expected 1 updated, got {result['updated']}"
            assert result["added"] == 1, f"Expected 1 added, got {result['added']}"
            
            # Verify no duplicates
            with open(meets_file) as f:
                synced = json.load(f)
            
            dates = [m["date"] for m in synced]
            dups = [d for d in set(dates) if dates.count(d) > 1]
            assert not dups, f"Found duplicate dates: {dups}"
            
            print("✓ test_deduplication_by_date passed")
        finally:
            sync_gostanford.MEETS_FILE = old_meets_file


def test_no_data_loss_on_update():
    """Test that updating a meet preserves important fields."""
    existing = [
        {
            "date": "2026-02-28",
            "opponent": "Intl All-Stars / California / Team Mexico / Team USA",
            "id": "stanford-intl-feb-28",
            "result": "W",
            "stanfordScore": 323.9,
            "opponentScore": 312.85,
            "image": "/images/meets/meet-2026-02-28.png",
            "athletes": [{"name": "Athlete1"}],
            "events": {"floor": {"stanford": 54.8}},
            "matchResults": [{"opponent": "Team A", "result": "W"}],
        }
    ]
    
    incoming = [
        {
            "date": "2026-02-28",
            "opponent": "Intl All-Stars",  # Sparser
            "result": None,
            "athletes": [],
            "events": {},
            "matchResults": [],
        }
    ]
    
    with tempfile.TemporaryDirectory() as tmpdir:
        meets_file = os.path.join(tmpdir, "meets.json")
        
        with open(meets_file, "w") as f:
            json.dump(existing, f)
        
        import sync_gostanford
        old_meets_file = sync_gostanford.MEETS_FILE
        sync_gostanford.MEETS_FILE = meets_file
        
        try:
            result = sync(incoming)
            
            with open(meets_file) as f:
                synced = json.load(f)
            
            meet = synced[0]
            
            # All important data should be preserved
            assert meet["result"] == "W", "Result should be preserved"
            assert meet["stanfordScore"] == 323.9, "Scores should be preserved"
            assert len(meet["athletes"]) > 0, "Athletes should be preserved"
            assert len(meet["events"]) > 0, "Events should be preserved"
            assert len(meet["matchResults"]) > 0, "Match results should be preserved"
            
            print("✓ test_no_data_loss_on_update passed")
        finally:
            sync_gostanford.MEETS_FILE = old_meets_file


if __name__ == "__main__":
    try:
        test_merge_preserves_rich_data()
        test_deduplication_by_date()
        test_no_data_loss_on_update()
        print("\n✅ All deduplication tests passed!")
    except AssertionError as e:
        print(f"\n❌ Test failed: {e}")
        sys.exit(1)
