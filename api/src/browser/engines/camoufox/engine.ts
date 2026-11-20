import puppeteer from "puppeteer";
import { Camoufox, type NewBrowserOptions } from "camoufox";
import type { BrowserDriver, BrowserEngine, BrowserLaunchConfig, PageDriver } from "../../types.ts";
import { CamoufoxPageDriver } from "./page.ts";
import type { Browser, Page } from "playwright-core";

class CamoufoxBrowserDriver implements BrowserDriver {
    private readonly browser: Browser;

    constructor(browser: Browser) {
        this.browser = browser;
    }

    async newPage(viewport: { width: number; height: number } = { width: 1920, height: 1080 }): Promise<PageDriver> {
        const page: Page = await this.browser.newPage({
            baseURL: 'https://google.com',
            viewport: viewport
        })

        return new CamoufoxPageDriver(page)
    }

    async close(): Promise<void> {
        return this.browser.close()
    }

    isConnected(): boolean {
        return this.browser.isConnected()
    }

    onDisconnected(cb: () => void): void {
        this.browser.on('disconnected', cb)
    }
}

export class CamoufoxEngine implements BrowserEngine {
    readonly name = 'camoufox'

    async launch(config: BrowserLaunchConfig): Promise<BrowserDriver> {
        const options: NewBrowserOptions = {
            headless: config.headless ?? true
        }

        const browser: Browser = await Camoufox(options)

        return new CamoufoxBrowserDriver(browser)
    }
}