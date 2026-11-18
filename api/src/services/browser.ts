
import puppeteer from 'puppeteer';
import type { Browser, LaunchOptions, Page } from 'puppeteer';
import type { Protocol } from 'puppeteer-core';
import { randomUUID } from "node:crypto";

interface BrowserSession {
    browser: Browser;
    pages: Map<string, Page>;
    ownerId: string;
    lastUsed: number;
    nextRef: number;
    documents: Map<string, DocumentState>;
}

export class BrowserManager {
    private browsers: Map<string, BrowserSession> = new Map()
    private pageRefMaps = new WeakMap<Page, Map<number, number>>()



    async createBrowser(ownerId: string, params: LaunchOptions): Promise<string> {
        const browserId = randomUUID();
        const browser = await puppeteer.launch(params)

        this.browsers.set(browserId, {
            browser,
            pages: new Map<string, Page>(),
            ownerId,
            lastUsed: Date.now(),
            nextRef: 1,
            documents: new Map<string, DocumentState>(),
        });

        browser.on('disconnected', () => {
            this.browsers.delete(browserId)
        })

        return browserId
    }

    // TODO: add error handler
    async createPage(browserId: string, params?: CreatePageParams): Promise<string> {
        const session = this.browsers.get(browserId);
        if (!session) throw new Error(`Browser ${browserId} not found`);

        const pageId = randomUUID()
        const page = await session.browser.newPage()

        session.pages.set(pageId, page)
        page.on('framenavigated', (frame) => {
            if (frame === page.mainFrame()) {
                this.pageRefMaps.delete(page);
            }
        });
        page.on('close', () => {
            this.pageRefMaps.delete(page);
            session.pages.delete(pageId);
        })

        if (params?.url) {
            await page.goto(params.url);
        }
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
    listPages(browserId: string): Array<{ pageId: string; url: string }> {
        const session = this.browsers.get(browserId);
        if (!session) return [];
        return Array.from(session.pages.entries(), ([pageId, page]) => ({
            pageId,
            url: page.url(),
        }));
    }

    // TODO: add error handler
    async updatePageUrl(browserId: string, pageId: string, url: string): Promise<Page | undefined> {
        const page = this.getPage(browserId, pageId);
        if (!page) return undefined;
        await page.goto(url);
        return page;
    }

    async snapshotPage(browserId: string, pageId: string): Promise<string | undefined> {
        const page = this.getPage(browserId, pageId);
        if (!page) return undefined;

        const cdp = await page.createCDPSession();
        try {
            const { nodes } = await cdp.send('Accessibility.getFullAXTree');
            const { text, refMap } = optimizeAXTreeForLLM(nodes);
            this.pageRefMaps.set(page, refMap);
            return text;
        } finally {
            await cdp.detach().catch(() => { });
        }
    }
    async clickButton(browserId: string, pageId: string, ref: number) {
        const page = this.getPage(browserId, pageId);
        if (!page) return undefined;

        const backendNodeId = this.pageRefMaps.get(page)?.get(ref)
        if (!backendNodeId) {
            throw new Error(`Ref [${ref}] not found. Take a new snapshot.`);
        }

        const cdp = await page.createCDPSession();
        try {
            await cdp.send('DOM.scrollIntoViewIfNeeded', { backendNodeId })
            const { quads } = await cdp.send('DOM.getContentQuads', { backendNodeId });
            const q = quads[0];
            if (!q) {
                throw new Error(`Element [${ref}] is hidden or has no layout box.`);
            }
            const x = (q[0] + q[2] + q[4] + q[6]) / 4;
            const y = (q[1] + q[3] + q[5] + q[7]) / 4;

            await page.mouse.click(x, y);
            return { clicked: true, ref, x, y };
        } finally {
            await cdp.detach().catch(() => { });
        }

    }

    async availableXYscroll(browserId: string, pageId: string) {
        const page = this.getPage(browserId, pageId);
        if (!page) return undefined;

        return await page.evaluate(() => ({
            x: window.scrollX,
            y: window.scrollY,
            maxX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            maxY: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        }));
    }

    async scrollPage(browserId: string, pageId: string, left: number, top: number) {
        const page = this.getPage(browserId, pageId);
        if (!page) return undefined;

        return await page.evaluate((x, y) => {
            window.scrollBy(x, y);
            return { x: window.scrollX, y: window.scrollY };
        }, left, top);
    }
    // TODO: add error handler
    async deletePage(browserId: string, pageId: string): Promise<boolean> {
        const page = this.getPage(browserId, pageId);
        if (!page) return false;
        await page.close();
        return true;
    }

    // TODO: add error handler
    async closePage(browserId: string, pageId: string): Promise<void> {
        await this.deletePage(browserId, pageId);
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

interface CreatePageParams {
    url: string
}

interface RefEntry {
    backendNodeId: number;
    role: string;
    name: string;
    nth: number;
    frameId: string;
}

type RefMap = Map<string, RefEntry>;

interface DocumentState {
    sessionId: string;
    loaderId: string;
    refs: Map<number, string>; // backendNodeId -> refId ("e1", "e2", ...)
}

const INTERACTIVE_ROLES = new Set([
    "button",
    "link",
    "textbox",
    "checkbox",
    "radio",
    "combobox",
    "listbox",
    "menuitem",
    "menuitemcheckbox",
    "menuitemradio",
    "option",
    "searchbox",
    "slider",
    "spinbutton",
    "switch",
    "tab",
    "treeitem",
    "Iframe",
]);

const LANDMARK_ROLES = new Set([
    'RootWebArea', 'navigation', 'search', 'main', 'contentinfo', 'dialog', 'banner'
]);

const BOOLEAN_PROPS = new Set(['checked', 'expanded', 'selected', 'disabled']);
const TEXT_PROPS = new Set(['valuetext', 'placeholder']);

type OptimizedAXTreeResult = {
    text: string;
    refMap: Map<number, number>;
};

export function optimizeAXTreeForLLM(rawNodes: Protocol.Accessibility.AXNode[]): OptimizedAXTreeResult {
    const nodeMap = new Map(rawNodes.map((node) => [node.nodeId, node]));
    const refMap = new Map<number, number>();
    const lines: string[] = [];
    let nextRef = 1;

    const isInsideInteractive = (node: Protocol.Accessibility.AXNode): boolean => {
        let current = node.parentId ? nodeMap.get(node.parentId) : undefined;
        while (current) {
            const role = typeof current.role?.value === 'string' ? current.role.value : undefined;
            if (role && INTERACTIVE_ROLES.has(role)) return true;
            current = current.parentId ? nodeMap.get(current.parentId) : undefined;
        }
        return false;
    };

    const formatProps = (
        role: string,
        node: Protocol.Accessibility.AXNode,
    ): string => {
        const parts: string[] = [];
        const nodeVal = typeof node.value?.value === 'string' ? node.value.value : undefined;
        if (nodeVal && nodeVal.length > 0) {
            parts.push(`val=${JSON.stringify(nodeVal)}`);
        }

        for (const p of node.properties ?? []) {
            const val = p.value?.value;
            if (val === undefined || val === false || val === 'false') continue;

            if (p.name === 'url' && role === 'RootWebArea' && typeof val === 'string') {
                parts.push(`(${val})`);
            } else if (TEXT_PROPS.has(p.name) && typeof val === 'string' && val.length > 0) {
                parts.push(`${p.name}=${JSON.stringify(val)}`);
            } else if (BOOLEAN_PROPS.has(p.name) && (val === true || val === 'true')) {
                parts.push(`[${p.name}]`);
            }
        }
        return parts.join(' ');
    };

    for (const node of rawNodes) {
        if (node.ignored) continue;

        const role = typeof node.role?.value === 'string' ? node.role.value : undefined;
        const name = typeof node.name?.value === 'string' ? node.name.value.trim() : undefined;

        if (!role || role === 'InlineTextBox' || role === 'none' || role === 'generic') continue;

        const isInteractive = INTERACTIVE_ROLES.has(role);
        const isLandmark = LANDMARK_ROLES.has(role);

        if (role === 'StaticText') {
            if (!name || isInsideInteractive(node)) continue;
            const ref = nextRef++;
            if (typeof node.backendDOMNodeId === 'number') {
                refMap.set(ref, node.backendDOMNodeId);
            }
            lines.push(`[${ref}] text ${JSON.stringify(name)}`);
            continue;
        }

        if (!isInteractive && !(isLandmark && (role === 'RootWebArea' || Boolean(name)))) {
            continue;
        }

        const ref = nextRef++;
        if (typeof node.backendDOMNodeId === 'number') {
            refMap.set(ref, node.backendDOMNodeId);
        }

        const label = name ? ` ${JSON.stringify(name)}` : '';
        const extras = formatProps(role, node);
        lines.push(`[${ref}] ${role}${label}${extras ? ` ${extras}` : ''}`);
    }

    return { text: lines.join('\n'), refMap };
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
