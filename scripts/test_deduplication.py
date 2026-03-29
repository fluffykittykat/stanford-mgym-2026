#!/usr/bin/env python3
"""
Test suite for deduplication logic in meets.json and sync_gostanford.py
Tests:
1. No duplicate dates in meets.json
2. All 10 meets are present
3. All images exist
4. March 14 has 4 match results
5. Sync deduplication works correctly
6. No data loss when merging
"""

import json
import os
import sys
import tempfile
import shutil
from pathlib import Path
from datetime import datetime

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
MEETS_FILE = os.path.join(DATA_DIR, "meets.json")
PUBLIC_DIR = os.path.join(PROJECT_ROOT, "public")

# Import the sync module
sys.path.insert(0, SCRIPT_DIR)
from sync_gostanford import load_meets, sync, merge_meet


class TestResults:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.tests = []

    def test(self, name, condition, message=""):
        if condition:
            self.passed += 1
            self.tests.append(f"✓ {name}")
        else:
            self.failed += 1
            self.tests.append(f"✗ {name}: {message}")

    def report(self):
        for test in self.tests:
            print(test)
        print()
        print(f"Results: {self.passed} passed, {self.failed} failed")
        return self.failed == 0


def test_meets_json():
    """Test that meets.json is properly formatted and has no duplicates."""
    results = TestResults()

    # Load meets.json
    try:
        with open(MEETS_FILE) as f:
            meets = json.load(f)
        results.test("Load meets.json", True)
    except Exception as e:
        results.test("Load meets.json", False, str(e))
        return results

    # Test 1: Verify 10 meets
    results.test("Total meets count", len(meets) == 10, f"Got {len(meets)} instead of 10")

    # Test 2: No duplicate dates
    dates = [m["date"] for m in meets]
    unique_dates = set(dates)
    results.test("No duplicate dates", len(dates) == len(unique_dates))

    if len(dates) != len(unique_dates):
        duplicates = [d for d in unique_dates if dates.count(d) > 1]
        for d in duplicates:
            print(f"  Duplicate: {d} ({dates.count(d)} times)")

    # Test 3: All meets have required fields
    for meet in meets:
        has_id = "id" in meet
        has_date = "date" in meet
        has_opponent = "opponent" in meet
        results.test(f"Meet {meet.get('date')} has id", has_id)
        results.test(f"Meet {meet.get('date')} has date", has_date)
        results.test(f"Meet {meet.get('date')} has opponent", has_opponent)

    # Test 4: All images exist
    all_images_exist = True
    for meet in meets:
        image_path = os.path.join(PUBLIC_DIR, meet.get("image", "").lstrip("/"))
        if not os.path.exists(image_path):
            print(f"  Missing: {image_path}")
            all_images_exist = False

    results.test("All images exist", all_images_exist)

    # Test 5: March 14 has 4 match results
    march_14 = next((m for m in meets if m["date"] == "2026-03-14"), None)
    if march_14:
        match_results = march_14.get("matchResults", [])
        results.test("March 14 has matchResults", "matchResults" in march_14)
        results.test("March 14 has 4 match results", len(match_results) == 4, f"Got {len(match_results)}")

        # Verify 4 opponents on March 14
        march_14_opponent = march_14.get("opponent", "")
        has_4_opponents = all(
            name in march_14_opponent
            for name in ["California", "Air Force", "Team France", "Team Quebec"]
        )
        results.test("March 14 lists all 4 opponents", has_4_opponents)
    else:
        results.test("March 14 meet exists", False, "Not found in meets.json")

    return results


