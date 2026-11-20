import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/server';
import type { BrowserManager } from '../../browser/manager.ts';


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
                if (!browserManager.hasBrowser(browserId)) {
                    throw new Error(`Browser with id ${browserId} not found`);
                }

                const result = await browserManager.scrollPage(
                    browserId,
                    pageId,
                    0,
                    direction === 'down' ? px : -px,
                );
                if (!result) {
                    return {
                        isError: true,
                        content: [{ type: 'text', text: `Page with ID ${pageId} not found` }]
                    };
                }

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
