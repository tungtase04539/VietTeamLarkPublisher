// Vite dev proxy: /lark-api → https://open.larksuite.com (avoids CORS)
const LARK_BASE = '/lark-api';
const LARK_APP_ID = 'cli_a90a9b039db99ed1';
const LARK_APP_SECRET = 'CEmFONDreMKKlXcf0UNAk76pFuEaYlz4';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export async function getLarkToken(): Promise<string> {
    const res = await fetch(`${LARK_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: LARK_APP_ID, app_secret: LARK_APP_SECRET }),
    });
    const data = await res.json() as { code: number; msg: string; tenant_access_token?: string };
    if (data.code !== 0 || !data.tenant_access_token) {
        throw new Error(`Lark auth failed: ${data.msg} (code ${data.code})`);
    }
    return data.tenant_access_token;
}

// ─── Markdown → Lark Blocks Parser ───────────────────────────────────────────
// Lark block_type constants (creatable via API)
// 2=text, 3=heading1…11=heading9, 12=bullet, 13=ordered, 14=code, 15=quote

// ── Lark pre-defined text_color codes ────────────────────────────
// 1=Red 2=Orange 3=Yellow 4=Green 5=Teal 6=Blue 7=Purple 8=DarkGray
function larkColorCode(hex: string | undefined): number | undefined {
    if (!hex) return undefined;
    const num = parseInt(hex.replace('#', ''), 16);
    const r = (num >> 16) & 0xff;
    const g = (num >> 8) & 0xff;
    const b = num & 0xff;
    const max = Math.max(r, g, b);
    if (max < 40) return undefined; // too dark / default
    // Green dominates
    if (g > r * 1.2 && g > b * 1.2) return 4;
    // Blue dominates
    if (b > r * 1.2 && b > g * 1.1) return 6;
    // Purple (high R + B, low G)
    if (r > 80 && b > 80 && g < r * 0.7) return 7;
    // Orange (high R, medium G)
    if (r > g * 1.2 && g > b * 1.4) return 2;
    // Red (high R, low G, low B)
    if (r > g * 1.5 && r > b * 1.5) return 1;
    // Teal
    if (g > r * 1.1 && b > r * 1.1) return 5;
    return 6; // default blue
}

type TextElement = {
    text_run: {
        content: string;
        text_element_style?: Record<string, boolean | string | number>;
    };
};

function parseInline(text: string, accentColor?: number | undefined): TextElement[] {
    // Remove raw HTML tags
    text = text.replace(/<[^>]+>/g, '');
    const elements: TextElement[] = [];
    // Regex for **bold**, *italic*, `code`, ~~strike~~
    const regex = /(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*]+)\*)|(_([^_]+)_)|(`([^`]+)`)|(~~([^~]+)~~)|([^*_`~]+)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
        if (!m[0] || m[0] === '') continue;
        if (m[1] || m[2]) { // **bold** or __bold__
            const style: Record<string, boolean | number> = { bold: true };
            if (accentColor) style.text_color = accentColor;
            elements.push({ text_run: { content: m[2] ?? m[4], text_element_style: style } });
        } else if (m[5] || m[7]) { // *italic* or _italic_
            elements.push({ text_run: { content: m[6] ?? m[8], text_element_style: { italic: true } } });
        } else if (m[9]) { // `code`
            elements.push({ text_run: { content: m[10], text_element_style: { inline_code: true } } });
        } else if (m[11]) { // ~~strike~~
            elements.push({ text_run: { content: m[12], text_element_style: { strikethrough: true } } });
        } else if (m[13]) { // plain text
            elements.push({ text_run: { content: m[13] } });
        }
    }
    if (elements.length === 0) elements.push({ text_run: { content: text } });
    return elements;
}

function makeBlock(blockType: number, key: string, elements: TextElement[], textColor?: number) {
    if (textColor) {
        elements = elements.map(el => ({
            text_run: {
                ...el.text_run,
                text_element_style: { ...el.text_run.text_element_style, text_color: textColor },
            },
        }));
    }
    return { block_type: blockType, [key]: { elements, style: {} } };
}

const CODE_LANG: Record<string, number> = {
    '': 1, 'text': 1, 'plain': 1,
    'abap': 2, 'ada': 3, 'apache': 1, 'apex': 1,
    'bash': 4, 'shell': 4, 'sh': 4, 'zsh': 4,
    'c': 6, 'cpp': 7, 'c++': 7, 'csharp': 8, 'cs': 8,
    'css': 10, 'coffeescript': 9, 'coffee': 9,
    'dart': 1, 'dockerfile': 12,
    'erlang': 1, 'erl': 1,
    'go': 17, 'groovy': 18,
    'html': 20, 'xml': 67,
    'java': 23, 'javascript': 22, 'js': 22,
    'json': 25,
    'kotlin': 26,
    'latex': 27, 'tex': 27,
    'lua': 30,
    'makefile': 1, 'markdown': 33, 'md': 33,
    'matlab': 34,
    'nginx': 1,
    'objc': 1, 'objective-c': 1,
    'perl': 42, 'php': 45,
    'powershell': 46, 'ps': 46,
    'python': 49, 'py': 49,
    'r': 50, 'ruby': 52, 'rb': 52, 'rust': 55,
    'scala': 56, 'sql': 60, 'swift': 62,
    'typescript': 63, 'ts': 63,
    'vim': 1,
    'yaml': 68, 'yml': 68,
};

export function markdownToLarkBlocks(markdown: string, accentHex?: string): unknown[] {
    const accentCode = larkColorCode(accentHex);
    const blocks: unknown[] = [];
    const lines = markdown.split('\n');
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // ── Fenced code block ─────────────────────────────────────
        if (line.match(/^```/)) {
            const lang = line.slice(3).trim().toLowerCase();
            const codeLines: string[] = [];
            i++;
            while (i < lines.length && !lines[i].match(/^```\s*$/)) {
                codeLines.push(lines[i]);
                i++;
            }
            const langCode = CODE_LANG[lang] ?? 1;
            blocks.push({
                block_type: 14,
                code: {
                    language: langCode,
                    elements: [{ text_run: { content: codeLines.join('\n') } }],
                    style: { wrap: true },
                },
            });
            i++;
            continue;
        }

        // ── Heading ───────────────────────────────────────────────
        const hMatch = line.match(/^(#{1,9})\s+(.+)$/);
        if (hMatch) {
            const level = Math.min(hMatch[1].length, 9);
            const btype = 2 + level; // heading1=3 ... heading9=11
            const key = `heading${level}`;
            // h1 and h2 get accent color; h3+ use default
            const headingColor = level <= 2 ? accentCode : undefined;
            blocks.push(makeBlock(btype, key, parseInline(hMatch[2], accentCode), headingColor));
            i++;
            continue;
        }

        // ── Blockquote ────────────────────────────────────────────
        if (line.match(/^>\s?/)) {
            const content = line.replace(/^>\s?/, '');
            blocks.push(makeBlock(15, 'quote', parseInline(content, accentCode)));
            i++;
            continue;
        }

        // ── Unordered list ────────────────────────────────────────
        const ulMatch = line.match(/^(\s*)[-*+]\s+(.+)$/);
        if (ulMatch) {
            blocks.push(makeBlock(12, 'bullet', parseInline(ulMatch[2], accentCode)));
            i++;
            continue;
        }

        // ── Ordered list ──────────────────────────────────────────
        const olMatch = line.match(/^(\s*)\d+[.)]\s+(.+)$/);
        if (olMatch) {
            blocks.push(makeBlock(13, 'ordered', parseInline(olMatch[2], accentCode)));
            i++;
            continue;
        }

        // ── Horizontal rule ───────────────────────────────────────
        if (line.match(/^(\*{3,}|-{3,}|_{3,})\s*$/)) {
            // Lark divider is block_type 22 (table) in some versions
            // Safe fallback: insert an empty paragraph
            blocks.push(makeBlock(2, 'text', [{ text_run: { content: '──────────────────' } }]));
            i++;
            continue;
        }

        // ── Image (base64 or URL) — show as placeholder ───────────
        if (line.match(/^!\[([^\]]*)\]\((.+)\)$/)) {
            const alt = line.match(/^!\[([^\]]*)\]/)![1] || 'image';
            const url = line.match(/\]\((.+)\)/)![1];
            // Skip base64 entirely, show URL images as text reference
            const isBase64 = url.startsWith('data:');
            if (!isBase64) {
                blocks.push(makeBlock(2, 'text', [{ text_run: { content: `[🖼️ ${alt}](${url})` } }]));
            }
            i++;
            continue;
        }

        // ── Table — collect all rows, tag for multi-step insertion ──
        if (line.startsWith('|')) {
            const tableRows: string[][] = [];
            while (i < lines.length && lines[i].startsWith('|')) {
                const row = lines[i];
                if (!row.match(/^\|[\s:|-]+\|$/)) {
                    const cells = row.split('|').slice(1, -1).map(c => c.trim());
                    tableRows.push(cells);
                }
                i++;
            }
            if (tableRows.length > 0) {
                const colSize = Math.max(...tableRows.map(r => r.length));
                // Tagged as table data — handled separately by insertBlocksIntoDoc
                blocks.push({ _tableRows: tableRows, _colSize: colSize } as unknown);
            }
            continue;
        }

        // ── Empty line ────────────────────────────────────────────
        if (line.trim() === '') {
            i++;
            continue;
        }

        // ── Regular paragraph ─────────────────────────────────────
        blocks.push(makeBlock(2, 'text', parseInline(line, accentCode)));
        i++;
    }

    return blocks;
}

// ─── Step 1: Create empty document ───────────────────────────────────────────

async function createDocument(
    token: string,
    title: string,
    folderToken?: string,
): Promise<string> {
    const body: Record<string, string> = { title };
    if (folderToken) body.folder_token = folderToken;

    const res = await fetch(`${LARK_BASE}/open-apis/docx/v1/documents`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json() as { code: number; msg: string; data?: { document?: { document_id: string } } };
    console.log('[Lark] createDocument:', data);
    if (data.code !== 0 || !data.data?.document) {
        throw new Error(`Failed to create Lark document: ${data.msg} (code ${data.code})`);
    }
    return data.data.document.document_id;
}

// ─── Step 2: Insert blocks into document ─────────────────────────────────────

async function insertBlocks(token: string, documentId: string, blocks: unknown[]): Promise<void> {
    if (blocks.length === 0) return;

    // Each request: max 50 blocks
    const CHUNK = 50;
    for (let i = 0; i < blocks.length; i += CHUNK) {
        const chunk = blocks.slice(i, i + CHUNK);
        const res = await fetch(
            `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json; charset=utf-8',
                },
                body: JSON.stringify({ children: chunk, index: i }),
            }
        );
        const data = await res.json() as { code: number; msg: string };
        console.log(`[Lark] insertBlocks [${i}..${i + chunk.length}]:`, data);
        if (data.code !== 0) {
            throw new Error(`Failed to insert blocks: ${data.msg} (code ${data.code})`);
        }
    }
}

async function getDocumentUrl(token: string, documentId: string): Promise<string> {
    try {
        const res = await fetch(`${LARK_BASE}/open-apis/docx/v1/documents/${documentId}`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json() as {
            code: number;
            data?: { document?: { url?: string } };
        };
        console.log('[Lark] getDocumentUrl:', data);
        const url = data.data?.document?.url;
        if (url) return url;
    } catch (e) {
        console.warn('[Lark] Could not fetch document URL:', e);
    }
    // Fallback: the document ID is usually accessible via this path
    // User's browser will redirect to their correct workspace URL
    return `https://open.larksuite.com/docx/${documentId}`;
}

// ─── Main Publish Function ────────────────────────────────────────────────────

export interface PublishConfig {
    title: string;
    markdown: string;
    folderToken?: string;
    onProgress?: (step: string, current?: number, total?: number) => void;
}

export async function publishToLark(config: PublishConfig): Promise<string> {
    const { title, markdown, folderToken, onProgress } = config;

    // Step 1: Auth
    onProgress?.('auth');
    const token = await getLarkToken();

    // Step 2: Parse markdown → Lark blocks (skip base64 images)
    onProgress?.('images', 0, 0);
    const blocks = markdownToLarkBlocks(markdown);
    console.log(`[Lark] Parsed ${blocks.length} blocks from markdown`);

    // Step 3: Create document
    onProgress?.('publishing');
    const documentId = await createDocument(token, title, folderToken);

    // Step 4: Insert blocks
    await insertBlocks(token, documentId, blocks);

    // Step 5: Get the correct workspace URL
    return await getDocumentUrl(token, documentId);
}
