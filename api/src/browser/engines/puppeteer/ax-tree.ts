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
    refMap: Map<number, number>;
}

export function optimizeAXTreeForLLM(rawNodes: Protocol.Accessibility.AXNode[]): OptimizedAXTreeResult {
    const nodeMap = new Map(rawNodes.map((node) => [node.nodeId, node]));
    const refMap = new Map<number, number>();
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
            const ref = nextRef++;
            if (typeof node.backendDOMNodeId === 'number') {
                refMap.set(ref, node.backendDOMNodeId);
            }
            lines.push(`[${ref}] text ${JSON.stringify(name)}`);
            continue;
        }

        if (!isInteractive && !(isLandmark && (role === 'RootWebArea' || Boolean(name)))) {
            continue;
        }

        const ref = nextRef++;
        if (typeof node.backendDOMNodeId === 'number') {
            refMap.set(ref, node.backendDOMNodeId);
        }

        const label = name ? ` ${JSON.stringify(name)}` : '';
        const extras = formatProps(role, node);
        lines.push(`[${ref}] ${role}${label}${extras ? ` ${extras}` : ''}`);
    }

    return { text: lines.join('\n'), refMap };
}
