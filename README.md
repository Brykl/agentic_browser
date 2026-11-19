# Agentic Browser (`agent-browser-plugin`)

Virtual headless Puppeteer browser with a live Web UI, REST/WebSocket/MCP API, and a Go CLI (`ab.exe` / `agb`), packaged as a plugin for **Google Antigravity**.

## Architecture

- **API + Static UI (`api/`)**: Fastify server (`http://127.0.0.1:3777`) managing Puppeteer sessions, accessibility snapshots, page actions, live screencast WebSocket (`/api/v1/ws`), and serving the built React UI (`ui/dist/`).
- **Web UI (`ui/`)**: React + Vite live browser viewer (tab switcher, URL bar, real-time frame stream).
- **CLI (`cli/`)**: Go binary (`dist/ab.exe`) for controlling browsers and pages (`browsers`, `pages`, `use`, `status`, `snapshot`, `click`, `fill`, `scroll`).
- **Antigravity Plugin (`plugin.json`, `skills/`, `rules/`)**: Teaches Antigravity agents how to start the API/UI server and control the virtual browser via the CLI.

---

## Installation

### Prerequisites

- **Node.js** `>= 24`
- **pnpm** `12.18.0` (or Corepack enabled)
- **Go** `1.27.1+` (to compile the CLI binary)
- **Google Antigravity** (`agy` CLI available in `PATH`)

### 1. Clone and install dependencies

```powershell
git clone https://github.com/Brykl/agentic_browser.git
cd agentic_browser
pnpm install
```

> Puppeteer will download a compatible Chrome/Chromium binary during `pnpm install` (if needed, ensure build scripts are allowed for `puppeteer`).

### 2. Build API, UI, and CLI

```powershell
# Compile TypeScript API (dist/) and Vite React UI (ui/dist/)
pnpm run build

# Compile the Go CLI binary to dist/ab.exe
go build -o ./dist/ab.exe ./cli
```

*(Optional)* If you use [Task](https://taskfile.dev/), `task cli:build` also builds `./dist/ab.exe`.

### 3. Verify locally (optional)

```powershell
# Start the unified API + UI server (http://localhost:3777)
pnpm run start
```

Open `http://localhost:3777` in your browser to see the live UI, or test the CLI in another terminal:

```powershell
.\dist\ab.exe browsers list --json
.\dist\ab.exe pages create --url "https://example.com"
.\dist\ab.exe pages snapshot
```

---

## Adding to Antigravity

### 1. Install / sync the plugin into Antigravity

Run the provided helper script (Windows PowerShell):

```powershell
pnpm run install:plugin
```

What `scripts/install-plugin.ps1` does:
1. Creates `%USERPROFILE%\.gemini\config\plugins\agent-browser-plugin\` as a real directory (required for Antigravity's Language Server plugin discovery).
2. Copies `plugin.json`, `package.json`, `README.md`, `assets/`, `rules/`, `skills/`, `dist/`, and `ui/dist/`.
3. Creates a directory junction for `node_modules` pointing to the repository's `node_modules` so dependencies are resolved without duplicating Puppeteer.

### 2. Validate the plugin

```powershell
agy plugin validate "$env:USERPROFILE\.gemini\config\plugins\agent-browser-plugin" --strict
```

Expected output shows `skills 1` and `rules 1` with `Validation passed`.

### 3. Enable in Antigravity

Check that Antigravity sees the plugin:

```powershell
agy plugin list
```

If it is disabled, enable it via CLI or in the Antigravity UI (**Customizations > Plugins > Browser for agent**):

```powershell
agy plugin enable agent-browser-plugin
```

Once enabled, the `agentic-browser` skill and `rules/AGENTS.md` are active automatically. You can ask the AI things like:
- *"Start the virtual browser UI & API and open https://example.com"*
- *"Take an accessibility snapshot of the active virtual browser page"*

### Updating after code changes

Whenever you pull changes or modify `api/`, `ui/`, `cli/`, `skills/`, or `rules/`:

```powershell
pnpm run build
go build -o ./dist/ab.exe ./cli
pnpm run install:plugin
```

---

## Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3777` | HTTP/WS port for the Fastify API + UI server |
| `HOST` | `127.0.0.1` | Bind address for the server |
| `AGENTIC_BROWSER_HEADLESS` | `true` | Set to `false` or `0` to launch visible Chrome windows |
| `AGENTIC_BROWSER_DEFAULT_URL` | *(blank)* | Optional initial URL opened in the default page on server startup |
| `AGENTIC_BROWSER_UI_DIR` | *(auto)* | Override path to built `ui/dist` static files |
| `AGENTIC_BROWSER_URL` | `http://localhost:3777` | API base URL used by `ab.exe` (recommended over `--url` when running `pages create`/`update`) |
| `AGB_BROWSER_ID` | *(from state)* | Override active browser ID for CLI commands |
| `AGB_PAGE_ID` | *(from state)* | Override active page ID for CLI commands |
