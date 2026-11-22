export interface BrowserLaunchConfig {
    headless?: boolean;
    proxy?: { server: string; username?: string; password?: string };
    viewport?: { width: number; height: number };
    engine?: string;
}

export type FrameListener = (frame: Buffer) => void;

export interface FrameStream {
    getFrame(): Buffer | null;
    onFrame(cb: FrameListener): () => void;
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
    dispatchInput(msg: InputEvent): Promise<void>;
    /** Release mouse buttons and modifier keys still held via dispatchInput (e.g. UI disconnected mid-drag). */
    releaseInput(): Promise<void>;
    setViewport(width: number, height: number): Promise<{ width: number; height: number }>;

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

export type InputEvent =
    | { t: "mouse"; kind: "move" | "down" | "up"; x: number; y: number; button: 0 | 1 | 2; mods: number; clicks?: number }
    | { t: "wheel"; x: number; y: number; dx: number; dy: number }
    | { t: "key"; kind: "down" | "up"; key: string; code: string; mods: number }
    | { t: "text"; text: string };