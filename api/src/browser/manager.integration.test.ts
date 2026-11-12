import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import type { Browser } from 'puppeteer';
import { CreateNewPage, GetPages, RunVirtualBrowser } from './manager.ts';


describe('browser manager - integration', () => {
    let browser: Browser | undefined;

    beforeAll(async () => {
        browser = await RunVirtualBrowser({ headless: true });
    }, 30_000);

    afterAll(async () => {
        await browser?.close();
    }, 30_000);

    test('creates a page and returns it in the browser pages', async () => {
        if (!browser) throw new Error('Browser has not started');

        const page = await CreateNewPage(browser);

        try {
            await page.setContent('<title>Integration test</title>');
            expect(await page.title()).toBe('Integration test');
            const pages = await GetPages(browser);
            // console.log('Количество страниц:', pages.length);
            // for (const [index, page] of pages.entries()) {
            //     console.log({
            //         index,
            //         url: page.url(),
            //         title: await page.title(),
            //         closed: page.isClosed(),
            //     });
            // }
            expect(pages).toContain(page);
        } finally {
            await page.close();
        }
    }, 30_000);
})
