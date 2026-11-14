import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/server';
import type { Browser } from 'puppeteer';
import { BrowserManager } from '../../browser/manager.ts';


export function ScrollPageTool(server: McpServer, browserManager: BrowserManager) {
    server.registerTool(
        'scroll-page',
        {
            description: 'Scroll a page up or down',
            inputSchema: z.object({
                browserId: z.uuid().describe('Browser ID returned by create-browser'),
                pageId: z.uuid().describe('Page ID returned by open-page'),
                direction: z.enum(['up', 'down']).describe('Scroll direction: up or down'),
                px: z.int().positive().describe('Distance to scroll in pixels; must be a positive integer')
            })
        },
        async ({ browserId, pageId, direction, px }) => {
            try {
                const browser = browserManager.getBrowser(browserId)
                if (!browser?.browser) throw new Error(`Browser with id ${browserId} not found`)
                const page = browserManager.getPage(browserId, pageId);
                if (!page) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Page with ID ${pageId} not found` }]
                    };
                }

                await page.evaluate((distance) => {
                    window.scrollBy({ top: distance, behavior: 'instant' });
                }, direction === 'down' ? px : -px);

                return {
                    content: [{ type: 'text', text: `Scrolled page ${pageId} ${direction} by ${px} pixels` }]
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Failed to scroll page ${pageId}: ${error instanceof Error ? error.message : String(error)}` }]
                };
            }
        }
    )
}
