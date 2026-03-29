# Claude to Gemini Bridge

A two-way communication system between Claude Code (CLI) and Google Gemini Pro in your browser. Claude sends live progress updates to Gemini and can read Gemini's responses. Supports multiple channels so different Claude instances and Gemini tabs can be paired independently.

**Supports both Google Chrome and Mozilla Firefox.**

## Architecture

```
Claude Code Instance A ──┐                    ┌── Gemini Tab (channel: backend)
Claude Code Instance B ──┤                    ├── Gemini Tab (channel: frontend)
Your Terminal ───────────┤                    ├── Gemini Tab (channel: ml-pipeline)
                         v                    v
                  Local Node.js Server (port 52945)
                   /c/<channel>/updates  (send → Gemini)
                   /c/<channel>/response (read ← Gemini)
                         ^                    ^
                         │  Browser Extension  │
                         │  (Chrome or Firefox) │
                         │  - background script polls per-channel
                         │  - content script injects into matched tab
                         └────────────────────┘
```

**Flow:**
1. A message is sent to the server on a specific channel
2. The browser extension's background script polls all active channels
3. Updates are routed to the Gemini tab assigned to that channel
4. The content script types the message into Gemini and clicks send
5. After Gemini responds, the content script scrapes the response and posts it back
6. The response can be read from the terminal or by Claude Code

## Files

All files are located in `~/.claude/gemini-bridge/`:

| File | Purpose |
|------|---------|
| `server.js` | Local HTTP server with per-channel routing |
| `send-update.sh` | Sends a message to a specific channel |
| `read-response.sh` | Reads Gemini's last response from a channel |
| `chat.sh` | Interactive chat script (single message or REPL mode) |
| `start.sh` | Starts the server in the background |
| `stop.sh` | Stops the server |
| `diagnose.html` | Browser-based diagnostic tool |
| `channels/` | Per-channel data (updates queue, last response) |
| `extension/` | Chrome extension (Manifest V3) |
| `extension-firefox/` | Firefox extension (Manifest V2) |

### Chrome Extension Files (`extension/`)

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V3 config |
| `background.js` | Service worker — uses `chrome.alarms` for reliable polling |
| `content.js` | Injects messages into Gemini, scrapes responses |
| `popup.html` / `popup.js` | Channel assignment UI |
| `icon.png` | Extension icon |

### Firefox Extension Files (`extension-firefox/`)

| File | Purpose |
|------|---------|
| `manifest.json` | Manifest V2 config with gecko settings |
| `background.js` | Persistent background script — uses `setInterval` |
| `content.js` | Injects messages into Gemini, scrapes responses |
| `popup.html` / `popup.js` | Channel assignment UI (Promise-based API) |
| `icon.png` | Extension icon |

## Browser Comparison

| Feature | Chrome | Firefox |
|---------|--------|---------|
| Manifest version | V3 | V2 |
| Background script | Service worker (can go inactive) | Persistent (always alive) |
| Polling method | `chrome.alarms` + `setTimeout` fallback | Simple `setInterval` |
| API namespace | `chrome.*` (callback-based) | `browser.*` (Promise-based) |
| Installation | Load unpacked at `chrome://extensions` | Load temporary at `about:debugging` |
| Persistence | Persists across restarts | Temporary unless signed |

The Firefox version is **more reliable** because the background script stays alive — no service worker lifecycle issues.

## Setup

### Step 1: Start the bridge server

```bash
~/.claude/gemini-bridge/start.sh
```

The server is shared between both browsers — same server, same channels, same scripts. To stop:

```bash
~/.claude/gemini-bridge/stop.sh
```

### Step 2a: Install on Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode** (toggle top-right)
3. Click **Load unpacked**
4. Select: `~/.claude/gemini-bridge/extension/`

### Step 2b: Install on Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on..."**
3. Navigate to `~/.claude/gemini-bridge/extension-firefox/`
4. Select the `manifest.json` file

