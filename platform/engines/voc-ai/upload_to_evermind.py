#!/usr/bin/env python3
"""Upload Solvea Content Engine skill graph to Evermind memory."""

import os
import time
from everos import EverOS

API_KEY = "41478317-7028-421a-ba94-50587a145b20"
GROUP_ID = "solvea_mkt"
SENDER_ID = "hunter"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# All 17 skill graph files in logical order
FILES = [
    "index.md",
    "voice/brand-voice.md",
    "voice/platform-tone.md",
    "platforms/x.md",
    "platforms/linkedin.md",
    "platforms/youtube.md",
    "platforms/instagram.md",
    "platforms/tiktok.md",
    "platforms/threads.md",
    "platforms/facebook.md",
    "platforms/newsletter.md",
    "engine/hooks.md",
    "engine/repurpose.md",
    "engine/scheduling.md",
    "engine/content-types.md",
    "audience/builders.md",
    "audience/casual.md",
]

client = EverOS(api_key=API_KEY)
base_ts = 1744300800000  # 2026-04-10T00:00:00 UTC

success = 0
failed = 0

for i, fpath in enumerate(FILES):
    full_path = os.path.join(BASE_DIR, fpath)
    if not os.path.exists(full_path):
        print(f"  SKIP {fpath} (not found)")
        failed += 1
        continue

    with open(full_path, "r") as f:
        content = f.read()

    # Tag with file path for retrieval context
    tagged_content = f"[Solvea Content Engine — {fpath}]\n\n{content}"

    try:
        resp = client.v1.memories.group.add(
            group_id=GROUP_ID,
            messages=[{
                "role": "user",
                "sender_id": SENDER_ID,
                "sender_name": "Solvea Content Engine",
                "timestamp": base_ts + (i * 60000),  # 1 min apart
                "content": tagged_content,
            }]
        )
        status = resp.data.status if resp.data else "unknown"
        print(f"  OK   {fpath} ({len(content)} chars) — {status}")
        success += 1
    except Exception as e:
        print(f"  FAIL {fpath} — {e}")
        failed += 1

    time.sleep(0.5)  # rate limit safety

print(f"\nDone: {success} uploaded, {failed} failed, group_id={GROUP_ID}")
