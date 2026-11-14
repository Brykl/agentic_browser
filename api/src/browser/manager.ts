
import puppeteer from 'puppeteer';
import type { Browser, LaunchOptions, Page } from 'puppeteer';
import { randomUUID } from "node:crypto";

interface BrowserSession {
    browser: Browser;
    pages: Map<string, Page>;
    ownerId: string;
    lastUsed: number;
}

export class BrowserManager {
    private browsers: Map<string, BrowserSession> = new Map()

    getBrowsers(): Map<string, BrowserSession> {
        return new Map(this.browsers);
    }

    getBrowser(browserId: string): BrowserSession | undefined {
        return this.browsers.get(browserId);
    }

    async createBrowser(ownerId: string, params: LaunchOptions): Promise<string> {
        const browserId = randomUUID();

        const browser = await puppeteer.launch(params)

        this.browsers.set(browserId, {
            browser,
            pages: new Map<string, Page>(),
            ownerId,
            lastUsed: Date.now()
        })

        return browserId
    }
}


export async function RunVirtualBrowser(params: LaunchOptions): Promise<Browser> {
    const browser = await puppeteer.launch(params);

    return browser
}


export async function CreateNewPage(browser: Browser): Promise<Page> {
    const page = await browser.newPage();
    return page
}

export async function GetPages(browser: Browser): Promise<Page[]> {
    const pages = await browser.pages();

    return pages
}

export async function GetPageById(browser: Browser, pageId: number): Promise<Page | undefined> {
    const pages = await GetPages(browser);
    return pages[pageId];
}

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
