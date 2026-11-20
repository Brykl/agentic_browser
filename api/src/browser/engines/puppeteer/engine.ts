import puppeteer from "puppeteer";
import type { Browser, CreatePageOptions, LaunchOptions, Viewport } from 'puppeteer';
import type { BrowserDriver, BrowserEngine, BrowserLaunchConfig, PageDriver } from "../../types.ts";
import { PuppeteerPageDriver } from "./page.ts";

class PuppeteerBrowserDriver implements BrowserDriver {
    private readonly browser: Browser;

    constructor(browser: Browser) {
        this.browser = browser;
    }

    async newPage(viewport: { width: number; height: number } = { width: 1920, height: 1080 }): Promise<PageDriver> {
        const options: CreatePageOptions = {
            type: 'tab'
        }
        const page = await this.browser.newPage(options)

        await page.setViewport(viewport)

        return new PuppeteerPageDriver(page)
    }

    async close(): Promise<void> {
        await this.browser.close()
    }

    isConnected(): boolean {
        return this.browser.connected
    }

    onDisconnected(cb: () => void): void {
        this.browser.on('disconnected', cb)
    }
}

export class PuppeteerEngine implements BrowserEngine {
    readonly name = 'puppeteer'

    async launch(config: BrowserLaunchConfig): Promise<BrowserDriver> {
        const options: LaunchOptions = {
            headless: config.headless ?? true
        }
        const browser = await puppeteer.launch(options)
        return new PuppeteerBrowserDriver(browser)
    }
}