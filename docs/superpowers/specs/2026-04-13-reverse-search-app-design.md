# Reverse Search App — Design Spec
**Date:** 2026-04-13  
**Project:** ReverseSearchApp  
**Stack:** Node.js + Express + Puppeteer  
**Platform:** Local web app (browser UI, local server)

---

## 1. Goal

A locally-hosted web application that reverse-searches uploaded images and videos across 6 search engines simultaneously. Results are displayed in a dark terminal-aesthetic UI with tabbed results per file and per engine. Each result is a clickable link that opens the source URL.

---

## 2. Aesthetic & UI

**Theme:** Dark terminal / cyber — near-black background (`#050510`), CRT scanline overlay.

**Typography:**
- `Orbitron` (Google Fonts) — headings, logo, search button
- `JetBrains Mono` — body text, result URLs, engine chips
- `Share Tech Mono` — labels, status bar, sub-text

**Fluorescent accent palette:**
- `#39ff14` — result scores, active engine tab, "engines complete" status
- `#00e5ff` — active file tab, result URLs, file chips
- `#ff00ff` — scan button, video frame count badge
- `#00ff99` — logo glow, Tor ON indicator

**Layout (single page):**
1. **Topbar** — logo (`▸ REVERSE TRACE`) + Tor ON/OFF toggle
2. **Drop zone** — drag-and-drop or browse; accepts JPG, PNG, GIF, WEBP, MP4, MOV, AVI; multiple files
3. **File queue** — chips showing queued files with remove (✕) button
4. **Engine selector** — toggle chips for each engine (GOOGLE, YANDEX, TINEYE, BING, SAUCENAO, BAIDU); click to toggle on/off
5. **Scan button** — `⬡ INITIATE SCAN` (magenta, Orbitron)
6. **Results container:**
   - Top tab row: one tab per uploaded file; video tabs show `[N frames]` badge
   - Inner tab row: one tab per selected engine with result count `ENGINE (N)`
   - Results grid: 3-column card grid; each card has thumbnail preview, clickable URL (opens in new tab), match score
7. **Status bar** — engines complete count, Tor exit node IP

---

## 3. Architecture

```
ReverseSearchApp/
├── server.js                  # Express entry point
├── config.js                  # API keys + settings (not committed)
├── src/
│   ├── connectors/
│   │   ├── google.js          # Google Vision API (official REST)
│   │   ├── tineye.js          # TinEye API (official REST)
│   │   ├── bing.js            # Bing Visual Search API (official REST)
│   │   ├── saucenao.js        # SauceNAO API (official REST)
│   │   ├── yandex.js          # Yandex Images (Puppeteer headless)
│   │   └── baidu.js           # Baidu Image Search (Puppeteer headless)
│   ├── video/
│   │   └── extractor.js       # ffmpeg keyframe extraction (1 frame per 5s)
│   └── tor/
│       └── proxy.js           # socks-proxy-agent → 127.0.0.1:9050
├── public/
│   ├── index.html             # Single-page UI
│   ├── app.js                 # Frontend JS (upload, SSE listener, tab rendering)
│   └── styles.css             # Dark theme styles
├── uploads/                   # Temp storage — auto-deleted after search completes
└── package.json
```

---

## 4. Search Engine Connectors

| Engine | Method | Auth required |
|---|---|---|
| Google Vision | REST API | API key (paid) |
| TinEye | REST API | API key (free tier: 100/month) |
| Bing Visual Search | REST API | API key (free tier: 1000/month) |
| SauceNAO | REST API | API key (free) |
| Yandex Images | Puppeteer — upload to `yandex.com/images/search` | None |
| Baidu Image Search | Puppeteer — upload to `image.baidu.com` | None |

All connectors return a uniform result shape:
```js
{
  engine: 'google',       // string
  url: 'https://...',     // source page URL
  title: '...',           // page/image title
  thumbnail: 'https://...', // preview image URL (may be null)
  score: 0.98,            // match confidence 0–1 (null if engine doesn't provide)
  sourceFile: 'photo1.jpg', // which uploaded file this result is for
  frameIndex: null        // null for images; integer frame index for video
}
```

---

## 5. Video Handling

- Accepted formats: MP4, MOV, AVI
- On upload, `extractor.js` runs `ffmpeg` to extract one frame every 5 seconds
- Each frame saved as a JPEG to `uploads/<jobId>/frames/`
- Each frame is then treated identically to an uploaded image — passed to all selected connectors
- In the UI, the video's tab shows `[N frames]` and results are sub-grouped by frame index

**Dependency:** `ffmpeg` must be installed on the host machine (`brew install ffmpeg` on macOS).

---

## 6. Tor Routing

- Toggle in the UI sends `useTor: true/false` with each search request
- When enabled, all HTTP requests (API calls + Puppeteer) route through `socks5://127.0.0.1:9050`
- API connectors: use `socks-proxy-agent` with `axios`
- Puppeteer connectors: launch with `--proxy-server=socks5://127.0.0.1:9050`
- **Prerequisite:** Tor must be running locally (`brew install tor && tor` on macOS)
- If Tor is toggled ON but not running, server returns a clear error: `TOR_NOT_RUNNING`

---

## 7. Data Flow

```
1. User drops files + selects engines + clicks SCAN
2. POST /api/search  (multipart: files[], engines[], useTor)
3. Server saves files to uploads/<jobId>/
4. For each file:
   a. If video → extract frames to uploads/<jobId>/frames/
   b. For each image/frame → fire selected connectors in parallel (Promise.allSettled)
5. Results streamed to client via SSE (GET /api/search/:jobId/stream)
6. Frontend receives SSE events, populates tabs live as engines respond
7. On stream close → server deletes uploads/<jobId>/ (cleanup)
```

---

## 8. API Keys & Config

`config.js` (gitignored) exports:
```js
module.exports = {
  google: { apiKey: '', cx: '' },      // Google Vision + Custom Search
  tineye: { apiKey: '' },
  bing: { apiKey: '' },
  saucenao: { apiKey: '' },
}
```

App runs without any API keys — engines with missing keys are automatically disabled and shown as greyed-out in the UI with a tooltip: `API key not configured`.

---

## 9. Error Handling

- Per-engine failures are isolated — one engine failing does not block others
- Failed engines show an error state tab: `ENGINE (error)` in red
- Upload size limit: 100MB per file, 500MB total per job
- Unsupported file types rejected at upload with clear message
- Tor not running: immediate error banner, Tor toggle reverts to OFF

---

## 10. Out of Scope

- User accounts / authentication
- Persistent results database
- Scheduling / batch automation
- Any dark web / .onion site crawling
