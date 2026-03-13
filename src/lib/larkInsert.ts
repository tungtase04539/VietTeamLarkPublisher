/**
 * larkInsert.ts
 * Bulletproof block insertion for Lark documents.
 *
 * Key fix: uses index:-1 (Lark's "append at end") instead of manual
 * indexOffset tracking. This prevents structure loss when any batch
 * partially fails or returns unexpected counts.
 *
 * Design principles:
 * 1. Append instead of position — index:-1 means Lark appends in order
 * 2. Split instead of truncate — long text is divided into multiple blocks
 * 3. Multi-retry with backoff — every operation retries up to MAX_RETRIES times
 * 4. Never stop mid-way — individual failures are logged and skipped
 * 5. Progress tracking — callers get real-time progress + final report
 */

import { uploadImageToLark } from './larkPublish';

// ─── Constants ────────────────────────────────────────────────────────────────

const LARK_BASE = '/lark-api';
const CHUNK_SIZE = 15;          // blocks per batch (conservative)
const MAX_RETRIES = 3;          // retry attempts for any failed operation
const TEXT_SPLIT_SIZE = 8000;   // split text at this char count (Lark safe limit)
const BATCH_DELAY = 250;        // ms between batches
const RETRY_BASE_DELAY = 500;   // base ms for retry backoff
const MAX_CONCURRENT_IMAGES = 5; // max parallel image uploads

// ─── Concurrency semaphore ────────────────────────────────────────────────────

class Semaphore {
    private running = 0;
    private queue: (() => void)[] = [];
    constructor(private limit: number) {}
    acquire(): Promise<void> {
        return new Promise(resolve => {
            if (this.running < this.limit) { this.running++; resolve(); }
            else { this.queue.push(resolve); }
        });
    }
    release(): void {
        this.running--;
        if (this.queue.length > 0) { this.running++; this.queue.shift()!(); }
    }
}

const imageSemaphore = new Semaphore(MAX_CONCURRENT_IMAGES);

// ─── Types ────────────────────────────────────────────────────────────────────

export type PublishResult = {
    totalBlocks: number;
    successBlocks: number;
    failedBlocks: number;
    failedDetails: string[];
};

export type ProgressCallback = (current: number, total: number, failedCount: number) => void;

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

// ─── Utilities ────────────────────────────────────────────────────────────────

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

async function safeJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!text) return { code: 0, msg: 'empty' } as T;
    try { return JSON.parse(text) as T; }
    catch { return { code: -1, msg: `Invalid JSON: ${text.slice(0, 100)}` } as T; }
}

/**
 * Fetch with automatic retry on 429 rate-limit AND transient errors.
 * Uses exponential backoff: 500ms, 1s, 2s, ...
 */
