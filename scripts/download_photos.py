#!/usr/bin/env python3
"""Download all athlete photos from GCS (decoded from imgproxy URLs) and meet hero images."""

import json, urllib.request, os, time, base64, re

os.makedirs("public/images/athletes", exist_ok=True)
os.makedirs("public/images/meets", exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"}

def decode_imgproxy(url):
    """Extract underlying GCS URL from gostanford.com imgproxy URL."""
    parts = url.split('/')
    b64 = parts[-1].split('.')[0]
    b64 += '=' * (-len(b64) % 4)
    try:
        return base64.urlsafe_b64decode(b64).decode()
    except Exception:
        return url

def download(src_url, dest_path):
    req = urllib.request.Request(src_url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=15) as r:
        with open(dest_path, "wb") as out:
            out.write(r.read())

# --- Athlete photos ---
with open("data/photos.json") as f:
    photos = json.load(f)

new_photos = {}
for name, url in photos.items():
    slug = name.lower().replace(" ", "-").replace("'", "")
    # Decode imgproxy → GCS
    src = decode_imgproxy(url) if "imgproxy" in url else url
    ext = src.split(".")[-1].split("?")[0][:4] or "png"
    filename = slug + "." + ext
    path = "public/images/athletes/" + filename
    try:
        download(src, path)
        new_photos[name] = "/images/athletes/" + filename
        print("OK: " + name)
    except Exception as e:
        print("FAIL: " + name + ": " + str(e))
        new_photos[name] = url
    time.sleep(0.2)

with open("data/photos.json", "w") as f:
    json.dump(new_photos, f, indent=2)
local = sum(1 for v in new_photos.values() if v.startswith("/images"))
print("Saved " + str(local) + "/" + str(len(new_photos)) + " athlete photos locally")

# --- Meet photos ---
with open("data/meet_photos.json") as f:
    meet_photos = json.load(f)

new_meet_photos = {}
for date, mdata in meet_photos.items():
    hero_url = mdata.get("heroImage", "")
    if hero_url and hero_url.startswith("/images"):
        new_meet_photos[date] = mdata
        print("Already local: " + date)
        continue
    if hero_url and hero_url.startswith("http"):
        src = decode_imgproxy(hero_url) if "imgproxy" in hero_url else hero_url
        ext = src.split(".")[-1].split("?")[0][:4] or "jpg"
        filename = "meet-" + date + "." + ext
        path = "public/images/meets/" + filename
        try:
            download(src, path)
            mdata = dict(mdata)
            mdata["heroImage"] = "/images/meets/" + filename
            print("OK meet: " + date)
        except Exception as e:
            print("FAIL meet: " + date + ": " + str(e))
    new_meet_photos[date] = mdata
    time.sleep(0.2)

with open("data/meet_photos.json", "w") as f:
    json.dump(new_meet_photos, f, indent=2)
print("Done. " + str(len(new_meet_photos)) + " meet entries saved.")
