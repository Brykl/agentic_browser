import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import type { Browser } from 'puppeteer';
import { BrowserManager, } from './browser.ts';



describe('BrowserManager - integration', () => {
    const manager = new BrowserManager();
    let firstBrowserId: string;
    let secondBrowserId: string;
    let createdAt: number;

    beforeAll(async () => {
        createdAt = Date.now();
        firstBrowserId = await manager.createBrowser('owner-1', { headless: true });
        secondBrowserId = await manager.createBrowser('owner-2', { headless: true });
    }, 60_000);

    afterAll(async () => {
        await Promise.all(
            [...manager.getBrowsers().values()].map(session => session.browser.close()),
        );
    }, 30_000);

    test('a new manager has no browsers', () => {
        expect(new BrowserManager().getBrowsers().size).toBe(0);
    });

    test('stores distinct browser sessions and retrieves them by ID', () => {
        const sessions = manager.getBrowsers();
        expect(firstBrowserId).not.toBe(secondBrowserId);
        expect(sessions.size).toBe(2);

        for (const [browserId, ownerId] of [
            [firstBrowserId, 'owner-1'],
            [secondBrowserId, 'owner-2'],
        ]) {
            const session = manager.getBrowser(browserId);
            if (!session) throw new Error(`Session ${browserId} was not stored`);

            expect(sessions.get(browserId)).toBe(session);
            expect(session.ownerId).toBe(ownerId);
            expect(session.pages).toBeInstanceOf(Map);
            expect(session.pages.size).toBe(0);
            expect(session.lastUsed).toBeGreaterThanOrEqual(createdAt);
            expect(session.lastUsed).toBeLessThanOrEqual(Date.now());
            expect(session.browser.connected).toBe(true);
        }

        expect(manager.getBrowser(firstBrowserId)?.browser).not.toBe(
            manager.getBrowser(secondBrowserId)?.browser,
        );
    });

    test('retrieved browsers can create independent pages', async () => {
        const first = manager.getBrowser(firstBrowserId);
        const second = manager.getBrowser(secondBrowserId);
        if (!first || !second) throw new Error('Browser sessions are missing');

        const firstPage = await first.browser.newPage();
        try {
            const secondPage = await second.browser.newPage();
            try {
                await firstPage.setContent('<title>First browser</title>');
                await secondPage.setContent('<title>Second browser</title>');

                expect(await firstPage.title()).toBe('First browser');
                expect(await secondPage.title()).toBe('Second browser');
                expect(await first.browser.pages()).toContain(firstPage);
                expect(await first.browser.pages()).not.toContain(secondPage);
                expect(await second.browser.pages()).toContain(secondPage);
            } finally {
                await secondPage.close();
            }
        } finally {
            await firstPage.close();
        }
    }, 30_000);

    test('clearing the returned map preserves stored sessions', () => {
        const sessions = manager.getBrowsers();
        const first = manager.getBrowser(firstBrowserId);
        sessions.clear();

        expect(manager.getBrowsers().size).toBe(2);
        expect(manager.getBrowser(firstBrowserId)).toBe(first);
        expect(manager.getBrowser(secondBrowserId)).toBeDefined();
    });

    test('returns undefined for an unknown browser ID', () => {
        expect(manager.getBrowser('missing-browser')).toBeUndefined();
    });
});