**Note:** Temporary Firefox add-ons are removed when Firefox closes. For permanent installation, sign the extension via [addons.mozilla.org](https://addons.mozilla.org) or set `xpinstall.signatures.required` to `false` in `about:config` (Developer/Nightly editions only).

### Step 3: Open Gemini tabs and assign channels

1. Open one or more tabs at `https://gemini.google.com` (in Chrome, Firefox, or both)
2. Start a new chat in each tab
3. Give each Gemini tab its role:

> You are my project coordinator for the backend project. You will receive live updates from Claude Code. Keep track of progress, summarize what has been completed, flag blockers, and brief me when I ask.

4. Click the **extension icon** on each Gemini tab
5. Type a **channel name** (e.g. `backend`, `frontend`) and click **Assign**

**Important (Chrome only):** After installing or reloading the extension, **hard refresh** each Gemini tab (Ctrl+Shift+R).

## Usage

### From the terminal (PyCharm, VS Code, any terminal)

**Send a single message to a channel:**
```bash
~/.claude/gemini-bridge/chat.sh -c backend "Finished the API refactor, all tests pass"
```

**Interactive chat on a channel:**
```bash
~/.claude/gemini-bridge/chat.sh -c frontend
```

**Chat on the default channel:**
```bash
~/.claude/gemini-bridge/chat.sh "Hello Gemini"
```

**List all active channels:**
```bash
~/.claude/gemini-bridge/chat.sh --list
```

**Read Gemini's last response:**
```bash
~/.claude/gemini-bridge/read-response.sh backend
```

**Send a raw update (used by Claude Code):**
```bash
~/.claude/gemini-bridge/send-update.sh "message" "project-name" "status" "channel"
```

Status values: `completed`, `in-progress`, `blocked`, `error`, `update`

### From Claude Code

Claude Code targets a channel using:
```bash
~/.claude/gemini-bridge/send-update.sh "Built auth module" "my-app" "completed" "backend"
~/.claude/gemini-bridge/read-response.sh backend
```

### Multi-Channel + Multi-Browser Workflow

```
Terminal 1 (Claude Code - backend)
  → channel "backend" → Chrome Gemini Tab 1

Terminal 2 (Claude Code - frontend)
  → channel "frontend" → Firefox Gemini Tab 1

Terminal 3 (your PyCharm terminal)
  → chat.sh -c backend "Status?"   → reads from Chrome tab
  → chat.sh -c frontend "Blockers?" → reads from Firefox tab
```

Both browsers share the same server and channels. You can mix and match freely.

## Extension Controls

Click the extension icon to see:

- **Connection status**: Green = server running, red = not detected
- **Channel assignment**: Set the channel for the current Gemini tab
- **Active tabs list**: All Gemini tabs and their assigned channels

## API Endpoints

Server runs on `127.0.0.1:52945`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/c/<channel>/updates` | Get pending updates for a channel |
| POST | `/c/<channel>/updates` | Send an update to a channel |
| POST | `/c/<channel>/clear` | Clear delivered updates |
| GET | `/c/<channel>/response` | Read Gemini's last response |
| POST | `/c/<channel>/response` | Post Gemini's response (used by extension) |
| GET | `/channels` | List all channels |
| GET | `/health` | Server health check |

Legacy routes without `/c/` prefix use the `default` channel.

### POST /c/<channel>/updates body

```json
{
  "message": "What was done",
  "project": "project-name",
  "status": "completed"
}
```

### GET /c/<channel>/response returns

```json
{
  "response": "Gemini's reply text...",
  "timestamp": "2026-03-29T12:00:00.000Z"
}
```

## Troubleshooting

### Server issues
- **"Bridge server not running"**: Run `~/.claude/gemini-bridge/start.sh`
- **Port in use**: `lsof -i :52945` to check, then kill the old process
- **Server logs**: `cat ~/.claude/gemini-bridge/server.log`

### Chrome-specific
- **Service worker inactive**: Extension uses `chrome.alarms` but Gemini tabs must be refreshed after reload
- **"Receiving end does not exist"**: Reload extension, then hard refresh Gemini tabs (Ctrl+Shift+R)

### Firefox-specific
- **Extension disappears after restart**: Temporary add-ons don't persist — re-load from `about:debugging`
- **Debug the extension**: `about:debugging` → click Inspect on the extension

### Both browsers
- **Updates not appearing**: Check channel is assigned (click extension icon), refresh Gemini tab
- **Response scraping fails**: Open DevTools (F12) → Console → look for `[Claude Bridge]` logs
- **Selectors outdated**: Google may update Gemini's UI — update selectors in `content.js`
- **Check pending updates**: `curl http://127.0.0.1:52945/c/CHANNEL/updates`

### Diagnostic tool
Open in either browser: `file:///home/dandyabeya/.claude/gemini-bridge/diagnose.html`

## Notes

- Server listens on `127.0.0.1` only — no external access
- Channel data stored as JSON in `~/.claude/gemini-bridge/channels/`
- Tab-to-channel mappings stored in each browser's extension storage, cleaned up on tab close
- Gemini's UI selectors may change with Google updates — update `content.js` if needed
- Both extensions can run simultaneously on the same server
