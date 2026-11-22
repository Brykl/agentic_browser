When the user asks to launch, inspect, or automate pages in the virtual / agentic browser (`agentic_browser`, `agb`, `ab.exe`, or `http://localhost:3777`), read and follow the `agentic-browser` skill (`skills/agentic-browser/SKILL.md`).

- Check `http://127.0.0.1:3777/api/v1/health` before starting `dist/index.js`, and always launch the server as a background daemon (`IsDaemon: true`).
- Use the `ab.exe` (`agb`) CLI for browser/page operations (`browsers`, `pages`, `snapshot`, `screenshot`, `click`, `fill`, `scroll`) instead of raw `curl` calls to `/api/v1/...`.
- Provide the live UI URL `http://localhost:3777` to the user after starting the server.
