import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, type Ref } from "react";
import { modifiers, type AgentCursorEvent, type SendInput, type Viewport } from "../input-protocol";

export type LiveViewHandle = {
    drawFrame: (blob: Blob) => void;
    updateAgentCursor: (event: AgentCursorEvent) => void;
    clear: () => void;
};

type Props = {
    ref?: Ref<LiveViewHandle>;
    /** Real page viewport reported by the server (CSS px) */
    viewport?: Viewport;
    connected: boolean;
    send: SendInput;
};

const RESIZE_DEBOUNCE_MS = 150;
const MULTI_CLICK_MS = 500;
const MULTI_CLICK_DISTANCE = 4;
const LINE_HEIGHT_PX = 16;
const CURSOR_IDLE_HIDE_MS = 4500;

/** Keys left to the host browser instead of being forwarded to the page. */
function isHostShortcut(e: KeyboardEvent | React.KeyboardEvent): boolean {
    if (e.key === "F12") return true; // DevTools of the UI itself
    if (e.ctrlKey && e.shiftKey && (e.code === "KeyI" || e.code === "KeyJ")) return true;
    return false;
}

/** Ctrl/Cmd+V: let the native `paste` event fire, then forward clipboard text. */
function isPasteShortcut(e: KeyboardEvent | React.KeyboardEvent): boolean {
    return (e.ctrlKey || e.metaKey) && !e.altKey && e.code === "KeyV";
}

function toButton(button: number): 0 | 1 | 2 | null {
    return button === 0 || button === 1 || button === 2 ? button : null;
}

