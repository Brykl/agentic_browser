// Shared helpers for raw user input coming from the live UI (see InputEvent in types.ts).

/** Modifier bitmask, same values as CDP `Input.dispatch*Event.modifiers`. */
export const MOD_ALT = 1;
export const MOD_CTRL = 2;
export const MOD_META = 4;
export const MOD_SHIFT = 8;

/** Modifier bit -> key name (identical in Playwright and DOM `KeyboardEvent.key`). */
export const MODIFIER_KEYS = [
    [MOD_ALT, 'Alt'],
    [MOD_CTRL, 'Control'],
    [MOD_META, 'Meta'],
    [MOD_SHIFT, 'Shift'],
] as const;

export function modifierBit(key: string): number {
    for (const [bit, name] of MODIFIER_KEYS) {
        if (name === key) return bit;
    }
    return 0;
}

/** DOM `KeyboardEvent.location`: 0 standard, 1 left, 2 right, 3 numpad. */
export function keyLocation(key: string, code: string): number {
    if (code.startsWith('Numpad')) return 3;
    if (modifierBit(key)) {
        if (code.endsWith('Left')) return 1;
        if (code.endsWith('Right')) return 2;
    }
    return 0;
}

/** DOM `MouseEvent.button` (0 left, 1 middle, 2 right) -> button name. */
export const MOUSE_BUTTONS = ['left', 'middle', 'right'] as const;
export type MouseButtonName = (typeof MOUSE_BUTTONS)[number];

/** Button name -> bit in DOM/CDP `buttons` bitmask. */
export const MOUSE_BUTTON_BITS: Record<MouseButtonName, number> = {
    left: 1,
    right: 2,
    middle: 4,
};

/** `KeyboardEvent.key` values that carry no usable key information. */
export const IGNORED_KEYS = new Set(['', 'Unidentified', 'Dead', 'Process']);

export const VIEWPORT_LIMITS = {
    minWidth: 320,
    maxWidth: 3840,
    minHeight: 200,
    maxHeight: 2160,
} as const;

function clamp(value: number, min: number, max: number, fallback: number): number {
    if (!Number.isFinite(value)) return fallback;
    return Math.min(max, Math.max(min, Math.round(value)));
}

export function clampViewport(width: number, height: number): { width: number; height: number } {
    return {
        width: clamp(width, VIEWPORT_LIMITS.minWidth, VIEWPORT_LIMITS.maxWidth, 1280),
        height: clamp(height, VIEWPORT_LIMITS.minHeight, VIEWPORT_LIMITS.maxHeight, 720),
    };
}

const SPECIAL_KEY_CODES: Record<string, number> = {
    Backspace: 8, Tab: 9, Enter: 13, NumpadEnter: 13,
    ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17,
    AltLeft: 18, AltRight: 18, Pause: 19, CapsLock: 20, Escape: 27, Space: 32,
    PageUp: 33, PageDown: 34, End: 35, Home: 36,
    ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40,
    PrintScreen: 44, Insert: 45, Delete: 46,
    MetaLeft: 91, MetaRight: 92, ContextMenu: 93,
    NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109, NumpadDecimal: 110, NumpadDivide: 111,
    NumLock: 144, ScrollLock: 145,
    Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192,
    BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222, IntlBackslash: 226,
};

/**
 * Windows virtual key code for a DOM `KeyboardEvent.code`.
 * CDP needs it for editing keys (Backspace, Enter, arrows...) to have any effect.
 */
export function windowsKeyCode(code: string): number | undefined {
    let m = /^Key([A-Z])$/.exec(code);
    if (m) return m[1]!.charCodeAt(0);
    m = /^Digit(\d)$/.exec(code);
    if (m) return 48 + Number(m[1]);
    m = /^Numpad(\d)$/.exec(code);
    if (m) return 96 + Number(m[1]);
    m = /^F(\d{1,2})$/.exec(code);
    if (m) return 111 + Number(m[1]);
    return SPECIAL_KEY_CODES[code];
}
