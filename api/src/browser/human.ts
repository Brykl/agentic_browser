import { path } from "ghost-cursor";

export type Point = { x: number; y: number };
export type Box = { x: number; y: number; width: number; height: number };

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
export const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

function gaussian(): number {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Точка внутри элемента: ближе к центру, но не ровно в центре и не у самого края. */
export function pointInside(box: Box): Point {
    return {
        x: box.x + box.width * clamp(0.5 + gaussian() * 0.15, 0.15, 0.85),
        y: box.y + box.height * clamp(0.5 + gaussian() * 0.15, 0.2, 0.8),
    };
}

/** Видимая часть элемента: кликать за пределами viewport нельзя. */
export function visiblePart(box: Box, vp: { width: number; height: number }): Box {
    const x = Math.max(0, box.x), y = Math.max(0, box.y);
    return {
        x, y,
        width: Math.max(1, Math.min(vp.width, box.x + box.width) - x),
        height: Math.max(1, Math.min(vp.height, box.y + box.height) - y),
    };
}

/** Точки траектории и пауза перед каждой (мс). */
export function humanPath(from: Point, to: Point): Array<Point & { dt: number }> {
    // Передаём точку, а не прямоугольник: с прямоугольником путь заканчивается в его углу
    const pts = path(from, to, { useTimestamps: true }) as Array<Point & { timestamp: number }>;
    return pts.map((p, i) => ({
        x: Math.round(p.x),
        y: Math.round(p.y),
        dt: i === 0 ? 0 : clamp(p.timestamp - pts[i - 1]!.timestamp, 4, 40),
    }));
}