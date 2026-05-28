#!/usr/bin/env python3
"""
Solvea Content Engine — Smart Sync to Evermind

Usage:
  python3 sync.py                  # sync only changed files
  python3 sync.py --all            # force re-upload all files
  python3 sync.py --file hooks.md  # sync one specific file
  python3 sync.py --status         # check what's changed since last sync
"""

import os
import sys
import json
import hashlib
import time
from everos import EverOS

API_KEY = "41478317-7028-421a-ba94-50587a145b20"
GROUP_ID = "solvea_mkt"
SENDER_ID = "hunter"
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
HASH_FILE = os.path.join(BASE_DIR, ".sync_hashes.json")

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


def file_hash(path):
    with open(path, "r") as f:
        return hashlib.md5(f.read().encode()).hexdigest()


def load_hashes():
    if os.path.exists(HASH_FILE):
        with open(HASH_FILE, "r") as f:
            return json.load(f)
    return {}


def save_hashes(hashes):
    with open(HASH_FILE, "w") as f:
        json.dump(hashes, f, indent=2)


def get_changed_files(old_hashes):
    changed = []
    for fpath in FILES:
        full = os.path.join(BASE_DIR, fpath)
        if not os.path.exists(full):
            continue
        h = file_hash(full)
        if old_hashes.get(fpath) != h:
            changed.append(fpath)
    return changed


def upload_files(file_list, client):
    base_ts = int(time.time() * 1000)
    success = 0
    for i, fpath in enumerate(file_list):
        full = os.path.join(BASE_DIR, fpath)
        with open(full, "r") as f:
            content = f.read()
        tagged = f"[Solvea Content Engine — {fpath}]\n\n{content}"
        try:
            resp = client.v1.memories.group.add(
                group_id=GROUP_ID,
                messages=[{
                    "role": "user",
                    "sender_id": SENDER_ID,
                    "sender_name": "Solvea Content Engine",
                    "timestamp": base_ts + (i * 60000),
                    "content": tagged,
                }]
            )
            print(f"  OK   {fpath} ({len(content)} chars)")
            success += 1
        except Exception as e:
            print(f"  FAIL {fpath} — {e}")
        time.sleep(0.3)
    return success


def main():
    args = sys.argv[1:]
    old_hashes = load_hashes()
    client = EverOS(api_key=API_KEY)

    # --status: just show what changed
    if "--status" in args:
        changed = get_changed_files(old_hashes)
        if not changed:
            print("All files in sync. No changes since last upload.")
        else:
            print(f"{len(changed)} file(s) changed since last sync:")
            for f in changed:
                print(f"  * {f}")
        return

    # --file: sync one specific file
    if "--file" in args:
        idx = args.index("--file")
        if idx + 1 < len(args):
            target = args[idx + 1]
            # Match partial paths
            matches = [f for f in FILES if target in f]
            if not matches:
                print(f"No file matching '{target}'. Available files:")
                for f in FILES:
                    print(f"  {f}")
                return
            to_upload = matches
        else:
            print("Usage: sync.py --file <filename>")
            return
    elif "--all" in args:
        to_upload = FILES
    else:
        to_upload = get_changed_files(old_hashes)

    if not to_upload:
        print("Nothing to sync. All files unchanged.")
        return

    print(f"Syncing {len(to_upload)} file(s) to Evermind (group: {GROUP_ID})...\n")
    count = upload_files(to_upload, client)

    # Flush to trigger processing
    try:
        client.v1.memories.group.flush(group_id=GROUP_ID)
        print(f"\nFlushed. {count} file(s) synced and processing.")
    except Exception as e:
        print(f"\nUploaded {count} file(s). Flush failed: {e}")

    # Update hashes for uploaded files
    new_hashes = old_hashes.copy()
    for fpath in to_upload:
        full = os.path.join(BASE_DIR, fpath)
        if os.path.exists(full):
            new_hashes[fpath] = file_hash(full)
    save_hashes(new_hashes)


if __name__ == "__main__":
    main()
