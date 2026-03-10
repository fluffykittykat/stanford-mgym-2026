#!/usr/bin/env python3
"""Scrape Stanford Men's Gymnastics meet hero images from gostanford.com"""

import json
import re
import urllib.request
import os

NEWS_URL = "https://gostanford.com/sports/mens-gymnastics/news"
SCHEDULE_URL = "https://gostanford.com/sports/mens-gymnastics/schedule"
BASE = "https://gostanford.com"
OUT_FILE = os.path.join(os.path.dirname(__file__), "..", "data", "meet_photos.json")

# Meet dates and opponents we want to find
TARGET_MEETS = {
    "2026-01-09": {"opponent": "Cal", "keywords": ["cal", "benefit", "cup", "berkeley"]},
    "2026-01-17": {"opponent": "Oklahoma", "keywords": ["oklahoma", "rocky mountain", "sooners"]},
    "2026-01-24": {"opponent": "Ohio State", "keywords": ["ohio state", "buckeyes", "osu"]},
    "2026-02-06": {"opponent": "Team Canada", "keywords": ["canada", "team canada"]},
    "2026-02-28": {"opponent": "International All-Stars", "keywords": ["international", "all-star", "all star"]},
}


def fetch(url):
    """Fetch URL and return HTML."""
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.read().decode("utf-8", errors="replace")
    except Exception as e:
        print(f"  Failed to fetch {url}: {e}")
        return ""


def find_article_links(html):
    """Find news article links from the news page."""
    links = []
    # Sidearm news pages have article links
    patterns = [
        r'<a[^>]*href="(/sports/mens-gymnastics/news/[^"]*)"[^>]*>',
        r'<a[^>]*href="(/news/\d{4}/[^"]*)"[^>]*>',
    ]
    for pat in patterns:
        links.extend(re.findall(pat, html, re.IGNORECASE))
    return list(set(links))


def find_hero_image(html):
    """Extract the hero/header image from an article page."""
    patterns = [
        # Sidearm hero image patterns
        r'<meta[^>]*property="og:image"[^>]*content="([^"]*)"',
        r'<img[^>]*class="[^"]*(?:hero|featured|story-image|article-image|header-image)[^"]*"[^>]*src="([^"]*)"',
        r'<img[^>]*src="([^"]*)"[^>]*class="[^"]*(?:hero|featured|story-image|article-image|header-image)[^"]*"',
        # CDN images in article body
        r'(https?://dxbhsrqyrr690\.cloudfront\.net/sidearm\.nextgen\.sites/gostanford\.com/images/[^"\'>\s]+\.(?:jpg|jpeg|png|webp))',
        # Large images
        r'<img[^>]*src="([^"]*(?:_header|_hero|_feature|_banner)[^"]*\.(?:jpg|jpeg|png|webp))"',
    ]
    for pat in patterns:
        match = re.search(pat, html, re.IGNORECASE)
        if match:
            src = match.group(1)
            if 'logo' not in src.lower() and 'icon' not in src.lower() and len(src) > 20:
                if src.startswith("//"):
                    src = "https:" + src
                elif src.startswith("/"):
                    src = BASE + src
                return src
    return None


def match_article_to_meet(article_url, article_html, meet_date, meet_info):
    """Check if an article matches a specific meet."""
    url_lower = article_url.lower()
    html_lower = article_html[:3000].lower()  # Check first 3000 chars

    # Check date match (various formats)
    date_parts = meet_date.split("-")
    year, month, day = date_parts
    month_int = int(month)
    day_int = int(day)

    date_in_url = f"{year}/{month}" in url_lower or f"{year}-{month}" in url_lower
    date_in_text = f"jan" in html_lower if month == "01" else f"feb" in html_lower if month == "02" else False

    # Check keyword match
    keyword_match = any(kw in url_lower or kw in html_lower for kw in meet_info["keywords"])

    return keyword_match and (date_in_url or date_in_text)


