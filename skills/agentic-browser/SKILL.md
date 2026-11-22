---
name: agentic-browser
description: Start the virtual browser API & live web UI and control browser sessions/pages via the `ab.exe` (`agb`) CLI. Use when the user asks to launch the virtual browser, open or test pages in the agentic browser, inspect accessibility snapshots, take screenshots, or click/fill/scroll elements via CLI.
---

# Agentic Browser (API + UI + CLI)

Control virtual browser sessions (**Camoufox** anti-detect Firefox and **Puppeteer** Chromium) with a live web UI (`http://localhost:3777`) using the bundled Go CLI.

## Locating Plugin Files

Relative to this `SKILL.md` (`skills/agentic-browser/SKILL.md`), the plugin root is `../..`:
- Server entrypoint: `<plugin_root>/dist/index.js`
- Built UI assets: `<plugin_root>/ui/dist/` (served automatically by the server)
- CLI binary: `<plugin_root>/bin/ab.exe` (Windows)

On Windows PowerShell, resolve the plugin root dynamically if needed, or check the current workspace if working inside the repo:
- Installed plugin path: `C:\Users\<user>\.gemini\config\plugins\agent-browser-plugin\`
- Fallback inside source repo: `./dist/index.js` and `./bin/ab.exe`

## Step 1: Ensure API + UI Server Is Running

Check health first before starting a duplicate process:

```powershell
curl.exe -sS http://127.0.0.1:3777/api/v1/health
```

Expected response: `{"ok":true}`.

If the server is not running:
1. Start `node "<plugin_root>\dist\index.js"` with `run_command` and `IsDaemon: true` (never block on a foreground server).
   - Optional env vars: `PORT` (default `3777`), `HOST` (default `127.0.0.1`), `BROWSER_ENGINE=camoufox|puppeteer` (default `camoufox`), `AGENTIC_BROWSER_HEADLESS=true|false`, `AGENTIC_BROWSER_DEFAULT_URL`.
2. Re-check `http://127.0.0.1:3777/api/v1/health` until it returns `{"ok":true}`.
3. Share the live UI URL `http://localhost:3777` with the user so they can watch and interact with the live browser canvas (mouse, wheel, keyboard, paste, tab switching, and automatic viewport resize).

If `dist/index.js` is missing in the source repo, build it first (`pnpm run build`); if `bin/ab.exe` is missing, build it with `go build -o ./bin/ab.exe ./cli`.

## Step 2: Select Browser and Page Context

The server automatically creates a default browser and page on startup.

```powershell
# List browsers (use --json for structured parsing)
.\bin\ab.exe browsers list --json

# Set active browser in CLI state (or create a new one, optionally choosing engine)
.\bin\ab.exe use browser <browser-id>
.\bin\ab.exe browsers create --owner-id agent
.\bin\ab.exe browsers create --owner-id agent --engine camoufox
.\bin\ab.exe browsers create --owner-id agent --engine puppeteer

# List pages in the active browser, or open a new page (also sets it active)
.\bin\ab.exe pages list --json
.\bin\ab.exe pages create --url "https://example.com"

# Check active browser & page context
.\bin\ab.exe status
```

To avoid state collisions across concurrent agents, pass `--browser-id <id>`, `[page-id]`, or set `AGB_BROWSER_ID` / `AGB_PAGE_ID` and `AGENTIC_BROWSER_URL` (defaults to `http://localhost:3777`).

## Step 3: Inspect and Interact via CLI

Always follow the **snapshot -> act -> re-snapshot** loop:

```powershell
# 1. Capture compact accessibility tree with [ref=eN] IDs (or --full for the raw uncompacted tree)
.\bin\ab.exe pages snapshot
.\bin\ab.exe pages snapshot --full

# Save a numbered PNG screenshot to screenshots/ (prints saved file path)
.\bin\ab.exe pages screenshot

# 2. Act using ref IDs from the latest snapshot
.\bin\ab.exe pages click --ref e5
.\bin\ab.exe pages fill --ref e8 --value "search query"
.\bin\ab.exe pages scroll --top 500
.\bin\ab.exe pages scroll-info

# 3. Navigate or reload
.\bin\ab.exe pages update --url "https://example.com/next"
.\bin\ab.exe pages reload
```

**Important rules:**
- Element `[ref]` mappings are cleared on page navigation (`framenavigated`). Always run `pages snapshot` again after navigating, reloading, or clicking elements that change the page.
- Prefer `--json` when you need IDs or structured output.
- Clean up extra tabs when done with `.\bin\ab.exe pages delete <page-id>`.