export function LiveViewBrowser({ ref, viewport, connected, send }: Props) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const cursorRef = useRef<HTMLDivElement>(null);
    const cursorIconRef = useRef<HTMLDivElement>(null);
    const rippleContainerRef = useRef<HTMLDivElement>(null);

    // Latest props for event handlers registered once (wheel, paste, resize)
    const viewportRef = useRef(viewport);
    const connectedRef = useRef(connected);
    useLayoutEffect(() => {
        viewportRef.current = viewport;
        connectedRef.current = connected;
    }, [viewport, connected]);

    /** Last measured size of the view area, re-sent after (re)connect */
    const sizeRef = useRef<Viewport | null>(null);
    /** Monotonic counter to drop out-of-order or stale decoded frames */
    const frameSeqRef = useRef(0);
    /** Keys pressed while the view had focus: code -> key */
    const pressedKeysRef = useRef(new Map<string, string>());
    const heldButtonsRef = useRef(new Set<0 | 1 | 2>());
    const lastPointRef = useRef({ x: 0, y: 0 });
    const lastDownRef = useRef({ time: 0, x: 0, y: 0, button: -1, count: 0 });
    const pendingMoveRef = useRef<{ x: number; y: number; mods: number } | null>(null);
    const moveFrameRef = useRef<number | null>(null);
    const agentCursorRef = useRef({ x: 0, y: 0, visible: false, down: false });
    const hideCursorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const emit = useCallback<SendInput>((msg) => {
        if (connectedRef.current) send(msg);
    }, [send]);

    // ---- Coordinates ------------------------------------------------------------
    /** Page viewport CSS px -> overlay px, accounting for `object-fit: contain` letterboxing */
    const fromPage = useCallback((x: number, y: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const r = canvas.getBoundingClientRect();
        const vw = viewportRef.current?.width ?? (canvas.width || r.width);
        const vh = viewportRef.current?.height ?? (canvas.height || r.height);
        if (!vw || !vh || !r.width || !r.height) return null;
        const scale = Math.min(r.width / vw, r.height / vh) || 1;
        return {
            x: (r.width - vw * scale) / 2 + x * scale,
            y: (r.height - vh * scale) / 2 + y * scale,
        };
    }, []);

    // ---- Agent cursor -----------------------------------------------------------
    const renderAgentCursor = useCallback(() => {
        const el = cursorRef.current;
        if (!el) return;
        const state = agentCursorRef.current;
        if (!state.visible) {
            el.style.opacity = "0";
            return;
        }
        const pos = fromPage(state.x, state.y);
        if (!pos) return;
        el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
        el.style.opacity = "1";
        if (cursorIconRef.current) {
            cursorIconRef.current.style.transform = state.down ? "scale(0.86)" : "scale(1)";
        }
    }, [fromPage]);

    const spawnRipple = useCallback((x: number, y: number) => {
        const container = rippleContainerRef.current;
        if (!container) return;
        const pos = fromPage(x, y);
        if (!pos) return;
        const ripple = document.createElement("div");
        ripple.className = "agent-cursor-ripple";
        ripple.style.left = `${pos.x}px`;
        ripple.style.top = `${pos.y}px`;
        ripple.addEventListener("animationend", () => ripple.remove(), { once: true });
        container.appendChild(ripple);
    }, [fromPage]);

    const resetHideCursorTimer = useCallback(() => {
        if (hideCursorTimerRef.current) {
            clearTimeout(hideCursorTimerRef.current);
            hideCursorTimerRef.current = null;
        }
        if (agentCursorRef.current.down) return;
        hideCursorTimerRef.current = setTimeout(() => {
            hideCursorTimerRef.current = null;
            agentCursorRef.current.visible = false;
            renderAgentCursor();
        }, CURSOR_IDLE_HIDE_MS);
    }, [renderAgentCursor]);

    const hideAgentCursor = useCallback(() => {
        if (hideCursorTimerRef.current) {
            clearTimeout(hideCursorTimerRef.current);
            hideCursorTimerRef.current = null;
        }
        agentCursorRef.current.visible = false;
        agentCursorRef.current.down = false;
        renderAgentCursor();
        if (rippleContainerRef.current) {
            rippleContainerRef.current.replaceChildren();
        }
    }, [renderAgentCursor]);

    useEffect(() => {
        renderAgentCursor();
    }, [viewport, renderAgentCursor]);

    useEffect(() => {
        return () => {
            if (hideCursorTimerRef.current) clearTimeout(hideCursorTimerRef.current);
        };
    }, []);

    // ---- Frames ---------------------------------------------------------------
    useImperativeHandle(ref, () => ({
        drawFrame(blob: Blob) {
            const seq = ++frameSeqRef.current;
            void createImageBitmap(blob)
                .then((bitmap) => {
                    const canvas = canvasRef.current;
                    if (seq !== frameSeqRef.current || !canvas) {
                        bitmap.close();
                        return;
                    }
                    const ctx = canvas.getContext("2d");
                    if (!ctx) {
                        bitmap.close();
                        return;
                    }
                    const resized = canvas.width !== bitmap.width || canvas.height !== bitmap.height;
                    if (canvas.width !== bitmap.width) canvas.width = bitmap.width;
                    if (canvas.height !== bitmap.height) canvas.height = bitmap.height;
                    ctx.drawImage(bitmap, 0, 0);
                    bitmap.close();
                    if (resized) renderAgentCursor();
                })
                .catch(() => { });
        },
        updateAgentCursor(event: AgentCursorEvent) {
            if (event.kind === "hide") {
                hideAgentCursor();
                return;
            }
            const state = agentCursorRef.current;
            state.x = event.x;
            state.y = event.y;
            state.visible = true;
            if (event.kind === "down") {
                state.down = true;
                spawnRipple(event.x, event.y);
            } else if (event.kind === "up") {
                state.down = false;
            }
            renderAgentCursor();
            resetHideCursorTimer();
        },
        clear() {
            frameSeqRef.current++;
            const canvas = canvasRef.current;
            const ctx = canvas?.getContext("2d");
            if (canvas && ctx) {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            hideAgentCursor();
        },
    }), [hideAgentCursor, renderAgentCursor, resetHideCursorTimer, spawnRipple]);

    // ---- Coordinates ------------------------------------------------------------
    /** Client (UI) coordinates -> page viewport CSS px, accounting for `object-fit: contain` letterboxing */
    const toPage = useCallback((clientX: number, clientY: number) => {
        const canvas = canvasRef.current!;
        const r = canvas.getBoundingClientRect();
        const vw = viewportRef.current?.width ?? (canvas.width || r.width);
        const vh = viewportRef.current?.height ?? (canvas.height || r.height);
        const scale = Math.min(r.width / vw, r.height / vh) || 1;
        const x = (clientX - r.left - (r.width - vw * scale) / 2) / scale;
        const y = (clientY - r.top - (r.height - vh * scale) / 2) / scale;
        return {
            x: Math.round(Math.min(vw - 1, Math.max(0, x))),
            y: Math.round(Math.min(vh - 1, Math.max(0, y))),
        };
    }, []);

    // ---- Resize -----------------------------------------------------------------
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        let timer: ReturnType<typeof setTimeout> | undefined;
        const observer = new ResizeObserver(([entry]) => {
            if (!entry) return;
            const size = {
                width: Math.round(entry.contentRect.width),
                height: Math.round(entry.contentRect.height),
            };
            if (size.width === 0 || size.height === 0) return;
            sizeRef.current = size;
            renderAgentCursor();
            clearTimeout(timer);
            timer = setTimeout(() => emit({ t: "resize", ...size }), RESIZE_DEBOUNCE_MS);
        });
        observer.observe(canvas);

        return () => {
            observer.disconnect();
            clearTimeout(timer);
        };
    }, [emit, renderAgentCursor]);

    // The server doesn't know our size after a (re)connect or page switch
    useEffect(() => {
        if (connected && sizeRef.current) {
            send({ t: "resize", ...sizeRef.current });
        }
    }, [connected, send]);

    // ---- Mouse ------------------------------------------------------------------
    const cancelPendingMove = () => {
        if (moveFrameRef.current !== null) cancelAnimationFrame(moveFrameRef.current);
        moveFrameRef.current = null;
        pendingMoveRef.current = null;
    };

    const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const point = toPage(e.clientX, e.clientY);
        lastPointRef.current = point;
        pendingMoveRef.current = { ...point, mods: modifiers(e) };
        // At most one move per animation frame
        if (moveFrameRef.current !== null) return;
        moveFrameRef.current = requestAnimationFrame(() => {
            moveFrameRef.current = null;
            const move = pendingMoveRef.current;
            pendingMoveRef.current = null;
            if (move) emit({ t: "mouse", kind: "move", button: 0, ...move });
        });
    };

    const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const button = toButton(e.button);
        if (button === null) return;
        e.preventDefault();
        const canvas = e.currentTarget;
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(e.pointerId); // keep receiving moves while dragging outside

        // down/up carry their own coordinates, a pending move would only arrive late
        cancelPendingMove();
        const point = toPage(e.clientX, e.clientY);
        lastPointRef.current = point;

        // PointerEvent.detail is 0 in Chromium, so count multi-clicks ourselves
        const last = lastDownRef.current;
        const now = performance.now();
        const sameSpot =
            Math.abs(point.x - last.x) <= MULTI_CLICK_DISTANCE &&
            Math.abs(point.y - last.y) <= MULTI_CLICK_DISTANCE;
        const count =
            last.button === button && sameSpot && now - last.time < MULTI_CLICK_MS
                ? (last.count % 3) + 1
                : 1;
        lastDownRef.current = { time: now, ...point, button, count };

        heldButtonsRef.current.add(button);
        emit({ t: "mouse", kind: "down", button, ...point, mods: modifiers(e), clicks: count });
    };

    const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        const button = toButton(e.button);
        if (button === null || !heldButtonsRef.current.has(button)) return;
        e.preventDefault();
        cancelPendingMove();
        const point = toPage(e.clientX, e.clientY);
        lastPointRef.current = point;
        heldButtonsRef.current.delete(button);
        emit({
            t: "mouse",
            kind: "up",
            button,
            ...point,
            mods: modifiers(e),
            clicks: lastDownRef.current.count,
        });
    };

    // React's onWheel is passive, so preventDefault() would not stop the UI from scrolling
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onWheel = (e: WheelEvent) => {
            e.preventDefault();
            const factor =
                e.deltaMode === WheelEvent.DOM_DELTA_LINE
                    ? LINE_HEIGHT_PX
                    : e.deltaMode === WheelEvent.DOM_DELTA_PAGE
                        ? (viewportRef.current?.height ?? canvas.clientHeight)
                        : 1;
            emit({
                t: "wheel",
                ...toPage(e.clientX, e.clientY),
                dx: e.deltaX * factor,
                dy: e.deltaY * factor,
            });
        };

        canvas.addEventListener("wheel", onWheel, { passive: false });
        return () => canvas.removeEventListener("wheel", onWheel);
    }, [emit, toPage]);

    // ---- Keyboard ---------------------------------------------------------------
    const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
        if (isHostShortcut(e)) return;
        if (isPasteShortcut(e)) return; // handled by the `paste` listener below
        e.preventDefault();
        if (e.nativeEvent.isComposing || e.key === "Process") return; // IME isn't supported yet

        pressedKeysRef.current.set(e.code, e.key);
        emit({ t: "key", kind: "down", key: e.key, code: e.code, mods: modifiers(e) });
    };

    const onKeyUp = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
        if (isHostShortcut(e)) return;
        e.preventDefault();
        // Release with the key name used on keydown (Shift may have changed `e.key`).
        // Keys never forwarded on keydown (paste shortcut, IME) are not released either.
        const key = pressedKeysRef.current.get(e.code);
        if (key === undefined) return;
        pressedKeysRef.current.delete(e.code);
        emit({ t: "key", kind: "up", key, code: e.code, mods: modifiers(e) });
    };

    useEffect(() => {
        const onPaste = (e: ClipboardEvent) => {
            if (document.activeElement !== canvasRef.current) return;
            e.preventDefault();
            const text = e.clipboardData?.getData("text/plain");
            if (text) emit({ t: "text", text });
        };
        document.addEventListener("paste", onPaste);
        return () => document.removeEventListener("paste", onPaste);
    }, [emit]);

    /** Focus lost (Alt+Tab, click on the app bar...): release everything still held in the page */
    const onBlur = () => {
        cancelPendingMove();
        for (const [code, key] of pressedKeysRef.current) {
            emit({ t: "key", kind: "up", key, code, mods: 0 });
        }
        pressedKeysRef.current.clear();
        for (const button of heldButtonsRef.current) {
            emit({ t: "mouse", kind: "up", button, ...lastPointRef.current, mods: 0, clicks: 1 });
        }
        heldButtonsRef.current.clear();
    };

    return (
        <div
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
            }}
        >
            <canvas
                ref={canvasRef}
                tabIndex={0}
                onPointerMove={onPointerMove}
                onPointerDown={onPointerDown}
                onPointerUp={onPointerUp}
                onContextMenu={(e) => e.preventDefault()}
                onKeyDown={onKeyDown}
                onKeyUp={onKeyUp}
                onBlur={onBlur}
                style={{
                    display: "block",
                    width: "100%",
                    height: "100%",
                    objectFit: "contain",
                    outline: "none",
                    cursor: connected ? "default" : "wait",
                    touchAction: "none",
                    userSelect: "none",
                }}
            />
            <div
                aria-hidden="true"
                style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    overflow: "hidden",
                }}
            >
                <div ref={rippleContainerRef} style={{ position: "absolute", inset: 0 }} />
                <div
                    ref={cursorRef}
                    style={{
                        position: "absolute",
                        top: 0,
                        left: 0,
                        opacity: 0,
                        willChange: "transform, opacity",
                        transition: "opacity 220ms ease, transform 45ms linear",
                    }}
                >
                    <div
                        ref={cursorIconRef}
                        style={{
                            transformOrigin: "top left",
                            transition: "transform 80ms ease-out",
                            filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.45))",
                        }}
                    >
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ display: "block" }}>
                            <path
                                d="M2 2L9.5 21L12.6 13.4L20.5 10.5L2 2Z"
                                fill="#7c3aed"
                                stroke="#ffffff"
                                strokeWidth="1.75"
                                strokeLinejoin="round"
                            />
                        </svg>
                        <span
                            style={{
                                position: "absolute",
                                left: 16,
                                top: 15,
                                padding: "1px 5px",
                                borderRadius: 999,
                                backgroundColor: "#7c3aed",
                                color: "#ffffff",
                                fontSize: 10,
                                fontWeight: 700,
                                lineHeight: "14px",
                                letterSpacing: "0.04em",
                                fontFamily: "system-ui, -apple-system, sans-serif",
                                border: "1px solid rgba(255, 255, 255, 0.85)",
                            }}
                        >
                            AI
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
