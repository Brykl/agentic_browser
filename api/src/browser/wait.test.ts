import { describe, expect, it } from '@jest/globals';
import {
    DEFAULT_WAIT_TIMEOUT_MS,
    MAX_WAIT_TIMEOUT_MS,
    WaitTimeoutError,
    clampWaitTimeout,
    isTimeoutError,
    matchUrlPattern,
    remainingMs,
} from './wait.ts';

describe('wait helpers', () => {
    it('matches URLs by substring, glob, and regex', () => {
        expect(matchUrlPattern('https://example.com/dashboard?tab=1', '/dashboard')).toBe(true);
        expect(matchUrlPattern('https://example.com/login', '/dashboard')).toBe(false);

        expect(matchUrlPattern('https://example.com/orders/42/confirm', 'https://example.com/orders/*/confirm')).toBe(true);
        expect(matchUrlPattern('https://example.com/orders/42/cancel', 'https://example.com/orders/*/confirm')).toBe(false);
        expect(matchUrlPattern('https://example.com/a/b/c', '**/b/**')).toBe(true);

        expect(matchUrlPattern('https://example.com/order/12345', '/\\/order\\/\\d+$/')).toBe(true);
        expect(matchUrlPattern('https://example.com/order/abc', '/\\/order\\/\\d+$/')).toBe(false);
        expect(matchUrlPattern('https://example.com/Dashboard', '/dashboard/i')).toBe(true);
    });

    it('clamps wait timeout to valid bounds', () => {
        expect(clampWaitTimeout(undefined)).toBe(DEFAULT_WAIT_TIMEOUT_MS);
        expect(clampWaitTimeout(50)).toBe(100);
        expect(clampWaitTimeout(5000)).toBe(5000);
        expect(clampWaitTimeout(999_999)).toBe(MAX_WAIT_TIMEOUT_MS);
    });

    it('computes remainingMs and throws WaitTimeoutError after deadline', () => {
        expect(remainingMs(Date.now() + 500, 'text', 500)).toBeGreaterThan(0);
        expect(() => remainingMs(Date.now() - 10, 'text "Done"', 1000)).toThrow(WaitTimeoutError);
    });

    it('identifies timeout errors', () => {
        expect(isTimeoutError(new WaitTimeoutError('expired'))).toBe(true);
        const pwTimeout = new Error('locator.waitFor: Timeout 5000ms exceeded.');
        pwTimeout.name = 'TimeoutError';
        expect(isTimeoutError(pwTimeout)).toBe(true);
        expect(isTimeoutError(new Error('Ref [e1] not found'))).toBe(false);
    });
});
