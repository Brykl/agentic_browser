
import puppeteer from 'puppeteer';
import type { Browser, LaunchOptions, Page } from 'puppeteer';

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
