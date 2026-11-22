import type { InputEvent } from '../browser/types.ts'

export type ResizeMessage = { t: 'resize'; width: number; height: number }
export type ClientMessage = InputEvent | ResizeMessage

const MAX_TEXT_LENGTH = 10_000
const MAX_KEY_LENGTH = 64

type Obj = Record<string, unknown>

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const int = (v: unknown, min: number, max: number): v is number =>
    Number.isInteger(v) && (v as number) >= min && (v as number) <= max
const str = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max

/**
 * Parse and validate one message from the live UI.
 * Returns null for anything malformed, so the caller can simply drop it.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
    let data: unknown
    try {
        data = JSON.parse(raw)
    } catch {
        return null
    }
    if (!isObj(data)) return null

    switch (data.t) {
        case 'mouse': {
            const { kind, x, y, button, mods, clicks } = data
            if (kind !== 'move' && kind !== 'down' && kind !== 'up') return null
            if (!num(x) || !num(y) || !int(mods, 0, 15)) return null
            if (button !== 0 && button !== 1 && button !== 2) return null
            if (clicks !== undefined && !int(clicks, 1, 3)) return null
            return { t: 'mouse', kind, x, y, button, mods, clicks }
        }
        case 'wheel': {
            const { x, y, dx, dy } = data
            if (!num(x) || !num(y) || !num(dx) || !num(dy)) return null
            return { t: 'wheel', x, y, dx, dy }
        }
        case 'key': {
            const { kind, key, code, mods } = data
            if (kind !== 'down' && kind !== 'up') return null
            if (!str(key, MAX_KEY_LENGTH) || !str(code, MAX_KEY_LENGTH) || !int(mods, 0, 15)) return null
            return { t: 'key', kind, key, code, mods }
        }
        case 'text': {
            const { text } = data
            if (!str(text, MAX_TEXT_LENGTH) || text.length === 0) return null
            return { t: 'text', text }
        }
        case 'resize': {
            const { width, height } = data
            if (!num(width) || !num(height)) return null
            return { t: 'resize', width, height }
        }
        default:
            return null
    }
}
