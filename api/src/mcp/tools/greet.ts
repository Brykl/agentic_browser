import * as z from 'zod/v4';
import { McpServer } from '@modelcontextprotocol/server';


export function GreetTool(server: McpServer) {
    server.registerTool(
        'greet',
        {
            description: 'Greet someone by name',
            inputSchema: z.object({ name: z.string() })
        },
        async ({ name }) => ({
            content: [{ type: 'text', text: `Hello, ${name}!` }]
        })
    )
}