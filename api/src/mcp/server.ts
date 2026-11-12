import { McpServer } from '@modelcontextprotocol/server';
import { GreetTool } from './tools/greet.ts';
import type { Browser } from 'puppeteer';
import { ScrollPageTool } from './tools/page.ts';



export function NewMcpServer(browser: Browser): McpServer {
    const server = new McpServer({
        name: 'agentic-browser-server',
        version: '1.0.0'
    });

    GreetTool(server)
    ScrollPageTool(server, browser)

    return server
}
