# Zoho Analytics Gallery

A lightweight, self-hosted asset gallery for browsing, searching, and managing Zoho Analytics media assets — including screenshots, illustrations, and videos.

![Node.js](https://img.shields.io/badge/Node.js-Built--in_modules-339933?logo=node.js&logoColor=white)
![No Dependencies](https://img.shields.io/badge/Dependencies-None-brightgreen)
![License](https://img.shields.io/badge/License-Internal-blue)

---

## Features

- **Gallery Grid** — Responsive card-based layout displaying all assets with lazy loading.
- **Filter by Type** — Quickly filter assets by category: All, Illustrations, Screenshots, or Videos.
- **Search** — Real-time debounced search to find assets by title.
- **Asset Preview** — Click any card to open a full-size lightbox preview (supports images and videos).
- **Copy URL** — One-click copy of any asset's full URL to the clipboard.
- **Add Assets** — Upload new assets via a modal form with live preview, type selection, and duplicate detection.
- **Admin Mode** — Password-protected admin mode that enables asset deletion with a confirmation dialog.
- **Zero Dependencies** — The Node.js server uses only built-in modules (`http`, `fs`, `path`). No npm install required.
- **Persistent Storage** — All gallery data is stored in a single `gallery.json` file.

---

## Project Structure

```
Zoho Gallery/
├── index.html       # Main HTML page (gallery UI, modals, templates)
├── styles.css       # Complete stylesheet (responsive, animations, dark theme)
├── script.js        # Client-side application logic (rendering, search, modals, CRUD)
├── server.js        # Node.js server (static files + REST API)
├── gallery.json     # Gallery data store (base URL + array of image/video items)
└── analytics-dark.png  # Favicon / branding asset
```

---

## Getting Started

### Prerequisites

- **Node.js** (v14 or later)

### Installation & Running

1. **Clone or download** the project folder.

2. **Start the server:**

   ```bash
   node server.js
   ```

3. **Open your browser** and visit:

   ```
   http://localhost:3000
   ```

That's it — no `npm install` needed!

---

## API Endpoints

The server exposes a simple REST API for managing gallery data:

| Method   | Endpoint              | Description                          |
|----------|-----------------------|--------------------------------------|
| `GET`    | `/api/gallery`        | Fetch all gallery items              |
| `POST`   | `/api/gallery`        | Add a new item (JSON body: `src`, `title`, `type`) |
| `DELETE` | `/api/gallery`        | Delete an item by `src` (JSON body: `src`)         |
| `POST`   | `/api/admin/verify`   | Verify admin password (JSON body: `password`)      |

### Example — Add a new asset

```bash
curl -X POST http://localhost:3000/api/gallery \
  -H "Content-Type: application/json" \
  -d '{"src": "/sites/zweb/images/analytics/new-feature.png", "title": "New Feature", "type": "screenshot"}'
```

### Example — Delete an asset

```bash
curl -X DELETE http://localhost:3000/api/gallery \
  -H "Content-Type: application/json" \
  -d '{"src": "/sites/zweb/images/analytics/new-feature.png"}'
```

---

## Usage Guide

### Browsing & Searching

- Use the **filter tabs** (All / Illustrations / Screenshots / Videos) to narrow assets by type.
- Type in the **search bar** to filter assets by title in real time.
- Click any card or the **Preview** button to open the full-size lightbox.
- Click **Copy URL** on any card to copy the asset's full URL to your clipboard.

### Adding Assets

1. Click the **+ Add Asset** button in the top bar.
2. Enter the **URL path** (relative to the base URL), a **title**, and select the asset **type**.
3. A live preview will appear to confirm the asset loads correctly.
4. Click **Add to Gallery** — the asset is saved to `gallery.json` and immediately appears in the grid.

### Admin Mode (Deleting Assets)

1. Click the **Admin** button (lock icon) in the top-right corner.
2. Enter the admin password in the login modal.
3. Once authenticated, delete buttons appear on each card.
4. Click the trash icon on any card, then confirm in the dialog to permanently remove it.
5. Click the **Admin ON** button again to exit admin mode.

> **Default admin password:** `zoho@admin`
> You can change this in `server.js` by editing the `ADMIN_PASSWORD` constant.

---

## Configuration

| Setting            | File        | Description                                |
|--------------------|-------------|--------------------------------------------|
| `PORT`             | `server.js` | Server port (default: `3000`)              |
| `ADMIN_PASSWORD`   | `server.js` | Password required to enable admin/delete mode |
| `baseUrl`          | `gallery.json` | Base URL prepended to all asset `src` paths |

---

## Tech Stack

| Layer      | Technology                     |
|------------|--------------------------------|
| Frontend   | Vanilla HTML5, CSS3, JavaScript (ES6+) |
| Backend    | Node.js (built-in `http`, `fs`, `path` modules) |
| Font       | [Inter](https://fonts.google.com/specimen/Inter) via Google Fonts |
| Data Store | JSON file (`gallery.json`)     |
