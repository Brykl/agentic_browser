import type { Protocol } from 'puppeteer-core';

const INTERACTIVE_ROLES = new Set([
    'button',
    'link',
    'textbox',
    'checkbox',
    'radio',
    'combobox',
    'listbox',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'option',
    'searchbox',
    'slider',
    'spinbutton',
    'switch',
    'tab',
    'treeitem',
    'Iframe',
]);

const LANDMARK_ROLES = new Set([
    'RootWebArea',
    'navigation',
    'search',
    'main',
    'contentinfo',
    'dialog',
    'banner',
]);

const BOOLEAN_PROPS = new Set(['checked', 'expanded', 'selected', 'disabled']);
const TEXT_PROPS = new Set(['valuetext', 'placeholder']);

export interface OptimizedAXTreeResult {
    text: string;
    refMap: Map<string, number>;
}

export function optimizeAXTreeForLLM(rawNodes: Protocol.Accessibility.AXNode[]): OptimizedAXTreeResult {
    const nodeMap = new Map(rawNodes.map((node) => [node.nodeId, node]));
    const refMap = new Map<string, number>();
    const lines: string[] = [];
    let nextRef = 1;

    const isInsideInteractive = (node: Protocol.Accessibility.AXNode): boolean => {
        let current = node.parentId ? nodeMap.get(node.parentId) : undefined;
        while (current) {
            const role = typeof current.role?.value === 'string' ? current.role.value : undefined;
            if (role && INTERACTIVE_ROLES.has(role)) return true;
            current = current.parentId ? nodeMap.get(current.parentId) : undefined;
        }
        return false;
    };

    const formatProps = (
        role: string,
        node: Protocol.Accessibility.AXNode,
    ): string => {
        const parts: string[] = [];
        const nodeVal = typeof node.value?.value === 'string' ? node.value.value : undefined;
        if (nodeVal && nodeVal.length > 0) {
            parts.push(`val=${JSON.stringify(nodeVal)}`);
        }

        for (const p of node.properties ?? []) {
            const val = p.value?.value;
            if (val === undefined || val === false || val === 'false') continue;

            if (p.name === 'url' && role === 'RootWebArea' && typeof val === 'string') {
                parts.push(`(${val})`);
            } else if (TEXT_PROPS.has(p.name) && typeof val === 'string' && val.length > 0) {
                parts.push(`${p.name}=${JSON.stringify(val)}`);
            } else if (BOOLEAN_PROPS.has(p.name) && (val === true || val === 'true')) {
                parts.push(`[${p.name}]`);
            }
        }
        return parts.join(' ');
    };

    for (const node of rawNodes) {
        if (node.ignored) continue;

        const role = typeof node.role?.value === 'string' ? node.role.value : undefined;
        const name = typeof node.name?.value === 'string' ? node.name.value.trim() : undefined;

        if (!role || role === 'InlineTextBox' || role === 'none' || role === 'generic') continue;

        const isInteractive = INTERACTIVE_ROLES.has(role);
        const isLandmark = LANDMARK_ROLES.has(role);

        if (role === 'StaticText') {
            if (!name || isInsideInteractive(node)) continue;
            const ref = `e${nextRef++}`;
            if (typeof node.backendDOMNodeId === 'number') {
                refMap.set(ref, node.backendDOMNodeId);
            }
            lines.push(`[ref=${ref}] text ${JSON.stringify(name)}`);
            continue;
        }

        if (!isInteractive && !(isLandmark && (role === 'RootWebArea' || Boolean(name)))) {
            continue;
        }

        const ref = `e${nextRef++}`;
        if (typeof node.backendDOMNodeId === 'number') {
            refMap.set(ref, node.backendDOMNodeId);
        }

        const label = name ? ` ${JSON.stringify(name)}` : '';
        const extras = formatProps(role, node);
        lines.push(`[ref=${ref}] ${role}${label}${extras ? ` ${extras}` : ''}`);
    }

    return { text: lines.join('\n'), refMap };
}

const COMPACT_LANDMARK_ROLES = new Set([
    'navigation',
    'search',
    'main',
    'contentinfo',
    'banner',
    'complementary',
    'dialog',
    'form',
]);

