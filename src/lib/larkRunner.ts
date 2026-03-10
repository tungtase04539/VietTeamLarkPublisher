/**
 * larkRunner.ts
 * Shared Lark publish logic used by both LarkPublishDialog (in-dialog mode)
 * and DashboardCard (background mode).
 */

import { getLarkToken, markdownToLarkBlocks, resolveImageBlocks, uploadImageToLark } from './larkPublish';
import { resolveSpaceId, moveDocToWiki } from './larkWiki';
import { getAllImages } from './imageStore';

export type PublishRunConfig = {
    title: string;
    wikiEnabled: boolean;
    wikiSpaceId: string;
    wikiNodeToken: string;
    accentHex?: string;
};

const LARK_BASE = '/lark-api';

type LarkBlockResponse = {
    code: number; msg: string;
    data?: {
        children?: {
            block_id: string;
            block_type: number;
            table?: { cells?: string[] };
        }[];
    };
};

async function safeJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!text) return { code: 0, msg: 'empty' } as T;
    return JSON.parse(text) as T;
}

export async function insertBlocksIntoDoc(token: string, documentId: string, blocks: unknown[]) {
    const CHUNK = 50;
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' };

    let indexOffset = 0;
    let i = 0;
    while (i < blocks.length) {
        const block = blocks[i] as Record<string, unknown>;

        // ── Table block ──────────────────────────────────────────
        if (block._tableRows) {
            const tableRows = block._tableRows as string[][];
            const colSize = block._colSize as number;
            const tableRes = await fetch(
                `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                {
                    method: 'POST', headers,
                    body: JSON.stringify({
                        children: [{ block_type: 31, table: { property: { row_size: tableRows.length, column_size: colSize } } }],
                        index: indexOffset,
                    }),
                }
            );
            const tableData = await safeJson<LarkBlockResponse>(tableRes);
            if (tableData.code !== 0) throw new Error(`Create table failed: ${tableData.msg} (code ${tableData.code})`);
            const tableBlockId = tableData.data?.children?.[0]?.block_id ?? '';
            let cellIds: string[] = tableData.data?.children?.[0]?.table?.cells ?? [];
            indexOffset++;

            if (cellIds.length === 0 && tableBlockId) {
                const cellsRes = await fetch(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${tableBlockId}/children`,
                    { headers }
                );
                const cellsData = await safeJson<{ code: number; data?: { children?: { block_id: string; block_type: number }[] } }>(cellsRes);
                cellIds = (cellsData.data?.children ?? []).filter(b => b.block_type === 32).map(b => b.block_id);
            }

            const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
            for (let r = 0; r < tableRows.length; r++) {
                for (let c = 0; c < colSize; c++) {
                    const cellText = tableRows[r]?.[c] ?? '';
                    const cellBlockId = cellIds[r * colSize + c];
                    if (!cellBlockId || !cellText) { await delay(80); continue; }
                    const doInsert = async () => fetch(
                        `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${cellBlockId}/children`,
                        {
                            method: 'POST', headers,
                            body: JSON.stringify({ children: [{ block_type: 2, text: { elements: [{ text_run: { content: cellText } }], style: {} } }], index: 0 }),
                        }
                    );
                    let txtRes = await doInsert();
                    if (txtRes.status === 429) { await delay(1500); txtRes = await doInsert(); }
                    const txtData = await safeJson<{ code: number; msg: string }>(txtRes);
                    if (txtData.code !== 0) throw new Error(`Insert cell text failed: ${txtData.msg} (code ${txtData.code})`);
                    await delay(150);
                }
            }
            i++; continue;
        }

        // ── Pre-uploaded Lark image token ──────────────────────────
        if (block._larkToken !== undefined) {
            const larkFileToken = block._larkToken as string;
            const imgBlock = { block_type: 27, image: { token: larkFileToken } };
            const directRes = await fetch(
                `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                { method: 'POST', headers, body: JSON.stringify({ children: [imgBlock], index: indexOffset }) }
            );
            const directData = await safeJson<{ code: number; msg: string; data?: unknown }>(directRes);
            if (directData.code === 0) {
                indexOffset++;
            } else {
                const textFallback = { block_type: 2, text: { elements: [{ text_run: { content: `[🖼️ img:${larkFileToken.slice(0, 8)}…]` } }], style: {} } };
                const fbRes = await fetch(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                    { method: 'POST', headers, body: JSON.stringify({ children: [textFallback], index: indexOffset }) }
                );
                const fbData = await safeJson<{ code: number; msg: string }>(fbRes);
                if (fbData.code === 0) indexOffset++;
            }
            i++; continue;
        }

        // ── Image placeholder (_imageSrc) ──────────────────────────
        if (block._imageSrc !== undefined) {
            const src = block._imageSrc as string;
            const alt = (block._imageAlt as string) || 'image';
            if (!src.startsWith('data:')) {
                const textBlock = { block_type: 2, text: { elements: [{ text_run: { content: `[🖼️ ${alt}](${src})` } }], style: {} } };
                const res = await fetch(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                    { method: 'POST', headers, body: JSON.stringify({ children: [textBlock], index: indexOffset }) }
                );
                const data = await safeJson<{ code: number; msg: string }>(res);
                if (data.code !== 0) throw new Error(`Insert image link failed: ${data.msg} (code ${data.code})`);
                indexOffset++; i++; continue;
            }

            const createRes = await fetch(
                `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                { method: 'POST', headers, body: JSON.stringify({ children: [{ block_type: 27, image: {} }], index: indexOffset }) }
            );
            const createData = await safeJson<{ code: number; msg: string; data?: { children?: { block_id: string }[] } }>(createRes);
            if (createData.code !== 0) throw new Error(`Create image block failed: ${createData.msg} (code ${createData.code})`);
            const imgBlockId = createData.data?.children?.[0]?.block_id;
            if (!imgBlockId) throw new Error('Create image block returned no block_id');
            indexOffset++;

            await new Promise(r => setTimeout(r, 300));
            const fileToken = await uploadImageToLark(token, imgBlockId, src);
            if (fileToken) {
                const patchRes = await fetch(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${imgBlockId}?document_revision_id=-1`,
                    { method: 'PATCH', headers, body: JSON.stringify({ replace_image: { token: fileToken } }) }
                );
                const patchData = await safeJson<{ code: number; msg: string; data?: unknown }>(patchRes);
                if (patchData.code !== 0) console.warn('[Lark] PATCH image token failed:', patchData.code, patchData.msg);
            }
            i++; continue;
        }

        // ── Image block (type 27) ──────────────────────────────────
        const blockRec = blocks[i] as Record<string, unknown>;
        if (blockRec.block_type === 27) {
            const res = await fetch(
                `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                { method: 'POST', headers, body: JSON.stringify({ children: [blockRec], index: indexOffset }) }
            );
            const data = await safeJson<{ code: number; msg: string }>(res);
            if (data.code !== 0) throw new Error(`Insert image block failed: ${data.msg} (code ${data.code})`);
            indexOffset++; i++; continue;
        }

        // ── Regular blocks: batch ──────────────────────────────────
        const batchEnd = Math.min(i + CHUNK, blocks.length);
        const regularChunk: unknown[] = [];
        for (let j = i; j < batchEnd; j++) {
            const b = blocks[j] as Record<string, unknown>;
            if (b._tableRows || b._larkToken !== undefined || b._imageSrc !== undefined || b.block_type === 27) break;
            regularChunk.push(b);
        }
        if (regularChunk.length === 0) { i++; continue; }

        const res = await fetch(
            `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
            { method: 'POST', headers, body: JSON.stringify({ children: regularChunk, index: indexOffset }) }
        );
        const data = await safeJson<{ code: number; msg: string }>(res);
        if (data.code !== 0) throw new Error(`Insert blocks failed: ${data.msg} (code ${data.code})`);
        indexOffset += regularChunk.length;
        i += regularChunk.length;
    }
}

/**
 * Run the full Lark publish flow, returns the published document URL.
 */
export async function runLarkPublish(
    config: PublishRunConfig,
    markdownInput: string,
): Promise<string> {
    // ── Auto-extract title from first H1 heading ────────────────────────────
    // If the markdown starts with "# Title", use that as the doc title and
    // strip the line from the body so it doesn't repeat inside the document.
    let title = config.title;
    let body = markdownInput;
    const h1Match = markdownInput.match(/^#\s+(.+)$/m);
    if (h1Match) {
        title = h1Match[1].trim().slice(0, 200);
        // Remove ONLY the first H1 line (and any immediately following blank lines)
        body = markdownInput.replace(/^#\s+.+(\r?\n)+/, '').trimStart();
    }

    const token = await getLarkToken();
    const blocks = markdownToLarkBlocks(body, config.accentHex);
    const larkImageStore = getAllImages();
    let docUrl = '';

    if (config.wikiEnabled && config.wikiSpaceId) {
        const { spaceId: resolvedSpaceId, nodeToken: resolvedNodeToken, domain: wikiDomain } =
            await resolveSpaceId(token, config.wikiSpaceId);
        const parentWikiToken = config.wikiNodeToken || resolvedNodeToken;

        const createRes = await fetch(`${LARK_BASE}/open-apis/docx/v1/documents`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
            body: JSON.stringify({ title }),
        });
        const createData = await createRes.json() as { code: number; msg: string; data?: { document?: { document_id: string } } };
        if (createData.code !== 0 || !createData.data?.document) {
            throw new Error(`Create doc failed: ${createData.msg} (code ${createData.code})`);
        }
        const docId = createData.data.document.document_id;

        const resolvedBlocks = await resolveImageBlocks(token, docId, blocks, larkImageStore);
        await insertBlocksIntoDoc(token, docId, resolvedBlocks);

        const { url: wikiUrl, wikiToken } = await moveDocToWiki(token, resolvedSpaceId, docId, parentWikiToken);

        if (wikiUrl) {
            docUrl = wikiUrl;
        } else {
            const r = await fetch(`${LARK_BASE}/open-apis/docx/v1/documents/${docId}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const d = await r.json() as { data?: { document?: { url?: string } } };
            const base = wikiDomain ?? 'https://open.larksuite.com';
            docUrl = d.data?.document?.url ?? (wikiToken ? `${base}/wiki/${wikiToken}` : `${base}/docx/${docId}`);
        }
    } else {
        const { publishToLark } = await import('./larkPublish');
        docUrl = await publishToLark({ title, markdown: body, imageStore: larkImageStore });
    }

    return docUrl;
}