def test_deduplication_logic():
    """Test that the sync deduplication logic works correctly."""
    results = TestResults()

    # Test merge_meet function
    existing = {
        "date": "2026-01-17",
        "id": "rocky-mountain-open-jan-17",
        "opponent": "Oklahoma / Nebraska / Air Force",
        "location": "Clune Arena, Colorado Springs, CO",
        "isHome": False,
        "result": "L",
        "stanfordScore": 320.75,
        "opponentScore": 323.95,
        "image": "/images/meets/meet-2026-01-17.png",
        "athletes": [{"name": "Test Athlete", "team": "Stanford", "scores": {}}],
    }

    incoming = {
        "date": "2026-01-17",
        "id": "rocky-mountain-open-jan-17",
        "opponent": "Oklahoma",  # Different/incomplete
        "location": "Clune Arena, Colorado Springs, CO",
        "isHome": False,
    }

    merged = merge_meet(existing, incoming)

    # Verify that more complete data is preserved
    results.test("Merge preserves complete opponent data", merged["opponent"] == "Oklahoma / Nebraska / Air Force")
    results.test("Merge preserves complete location", merged["location"] == "Clune Arena, Colorado Springs, CO")
    results.test("Merge preserves athletes data", "athletes" in merged and len(merged["athletes"]) > 0)

    # Test that new fields are added
    incoming_with_new_field = dict(incoming)
    incoming_with_new_field["newField"] = "test value"
    merged2 = merge_meet(existing, incoming_with_new_field)
    results.test("Merge adds new fields", merged2.get("newField") == "test value")

    return results


def test_sync_logic():
    """Test the sync function with mock data."""
    results = TestResults()

    # Create a temporary directory for test
    with tempfile.TemporaryDirectory() as tmpdir:
        # Mock meets.json with some initial data
        test_meets_file = os.path.join(tmpdir, "meets.json")
        initial_meets = [
            {"date": "2026-01-09", "id": "test-1", "opponent": "Cal", "image": "/test.png"},
            {"date": "2026-01-17", "id": "test-2", "opponent": "Oklahoma", "image": "/test.png"},
        ]

        with open(test_meets_file, "w") as f:
            json.dump(initial_meets, f)

        # Mock sync by replacing the MEETS_FILE globally (for this test only)
        original_meets_file = sys.modules["sync_gostanford"].MEETS_FILE
        sys.modules["sync_gostanford"].MEETS_FILE = test_meets_file

        try:
            # Test 1: Adding a new meet
            new_meets = [
                {"date": "2026-01-09", "id": "test-1", "opponent": "Cal", "image": "/test.png", "location": "Berkeley"},
                {"date": "2026-01-17", "id": "test-2", "opponent": "Oklahoma / Nebraska / Air Force", "image": "/test.png"},
                {"date": "2026-02-06", "id": "test-3", "opponent": "Team Canada", "image": "/test.png"},
            ]

            summary = sync(new_meets)

            # Reload and verify
            with open(test_meets_file) as f:
                synced_meets = json.load(f)

            results.test("Sync adds new meets", summary["added"] == 1, f"Got {summary['added']} added")
            results.test("Sync updates existing meets", summary["updated"] == 2, f"Got {summary['updated']} updated")
            results.test("Sync total is correct", summary["total"] == 3, f"Got {summary['total']} meets")
            results.test("No duplicate dates after sync", len(set(m["date"] for m in synced_meets)) == 3)

            # Verify deduplication
            dates = [m["date"] for m in synced_meets]
            results.test("No date appears twice", len(dates) == len(set(dates)))

        finally:
            sys.modules["sync_gostanford"].MEETS_FILE = original_meets_file

    return results


def main():
    print("=" * 60)
    print("DEDUPLICATION TEST SUITE")
    print("=" * 60)
    print()

    all_results = []

    print("TEST 1: meets.json Integrity")
    print("-" * 60)
    r1 = test_meets_json()
    all_results.append(r1)
    if r1.report():
        print("✓ meets.json integrity checks PASSED")
    else:
        print("✗ meets.json integrity checks FAILED")
    print()

    print("TEST 2: Deduplication Logic")
    print("-" * 60)
    r2 = test_deduplication_logic()
    all_results.append(r2)
    if r2.report():
        print("✓ Deduplication logic checks PASSED")
    else:
        print("✗ Deduplication logic checks FAILED")
    print()

    print("TEST 3: Sync Function")
    print("-" * 60)
    r3 = test_sync_logic()
    all_results.append(r3)
    if r3.report():
        print("✓ Sync function checks PASSED")
    else:
        print("✗ Sync function checks FAILED")
    print()

    # Summary
    total_passed = sum(r.passed for r in all_results)
    total_failed = sum(r.failed for r in all_results)

    print("=" * 60)
    print(f"OVERALL RESULTS: {total_passed} passed, {total_failed} failed")
    print("=" * 60)

    if total_failed == 0:
        print("✓ All tests passed!")
        return 0
    else:
        print("✗ Some tests failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
