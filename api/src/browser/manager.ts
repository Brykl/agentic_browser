
import puppeteer from 'puppeteer';
import type { Browser, LaunchOptions, Page } from 'puppeteer';
import { randomUUID } from "node:crypto";
import { error } from 'node:console';

interface BrowserSession {
    browser: Browser;
    pages: Map<string, Page>;
    ownerId: string;
    lastUsed: number;
}

export class BrowserManager {
    private browsers: Map<string, BrowserSession> = new Map()



    async createBrowser(ownerId: string, params: LaunchOptions): Promise<string> {
        const browserId = randomUUID();
        const browser = await puppeteer.launch(params)

        this.browsers.set(browserId, {
            browser,
            pages: new Map<string, Page>(),
            ownerId,
            lastUsed: Date.now()
        })

        browser.on('disconnected', () => {
            this.browsers.delete(browserId)
        })

        return browserId
    }

    // TODO: add error handler
    async createPage(browserId: string): Promise<string> {
        const session = this.browsers.get(browserId);
        if (!session) throw new Error(`Browser ${browserId} not found`);

        const pageId = randomUUID()
        const page = await session.browser.newPage()

        session.pages.set(pageId, page)
        page.on('close', () => {
            session.pages.delete(pageId)
        })
        return pageId
    }

    getBrowsers(): Map<string, BrowserSession> {
        return new Map(this.browsers);
    }

    // TODO: add error handler
    getBrowser(browserId: string): BrowserSession | undefined {
        return this.browsers.get(browserId);
    }

    // TODO: add error handler
    getPage(browserId: string, pageId: string): Page | undefined {
        const session = this.browsers.get(browserId);
        if (!session) return undefined;
        session.lastUsed = Date.now();
        return session.pages.get(pageId);
    }

    // TODO: add error handler
    listPages(browserId: string): string[] {
        return [...(this.browsers.get(browserId)?.pages.keys() ?? [])];
    }

    // TODO: add error handler
    async closePage(browserId: string, pageId: string): Promise<void> {
        await this.getPage(browserId, pageId)?.close();
    }

    // TODO: add error handler
    async closeBrowser(browserId: string): Promise<void> {
        await this.browsers.get(browserId)?.browser.close();
    }

    // TODO: add error handler
    async closeAll(): Promise<void> {
        await Promise.all([...this.browsers.values()].map(s => s.browser.close()));
    }


}


// export async function RunVirtualBrowser(params: LaunchOptions): Promise<Browser> {
//     const browser = await puppeteer.launch(params);

//     return browser
// }


// export async function CreateNewPage(browser: Browser): Promise<Page> {
//     const page = await browser.newPage();
//     return page
// }

// export async function GetPages(browser: Browser): Promise<Page[]> {
//     const pages = await browser.pages();

//     return pages
// }

// export async function GetPageById(browser: Browser, pageId: string): Promise<Page | undefined> {
//     const pages = await GetPages(browser);
//     return pages[pageId];
// }

export async function ScrenCast(page: Page) {
    const cdp = await page.createCDPSession()

    let lastFrame: string | null = null;

    cdp.on('Page.screencastFrame', async ({ data, sessionId }) => {
        lastFrame = data;

        void cdp.send('Page.screencastFrameAck', {
            sessionId,
        }).catch(console.error);
    })

    await cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 70,
        everyNthFrame: 1,
    });

    return {
        getFrame: () => lastFrame,

        stop: async () => {
            await cdp.send('Page.stopScreencast');
            await cdp.detach();
        },
    };
}



// try {


//     await page.setViewport({ width: 1920, height: 1080 });

//     await page.goto('https://til-uiren.qazaq-learn.workers.dev/', {
//         waitUntil: 'networkidle0',
//     });


//     await page.screenshot({ path: 'puppeteer-check.png' });

//     console.log('Успех: браузер запущен, страница проверена, скриншот сохранён.');
// } finally {
//     await browser.close();
// }
