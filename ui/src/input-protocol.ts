// Messages the live view sends to /api/v1/ws (mirrors api/src/ws/client-message.ts)

export type ClientMessage =
  | { t: "mouse"; kind: "move" | "down" | "up"; x: number; y: number; button: 0 | 1 | 2; mods: number; clicks?: number }
  | { t: "wheel"; x: number; y: number; dx: number; dy: number }
  | { t: "key"; kind: "down" | "up"; key: string; code: string; mods: number }
  | { t: "text"; text: string }
  | { t: "resize"; width: number; height: number };

export type SendInput = (msg: ClientMessage) => void;

export type Viewport = { width: number; height: number };

export type AgentCursorEvent =
  | { kind: "move"; x: number; y: number }
  | { kind: "down"; x: number; y: number }
  | { kind: "up"; x: number; y: number }
  | { kind: "hide" };

/** Modifier bitmask, same values as CDP: Alt=1, Ctrl=2, Meta=4, Shift=8 */
export function modifiers(e: { altKey: boolean; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean }): number {
  return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0);
}
