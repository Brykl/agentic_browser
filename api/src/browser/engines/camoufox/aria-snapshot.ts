interface AriaNode {
    content: string;
    children: AriaNode[];
}

const INHERENTLY_CLICKABLE_ROLES = new Set([
    'button',
    'link',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'tab',
    'option',
    'checkbox',
    'radio',
    'switch',
]);

const CONTAINER_LANDMARK_ROLES = new Set([
    'navigation',
    'search',
    'main',
    'contentinfo',
    'banner',
    'complementary',
    'form',
    'list',
]);

const NOISE_EMPTY_ROLES = new Set(['generic', 'status', 'alert', 'none', 'presentation']);

function parseTree(raw: string): AriaNode[] {
    const roots: AriaNode[] = [];
    const stack: Array<{ indent: number; node: AriaNode }> = [];

    for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        const match = /^(\s*)-\s+(.*)$/.exec(line);
        if (!match) continue;

        const indent = match[1]!.length;
        const node: AriaNode = { content: match[2]!.trimEnd(), children: [] };

        while (stack.length > 0 && stack[stack.length - 1]!.indent >= indent) {
            stack.pop();
        }

        if (stack.length === 0) {
            roots.push(node);
        } else {
            stack[stack.length - 1]!.node.children.push(node);
        }
        stack.push({ indent, node });
    }

    return roots;
}

function splitHeaderAndInlineValue(content: string): { header: string; inlineValue?: string } {
    // Handles: `generic [ref=e79]: Қазақстан` or `text: "Google ұсынды:"` or `navigation [ref=e3]:`
    let inQuotes = false;
    let escaped = false;
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (escaped) {
            escaped = false;
            continue;
        }
        if (ch === '\\') {
            escaped = true;
            continue;
        }
        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }
        if (!inQuotes && ch === ':') {
            const header = content.slice(0, i).trim();
            const rest = content.slice(i + 1).trim();
            return { header, inlineValue: rest.length > 0 ? rest : undefined };
        }
    }
    return { header: content.trim() };
}

function compactNodes(nodes: AriaNode[]): AriaNode[] {
    const result: AriaNode[] = [];

    for (const node of nodes) {
        // 1. Drop verbose /url: metadata lines (agent acts via [ref=eN])
        if (node.content.startsWith('/url:')) {
            continue;
        }

        const { header, inlineValue } = splitHeaderAndInlineValue(node.content);
        const role = header.split(/\s+/)[0] ?? '';
        const hasCursorPointer = header.includes('[cursor=pointer]');
        const hasQuotedName = /"[^"]+"/.test(header);

        let children = compactNodes(node.children);

        // 2. Drop redundant `text:` children inside named links/buttons
        if ((role === 'link' || role === 'button') && hasQuotedName) {
            children = children.filter((c) => !c.content.startsWith('text:'));
        }

        // 3. Unwrap non-clickable container `generic` nodes without inline text
        if (role === 'generic' && !hasCursorPointer && !inlineValue) {
            result.push(...children);
            continue;
        }

        // 4. Drop empty noise nodes (empty status/alert/generic without text or children)
        if (NOISE_EMPTY_ROLES.has(role) && !hasCursorPointer && !inlineValue && !hasQuotedName && children.length === 0) {
            continue;
        }

        // 5. Simplify non-clickable `generic [ref=e79]: Some text` -> `text: Some text`
        if (role === 'generic' && !hasCursorPointer && inlineValue && children.length === 0) {
            result.push({ content: `text: ${inlineValue}`, children: [] });
            continue;
        }

        let cleanHeader = header;

        // 6. Strip redundant [cursor=pointer] from inherently clickable roles
        if (INHERENTLY_CLICKABLE_ROLES.has(role)) {
            cleanHeader = cleanHeader.replace(/\s*\[cursor=pointer\]/g, '');
        }

        // 7. Strip [ref=eN] from pure structural container landmarks (unless clickable)
        if (CONTAINER_LANDMARK_ROLES.has(role) && !hasCursorPointer) {
            cleanHeader = cleanHeader.replace(/\s*\[ref=e\d+\]/g, '');
        }

        // Drop landmark container if it became completely empty
        if (CONTAINER_LANDMARK_ROLES.has(role) && !inlineValue && !hasQuotedName && children.length === 0) {
            continue;
        }

        const rebuilt = inlineValue
            ? `${cleanHeader}: ${inlineValue}`
            : children.length > 0
                ? `${cleanHeader}:`
                : cleanHeader;

        result.push({ content: rebuilt, children });
    }

    return result;
}

function serializeTree(nodes: AriaNode[], depth = 0): string[] {
    const lines: string[] = [];
    const pad = '  '.repeat(depth);
    for (const node of nodes) {
        lines.push(`${pad}- ${node.content}`);
        if (node.children.length > 0) {
            lines.push(...serializeTree(node.children, depth + 1));
        }
    }
    return lines;
}

export function compactAriaSnapshot(raw: string): string {
    const tree = parseTree(raw);
    const compacted = compactNodes(tree);
    return serializeTree(compacted).join('\n');
}
