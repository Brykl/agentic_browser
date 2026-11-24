import { describe, expect, it } from '@jest/globals';
import { computeSnapshotDiff } from './snapshot-diff.ts';

describe('computeSnapshotDiff', () => {
    it('returns (no changes) when snapshots are identical', () => {
        const snap = '[ref=e1] heading "Login"\n[ref=e2] textbox "Email"\n[ref=e3] button "Submit"';
        const res = computeSnapshotDiff(snap, snap);
        expect(res).toEqual({ text: '(no changes)', mode: 'diff' });
    });

    it('returns compact line-level diff for small updates', () => {
        const prev = [
            '[ref=e1] heading "Search"',
            '[ref=e2] textbox "Query"',
            '[ref=e3] button "Go"',
            '[ref=e4] link "Home"',
            '[ref=e5] link "About"',
        ].join('\n');
        const curr = [
            '[ref=e1] heading "Search"',
            '[ref=e2] textbox "Query" value="hello"',
            '[ref=e3] button "Go"',
            '[ref=e4] link "Home"',
            '[ref=e5] link "About"',
        ].join('\n');

        const res = computeSnapshotDiff(prev, curr);
        expect(res.mode).toBe('diff');
        expect(res.text).toBe('- [ref=e2] textbox "Query"\n+ [ref=e2] textbox "Query" value="hello"');
    });

    it('falls back to compact snapshot when most lines changed', () => {
        const prev = '[ref=e1] button "A"\n[ref=e2] button "B"';
        const curr = '[ref=e1] heading "Dashboard"\n[ref=e2] link "Settings"\n[ref=e3] button "Logout"';

        const res = computeSnapshotDiff(prev, curr);
        expect(res).toEqual({ text: curr, mode: 'compact' });
    });

    it('falls back to compact snapshot when previous is empty', () => {
        const curr = '[ref=e1] button "OK"';
        const res = computeSnapshotDiff('', curr);
        expect(res).toEqual({ text: curr, mode: 'compact' });
    });
});
