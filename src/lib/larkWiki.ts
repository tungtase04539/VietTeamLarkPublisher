// Lark Wiki v2 API helpers — proxied via Vite's /lark-api → open.larksuite.com
const LARK_BASE = '/lark-api';

export interface WikiSpace {
    space_id: string;
    name: string;
    description?: string;
}

export interface WikiNode {
    node_token: string;
    obj_token: string;
    obj_type: string;
    title: string;
    has_child: boolean;
    space_id: string;
    parent_node_token?: string;
}

/**
 * Accepts:
 *   - Full URL: https://congdongagi.sg.larksuite.com/wiki/TOKEN
 *   - Bare token: MZ9Nwoz9Kixx6yk6UB4lQK99gEk
 *   - Numeric space_id: 7123456789012345678
 *
 * Returns: { spaceId (numeric), nodeToken, domain (e.g. https://congdongagi.sg.larksuite.com) }
 */
export async function resolveSpaceId(
    token: string,
    input: string,
): Promise<{ spaceId: string; nodeToken?: string; domain?: string }> {
    let rawToken = input.trim();
    let domain: string | undefined;

    // Parse full URL → extract domain + token
    try {
        const url = new URL(rawToken);
        domain = url.origin; // https://congdongagi.sg.larksuite.com
        // last path segment is the token
        const parts = url.pathname.split('/').filter(Boolean);
        rawToken = parts[parts.length - 1];
    } catch { /* not a URL, use raw input */ }

    // Already numeric → no API call needed
    if (/^\d+$/.test(rawToken)) return { spaceId: rawToken, domain };

    const res = await fetch(
        `${LARK_BASE}/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(rawToken)}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json() as {
        code: number; msg: string;
        data?: { node?: { space_id?: string; node_token?: string } };
    };
    console.log('[Lark Wiki] resolveSpaceId get_node:', data);
    const spaceId = data.data?.node?.space_id;
    if (spaceId) return { spaceId, nodeToken: data.data?.node?.node_token ?? rawToken, domain };
    throw new Error(`Không thể xác định Space ID từ "${input}". Hãy nhập URL wiki hoặc numeric Space ID.`);
}


// ─── List wiki spaces ─────────────────────────────────────────────────────────

export async function listWikiSpaces(token: string): Promise<WikiSpace[]> {
    const res = await fetch(`${LARK_BASE}/open-apis/wiki/v2/spaces?page_size=50`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json() as { code: number; msg: string; data?: { items?: WikiSpace[] } };
    console.log('[Lark Wiki] listWikiSpaces raw:', data);
    if (data.code !== 0) throw new Error(`List wiki spaces failed: ${data.msg} (code ${data.code})`);
    return data.data?.items ?? [];
}

// ─── List wiki nodes ──────────────────────────────────────────────────────────

export async function listWikiNodes(
    token: string,
    spaceId: string,
    parentNodeToken?: string,
): Promise<WikiNode[]> {
    const params = new URLSearchParams({ page_size: '50' });
    if (parentNodeToken) params.set('parent_node_token', parentNodeToken);
    const res = await fetch(
        `${LARK_BASE}/open-apis/wiki/v2/spaces/${spaceId}/nodes?${params}`,
        { headers: { Authorization: `Bearer ${token}` } },
    );
    const data = await res.json() as { code: number; msg: string; data?: { items?: WikiNode[] } };
    console.log('[Lark Wiki] listWikiNodes raw:', data);
    if (data.code !== 0) throw new Error(`List wiki nodes failed: ${data.msg} (code ${data.code})`);
    return data.data?.items ?? [];
}

// ─── Create wiki node (docx) ──────────────────────────────────────────────────

export async function createWikiNode(
    token: string,
    spaceId: string,
    title: string,
    parentNodeToken?: string,
): Promise<{ nodeToken: string; objToken: string; url?: string }> {
    const body: Record<string, string> = {
        obj_type: 'docx',
        node_type: 'origin',
        title,
    };
    if (parentNodeToken) body.parent_node_token = parentNodeToken;

    const res = await fetch(`${LARK_BASE}/open-apis/wiki/v2/spaces/${spaceId}/nodes`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json() as {
        code: number;
        msg: string;
        data?: { node?: { node_token: string; obj_token: string; url?: string } };
    };
    console.log('[Lark Wiki] createWikiNode:', data);
    if (data.code !== 0 || !data.data?.node) {
        throw new Error(`Create wiki node failed: ${data.msg} (code ${data.code})`);
    }
    const node = data.data.node;
    return { nodeToken: node.node_token, objToken: node.obj_token, url: node.url };
}

// ─── Move existing doc into wiki ──────────────────────────────────────────────

export async function moveDocToWiki(
    token: string,
    spaceId: string,
    objToken: string,
    parentWikiToken?: string,
): Promise<{ wikiToken: string; url?: string }> {
    const body: Record<string, string> = {
        obj_type: 'docx',
        obj_token: objToken,
    };
    if (parentWikiToken) body.parent_wiki_token = parentWikiToken;

    console.log('[Lark Wiki] moveDocToWiki request:', {
        spaceId, body,
    });

    const res = await fetch(
        `${LARK_BASE}/open-apis/wiki/v2/spaces/${spaceId}/nodes/move_docs_to_wiki`,
        {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json; charset=utf-8',
            },
            body: JSON.stringify(body),
        }
    );
    const data = await res.json() as {
        code: number;
        msg: string;
        data?: { wiki_token?: string; url?: string; task_id?: string };
    };
    console.log('[Lark Wiki] moveDocToWiki response:', data);
    if (data.code !== 0) {
        throw new Error(`Move doc to wiki failed: ${data.msg} (code ${data.code})`);
    }
    return { wikiToken: data.data?.wiki_token ?? '', url: data.data?.url };
}

