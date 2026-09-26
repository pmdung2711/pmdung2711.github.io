#!/usr/bin/env python3
"""Build data/gallery.json from a shared Google Drive folder.

Every subfolder of the root folder is an album. Each album folder holds its photos/videos
plus a metadata.json describing the album:

    📁 root (shared: Anyone with the link – Viewer)
       📁 Da Lat trip
          📄 metadata.json
          🖼 pine_forest.jpg
          🎞 waterfall.mp4
       📁 Cats
          📄 metadata.json
          🖼 mochi.png

metadata.json (every field optional):

    {
      "title": "Đà Lạt trip",               // default: folder name
      "date": "2025-03",                   // default: date prefix of the folder name
      "description": "Foggy mornings.",
      "cover": "pine_forest.jpg",           // default: first item
      "items": [                            // listed files come first, in this order
        { "file": "pine_forest.jpg", "caption": "Pine forest at dawn" },
        { "file": "waterfall.mp4", "caption": "Datanla falls", "date": "2025-03-13" },
        { "file": "blurry.jpg", "hidden": true }
      ]
    }

Files not listed in "items" are still shown (after the listed ones, oldest first) without
a caption. Files directly in the root folder go into an "Other" album.

Usage:
    export GDRIVE_API_KEY=...   # Google Cloud API key with the Drive API enabled
    python3 scripts/sync_gallery.py --folder <root folder id or link>   # first run
    python3 scripts/sync_gallery.py                                     # reuses the saved root folder
    python3 scripts/sync_gallery.py --dry-run                           # print, don't write
    python3 scripts/sync_gallery.py --scaffold drive-metadata           # starter metadata.json per album

data/gallery.json is generated: edit metadata.json in Drive, not gallery.json.
It never contains Drive folder IDs or links; the root folder is remembered in the
git-ignored file scripts/.drive-folder (or set $GDRIVE_FOLDER).
Only the Python standard library is used.
"""

import argparse
import json
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

API = "https://www.googleapis.com/drive/v3/files"
FOLDER = "application/vnd.google-apps.folder"
FIELDS = "nextPageToken, files(id, name, mimeType, description, createdTime, imageMediaMetadata/time)"
METADATA_NAME = "metadata.json"
DEFAULT_OUT = os.path.join(os.path.dirname(__file__), "..", "data", "gallery.json")
FOLDER_FILE = os.path.join(os.path.dirname(__file__), ".drive-folder")  # git-ignored
UNSORTED_TITLE = "Other"

# "2025 - Trip", "2025-03 – Trip", "2025-03-12_Trip" → ("2025-03-12", "Trip")
DATE_PREFIX = re.compile(r"^(\d{4}(?:-\d{2}){0,2})(?:\s*[-–—_.]?\s+|[-–—_.])(.+)$")

warnings = []


def warn(message):
    warnings.append(message)
    sys.stderr.write("warning: " + message + "\n")


def die(message):
    sys.stderr.write("error: " + message + "\n")
    sys.exit(1)


def folder_id_from(value):
    """Accept a bare ID or any Drive folder link."""
    match = re.search(r"/folders/([\w-]+)", value) or re.search(r"[?&]id=([\w-]+)", value)
    return match.group(1) if match else value.strip()


def split_date(name):
    match = DATE_PREFIX.match(name.strip())
    return (match.group(1), match.group(2).strip()) if match else ("", name.strip())


def slugify(text):
    text = unicodedata.normalize("NFD", text.lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn").replace("đ", "d")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-") or "album"


def is_media(f):
    return f["mimeType"].startswith(("image/", "video/"))


class Drive:
    def __init__(self, key):
        self.key = key

    def _get(self, url, params, what):
        params = dict(params, key=self.key)
        try:
            with urllib.request.urlopen(url + "?" + urllib.parse.urlencode(params), timeout=30) as res:
                return res.read()
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", "replace")
            if err.code in (403, 404):
                die("Drive said %d for %s.\n"
                    "  - Is the root folder shared as 'Anyone with the link – Viewer'?\n"
                    "  - Is the Drive API enabled for this key's project?\n%s" % (err.code, what, body))
            die("Drive API request failed for %s (%d): %s" % (what, err.code, body))
        except urllib.error.URLError as err:
            die("could not reach Google Drive: %s" % err.reason)

    def children(self, folder_id):
        """All non-trashed direct children of a folder."""
        files, token = [], None
        while True:
            params = {
                "q": "'%s' in parents and trashed = false" % folder_id,
                "fields": FIELDS,
                "pageSize": 1000,
                "orderBy": "name",
                "supportsAllDrives": "true",
                "includeItemsFromAllDrives": "true",
            }
            if token:
                params["pageToken"] = token
            data = json.loads(self._get(API, params, "folder " + folder_id))
            files.extend(data.get("files", []))
            token = data.get("nextPageToken")
            if not token:
                return files

    def download(self, file_id):
        return self._get(API + "/" + file_id, {"alt": "media", "supportsAllDrives": "true"}, "file " + file_id)

    def media_in(self, folder_id):
        """Images and videos in a folder and all of its subfolders."""
        found = []
        for f in self.children(folder_id):
            if f["mimeType"] == FOLDER:
                found.extend(self.media_in(f["id"]))
            elif is_media(f):
                found.append(f)
        return found


