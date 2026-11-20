import type { FrameStream, PageDriver } from "../../types.ts";
import type { Page } from "playwright-core";

export class CamoufoxPageDriver implements PageDriver {
    private readonly page: Page

    constructor(page: Page) {
        this.page = page
    }

    url(): string {
        throw new Error("Not implemented");
    }
    async title(): Promise<string> {
        throw new Error("Not implemented");
    }
    async goto(url: string): Promise<void> {
        throw new Error("Not implemented");
    }
    async reload(): Promise<void> {
        throw new Error("Not implemented");
    }
    async close(): Promise<void> {
        throw new Error("Not implemented");
    }
    async snapshot(): Promise<string> {
        throw new Error("Not implemented");
    }
    async click(ref: number): Promise<{ clicked: true; ref: number; x?: number; y?: number }> {
        throw new Error("Not implemented");
    }
    async fill(ref: number, value: string): Promise<{ filled: true; ref: number; value: string }> {
        throw new Error("Not implemented");
    }
    async getScroll(): Promise<{ x: number; y: number; maxX: number; maxY: number }> {
        throw new Error("Not implemented");
    }
    async scrollBy(left: number, top: number): Promise<{ x: number; y: number }> {
        throw new Error("Not implemented");
    }
    async startScreencast(): Promise<FrameStream> {
        throw new Error("Not implemented");
    }
    onNavigate(cb: () => void): void {
        throw new Error("Not implemented");
    }
    onClose(cb: () => void): void {
        throw new Error("Not implemented");
    }
}