def scrape_generic_gymnastics_photos():
    """Find ANY gymnastics action shots from gostanford.com as fallbacks."""
    print("\nLooking for generic gymnastics photos from gostanford.com...")
    photos = []

    # Try the schedule page
    html = fetch(SCHEDULE_URL)
    if html:
        cdn_imgs = re.findall(
            r'(https?://dxbhsrqyrr690\.cloudfront\.net/sidearm\.nextgen\.sites/gostanford\.com/images/[^"\'>\s]+\.(?:jpg|jpeg|png|webp))',
            html, re.IGNORECASE
        )
        photos.extend(cdn_imgs)

    # Try the main sport page
    html = fetch(f"{BASE}/sports/mens-gymnastics")
    if html:
        cdn_imgs = re.findall(
            r'(https?://dxbhsrqyrr690\.cloudfront\.net/sidearm\.nextgen\.sites/gostanford\.com/images/[^"\'>\s]+\.(?:jpg|jpeg|png|webp))',
            html, re.IGNORECASE
        )
        photos.extend(cdn_imgs)

    # Try news page
    html = fetch(NEWS_URL)
    if html:
        cdn_imgs = re.findall(
            r'(https?://dxbhsrqyrr690\.cloudfront\.net/sidearm\.nextgen\.sites/gostanford\.com/images/[^"\'>\s]+\.(?:jpg|jpeg|png|webp))',
            html, re.IGNORECASE
        )
        photos.extend(cdn_imgs)

    # Filter out logos, icons, small images
    filtered = []
    for url in photos:
        lower = url.lower()
        if any(skip in lower for skip in ['logo', 'icon', 'sprite', 'banner_ad', 'sponsor', 'thumbnail_', '_thumb']):
            continue
        if any(good in lower for good in ['gymnast', 'gym', 'action', 'meet', 'competition', 'team', 'sport']):
            filtered.append(url)
        else:
            filtered.append(url)  # Keep it anyway as generic fallback

    return list(set(filtered))


def main():
    result = {}

    # Step 1: Fetch news page
    print(f"Fetching {NEWS_URL}...")
    news_html = fetch(NEWS_URL)
    if not news_html:
        print("Failed to fetch news page")
    else:
        print(f"Got {len(news_html)} bytes")

        # Find article links
        article_links = find_article_links(news_html)
        print(f"Found {len(article_links)} article links")

        # Also check og:image on each article
        for link in article_links[:30]:
            url = f"{BASE}{link}" if link.startswith("/") else link
            print(f"  Checking {url}...")
            article_html = fetch(url)
            if not article_html:
                continue

            for date, info in TARGET_MEETS.items():
                if date in result:
                    continue
                if match_article_to_meet(link, article_html, date, info):
                    hero = find_hero_image(article_html)
                    if hero:
                        result[date] = {
                            "heroImage": hero,
                            "recapUrl": url
                        }
                        print(f"  >> Matched meet {date} ({info['opponent']}): {hero[:80]}")

    # Step 2: Check og:image from news page items directly
    if news_html:
        # Look for article cards with images on the news listing page itself
        card_pattern = r'<a[^>]*href="([^"]*)"[^>]*>.*?<img[^>]*src="([^"]*)"[^>]*/?>.*?</a>'
        cards = re.findall(card_pattern, news_html, re.DOTALL | re.IGNORECASE)
        for href, img_src in cards:
            for date, info in TARGET_MEETS.items():
                if date in result:
                    continue
                href_lower = href.lower()
                if any(kw in href_lower for kw in info["keywords"]):
                    src = img_src
                    if src.startswith("//"):
                        src = "https:" + src
                    elif src.startswith("/"):
                        src = BASE + src
                    if 'logo' not in src.lower():
                        full_url = f"{BASE}{href}" if href.startswith("/") else href
                        result[date] = {"heroImage": src, "recapUrl": full_url}
                        print(f"  >> Found from news card for {date}: {src[:80]}")

    # Step 3: If we still have missing meets, try generic photos as fallback
    missing = [d for d in TARGET_MEETS if d not in result]
    if missing:
        print(f"\nMissing photos for {len(missing)} meets: {missing}")
        fallback_photos = scrape_generic_gymnastics_photos()
        print(f"Found {len(fallback_photos)} potential fallback photos")

        # Assign fallback photos to missing meets
        for i, date in enumerate(sorted(missing)):
            if i < len(fallback_photos):
                result[date] = {
                    "heroImage": fallback_photos[i],
                    "recapUrl": f"{BASE}/sports/mens-gymnastics"
                }
                print(f"  >> Fallback for {date}: {fallback_photos[i][:80]}")

    print(f"\nTotal meet photos found: {len(result)}")
    for date, data in sorted(result.items()):
        print(f"  {date}: {data['heroImage'][:80]}...")

    with open(OUT_FILE, "w") as f:
        json.dump(result, f, indent=2)
    print(f"\nWrote {OUT_FILE}")


if __name__ == "__main__":
    main()
