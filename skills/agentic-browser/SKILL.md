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
- CLI binary: `ab` (`<plugin_root>/bin/ab.exe` on Windows — added to the Windows User `PATH` by `scripts/install-plugin.ps1`)

On Windows PowerShell, prefer invoking `ab` directly from `PATH`. If `ab` is not yet resolved in an older shell session, fall back to the explicit binary path:
- Installed plugin path: `C:\Users\<user>\.gemini\config\plugins\agent-browser-plugin\` (`<plugin_root>\dist\index.js` and `<plugin_root>\bin\ab.exe`)
- Fallback inside source repo: `./dist/index.js` and `./bin/ab.exe`

## Step 1: Ensure API + UI Server Is Running

Check health first before starting a duplicate process:

```powershell
curl.exe -sS http://127.0.0.1:3777/api/v1/health
```

Expected response: `{"ok":true}`.

If the server is not running:
1. Start `node "<plugin_root>\dist\index.js"` with `run_command` and `IsDaemon: true` (never block on a foreground server).
   - Optional env vars: `PORT` (default `3777`), `HOST` (default `127.0.0.1`), `BROWSER_ENGINE=camoufox|puppeteer` (default `camoufox`), `AGENTIC_BROWSER_HEADLESS=true|false`, `AGENTIC_BROWSER_HUMANIZE=true|false` (default `false`), `AGENTIC_BROWSER_DEFAULT_URL`.
2. Re-check `http://127.0.0.1:3777/api/v1/health` until it returns `{"ok":true}`.
3. Share the live UI URL `http://localhost:3777` with the user so they can watch and interact with the live browser canvas (mouse, wheel, keyboard, paste, tab switching, and automatic viewport resize).

If `dist/index.js` is missing in the source repo, build it first (`pnpm run build`); if `bin/ab.exe` is missing, build it with `go build -o ./bin/ab.exe ./cli`.

## Step 2: Select Browser and Page Context

The server automatically creates a default browser and page on startup.

On a clean machine (empty `state.json`), `ab` read/action commands (`pages list`, `pages create`, `pages update`, `pages snapshot`, `pages click`, `pages fill`, `pages wait`, `pages screenshot`, `pages scroll`, `pages reload`) **automatically query `GET /api/v1/browsers`**, select the sole active (or default) browser and page, and persist them in `state.json`. You can jump straight to Step 3 without manually running `browsers list` -> `use browser` -> `pages list` -> `use page`.

Use the context commands below when you need multiple sessions/tabs or want to switch explicitly (note: destructive `browsers delete` and `pages delete` never auto-select from an empty state and require an explicit ID or saved context):

```powershell
# List browsers (use --json for structured parsing)
ab browsers list --json

# Set active browser in CLI state (or create/delete one, optionally choosing engine/humanize)
ab use browser <browser-id>
ab browsers create --owner-id agent
ab browsers create --owner-id agent --engine camoufox --humanize
ab browsers create --owner-id agent --engine puppeteer --humanize=false
ab browsers delete <browser-id>

# List pages in the active browser, or open a new page (also sets it active)
ab pages list --json
ab pages create --url "https://example.com"

# Check active browser & page context
ab status
```

To avoid state collisions across concurrent agents, pass `--browser-id <id>`, `[page-id]`, or set `AGB_BROWSER_ID` / `AGB_PAGE_ID` and `AGENTIC_BROWSER_URL` (defaults to `http://localhost:3777`).

## Step 3: Inspect and Interact via CLI

All page actions (`click`, `fill`, `wait`, `update`, `reload`, `scroll`, `create`) immediately return the resulting `url`, `title`, and `navigated` status. After `click`, the driver briefly checks whether navigation started (~250ms) and waits for `domcontentloaded` before returning. Pass `--snapshot` (compact), `--diff` (line-level diff against the previous snapshot, automatically falling back to compact on navigation or large changes), or `--full-snapshot` to get the updated accessibility tree in the same call instead of running separate `get` and `snapshot` commands:

```powershell
# 1. Capture compact accessibility tree with [ref=eN] IDs (or --full for the raw uncompacted tree)
ab pages snapshot
ab pages snapshot --full

# Save a numbered PNG screenshot to screenshots/ (prints saved file path)
ab pages screenshot

# 2. Act using ref IDs from the latest snapshot (add --snapshot or --diff to inspect the result in 1 turn)
ab pages click --ref e5 --snapshot
ab pages click --ref e5 --diff
ab pages fill --ref e8 --value "search query"
# Fill multiple form fields in a single request (prefer this over repeated fill calls)
ab pages fill -f e8="user@example.com" -f e9="secret" --diff
ab pages fill --fields-json '[{"ref":"e8","value":"line1\nline2"}]'
ab pages scroll --top 500 --diff
ab pages scroll-info

# 3. Wait for async navigation, redirects, load state, or visible text
ab pages wait --url "/dashboard" --timeout 15s --snapshot
ab pages wait --text "Order confirmed" --load networkidle --diff
ab pages wait --load domcontentloaded

# 4. Navigate or reload (with immediate snapshot)
ab pages update --url "https://example.com/next" --snapshot
ab pages reload --snapshot
```

**Important rules:**
- Element `[ref]` mappings are cleared on page navigation (`framenavigated`). Prefer passing `--snapshot` or `--diff` directly on `click`, `fill`, `wait`, `update`, `reload`, `scroll`, or `create` to avoid separate `pages get` + `pages snapshot` round-trips.
- For SPA transitions, redirects, or async loading spinners after a click, use `ab pages wait` (`--url` supports substring, `*` glob, or `/regex/`; `--text` waits for visible text; `--load` accepts `domcontentloaded`, `load`, or `networkidle`) instead of polling `pages snapshot` in a loop.
- When filling multi-field forms, pass multiple `-f ref=value` flags (or `--fields-json`) to `ab pages fill` so all fields are filled in one API call.
- Prefer `--json` when you need IDs or structured output.
- Clean up extra tabs or browsers when done with `ab pages delete <page-id>` or `ab browsers delete <browser-id>`.
