# Dustin's Gallery 🐾

Personal portfolio at **https://pmdung2711.github.io**. It's plain HTML, CSS, and JavaScript with no build step, served by GitHub Pages.

## Pages

| Page | File |
| --- | --- |
| Home (hero, profile, where I live) | `index.html` |
| Journey timeline | `journey.html` |
| Gallery albums (Google Drive) | `gallery.html` + `data/gallery.json` |
| Blog list / single post | `blog.html`, `post.html` + `posts/` |
| Learning courses / study desks | `learning.html` + `data/learning.json` + `learning/` |
| Not found | `404.html` |

Text wrapped in `<span class="placeholder">` shows a yellow highlight. Replace it with your own content, then remove the span.

## Preview locally

The gallery and blog load their JSON and Markdown files with `fetch`, so opening the HTML file directly won't work. Start a local server instead:

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

## Gallery albums

The gallery page shows a shelf of albums. Clicking one opens `gallery.html?album=<slug>`. Give each album its own subfolder in Drive, under one shared root folder:

```
📁 Dustin's Gallery (public)   ← Share → "Anyone with the link – Viewer"
   📁 2025 - Da Lat trip
   📁 2024 - Moving to HCMC
   📁 Cats
```

Everything inside the root folder inherits its sharing, so keep private files out of it.

### Add an album

Add an entry to `albums` in `data/gallery.json`. Albums appear in the order listed.

```json
{
  "title": "Da Lat trip",
  "date": "2025-03",
  "description": "Pine forests and foggy mornings.",
  "cover": "<file id to use as cover, optional (defaults to the first item)>",
  "items": []
}
```

The album link is built from the title (e.g. `da-lat-trip`). Add `"slug": "..."` to set it yourself.

### Add a photo or video to an album

1. In Drive, right-click the file → **Share** → **Copy link**, for example `https://drive.google.com/file/d/1AbCdEfG.../view`.
2. The part between `/d/` and `/view` is the file ID. Add it to the album's `items`:
   ```json
   { "id": "1AbCdEfG...", "type": "image", "caption": "Sunset", "date": "2025-03-12" }
   ```
   For a video, use `"type": "video"`.

Photos should be JPG or PNG; export iPhone HEIC as JPG. Videos should be MP4, and Drive needs a few minutes to process a new one before it plays.

The site never links to your Drive folders, and `gallery.json` contains no folder IDs. Visitors only see the individual photos and videos listed in it.

### Sync albums from Drive automatically

`scripts/sync_gallery.py` builds `data/gallery.json` from your shared Drive folder. Each subfolder is an album, described by a `metadata.json` placed inside that folder:

```
📁 Dustin's Gallery (public)
   📁 Da Lat trip
      📄 metadata.json
      🖼 pine_forest.jpg
      🎞 waterfall.mp4
```

```json
{
  "title": "Đà Lạt trip",
  "date": "2025-03",
  "description": "Pine forests, foggy mornings and too much coffee.",
  "cover": "pine_forest.jpg",
  "items": [
    { "file": "pine_forest.jpg", "caption": "Pine forest at dawn" },
    { "file": "waterfall.mp4", "caption": "Datanla falls", "date": "2025-03-13" },
    { "file": "market.jpg" },
    { "file": "blurry.jpg", "hidden": true }
  ]
}
```

A copy is in `scripts/metadata.example.json`.

- **Every field is optional.** The title falls back to the folder name, and the date to a folder name prefix like `2025-03 - …`.
- **`items`** matches files by their exact name in Drive. Listed files appear first, in the order listed.
  - `caption` and `date` are optional. Without a date, the photo's EXIF "taken" time is used, or else the upload date.
  - `"hidden": true` leaves a file off the site.
  - Files you don't list still appear, after the listed ones, without a caption.
- **Nested folders:** files in subfolders of an album belong to that album.
- **Root files:** files directly in the root folder form an "Other" album.
- **Format:** `metadata.json` must be a plain uploaded file, not a Google Doc. `//` comments are allowed.

`data/gallery.json` is generated, so edit `metadata.json` in Drive rather than `gallery.json`.

One-time setup: in [Google Cloud Console](https://console.cloud.google.com/), create a project, enable **Google Drive API**, then create an **API key** and restrict it to the Drive API. The key only runs on your machine and is never published.

```sh
export GDRIVE_API_KEY=your-key
python3 scripts/sync_gallery.py --folder "https://drive.google.com/drive/folders/<root id>"   # first time
python3 scripts/sync_gallery.py --scaffold drive-metadata  # starter metadata.json per album, listing every file
python3 scripts/sync_gallery.py            # later runs reuse the saved folder (kept in git-ignored scripts/.drive-folder)
python3 scripts/sync_gallery.py --dry-run  # preview without writing
python3 scripts/sync_gallery.py --strict   # refuse to write if anything looks wrong
```

With `--scaffold`, fill in the generated files and upload each one into its album folder. Then run the sync again, and commit and push `data/gallery.json`. The `drive-metadata/` folder is git-ignored.

## Write a blog post

1. Create `posts/my-post-slug.md` in Markdown. Don't add a `# Title` line, because the title comes from `posts.json`.
2. Add an entry to `posts/posts.json`:
   ```json
   { "slug": "my-post-slug", "title": "My post", "date": "2025-02-14", "summary": "One line teaser", "tags": ["travel"] }
   ```
   Slugs can only use letters, numbers, and dashes.
3. Commit and push. The post appears at `post.html?slug=my-post-slug`.

## Add a course or study desk

The Learning page lists courses from `data/learning.json`. Clicking one opens `learning.html?course=<slug>`, which lists its study desks.

1. Put the study desk HTML in `learning/<course-slug>/`, e.g. `learning/claude-certification/ccao-f-study-desk.html`. Use a lowercase name without spaces.
2. Add it to the course's `materials` (or add a new course to `courses`):
   ```json
   {
     "title": "CCAO-F Study Desk",
     "subtitle": "Claude Certified Associate – Foundations",
     "description": "One line teaser",
     "href": "learning/claude-certification/ccao-f-study-desk.html",
     "tags": ["claude"]
   }
   ```
   A course without a `slug` gets one from its title.
3. Commit and push.

## Change the map

On openstreetmap.org, find your area, then go to **Share → HTML** and copy the `src` URL into the `<iframe class="map">` in `index.html`.
