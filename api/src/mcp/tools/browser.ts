import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/server';
import type { BrowserManager } from '../../browser/manager.ts';



export function CreateBrowserTool(server: McpServer, browserManager: BrowserManager) {
    server.registerTool(
        'create-browser',
        {
            description: 'Create instance of browser',
            inputSchema: z.object({
                ownerId: z.string(),
                headless: z.boolean().optional(),
                engine: z.string().optional(),
                humanize: z.boolean().optional(),
            })
        },
        async ({ ownerId, headless = true, engine, humanize }) => {
            try {
                const browserId = await browserManager.createBrowser(ownerId, { headless, engine, humanize })
                return {
                    content: [{ type: 'text', text: `Browser created. browserId: ${browserId}` }],
                };
            } catch (error) {
                return {
                    isError: true,
                    content: [{ type: 'text', text: `Failed to create browser: ${error instanceof Error ? error.message : String(error)}` }],
                };
            }
        }
    )
}