import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/server';
import type { Browser } from 'puppeteer';
import { GetPageById } from '../../browser/manager.ts';


export function ScrollPageTool(server: McpServer, browser: Browser) {
    server.registerTool(
        'scroll-page',
        {
            description: 'Scroll a page up or down',
            inputSchema: z.object({
                pageId: z.int().nonnegative().describe('Index of the page in browser.pages(), starting at 0'),
                direction: z.enum(['up', 'down']).describe('Scroll direction: up or down'),
                px: z.int().positive().describe('Distance to scroll in pixels; must be a positive integer')
            })
        },
        async ({ pageId, direction, px }) => {
            try {
                const page = await GetPageById(browser, pageId);
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
