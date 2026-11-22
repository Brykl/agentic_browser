export interface BrowserLaunchConfig {
    headless?: boolean;
    proxy?: { server: string; username?: string; password?: string };
    viewport?: { width: number; height: number };
    engine?: string;
}

export interface FrameStream {
    getFrame(): string | null;
    stop(): Promise<void>;
}

export interface PageDriver {
    url(): string;
    title(): Promise<string>;
    goto(url: string): Promise<void>;
    reload(): Promise<void>;
    close(): Promise<void>;

    snapshot(): Promise<string>;
    fullSnapshot(): Promise<string>;
    click(ref: string): Promise<{ clicked: true; ref: string; x?: number; y?: number }>;
    fill(ref: string, value: string): Promise<{ filled: true; ref: string; value: string }>;
    getScroll(): Promise<{ x: number; y: number; maxX: number; maxY: number }>;
    scrollBy(left: number, top: number): Promise<{ x: number; y: number }>;
    startScreencast(): Promise<FrameStream>;

    onNavigate(cb: () => void): void;
    onClose(cb: () => void): void;
}

export interface BrowserDriver {
    newPage(viewport?: { width: number; height: number }): Promise<PageDriver>;
    close(): Promise<void>;
    isConnected(): boolean;
    onDisconnected(cb: () => void): void;
}

export interface BrowserEngine {
    readonly name: string;
    launch(config: BrowserLaunchConfig): Promise<BrowserDriver>;
}