def strip_json_comments(text):
    """Allow // line comments in metadata.json (outside of strings)."""
    out, in_str, esc, i = [], False, False, 0
    while i < len(text):
        c = text[i]
        if in_str:
            out.append(c)
            esc = (c == "\\" and not esc)
            if c == '"' and not esc:
                in_str = False
        elif c == '"':
            in_str = True
            out.append(c)
        elif text.startswith("//", i):
            while i < len(text) and text[i] != "\n":
                i += 1
            continue
        else:
            out.append(c)
        i += 1
    return "".join(out)


def read_metadata(drive, meta_file, album_name):
    if meta_file is None:
        warn('album "%s" has no %s; using the folder name' % (album_name, METADATA_NAME))
        return {}
    if meta_file["mimeType"] == "application/vnd.google-apps.document":
        warn('"%s/%s" is a Google Doc, not a plain file; upload a real .json file' % (album_name, METADATA_NAME))
        return {}
    raw = drive.download(meta_file["id"]).decode("utf-8-sig")
    try:
        meta = json.loads(strip_json_comments(raw))
    except ValueError as err:
        die('"%s/%s" is not valid JSON: %s' % (album_name, METADATA_NAME, err))
    if not isinstance(meta, dict):
        die('"%s/%s" must be a JSON object { ... }' % (album_name, METADATA_NAME))
    items = meta.get("items", [])
    if isinstance(items, dict):  # also accept { "file.jpg": "caption" }
        items = [{"file": k, "caption": v} for k, v in items.items()]
    meta["items"] = [it if isinstance(it, dict) else {"file": str(it)} for it in items]
    return meta


def file_date(f):
    taken = (f.get("imageMediaMetadata") or {}).get("time", "")  # "2025:03:12 08:10:22"
    if re.match(r"^\d{4}:\d{2}:\d{2}", taken):
        return taken[:10].replace(":", "-")
    return f.get("createdTime", "")[:10]


def build_album(drive, folder, files, meta_file):
    name_date, name_title = split_date(folder["name"])
    meta = read_metadata(drive, meta_file, folder["name"])

    by_name = {}
    for f in files:
        if f["mimeType"] in ("image/heic", "image/heif"):
            warn('"%s/%s" is HEIC; Drive thumbnails may not render, export as JPG' % (folder["name"], f["name"]))
        if f["name"] in by_name:
            warn('"%s" has two files named "%s"; captions go to the first' % (folder["name"], f["name"]))
            continue
        by_name[f["name"]] = f

    def make_item(f, entry):
        return {
            "id": f["id"],
            "type": "video" if f["mimeType"].startswith("video/") else "image",
            "caption": str(entry.get("caption") or f.get("description") or "").strip(),
            "date": str(entry.get("date") or file_date(f)),
        }

    listed, used = [], set()
    for entry in meta["items"] if meta else []:
        name = entry.get("file", "")
        f = by_name.get(name)
        if f is None:
            warn('"%s/%s" lists "%s" but no such image/video is in the folder' % (folder["name"], METADATA_NAME, name))
            continue
        used.add(name)
        if not entry.get("hidden"):
            listed.append(make_item(f, entry))

    rest = [make_item(f, {}) for n, f in by_name.items() if n not in used]
    rest.sort(key=lambda it: it["date"])
    items = listed + rest

    cover = ""
    if meta.get("cover"):
        f = by_name.get(meta["cover"])
        if f:
            cover = f["id"]
        else:
            warn('"%s/%s": cover "%s" not found' % (folder["name"], METADATA_NAME, meta["cover"]))

    title = str(meta.get("title") or name_title)
    return {
        "title": title,
        "slug": str(meta.get("slug") or slugify(title)),
        "date": str(meta.get("date") or name_date),
        "description": str(meta.get("description") or "").strip(),
        "cover": cover,
        "items": items,
        "_files": sorted(by_name),  # for --scaffold
        "_has_meta": meta_file is not None,
    }


