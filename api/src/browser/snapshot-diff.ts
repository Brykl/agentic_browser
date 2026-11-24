import type { SnapshotMode } from './types.ts';

export interface SnapshotDiffResult {
    text: string;
    mode: SnapshotMode;
}

const MAX_LCS_CELLS = 250_000;
const FULL_FALLBACK_RATIO = 0.65;

function splitLines(text: string): string[] {
    if (!text) return [];
    const lines = text.split(/\r?\n/);
    while (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
    }
    return lines;
}

/**
 * Computes a compact line-level diff between two accessibility snapshots.
 * Falls back to returning the full `current` compact snapshot when the diff
 * would be larger/noisier than the fresh snapshot itself.
 */
export function computeSnapshotDiff(previous: string, current: string): SnapshotDiffResult {
    const prevLines = splitLines(previous);
    const currLines = splitLines(current);

    if (prevLines.length === 0) {
        return { text: current, mode: 'compact' };
    }

    if (prevLines.length * currLines.length > MAX_LCS_CELLS) {
        return { text: current, mode: 'compact' };
    }

    const m = prevLines.length;
    const n = currLines.length;

    // Build LCS length table
    const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
        const row = dp[i]!;
        const nextRow = dp[i + 1]!;
        const prevLine = prevLines[i]!;
        for (let j = n - 1; j >= 0; j--) {
            if (prevLine === currLines[j]) {
                row[j] = nextRow[j + 1]! + 1;
            } else {
                const down = nextRow[j]!;
                const right = row[j + 1]!;
                row[j] = down >= right ? down : right;
            }
        }
    }

    const diffLines: string[] = [];
    let added = 0;
    let removed = 0;
    let i = 0;
    let j = 0;

    while (i < m && j < n) {
        if (prevLines[i] === currLines[j]) {
            i++;
            j++;
        } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) {
            diffLines.push(`- ${prevLines[i]}`);
            removed++;
            i++;
        } else {
            diffLines.push(`+ ${currLines[j]}`);
            added++;
            j++;
        }
    }
    while (i < m) {
        diffLines.push(`- ${prevLines[i]}`);
        removed++;
        i++;
    }
    while (j < n) {
        diffLines.push(`+ ${currLines[j]}`);
        added++;
        j++;
    }

    if (added === 0 && removed === 0) {
        return { text: '(no changes)', mode: 'diff' };
    }

    const changeRatio = (added + removed) / Math.max(currLines.length, 1);
    if (changeRatio > FULL_FALLBACK_RATIO) {
        return { text: current, mode: 'compact' };
    }

    return { text: diffLines.join('\n'), mode: 'diff' };
}
