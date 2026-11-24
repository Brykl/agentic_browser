# Agentic Browser (`agent-browser-plugin`)

Multi-engine virtual browser (**Camoufox** anti-detect Firefox + **Puppeteer** Chromium) with a live Web UI, REST/WebSocket/MCP API, and a Go CLI (`ab.exe` / `agb`), packaged as a plugin for **Google Antigravity**.

## Architecture

- **API + Static UI (`api/`)**: Fastify server (`http://127.0.0.1:3777`) managing Camoufox and Puppeteer sessions via a pluggable `BrowserEngine` architecture, compact & full accessibility snapshots (`[ref=eN]`), numbered PNG screenshots (`screenshots/`), page actions, push-based binary JPEG screencast + interactive input WebSocket (`/api/v1/ws`), and serving the built React UI (`ui/dist/`).
- **Web UI (`ui/`)**: React + Vite interactive live browser viewer (tab switcher, URL bar, binary `createImageBitmap` frame stream, live mouse/wheel/keyboard/paste input including non-US layouts, and automatic viewport resize).
- **CLI (`cli/`, prebuilt at `bin/ab.exe`)**: Go binary (`windows/amd64` prebuilt in git) for controlling browsers and pages (`browsers`, `pages`, `use`, `status`, `snapshot`, `screenshot`, `click`, `fill`, `scroll`).
- **Antigravity Plugin (`plugin.json`, `skills/`, `rules/`)**: Teaches Antigravity agents how to start the API/UI server and control the virtual browser via the CLI.

---

## Installation & Adding to Antigravity

### Prerequisites (Windows)

- **Git**
- **Node.js** `>= 24`
- **pnpm** `12.18.0` (e.g. via `corepack enable`)
- **Google Antigravity** (`agy` CLI available in `PATH`)
- *(Only if modifying `cli/`)* **Go** `1.27.1+` — not required on a new PC because `bin/ab.exe` is tracked in git.

### Quick Setup after `git clone`

```powershell
git clone https://github.com/Brykl/agentic_browser.git
cd agentic_browser
pnpm install
pnpm run install:plugin
```

That's it:
- `pnpm install` installs Node dependencies and downloads Chrome/Chromium for Puppeteer (allowed in `pnpm-workspace.yaml`).
- `pnpm run install:plugin` runs [scripts/install-plugin.ps1](scripts/install-plugin.ps1), which builds the API (`dist/`) and UI (`ui/dist/`), copies `plugin.json`, `assets/`, `bin/ab.exe`, `rules/`, `skills/`, `dist/`, and `ui/dist/` into `%USERPROFILE%\.gemini\config\plugins\agent-browser-plugin\`, links `node_modules` via a directory junction (so keep the cloned `agentic_browser` folder on disk), and adds `<TargetDir>\bin` to the Windows User `PATH` (idempotently) as well as the current PowerShell session so `ab` (`ab.exe`) can be run from any directory.

### Verify in Antigravity

```powershell
agy plugin validate "$env:USERPROFILE\.gemini\config\plugins\agent-browser-plugin" --strict
agy plugin list
```

Discovered plugins are enabled by default. If it shows as disabled, enable it via CLI (`agy plugin enable agent-browser-plugin`) or in the Antigravity UI (**Customizations > Plugins > Browser for agent**).

Once enabled, the `agentic-browser` skill and `rules/AGENTS.md` are active automatically. You can ask the AI:
- *"Start the virtual browser UI & API and open https://example.com"*
- *"Take an accessibility snapshot of the active virtual browser page"*

---

## Local Testing & Development

```powershell
# Start the unified API + UI server directly (http://localhost:3777)
pnpm run start

# Test the prebuilt CLI in another terminal (`ab` is on User PATH after `pnpm run install:plugin`, or use `.\bin\ab.exe` from the repo)
ab browsers list --json
ab pages create --url "https://example.com"
ab pages snapshot
ab pages screenshot
```

### Updating after code changes

- After editing `api/`, `ui/`, `skills/`, or `rules/`:
  ```powershell
  pnpm run install:plugin
  ```
- After editing Go code in `cli/`, rebuild `bin/ab.exe` before committing and syncing:
  ```powershell
  go build -o ./bin/ab.exe ./cli   # or: task cli:build
  pnpm run install:plugin
  ```

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3777` | HTTP/WS port for the Fastify API + UI server |
| `HOST` | `127.0.0.1` | Bind address for the server |
| `BROWSER_ENGINE` | `camoufox` | Default browser engine (`camoufox` or `puppeteer`) |
| `AGENTIC_BROWSER_HEADLESS` | `true` | Set to `false` or `0` to launch visible Chrome windows |
| `AGENTIC_BROWSER_DEFAULT_URL` | *(blank)* | Optional initial URL opened in the default page on server startup |
| `AGENTIC_BROWSER_UI_DIR` | *(auto)* | Override path to built `ui/dist` static files |
| `AGENTIC_BROWSER_URL` | `http://localhost:3777` | API base URL used by `ab.exe` (recommended over `--url` when running `pages create`/`update`) |
| `AGB_BROWSER_ID` | *(from state)* | Override active browser ID for CLI commands |
| `AGB_PAGE_ID` | *(from state)* | Override active page ID for CLI commands |