def split_children(children):
    meta = next((c for c in children if c["name"].lower() == METADATA_NAME), None)
    return meta, [c for c in children if c["mimeType"] == FOLDER], [c for c in children if is_media(c)]


def scaffold(albums, directory):
    """Write a starter metadata.json per album for the user to fill in and upload."""
    for album in albums:
        if album["_has_meta"]:
            print("  skip %s (already has %s in Drive)" % (album["_folder_name"], METADATA_NAME))
            continue
        path = os.path.join(directory, re.sub(r'[\\/:*?"<>|]', "_", album["_folder_name"]))
        os.makedirs(path, exist_ok=True)
        target = os.path.join(path, METADATA_NAME)
        template = {
            "title": album["title"],
            "date": album["date"],
            "description": "",
            "cover": album["_files"][0] if album["_files"] else "",
            "items": [{"file": name, "caption": ""} for name in album["_files"]],
        }
        with open(target, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(template, ensure_ascii=False, indent=2) + "\n")
        print("  wrote %s" % os.path.relpath(target))
    print("Fill these in, then upload each metadata.json into its album folder in Drive.")


def main():
    parser = argparse.ArgumentParser(description="Build data/gallery.json from a Google Drive folder.")
    parser.add_argument("--folder", help="root folder ID or link (default: $GDRIVE_FOLDER or the one saved last time)")
    parser.add_argument("--key", help="API key (default: $GDRIVE_API_KEY)")
    parser.add_argument("--out", default=DEFAULT_OUT, help="path to gallery.json")
    parser.add_argument("--dry-run", action="store_true", help="print the result instead of writing it")
    parser.add_argument("--scaffold", metavar="DIR",
                        help="write a starter metadata.json for every album that lacks one into DIR")
    parser.add_argument("--strict", action="store_true", help="exit with an error if there are warnings")
    args = parser.parse_args()

    out = os.path.abspath(args.out)
    saved = ""
    if os.path.exists(FOLDER_FILE):
        with open(FOLDER_FILE, encoding="utf-8") as fh:
            saved = fh.read().strip()
    elif os.path.exists(out):  # older versions stored it in gallery.json
        with open(out, encoding="utf-8") as fh:
            saved = json.load(fh).get("rootFolderId", "")

    key = args.key or os.environ.get("GDRIVE_API_KEY")
    if not key:
        die("no API key. Set GDRIVE_API_KEY or pass --key.")
    root = folder_id_from(args.folder or os.environ.get("GDRIVE_FOLDER") or saved)
    if not root:
        die("no root folder. Pass --folder <id or link> once; it is saved for next time.")
    if root != saved:
        with open(FOLDER_FILE, "w", encoding="utf-8") as fh:
            fh.write(root + "\n")

    drive = Drive(key)
    root_meta, subfolders, loose = split_children(drive.children(root))

    albums = []
    for folder in subfolders:
        meta_file, nested, media = split_children(drive.children(folder["id"]))
        for sub in nested:
            media.extend(drive.media_in(sub["id"]))
        album = build_album(drive, folder, media, meta_file)
        album["_folder_name"] = folder["name"]
        albums.append(album)
        print("  %-32s %3d items" % (album["title"][:32], len(album["items"])))

    # Newest albums first; undated ones last, alphabetical
    albums.sort(key=lambda a: a["title"].lower())
    albums.sort(key=lambda a: a["date"], reverse=True)

    if loose:
        album = build_album(drive, {"id": root, "name": UNSORTED_TITLE}, loose, root_meta)
        album["_folder_name"] = UNSORTED_TITLE
        albums.append(album)
        print("  %-32s %3d items (files directly in the root folder)" % (album["title"][:32], len(album["items"])))

    if args.scaffold:
        scaffold(albums, args.scaffold)
        return

    for album in albums:
        for k in [k for k in album if k.startswith("_")]:
            del album[k]
    result = {"albums": albums}
    text = json.dumps(result, ensure_ascii=False, indent=2) + "\n"

    if args.strict and warnings:
        die("%d warning(s); not writing %s" % (len(warnings), os.path.relpath(out)))
    if args.dry_run:
        print(text)
        return
    with open(out, "w", encoding="utf-8") as fh:
        fh.write(text)
    total = sum(len(a["items"]) for a in albums)
    print("Wrote %d albums, %d items → %s" % (len(albums), total, os.path.relpath(out)))


if __name__ == "__main__":
    main()
