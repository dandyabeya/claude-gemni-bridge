# Claude to Gemini Bridge — Firefox Edition

A two-way communication system between Claude Code (CLI) and Google Gemini Pro in your Firefox browser. Claude sends live progress updates to Gemini and can read Gemini's responses. Supports multiple channels so different Claude instances and Gemini tabs can be paired independently.

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
                         │  Firefox Extension  │
                         │  - background.js polls per-channel
                         │  - content.js injects into matched tab
                         └────────────────────┘
```

## Key Differences from Chrome Version

| Feature | Chrome | Firefox |
|---------|--------|---------|
| Manifest version | V3 | V2 |
| Background script | Service worker (can go inactive) | Persistent background script (always alive) |
| Polling method | `chrome.alarms` + `setTimeout` fallback | Simple `setInterval` (reliable) |
| API namespace | `chrome.*` | `browser.*` (Promise-based) |
| Message passing | Callback-based | Promise-based |
| Installation | Load unpacked at `chrome://extensions` | Load temporary at `about:debugging` |

The Firefox version is actually **more reliable** because the background script stays alive — no service worker lifecycle issues.

## Files

All files are located in `~/.claude/gemini-bridge/extension-firefox/`:

| File | Purpose |
|------|---------|
| `manifest.json` | Extension config (Manifest V2, gecko-compatible) |
| `background.js` | Persistent background script, polls per-channel |
| `content.js` | Injects messages into Gemini, scrapes responses |
| `popup.html` | Extension popup — assign channels, view tab status |
| `popup.js` | Popup logic (Promise-based Firefox API) |
| `icon.png` | Extension icon |

Shared files in `~/.claude/gemini-bridge/`:

| File | Purpose |
|------|---------|
| `server.js` | Local HTTP server with per-channel routing |
| `send-update.sh` | Sends a message to a specific channel |
| `read-response.sh` | Reads Gemini's last response from a channel |
| `chat.sh` | Interactive chat script (single message or REPL mode) |
| `start.sh` | Starts the server in the background |
| `stop.sh` | Stops the server |
| `diagnose.html` | Browser-based diagnostic tool |

## Setup

### Step 1: Start the bridge server

```bash
~/.claude/gemini-bridge/start.sh
```

The server is shared between Chrome and Firefox — same server, same channels, same scripts.

### Step 2: Install the Firefox extension

1. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`
2. Click **"Load Temporary Add-on..."**
3. Navigate to `~/.claude/gemini-bridge/extension-firefox/`
4. Select the `manifest.json` file
5. The "Claude → Gemini Bridge" extension should appear

**Note:** Temporary add-ons in Firefox are removed when Firefox closes. For permanent installation, you need to sign the extension via [addons.mozilla.org](https://addons.mozilla.org) or set `xpinstall.signatures.required` to `false` in `about:config` (Developer/Nightly editions only).

### Step 3: Open Gemini tabs and assign channels

1. Open one or more tabs at `https://gemini.google.com`
2. Start a new chat in each tab
3. Give each Gemini tab its role, for example:

> You are my project coordinator for the backend project. You will receive live updates from Claude Code. Keep track of progress, summarize what has been completed, flag blockers, and brief me when I ask.

4. Click the **extension icon** on each Gemini tab
5. Type a **channel name** (e.g. `backend`, `frontend`, `ml-pipeline`) and click **Assign**

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

**Read Gemini's last response on a channel:**
```bash
~/.claude/gemini-bridge/read-response.sh backend
```

**Send a raw update (used by Claude Code):**
```bash
~/.claude/gemini-bridge/send-update.sh "message" "project-name" "status" "channel"
```

### Multi-Channel Workflow

```
Terminal 1 (Claude Code - backend work)
  → sends updates to channel "backend"
  → Gemini Tab 1 (Firefox) receives and tracks backend progress

Terminal 2 (Claude Code - frontend work)
  → sends updates to channel "frontend"
  → Gemini Tab 2 (Firefox) receives and tracks frontend progress

Terminal 3 (your PyCharm terminal)
  → chat.sh -c backend "What's the status?"
  → reads from Gemini Tab 1
```

### Running Chrome and Firefox simultaneously

Both extensions share the same server and channels. You can:
- Assign channel "backend" to a Chrome Gemini tab
- Assign channel "frontend" to a Firefox Gemini tab
- Both receive updates independently on their channels

## Extension Controls

Click the extension icon in Firefox to see:

- **Connection status**: Green dot = server running, red = not detected
- **Channel assignment**: Set the channel for the current Gemini tab
- **Active tabs list**: All open Gemini tabs and their assigned channels

## API Endpoints

Same server as the Chrome version. Runs on `127.0.0.1:52945`.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/c/<channel>/updates` | Get pending updates for a channel |
| POST | `/c/<channel>/updates` | Send an update to a channel |
| POST | `/c/<channel>/clear` | Clear delivered updates |
| GET | `/c/<channel>/response` | Read Gemini's last response |
| POST | `/c/<channel>/response` | Post Gemini's response (used by extension) |
| GET | `/channels` | List all channels |
| GET | `/health` | Server health check |

## Troubleshooting

### Extension disappears after restarting Firefox
Temporary add-ons don't persist. Re-load it from `about:debugging`. For permanent installation, see the signing note in Setup Step 2.

### Extension says "Bridge server not running"
- Run `~/.claude/gemini-bridge/start.sh`
- Check: `curl http://127.0.0.1:52945/health`

### Updates not appearing in Gemini
- Make sure the Gemini tab has a **channel assigned** (click extension icon)
- Check the **Browser Console** (Ctrl+Shift+J) for `[Claude Bridge]` logs
- Check pending updates: `curl http://127.0.0.1:52945/c/CHANNEL_NAME/updates`

### Content script not loading
- Go to `about:debugging#/runtime/this-firefox`
- Click **Inspect** on the extension
- Check the console for errors
- Try reloading the extension and refreshing the Gemini tab

### Response scraping not working
- Open DevTools (F12) on the Gemini tab
- Check Console for `[Claude Bridge]` logs
- If selectors are outdated, update `content.js` `scrapeLastResponse()`

### Run the diagnostic tool
Open in Firefox: `file:///home/dandyabeya/.claude/gemini-bridge/diagnose.html`

## Notes

- The server only listens on `127.0.0.1` (localhost) — no external access
- Firefox's persistent background script means **no service worker wake-up issues**
- The `browser.*` API is Promise-based (cleaner than Chrome's callback style)
- Channel data is stored as JSON in `~/.claude/gemini-bridge/channels/`
- Tab-to-channel mappings are in `browser.storage.local`, cleaned up on tab close
- Gemini's UI selectors may change — update `content.js` if needed
