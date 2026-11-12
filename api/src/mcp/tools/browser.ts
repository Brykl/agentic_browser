import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/server';


export function CreateBrowser(server: McpServer) {
    server.registerTool(
        'create-browser',
        {
            description: 'Create instance of browser',
            inputSchema: z.object({})
        },
        async ({ }) => ({
            content: [{ type: 'text', text: `Hello, ${name}!` }]
        })
    )
}