import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

const SCREENSHOTS_DIR = path.resolve(process.cwd(), "screenshots");
const SCREENSHOT_NAME_RE = /^screenshot-(\d+)\.png$/;

let lastNumber = 0;

/**
 * Ensures `screenshots/` exists and returns the next sequential path
 * (`screenshots/screenshot-0001.png`, `screenshot-0002.png`, ...).
 */
export async function nextScreenshotPath(): Promise<string> {
    await mkdir(SCREENSHOTS_DIR, { recursive: true });

    let maxExisting = 0;
    for (const entry of await readdir(SCREENSHOTS_DIR)) {
        const match = SCREENSHOT_NAME_RE.exec(entry);
        if (match) {
            const num = Number.parseInt(match[1]!, 10);
            if (num > maxExisting) maxExisting = num;
        }
    }

    lastNumber = Math.max(lastNumber, maxExisting) + 1;
    const filename = `screenshot-${String(lastNumber).padStart(4, "0")}.png`;
    return path.join(SCREENSHOTS_DIR, filename);
}