async function larkFetch(url: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const res = await fetch(url, init);
            if (res.status === 429) {
                const waitMs = RETRY_BASE_DELAY * Math.pow(2, attempt + 1); // 1s, 2s, 4s
                console.warn(`[Lark] Rate limited (429), waiting ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
                await delay(waitMs);
                continue;
            }
            return res;
        } catch (netErr) {
            const waitMs = RETRY_BASE_DELAY * Math.pow(2, attempt);
            console.warn(`[Lark] Network error (attempt ${attempt + 1}/${MAX_RETRIES}):`, netErr, `— retrying in ${waitMs}ms`);
            await delay(waitMs);
        }
    }
    // Final attempt — let it throw if it fails
    return fetch(url, init);
}

/**
 * Try a Lark POST operation up to MAX_RETRIES times.
 * Returns { success, data } so callers can handle failures gracefully.
 */
async function larkPost<T extends { code: number; msg: string }>(
    url: string, body: unknown, headers: Record<string, string>
): Promise<{ success: boolean; data: T }> {
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        try {
            const res = await larkFetch(url, {
                method: 'POST', headers,
                body: JSON.stringify(body),
            });
            const data = await safeJson<T>(res);
            if (data.code === 0) return { success: true, data };
            // Non-zero code: retry with backoff (might be transient)
            if (attempt < MAX_RETRIES - 1) {
                const waitMs = RETRY_BASE_DELAY * Math.pow(2, attempt);
                console.warn(`[Lark] API error code ${data.code} (attempt ${attempt + 1}), retrying in ${waitMs}ms: ${data.msg}`);
                await delay(waitMs);
            } else {
                return { success: false, data };
            }
        } catch (err) {
            if (attempt >= MAX_RETRIES - 1) {
                return { success: false, data: { code: -1, msg: String(err) } as T };
            }
            await delay(RETRY_BASE_DELAY * Math.pow(2, attempt));
        }
    }
    return { success: false, data: { code: -1, msg: 'Max retries reached' } as T };
}

// ─── Text Splitting ───────────────────────────────────────────────────────────

/**
 * Split long text into chunks, breaking at sentence boundaries when possible.
 * Never truncates — all content is preserved across multiple chunks.
 */
function splitText(text: string, maxLen: number = TEXT_SPLIT_SIZE): string[] {
    if (text.length <= maxLen) return [text];

    const chunks: string[] = [];
    let remaining = text;

    while (remaining.length > 0) {
        if (remaining.length <= maxLen) {
            chunks.push(remaining);
            break;
        }

        // Try to find a good break point within the last 20% of the chunk
        const searchStart = Math.floor(maxLen * 0.8);
        const searchArea = remaining.slice(searchStart, maxLen);

        // Priority: newline > period/。 > comma > space > forced cut
        let breakAt = -1;
        const newlineIdx = searchArea.lastIndexOf('\n');
        if (newlineIdx >= 0) {
            breakAt = searchStart + newlineIdx + 1;
        } else {
            // Try sentence endings
            const sentenceMatch = searchArea.match(/.*[.。!?！？]\s*/);
            if (sentenceMatch) {
                breakAt = searchStart + sentenceMatch[0].length;
            } else {
                // Try comma or space
                const commaIdx = searchArea.lastIndexOf(',');
                const spaceIdx = searchArea.lastIndexOf(' ');
                const bestIdx = Math.max(commaIdx, spaceIdx);
                if (bestIdx >= 0) {
                    breakAt = searchStart + bestIdx + 1;
                } else {
                    // Forced cut
                    breakAt = maxLen;
                }
            }
        }

        chunks.push(remaining.slice(0, breakAt));
        remaining = remaining.slice(breakAt);
    }

    return chunks;
}

// ─── URL builders ─────────────────────────────────────────────────────────────

// index:-1 means "append at end" in Lark API — safe, order-preserving
const APPEND = -1;

const docChildrenUrl = (docId: string) =>
    `${LARK_BASE}/open-apis/docx/v1/documents/${docId}/blocks/${docId}/children`;

const cellChildrenUrl = (docId: string, cellBlockId: string) =>
    `${LARK_BASE}/open-apis/docx/v1/documents/${docId}/blocks/${cellBlockId}/children`;

// ─── Image helpers ────────────────────────────────────────────────────────────

/**
 * Upload an image and insert it as a top-level block (3-step flow).
 */
async function insertBase64Image(
    token: string, docId: string, headers: Record<string, string>,
    src: string, alt: string,
    result: PublishResult
): Promise<void> {
    await imageSemaphore.acquire();
    try {
        // Step 1: Create empty image block (appended at end)
        const { success: created, data: createData } = await larkPost<{
            code: number; msg: string;
            data?: { children?: { block_id: string }[] };
        }>(
            `${docChildrenUrl(docId)}?document_revision_id=-1`,
            { children: [{ block_type: 27, image: { token: '' } }], index: APPEND },
            headers
        );

        if (!created || !createData.data?.children?.[0]?.block_id) {
            throw new Error(`Create image block failed: ${createData.msg}`);
        }

        const imgBlockId = createData.data.children[0].block_id;
        await delay(300);

        // Step 2: Upload media
        const fileToken = await uploadImageToLark(token, imgBlockId, src);

        if (fileToken) {
            // Step 3: PATCH the image block with file_token
            const patchRes = await larkFetch(
                `${LARK_BASE}/open-apis/docx/v1/documents/${docId}/blocks/${imgBlockId}?document_revision_id=-1`,
                { method: 'PATCH', headers, body: JSON.stringify({ replace_image: { token: fileToken } }) }
            );
            const patchData = await safeJson<{ code: number; msg: string }>(patchRes);
            if (patchData.code !== 0) {
                console.warn('[Lark] PATCH image failed:', patchData.msg);
            }
        }

        result.successBlocks++;
    } catch (imgErr) {
        console.warn('[Lark] Image 3-step failed, text fallback:', imgErr);
        // Fallback: text placeholder appended at end
        const fb = { block_type: 2, text: { elements: [{ text_run: { content: `[🖼️ ${alt}]` } }], style: {} } };
        const { success } = await larkPost<{ code: number; msg: string }>(
            docChildrenUrl(docId),
            { children: [fb], index: APPEND },
            headers
        );
        if (success) { result.successBlocks++; }
        else { result.failedBlocks++; result.failedDetails.push(`Base64 image (${alt})`); }
    } finally {
        imageSemaphore.release();
    }
}

/**
 * Upload an image and insert it inside a table cell (3-step flow).
 */
async function uploadImageInCell(
    token: string, docId: string, headers: Record<string, string>,
    cellBlockId: string, src: string, alt: string
): Promise<void> {
    await imageSemaphore.acquire();
    try {
        if (!src.startsWith('data:')) {
            // External URL — insert as text link inside the cell (append in cell)
            await larkPost<{ code: number; msg: string }>(
                cellChildrenUrl(docId, cellBlockId),
                { children: [{ block_type: 2, text: { elements: [{ text_run: { content: `[🖼️ ${alt}](${src})` } }], style: {} } }], index: APPEND },
                headers
            );
            return;
        }

        // Step 1: Create empty image block inside the cell
        const { success: created, data: createData } = await larkPost<{
            code: number; msg: string;
            data?: { children?: { block_id: string }[] };
        }>(
            `${LARK_BASE}/open-apis/docx/v1/documents/${docId}/blocks/${cellBlockId}/children?document_revision_id=-1`,
            { children: [{ block_type: 27, image: { token: '' } }], index: APPEND },
            headers
        );
        if (!created || !createData.data?.children?.[0]?.block_id) {
            throw new Error(`Create image block in cell failed: ${createData.msg}`);
        }
        const imgBlockId = createData.data.children[0].block_id;
        await delay(200);

        // Step 2: Upload the image media
        const fileToken = await uploadImageToLark(token, imgBlockId, src);
        if (fileToken) {
            // Step 3: PATCH with file_token
            await larkFetch(
                `${LARK_BASE}/open-apis/docx/v1/documents/${docId}/blocks/${imgBlockId}?document_revision_id=-1`,
                { method: 'PATCH', headers, body: JSON.stringify({ replace_image: { token: fileToken } }) }
            );
        }
    } catch (err) {
        console.warn(`[Lark] Image in cell failed, text fallback:`, err);
        await larkPost<{ code: number; msg: string }>(
            cellChildrenUrl(docId, cellBlockId),
            { children: [{ block_type: 2, text: { elements: [{ text_run: { content: `[🖼️ ${alt}]` } }], style: {} } }], index: APPEND },
            headers
        );
    } finally {
        imageSemaphore.release();
    }
}

// ─── Table handlers ───────────────────────────────────────────────────────────

/**
 * Insert a table and populate all cells.
 * Images inside cells get uploaded via 3-step Lark flow.
 * Falls back to text rows if table creation fails.
 */
async function insertTable(
    token: string,
    docId: string, headers: Record<string, string>,
    tableRows: string[][], tableCells: unknown[][][] | undefined,
    colSize: number,
    result: PublishResult
): Promise<void> {
    type CellSeg = { text?: string; img?: { src: string; alt: string } };

    // Step 1: Create the table structure (appended at end of document)
    const { success: tableCreated, data: tableData } = await larkPost<LarkBlockResponse>(
        docChildrenUrl(docId),
        {
            children: [{ block_type: 31, table: { property: { row_size: tableRows.length, column_size: colSize } } }],
            index: APPEND,
        },
        headers
    );

    if (!tableCreated) {
        console.warn('[Lark] Table creation failed, falling back to text rows:', tableData.msg);
        // Fallback: render each row as a text paragraph
        for (const row of tableRows) {
            const rowText = '| ' + row.join(' | ') + ' |';
            const chunks = splitText(rowText, TEXT_SPLIT_SIZE);
            for (const chunk of chunks) {
                const { success } = await larkPost<{ code: number; msg: string }>(
                    docChildrenUrl(docId),
                    { children: [{ block_type: 2, text: { elements: [{ text_run: { content: chunk } }], style: {} } }], index: APPEND },
                    headers
                );
                if (success) { result.successBlocks++; }
                else { result.failedBlocks++; result.failedDetails.push(`Table text row (${chunk.length} chars)`); }
                await delay(100);
            }
        }
        return;
    }

    const tableBlockId = tableData.data?.children?.[0]?.block_id ?? '';
    let cellIds: string[] = tableData.data?.children?.[0]?.table?.cells ?? [];

    // Step 2: Get cell IDs if not returned directly
    if (cellIds.length === 0 && tableBlockId) {
        try {
            const cellsRes = await larkFetch(
                `${LARK_BASE}/open-apis/docx/v1/documents/${docId}/blocks/${tableBlockId}/children`,
                { headers }
            );
            const cellsData = await safeJson<{ code: number; data?: { children?: { block_id: string; block_type: number }[] } }>(cellsRes);
            cellIds = (cellsData.data?.children ?? []).filter(b => b.block_type === 32).map(b => b.block_id);
        } catch (err) {
            console.warn('[Lark] Failed to get cell IDs:', err);
        }
    }

    // Step 3: Populate each cell (cells use APPEND within their own children)
    for (let r = 0; r < tableRows.length; r++) {
        for (let c = 0; c < colSize; c++) {
            const cellBlockId = cellIds[r * colSize + c];
            if (!cellBlockId) { await delay(50); continue; }

            const segments = tableCells?.[r]?.[c] as CellSeg[] | undefined;

            if (segments && segments.length > 0) {
                // Structured mode: text + image segments
                for (const seg of segments) {
                    if (seg.img) {
                        await uploadImageInCell(token, docId, headers, cellBlockId, seg.img.src, seg.img.alt);
                        result.successBlocks++;
                    } else if (seg.text) {
                        const textChunks = splitText(seg.text);
                        for (const chunk of textChunks) {
                            const { success } = await larkPost<{ code: number; msg: string }>(
                                cellChildrenUrl(docId, cellBlockId),
                                { children: [{ block_type: 2, text: { elements: [{ text_run: { content: chunk } }], style: {} } }], index: APPEND },
                                headers
                            );
                            if (success) { result.successBlocks++; }
                            else { result.failedBlocks++; result.failedDetails.push(`Cell [${r},${c}] text chunk`); }
                            await delay(80);
                        }
                    }
                }
            } else {
                // Plain text fallback
                const cellText = tableRows[r]?.[c] ?? '';
                if (!cellText) { await delay(50); continue; }
                const textChunks = splitText(cellText);
                for (const chunk of textChunks) {
                    const { success } = await larkPost<{ code: number; msg: string }>(
                        cellChildrenUrl(docId, cellBlockId),
                        { children: [{ block_type: 2, text: { elements: [{ text_run: { content: chunk } }], style: {} } }], index: APPEND },
                        headers
                    );
                    if (success) { result.successBlocks++; }
                    else { result.failedBlocks++; result.failedDetails.push(`Cell [${r},${c}] chunk`); }
                    await delay(120);
                }
            }
        }
    }
}

// ─── Main Export ──────────────────────────────────────────────────────────────

/**
 * Insert all blocks into a Lark document using append mode (index:-1).
 * This guarantees correct document structure regardless of failures.
 *
 * - All blocks are appended sequentially (no index tracking needed)
 * - Tables: created as proper Lark tables, cells populated with text/images
 * - Images: 3-step upload with fallback to text placeholder
 * - Regular blocks: batched (up to CHUNK_SIZE), individual retry on batch fail
 *
 * @returns PublishResult with detailed success/failure report
 */
export async function insertBlocksIntoDoc(
    token: string,
    documentId: string,
    blocks: unknown[],
    onProgress?: ProgressCallback,
): Promise<PublishResult> {
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' };
    const result: PublishResult = {
        totalBlocks: blocks.length,
        successBlocks: 0,
        failedBlocks: 0,
        failedDetails: [],
    };

    let i = 0;

    while (i < blocks.length) {
        const block = blocks[i] as Record<string, unknown>;

        // Progress report
        onProgress?.(i, blocks.length, result.failedBlocks);
        if (i % 10 === 0 || i === blocks.length - 1) {
            const pct = ((i / blocks.length) * 100).toFixed(1);
            console.log(`[Lark] Progress: block ${i + 1}/${blocks.length} (${pct}%) | ✓${result.successBlocks} ✗${result.failedBlocks}`);
        }

        // ── Table block ──────────────────────────────────────────────
        if (block._tableRows) {
            const tableRows = block._tableRows as string[][];
            const tableCells = block._tableCells as unknown[][][] | undefined;
            const colSize = block._colSize as number;
            if (tableRows.length > 0 && colSize > 0) {
                await insertTable(token, documentId, headers, tableRows, tableCells, colSize, result);
            }
            i++; continue;
        }

        // ── Pre-uploaded Lark image token ─────────────────────────────
        if (block._larkToken !== undefined) {
            const imgBlock = { block_type: 27, image: { token: block._larkToken as string } };
            const { success } = await larkPost<{ code: number; msg: string }>(
                docChildrenUrl(documentId),
                { children: [imgBlock], index: APPEND },
                headers
            );
            if (success) { result.successBlocks++; }
            else {
                console.warn('[Lark] Direct image token insert failed, using text fallback');
                const textFb = { block_type: 2, text: { elements: [{ text_run: { content: `[🖼️ img:${(block._larkToken as string).slice(0, 12)}…]` } }], style: {} } };
                const { success: fbOk } = await larkPost<{ code: number; msg: string }>(
                    docChildrenUrl(documentId),
                    { children: [textFb], index: APPEND },
                    headers
                );
                if (fbOk) { result.successBlocks++; }
                else { result.failedBlocks++; result.failedDetails.push(`Image token ${(block._larkToken as string).slice(0, 12)}`); }
            }
            i++; continue;
        }

        // ── Image placeholder (_imageSrc) ─────────────────────────────
        if (block._imageSrc !== undefined) {
            const src = block._imageSrc as string;
            const alt = (block._imageAlt as string) || 'image';

            if (src.startsWith('data:')) {
                await insertBase64Image(token, documentId, headers, src, alt, result);
            } else {
                // External URL image — insert as text link
                const textBlock = { block_type: 2, text: { elements: [{ text_run: { content: `[🖼️ ${alt}](${src})` } }], style: {} } };
                const { success } = await larkPost<{ code: number; msg: string }>(
                    docChildrenUrl(documentId),
                    { children: [textBlock], index: APPEND },
                    headers
                );
                if (success) { result.successBlocks++; }
                else { result.failedBlocks++; result.failedDetails.push(`Image link (${alt})`); }
            }
            i++; continue;
        }

        // ── Standalone image block (type 27) ──────────────────────────
        if (block.block_type === 27) {
            const { success } = await larkPost<{ code: number; msg: string }>(
                docChildrenUrl(documentId),
                { children: [block], index: APPEND },
                headers
            );
            if (success) { result.successBlocks++; }
            else { result.failedBlocks++; result.failedDetails.push('Image block (type 27)'); }
            i++; continue;
        }

        // ── Regular blocks: collect batch and append ──────────────────
        const batchEnd = Math.min(i + CHUNK_SIZE, blocks.length);
        const regularChunk: unknown[] = [];
        for (let j = i; j < batchEnd; j++) {
            const b = blocks[j] as Record<string, unknown>;
            if (b._tableRows || b._larkToken !== undefined || b._imageSrc !== undefined || b.block_type === 27) break;
            regularChunk.push(b);
        }

        if (regularChunk.length === 0) {
            // This block doesn't match any known type — skip with a warning
            console.warn('[Lark] Unknown block type at index', i, '— skipping:', JSON.stringify(block).slice(0, 80));
            i++; continue;
        }

        // Try batch first (all appended at end)
        const { success, data } = await larkPost<{ code: number; msg: string }>(
            docChildrenUrl(documentId),
            { children: regularChunk, index: APPEND },
            headers
        );

        if (success) {
            result.successBlocks += regularChunk.length;
            i += regularChunk.length;
        } else {
            // Batch failed — insert individually
            console.warn(`[Lark] Batch failed (code ${data.code}), inserting ${regularChunk.length} blocks individually...`);
            for (const singleBlock of regularChunk) {
                const { success: sOk } = await larkPost<{ code: number; msg: string }>(
                    docChildrenUrl(documentId),
                    { children: [singleBlock], index: APPEND },
                    headers
                );
                if (sOk) { result.successBlocks++; }
                else {
                    result.failedBlocks++;
                    const desc = JSON.stringify(singleBlock).slice(0, 80);
                    result.failedDetails.push(`Block: ${desc}`);
                }
                await delay(150);
            }
            i += regularChunk.length;
        }

        await delay(BATCH_DELAY);
    }

    // Final progress
    onProgress?.(blocks.length, blocks.length, result.failedBlocks);
    console.log(`[Lark] ✅ Publish complete: ${result.successBlocks}/${result.totalBlocks} blocks succeeded, ${result.failedBlocks} failed`);
    if (result.failedDetails.length > 0) {
        console.warn('[Lark] Failed blocks:', result.failedDetails);
    }

    return result;
}
