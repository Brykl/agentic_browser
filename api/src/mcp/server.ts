import { McpServer } from '@modelcontextprotocol/server';
import { GreetTool } from './tools/greet.ts';



export function NewMcpServer(): McpServer {
    const server = new McpServer({
        name: 'agentic-browser-server',
        version: '1.0.0'
    });

    GreetTool(server)

    return server
}