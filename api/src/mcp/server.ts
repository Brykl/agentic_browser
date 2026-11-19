import { McpServer } from '@modelcontextprotocol/server';
import { GreetTool } from './tools/greet.ts';
import type { Browser } from 'puppeteer';
import { ScrollPageTool } from './tools/page.ts';
import type { BrowserManager } from '../services/browser.ts';
import { CreateBrowserTool } from './tools/browser.ts';



export function NewMcpServer(browserManager: BrowserManager): McpServer {
    const server = new McpServer({
        name: 'agentic-browser-server',
        version: '1.0.0'
    });

    GreetTool(server)
    ScrollPageTool(server, browserManager)
    CreateBrowserTool(server, browserManager)

    return server
}