const COMPACT_BOOLEAN_PROPS = new Set(['checked', 'expanded', 'selected', 'disabled', 'focused']);

interface CompactNode {
    content: string;
    children: CompactNode[];
}

export function compactAXTreeForLLM(rawNodes: Protocol.Accessibility.AXNode[]): OptimizedAXTreeResult {
    const nodeMap = new Map(rawNodes.map((node) => [node.nodeId, node]));
    const refMap = new Map<string, number>();
    let nextRef = 1;

    const getPropsSuffix = (node: Protocol.Accessibility.AXNode): string => {
        const parts: string[] = [];
        const nodeVal = typeof node.value?.value === 'string' ? node.value.value : undefined;
        if (nodeVal && nodeVal.length > 0) {
            parts.push(`val=${JSON.stringify(nodeVal)}`);
        }

        for (const p of node.properties ?? []) {
            const val = p.value?.value;
            if (val === undefined || val === false || val === 'false') continue;

            if (p.name === 'focused' && (val === true || val === 'true')) {
                parts.push('[active]');
            } else if (COMPACT_BOOLEAN_PROPS.has(p.name) && (val === true || val === 'true')) {
                parts.push(`[${p.name}]`);
            } else if (p.name === 'level' && typeof val === 'number') {
                parts.push(`[level=${val}]`);
            } else if (TEXT_PROPS.has(p.name) && typeof val === 'string' && val.length > 0) {
                parts.push(`${p.name}=${JSON.stringify(val)}`);
            }
        }
        return parts.join(' ');
    };

    const visit = (node: Protocol.Accessibility.AXNode, insideInteractive: boolean): CompactNode[] => {
        const role = typeof node.role?.value === 'string' ? node.role.value : '';
        const name = typeof node.name?.value === 'string' ? node.name.value.trim() : '';

        const childNodes = (node.childIds ?? [])
            .map((id) => nodeMap.get(id))
            .filter((n): n is Protocol.Accessibility.AXNode => Boolean(n));

        const isInteractive = !node.ignored && INTERACTIVE_ROLES.has(role);

        if (node.ignored || !role || role === 'InlineTextBox' || role === 'none' || role === 'generic' || role === 'RootWebArea') {
            return childNodes.flatMap((child) => visit(child, insideInteractive));
        }

        if (role === 'StaticText') {
            if (!name || insideInteractive) return [];
            return [{ content: `text: ${name}`, children: [] }];
        }

        const children = childNodes.flatMap((child) => visit(child, insideInteractive || isInteractive));

        if (isInteractive) {
            const ref = `e${nextRef++}`;
            if (typeof node.backendDOMNodeId === 'number') {
                refMap.set(ref, node.backendDOMNodeId);
            }
            const label = name ? ` ${JSON.stringify(name)}` : '';
            const extras = getPropsSuffix(node);
            const filteredChildren = name
                ? children.filter((c) => !c.content.startsWith('text:'))
                : children;
            const header = `${role}${label}${extras ? ` ${extras}` : ''} [ref=${ref}]`;
            return [{ content: filteredChildren.length > 0 ? `${header}:` : header, children: filteredChildren }];
        }

        if (COMPACT_LANDMARK_ROLES.has(role)) {
            if (children.length === 0) return [];
            const label = name ? ` ${JSON.stringify(name)}` : '';
            return [{ content: `${role}${label}:`, children }];
        }

        if (role === 'heading' || role === 'img') {
            if (!name && children.length === 0) return [];
            const label = name ? ` ${JSON.stringify(name)}` : '';
            const extras = getPropsSuffix(node);
            const header = `${role}${label}${extras ? ` ${extras}` : ''}`;
            return [{ content: children.length > 0 ? `${header}:` : header, children }];
        }

        return children;
    };

    const roots = rawNodes.filter((n) => !n.parentId);
    const compacted = roots.flatMap((r) => visit(r, false));

    const lines: string[] = [];
    const serialize = (nodes: CompactNode[], depth = 0) => {
        const pad = '  '.repeat(depth);
        for (const n of nodes) {
            lines.push(`${pad}- ${n.content}`);
            if (n.children.length > 0) {
                serialize(n.children, depth + 1);
            }
        }
    };
    serialize(compacted);

    return { text: lines.join('\n'), refMap };
}
