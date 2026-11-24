export const DEFAULT_WAIT_TIMEOUT_MS = 10_000;
export const MAX_WAIT_TIMEOUT_MS = 120_000;
export const DEFAULT_CLICK_NAV_DETECT_MS = 250;
export const DEFAULT_CLICK_NAV_TIMEOUT_MS = 5_000;

export class WaitTimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'WaitTimeoutError';
    }
}

export function waitSleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function clampWaitTimeout(timeout?: number): number {
    if (timeout === undefined || !Number.isFinite(timeout)) {
        return DEFAULT_WAIT_TIMEOUT_MS;
    }
    return Math.min(Math.max(Math.round(timeout), 100), MAX_WAIT_TIMEOUT_MS);
}

export function remainingMs(deadline: number, condition: string, totalTimeoutMs: number): number {
    const left = deadline - Date.now();
    if (left <= 0) {
        throw new WaitTimeoutError(`Wait timed out after ${totalTimeoutMs}ms waiting for ${condition}`);
    }
    return left;
}

/**
 * Matches a page URL against a user-supplied pattern:
 * - `/regex/flags` -> RegExp match
 * - pattern containing `*` -> glob match (`*` / `**` match any characters)
 * - plain string -> substring match
 */
export function matchUrlPattern(currentUrl: string, pattern: string): boolean {
    if (pattern.startsWith('/')) {
        const lastSlash = pattern.lastIndexOf('/');
        if (lastSlash > 0) {
            const body = pattern.slice(1, lastSlash);
            const flags = pattern.slice(lastSlash + 1);
            if (/^[dgimsuvy]*$/.test(flags)) {
                try {
                    return new RegExp(body, flags).test(currentUrl);
                } catch {
                    // Fall through to substring match if regex is invalid
                }
            }
        }
    }

    if (pattern.includes('*')) {
        const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*+/g, '.*');
        return new RegExp(`^${escaped}$`).test(currentUrl);
    }

    return currentUrl.includes(pattern);
}

export function isTimeoutError(err: unknown): boolean {
    if (err instanceof WaitTimeoutError) return true;
    if (!(err instanceof Error)) return false;
    return err.name === 'TimeoutError' || /timeout|timed out|exceeded/i.test(err.message);
}
