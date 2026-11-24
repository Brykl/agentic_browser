export interface BrowserLaunchConfig {
    headless?: boolean;
    proxy?: { server: string; username?: string; password?: string };
    viewport?: { width: number; height: number };
    engine?: string;
    humanize?: boolean;
}

export type FrameListener = (frame: Buffer) => void;

export type AgentCursorEvent =
    | { kind: 'move'; x: number; y: number }
    | { kind: 'down'; x: number; y: number }
    | { kind: 'up'; x: number; y: number }
    | { kind: 'hide' };

export type AgentCursorListener = (event: AgentCursorEvent) => void;

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
    click(ref: string, options?: ClickOptions): Promise<ClickResult>;
    fill(ref: string, value: string): Promise<{ filled: boolean; ref: string; value: string }>;
    wait(options: WaitOptions): Promise<WaitResult>;
    getScroll(): Promise<{ x: number; y: number; maxX: number; maxY: number }>;
    scrollBy(left: number, top: number): Promise<{ x: number; y: number }>;
    startScreencast(): Promise<FrameStream>;
    dispatchInput(msg: InputEvent): Promise<void>;
    releaseInput(): Promise<void>;
    setViewport(width: number, height: number): Promise<{ width: number; height: number }>;
    screenshot(): Promise<string>

    onAgentCursor(cb: AgentCursorListener): () => void;
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


export interface FillFieldInput {
    ref: string;
    value: string;
}

export interface FillFieldResult {
    filled: boolean;
    ref: string;
    value: string;
}

export class FillBatchError extends Error {
    readonly failedRef: string;
    readonly completed: FillFieldResult[];

    constructor(message: string, failedRef: string, completed: FillFieldResult[]) {
        super(message);
        this.name = 'FillBatchError';
        this.failedRef = failedRef;
        this.completed = completed;
    }
}

export type SnapshotMode = 'compact' | 'full' | 'diff';

export interface ActionOptions {
    snapshot?: SnapshotMode;
}

export interface PageActionMeta {
    url: string;
    title: string;
    navigated: boolean;
    snapshot?: string;
    snapshotMode?: SnapshotMode;
}

export interface ClickOptions {
    waitForNavigation?: boolean;
    navigationDetectMs?: number;
    navigationTimeoutMs?: number;
}

export interface ClickResult {
    clicked: true;
    ref: string;
    x?: number;
    y?: number;
    navigated?: boolean;
}

export type PageLoadState = 'domcontentloaded' | 'load' | 'networkidle';

export interface WaitOptions {
    url?: string;
    text?: string;
    load?: PageLoadState;
    timeout?: number;
}

export interface WaitResult {
    waited: true;
    elapsedMs: number;
}