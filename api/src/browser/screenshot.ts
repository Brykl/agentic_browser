import { mkdir, readdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SCREENSHOT_NAME_RE = /^screenshot-(\d+)\.png$/;

function getScreenshotsDir(): string {
    const envDir = process.env.AGENTIC_BROWSER_SCREENSHOTS_DIR?.trim();
    return envDir
        ? path.resolve(envDir)
        : path.join(os.tmpdir(), "agentic-browser", "screenshots");
}

let lastNumber = 0;

/**
 * Ensures the screenshots directory exists and returns the next sequential path
 * (`screenshot-0001.png`, `screenshot-0002.png`, ...).
 */
export async function nextScreenshotPath(): Promise<string> {
    const dir = getScreenshotsDir();
    await mkdir(dir, { recursive: true });

    let maxExisting = 0;
    for (const entry of await readdir(dir)) {
        const match = SCREENSHOT_NAME_RE.exec(entry);
        if (match) {
            const num = Number.parseInt(match[1]!, 10);
            if (num > maxExisting) maxExisting = num;
        }
    }

    lastNumber = Math.max(lastNumber, maxExisting) + 1;
    const filename = `screenshot-${String(lastNumber).padStart(4, "0")}.png`;
    return path.join(dir, filename);
}
