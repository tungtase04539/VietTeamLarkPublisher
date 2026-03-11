import { useState, useEffect, useRef } from 'react';
import { X, Upload, CheckCircle2, Loader2, ExternalLink, AlertTriangle, Globe, Bookmark, Plus, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getLarkToken, markdownToLarkBlocks, resolveImageBlocks } from '../lib/larkPublish';
import { resolveSpaceId, moveDocToWiki } from '../lib/larkWiki';
import { getAllImages } from '../lib/imageStore';
import { THEMES } from '../lib/themes';
import { appendLog } from '../lib/cardLog';

const LARK_BASE = '/lark-api';
const STORAGE_KEY = 'lark_saved_wikis';
const LARK_APP_ID = 'cli_a90a9b039db99ed1';
const LARK_APP_SECRET = 'CEmFONDreMKKlXcf0UNAk76pFuEaYlz4';

async function quickGetToken(): Promise<string> {
    const res = await fetch(`${LARK_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ app_id: LARK_APP_ID, app_secret: LARK_APP_SECRET }),
    });
    const d = await res.json() as { tenant_access_token?: string };
    return d.tenant_access_token ?? '';
}

async function fetchWikiName(url: string): Promise<string | null> {
    try {
        // Extract token from URL
        const u = new URL(url);
        const parts = u.pathname.split('/').filter(Boolean);
        const rawToken = parts[parts.length - 1];
        if (!rawToken) return null;
        const token = await quickGetToken();
        if (!token) return null;
        const res = await fetch(
            `${LARK_BASE}/open-apis/wiki/v2/spaces/get_node?token=${encodeURIComponent(rawToken)}`,
            { headers: { Authorization: `Bearer ${token}` } },
        );
        const data = await res.json() as { data?: { node?: { title?: string; space_info?: { name?: string } } } };
        return data.data?.node?.title ?? data.data?.node?.space_info?.name ?? null;
    } catch { return null; }
}

interface SavedWiki { name: string; url: string }

function loadSavedWikis(): SavedWiki[] {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]'); } catch { return []; }
}
function saveSavedWikis(list: SavedWiki[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

function extractTitle(markdown: string): string {
    const h1 = markdown.match(/^#\s+(.+)$/m);
    return h1 ? h1[1].trim().slice(0, 60) : 'Untitled Document';
}

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

async function insertBlocksIntoDoc(token: string, documentId: string, blocks: unknown[]) {
    const CHUNK = 20; // Smaller chunks to avoid Lark API limits
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' };
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    /** Fetch with automatic retry on 429 rate-limit */
    async function fetchWithRetry(url: string, init: RequestInit, maxRetries = 3): Promise<Response> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            const res = await fetch(url, init);
            if (res.status === 429) {
                const waitMs = Math.min(1000 * Math.pow(2, attempt), 5000);
                console.warn(`[Lark] Rate limited (429), waiting ${waitMs}ms before retry ${attempt + 1}/${maxRetries}...`);
                await delay(waitMs);
                continue;
            }
            return res;
        }
        return fetch(url, init);
    }

    // Process blocks sequentially — tables need multi-step insertion
    let indexOffset = 0;
    let i = 0;
    while (i < blocks.length) {
        const block = blocks[i] as Record<string, unknown>;

        // ── Table block: multi-step ──────────────────────────────
        if (block._tableRows) {
            const tableRows = block._tableRows as string[][];
            const colSize = block._colSize as number;

            // Validate: Lark requires row_size >= 1 and column_size >= 1
            if (tableRows.length === 0 || colSize === 0) {
                i++;
                continue;
            }

            try {
                // Step A: create table block — minimal params only (Lark auto-creates cells)
                const tableRes = await fetchWithRetry(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                    {
                        method: 'POST', headers,
                        body: JSON.stringify({
                            children: [{
                                block_type: 31,
                                table: {
                                    property: {
                                        row_size: tableRows.length,
                                        column_size: colSize,
                                    },
                                },
                            }],
                            index: indexOffset,
                        }),
                    }
                );
                const tableData = await safeJson<LarkBlockResponse>(tableRes);
                if (tableData.code !== 0) throw new Error(`Create table failed: ${tableData.msg} (code ${tableData.code})`);
                const tableBlockId = tableData.data?.children?.[0]?.block_id ?? '';
                let cellIds: string[] = tableData.data?.children?.[0]?.table?.cells ?? [];
                indexOffset++;

                // Fallback: GET table children if cells array is empty
                if (cellIds.length === 0 && tableBlockId) {
                    const cellsRes = await fetchWithRetry(
                        `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${tableBlockId}/children`,
                        { headers }
                    );
                    const cellsData = await safeJson<{ code: number; data?: { children?: { block_id: string; block_type: number }[] } }>(cellsRes);
                    console.log('[Lark Table] fallback GET children:', cellsData);
                    cellIds = (cellsData.data?.children ?? [])
                        .filter(b => b.block_type === 32)
                        .map(b => b.block_id);
                }
                console.log('[Lark Table] cell IDs:', cellIds);

                // Step C: insert text into each cell with retry and truncation
                const CELL_MAX = 10000;
                for (let r = 0; r < tableRows.length; r++) {
                    for (let c = 0; c < colSize; c++) {
                        let cellText = tableRows[r]?.[c] ?? '';
                        const cellBlockId = cellIds[r * colSize + c];
                        if (!cellBlockId || !cellText) { await delay(80); continue; }
                        // Truncate oversized cell text
                        if (cellText.length > CELL_MAX) {
                            cellText = cellText.slice(0, CELL_MAX) + '…(truncated)';
                        }
                        try {
                            const doInsert = async () => fetchWithRetry(
                                `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${cellBlockId}/children`,
                                {
                                    method: 'POST', headers,
                                    body: JSON.stringify({
                                        children: [{ block_type: 2, text: { elements: [{ text_run: { content: cellText } }], style: {} } }],
                                        index: 0,
                                    }),
                                }
                            );
                            const txtRes = await doInsert();
                            const txtData = await safeJson<{ code: number; msg: string }>(txtRes);
                            if (txtData.code !== 0) {
                                console.warn(`[Lark] Cell [${r},${c}] text insert failed (code ${txtData.code}), skipping`);
                            }
                        } catch (cellErr) {
                            console.warn(`[Lark] Cell [${r},${c}] error, skipping:`, cellErr);
                        }
                        await delay(150);
                    }
                }
            } catch (tableErr) {
                // Fallback: render table as plain text paragraphs
                console.warn('[Lark] Table insertion failed, falling back to text:', tableErr);
                const ROW_MAX = 5000;
                for (const row of tableRows) {
                    let rowText = '| ' + row.join(' | ') + ' |';
                    if (rowText.length > ROW_MAX) rowText = rowText.slice(0, ROW_MAX) + '…|';
                    try {
                        const fbRes = await fetchWithRetry(
                            `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                            {
                                method: 'POST', headers,
                                body: JSON.stringify({
                                    children: [{ block_type: 2, text: { elements: [{ text_run: { content: rowText } }], style: {} } }],
                                    index: indexOffset,
                                }),
                            }
                        );
                        const fbData = await safeJson<{ code: number; msg: string }>(fbRes);
                        if (fbData.code === 0) indexOffset++;
                    } catch (fbErr) {
                        console.warn('[Lark] Table fallback row error, skipping:', fbErr);
                    }
                }
            }
            i++;
            continue;
        }


        // ── Pre-uploaded Lark image token (_larkToken) ────────────
        // Try inserting image block directly with the token embedded.
        if (block._larkToken !== undefined) {
            const larkFileToken = block._larkToken as string;
            console.log('[Lark] attempting direct insert for larkToken:', larkFileToken);

            const imgBlock = { block_type: 27, image: { token: larkFileToken } };
            const directRes = await fetch(
                `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                {
                    method: 'POST', headers,
                    body: JSON.stringify({ children: [imgBlock], index: indexOffset }),
                }
            );
            const directData = await safeJson<{ code: number; msg: string; data?: unknown }>(directRes);
            console.log('[Lark] direct image insert result:', JSON.stringify(directData));

            if (directData.code === 0) {
                indexOffset++;
            } else {
                // Fallback: text reference
                console.warn('[Lark] Direct image insert failed code:', directData.code, 'token:', larkFileToken);
                const textFallback = {
                    block_type: 2,
                    text: { elements: [{ text_run: { content: `[🖼️ img:${larkFileToken.slice(0, 8)}…]` } }], style: {} },
                };
                const fbRes = await fetch(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                    { method: 'POST', headers, body: JSON.stringify({ children: [textFallback], index: indexOffset }) }
                );
                const fbData = await safeJson<{ code: number; msg: string }>(fbRes);
                if (fbData.code === 0) indexOffset++;
            }

            i++;
            continue;
        }

        // ── Image placeholder (_imageSrc): upload-first approach ──────
        if (block._imageSrc !== undefined) {
            const src = block._imageSrc as string;
            const alt = (block._imageAlt as string) || 'image';

            if (!src.startsWith('data:')) {
                // External URL or unresolved img:// — insert as text link instead
                const textBlock = {
                    block_type: 2,
                    text: { elements: [{ text_run: { content: `[🖼️ ${alt}](${src})` } }], style: {} },
                };
                const res = await fetch(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                    { method: 'POST', headers, body: JSON.stringify({ children: [textBlock], index: indexOffset }) }
                );
                const data = await safeJson<{ code: number; msg: string }>(res);
                if (data.code === 0) indexOffset++;
                i++;
                continue;
            }

            // 3-step flow: create image block → upload media → PATCH token
            try {
                // Step 1: Create image block (with document_revision_id=-1)
                const createRes = await fetch(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children?document_revision_id=-1`,
                    {
                        method: 'POST', headers,
                        body: JSON.stringify({
                            children: [{ block_type: 27, image: { token: '' } }],
                            index: indexOffset,
                        }),
                    }
                );
                const createData = await safeJson<{ code: number; msg: string; data?: { children?: { block_id: string }[] } }>(createRes);
                console.log('[Lark] create image block:', createData);

                if (createData.code !== 0 || !createData.data?.children?.[0]?.block_id) {
                    throw new Error(`Create image block failed: ${createData.msg} (code ${createData.code})`);
                }

                const imgBlockId = createData.data.children[0].block_id;
                indexOffset++;

                // Small delay before next block operation
                await new Promise(r => setTimeout(r, 300));

                // Step 2: Upload media with parent_node = imgBlockId
                const { uploadImageToLark } = await import('../lib/larkPublish');
                const fileToken = await uploadImageToLark(token, imgBlockId, src);
                console.log('[Lark] upload image result:', { fileToken, imgBlockId });

                if (fileToken) {
                    // Step 3: PATCH the image block with the file_token
                    const patchRes = await fetch(
                        `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${imgBlockId}?document_revision_id=-1`,
                        {
                            method: 'PATCH', headers,
                            body: JSON.stringify({ replace_image: { token: fileToken } }),
                        }
                    );
                    const patchData = await safeJson<{ code: number; msg: string; data?: unknown }>(patchRes);
                    console.log('[Lark] PATCH image block result:', JSON.stringify(patchData));
                    if (patchData.code !== 0) {
                        console.warn('[Lark] PATCH image token failed:', patchData.code, patchData.msg);
                    }
                } else {
                    console.warn('[Lark] Image upload returned no file_token for block', imgBlockId);
                }
            } catch (imgErr) {
                console.warn('[Lark] Image insertion failed, using text fallback:', imgErr);
                const fb = { block_type: 2, text: { elements: [{ text_run: { content: `[🖼️ ${alt}]` } }], style: {} } };
                const fbRes = await fetch(
                    `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                    { method: 'POST', headers, body: JSON.stringify({ children: [fb], index: indexOffset }) }
                );
                const fbData = await safeJson<{ code: number; msg: string }>(fbRes);
                if (fbData.code === 0) indexOffset++;
            }

            i++;
            continue;
        }

        // ── Image block (block_type 27) already resolved — insert individually ──
        const blockRec = blocks[i] as Record<string, unknown>;
        if (blockRec.block_type === 27) {
            const res = await fetchWithRetry(
                `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                { method: 'POST', headers, body: JSON.stringify({ children: [blockRec], index: indexOffset }) }
            );
            const data = await safeJson<{ code: number; msg: string }>(res);
            console.log('[Lark] insertImage block:', data);
            if (data.code === 0) {
                indexOffset++;
            } else {
                console.warn('[Lark] Insert image block failed, skipping:', data.code, data.msg);
            }
            i++;
            continue;
        }

        // ── Regular blocks: batch ────────────────────────────────
        const batchEnd = Math.min(i + CHUNK, blocks.length);
        // Collect only non-table, non-image blocks in this window
        const regularChunk: unknown[] = [];
        for (let j = i; j < batchEnd; j++) {
            const b = blocks[j] as Record<string, unknown>;
            if (b._tableRows || b._larkToken !== undefined || b._imageSrc !== undefined || b.block_type === 27) break;
            regularChunk.push(b);
        }
        if (regularChunk.length === 0) { i++; continue; }

        const res = await fetchWithRetry(
            `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
            { method: 'POST', headers, body: JSON.stringify({ children: regularChunk, index: indexOffset }) }
        );
        const data = await safeJson<{ code: number; msg: string }>(res);
        if (data.code !== 0) {
            // Batch failed — retry blocks one by one with delays
            console.warn(`[Lark] Batch insert failed (code ${data.code}), retrying ${regularChunk.length} blocks individually...`);
            for (const singleBlock of regularChunk) {
                try {
                    await delay(150); // throttle between individual inserts
                    const singleRes = await fetchWithRetry(
                        `${LARK_BASE}/open-apis/docx/v1/documents/${documentId}/blocks/${documentId}/children`,
                        { method: 'POST', headers, body: JSON.stringify({ children: [singleBlock], index: indexOffset }) }
                    );
                    const singleData = await safeJson<{ code: number; msg: string }>(singleRes);
                    if (singleData.code === 0) {
                        indexOffset++;
                    } else {
                        console.warn('[Lark] Skipping invalid block:', JSON.stringify(singleBlock).slice(0, 200), singleData.msg);
                    }
                } catch (err) {
                    console.warn('[Lark] Block insert error, skipping:', err);
                }
            }
        } else {
            indexOffset += regularChunk.length;
        }
        i += regularChunk.length;

        // Throttle between batches to avoid rate limiting
        await delay(200);
    }
}


type Step = 'idle' | 'auth' | 'images' | 'publishing' | 'done' | 'error';

export type PublishConfig = {
    title: string;
    wikiEnabled: boolean;
    wikiSpaceId: string;
    wikiNodeToken: string;
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    markdownInput: string;
    activeTheme?: string;
    cardId?: string;
    cardTitle?: string;
    /** When provided, clicking Đăng closes the dialog and fires this callback for background publish */
    onPublishStarted?: (config: PublishConfig) => void;
}

export default function LarkPublishDialog({ isOpen, onClose, markdownInput, activeTheme, cardId, cardTitle, onPublishStarted }: Props) {
    // Extract accent hex from theme's `strong` style (e.g. `color: #b75c3d !important`)
    const accentHex = (() => {
        const theme = THEMES.find(t => t.id === activeTheme);
        const strongStyle = theme?.styles?.strong ?? '';
        const m = strongStyle.match(/color:\s*(#[0-9a-fA-F]{6})/);
        return m?.[1] ?? undefined;
    })();
    const [title, setTitle] = useState('');
    const [step, setStep] = useState<Step>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [resultUrl, setResultUrl] = useState('');

    // Wiki mode
    const [wikiEnabled, setWikiEnabled] = useState(false);
    const [wikiSpaceId, setWikiSpaceId] = useState('');
    const [wikiNodeToken, setWikiNodeToken] = useState('');

    // Saved wikis
    const [savedWikis, setSavedWikis] = useState<SavedWiki[]>([]);
    const [saveName, setSaveName] = useState('');
    const [showSaveInput, setShowSaveInput] = useState(false);
    const [fetchingName, setFetchingName] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const skipFetchRef = useRef(false);

    useEffect(() => { setSavedWikis(loadSavedWikis()); }, []);

    // Auto-fetch wiki name when URL is pasted (skip when selecting a saved wiki)
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        const url = wikiSpaceId.trim();
        if (!url.startsWith('http')) return;
        if (skipFetchRef.current) { skipFetchRef.current = false; return; }
        debounceRef.current = setTimeout(async () => {
            setFetchingName(true);
            const name = await fetchWikiName(url);
            setFetchingName(false);
            if (name) {
                setSaveName(name);
                setShowSaveInput(true);
            }
        }, 600);
        return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    }, [wikiSpaceId]);

    const isLoading = ['auth', 'publishing'].includes(step);

    const handleOpen = () => { if (!title) setTitle(extractTitle(markdownInput)); };

    const handleClose = () => {
        if (isLoading) return;
        setStep('idle'); setErrorMsg(''); setResultUrl('');
        onClose();
    };

    const handleSaveWiki = () => {
        const name = saveName.trim();
        const url = wikiSpaceId.trim();
        if (!name || !url) return;
        const updated = [...savedWikis.filter(w => w.name !== name), { name, url }];
        setSavedWikis(updated);
        saveSavedWikis(updated);
        setSaveName(''); setShowSaveInput(false);
    };

    const handleDeleteWiki = (name: string) => {
        const updated = savedWikis.filter(w => w.name !== name);
        setSavedWikis(updated);
        saveSavedWikis(updated);
    };

    const handleSelectWiki = (wiki: SavedWiki) => {
        skipFetchRef.current = true; // skip auto-fetch — wiki already saved
        setShowSaveInput(false);
        setSaveName('');
        setWikiSpaceId(wiki.url);
    };

    const handlePublish = async () => {
        // Background mode: close dialog, fire callback, let parent handle publish
        if (onPublishStarted) {
            const cfg: PublishConfig = {
                title: title || extractTitle(markdownInput),
                wikiEnabled,
                wikiSpaceId: wikiSpaceId.trim(),
                wikiNodeToken: wikiNodeToken.trim(),
            };
            onClose();
            onPublishStarted(cfg);
            return;
        }
        // Single mode: original in-dialog flow
        setStep('auth'); setErrorMsg('');
        const t0 = Date.now();
        try {
            const token = await getLarkToken();
            const docTitle = title || extractTitle(markdownInput);
            const blocks = markdownToLarkBlocks(markdownInput, accentHex);
            const larkImageStore = getAllImages();

            // ── Pre-publish: warn about unresolved img:// refs ──────
            const unresolvedImgKeys = [...markdownInput.matchAll(/\(img:\/\/([^)]+)\)/g)]
                .map(m => m[1])
                .filter(key => !larkImageStore.has(key));
            if (unresolvedImgKeys.length > 0) {
                const proceed = window.confirm(
                    `⚠️ Có ${unresolvedImgKeys.length} ảnh dùng img:// ref từ phiên trước không còn data.\n\n` +
                    `Các ảnh này sẽ bị bỏ qua khi đăng lên Lark.\n\n` +
                    `Để đăng ảnh đúng: kéo thả lại file ảnh vào nút "Tải ảnh" trước khi publish.\n\n` +
                    `Tiếp tục publish không có ảnh?`
                );
                if (!proceed) { setStep('idle'); return; }
            }

            setStep('publishing');

            let docUrl = '';
            if (wikiEnabled && wikiSpaceId.trim()) {
                const { spaceId: resolvedSpaceId, nodeToken: resolvedNodeToken, domain: wikiDomain } =
                    await resolveSpaceId(token, wikiSpaceId.trim());
                const parentWikiToken = wikiNodeToken.trim() || resolvedNodeToken;

                const createRes = await fetch(`${LARK_BASE}/open-apis/docx/v1/documents`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=utf-8' },
                    body: JSON.stringify({ title: docTitle }),
                });
                const createData = await createRes.json() as { code: number; msg: string; data?: { document?: { document_id: string } } };
                if (createData.code !== 0 || !createData.data?.document) {
                    throw new Error(`Create doc failed: ${createData.msg} (code ${createData.code})`);
                }
                const docId = createData.data.document.document_id;

                setStep('images');
                const resolvedBlocks = await resolveImageBlocks(
                    token, docId, blocks, larkImageStore,
                );

                await insertBlocksIntoDoc(token, docId, resolvedBlocks);

                const { url: wikiUrl, wikiToken } = await moveDocToWiki(
                    token, resolvedSpaceId, docId, parentWikiToken,
                );

                if (wikiUrl) {
                    docUrl = wikiUrl;
                } else {
                    const r = await fetch(`${LARK_BASE}/open-apis/docx/v1/documents/${docId}`, {
                        headers: { Authorization: `Bearer ${token}` },
                    });
                    const d = await r.json() as { data?: { document?: { url?: string } } };
                    const base = wikiDomain ?? 'https://open.larksuite.com';
                    docUrl = d.data?.document?.url
                        ?? (wikiToken ? `${base}/wiki/${wikiToken}` : `${base}/docx/${docId}`);
                }
            } else {
                const { publishToLark } = await import('../lib/larkPublish');
                docUrl = await publishToLark({ title: docTitle, markdown: markdownInput, imageStore: larkImageStore });
            }

            setResultUrl(docUrl);
            setStep('done');
            appendLog({
                cardId: cardId ?? 'single',
                cardTitle: (cardTitle ?? title) || 'Single Mode',
                type: 'lark_publish',
                timestamp: new Date().toISOString(),
                durationMs: Date.now() - t0,
                larkUrl: docUrl,
                success: true,
            });
        } catch (e) {
            setErrorMsg(e instanceof Error ? e.message : String(e));
            setStep('error');
            appendLog({
                cardId: cardId ?? 'single',
                cardTitle: (cardTitle ?? title) || 'Single Mode',
                type: 'lark_publish',
                timestamp: new Date().toISOString(),
                durationMs: Date.now() - t0,
                success: false,
                errorMsg: e instanceof Error ? e.message : String(e),
            });
        }
    };

    const statusLabel: Record<Step, string> = {
        idle: '', auth: 'Đang xác thực...', images: 'Đang upload ảnh lên Lark...',
        publishing: 'Đang tạo tài liệu...',
        done: 'Đăng thành công!', error: 'Đăng thất bại',
    };

    const canPublish = !isLoading && !!markdownInput.trim() &&
        (!wikiEnabled || wikiSpaceId.trim().length > 0);

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] bg-black/20 backdrop-blur-sm" onClick={handleClose} />

                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
                        onAnimationStart={handleOpen}
                        className="fixed inset-x-4 top-[5vh] z-[101] mx-auto max-w-md bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-apple-lg border border-[#00000015] dark:border-[#ffffff15] overflow-hidden"
                        style={{ maxHeight: '90vh' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 pt-5 pb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#1456f0] to-[#3b82f6] flex items-center justify-center">
                                    <Upload size={15} className="text-white" />
                                </div>
                                <div>
                                    <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Đăng lên Lark</h2>
                                    <p className="text-[11px] text-[#86868b]">Tạo tài liệu Lark từ Markdown</p>
                                </div>
                            </div>
                            <button onClick={handleClose} disabled={isLoading}
                                className="p-1.5 rounded-full hover:bg-[#00000008] dark:hover:bg-[#ffffff10] disabled:opacity-40">
                                <X size={16} className="text-[#86868b]" />
                            </button>
                        </div>

                        <div className="overflow-y-auto px-5 pb-5 space-y-3" style={{ maxHeight: 'calc(90vh - 80px)' }}>
                            {/* Title */}
                            <div>
                                <label className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide block mb-1">Tiêu đề</label>
                                <input value={title} onChange={e => setTitle(e.target.value)} disabled={isLoading}
                                    placeholder="Nhập tiêu đề tài liệu..."
                                    className="w-full px-3 py-2 rounded-xl bg-[#00000006] dark:bg-[#ffffff08] border border-[#00000012] dark:border-[#ffffff12] text-[13.5px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] outline-none focus:ring-2 focus:ring-[#0066cc]/25 transition-all disabled:opacity-60" />
                            </div>

                            {/* Wiki toggle */}
                            <div className="rounded-xl border border-[#00000012] dark:border-[#ffffff12] overflow-hidden">
                                <button onClick={() => setWikiEnabled(p => !p)} disabled={isLoading}
                                    className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-[#00000004] transition-colors">
                                    <div className="flex items-center gap-2">
                                        <Globe size={14} className="text-[#0066cc] dark:text-[#0a84ff]" />
                                        <span className="text-[13px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">Đăng vào Wiki</span>
                                    </div>
                                    <div className={`w-9 h-5 rounded-full transition-colors ${wikiEnabled ? 'bg-[#34c759]' : 'bg-[#e5e5ea] dark:bg-[#38383a]'}`}>
                                        <div className={`w-4 h-4 bg-white rounded-full shadow mt-0.5 transition-transform ${wikiEnabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                    </div>
                                </button>

                                <AnimatePresence>
                                    {wikiEnabled && (
                                        <motion.div initial={{ height: 0 }} animate={{ height: 'auto' }} exit={{ height: 0 }}
                                            className="overflow-hidden border-t border-[#00000010] dark:border-[#ffffff10]">
                                            <div className="p-3 space-y-2.5">

                                                {/* ── Saved wikis ── */}
                                                {savedWikis.length > 0 && (
                                                    <div>
                                                        <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide mb-1.5">Wiki đã lưu</p>
                                                        <div className="flex flex-wrap gap-1.5">
                                                            {savedWikis.map(w => (
                                                                <div key={w.name}
                                                                    className={`flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-lg border text-[12px] font-medium transition-colors ${wikiSpaceId === w.url ? 'bg-[#0066cc] dark:bg-[#0a84ff] text-white border-transparent' : 'bg-[#00000006] dark:bg-[#ffffff08] text-[#1d1d1f] dark:text-[#f5f5f7] border-[#00000012] dark:border-[#ffffff12]'}`}>
                                                                    <button onClick={() => handleSelectWiki(w)} disabled={isLoading}
                                                                        className="max-w-[120px] truncate text-left">
                                                                        {w.name}
                                                                    </button>
                                                                    <button onClick={() => handleDeleteWiki(w.name)} disabled={isLoading}
                                                                        className={`p-0.5 rounded hover:opacity-70 transition-opacity ${wikiSpaceId === w.url ? 'text-white/70' : 'text-[#86868b]'}`}>
                                                                        <Trash2 size={10} />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* ── URL input ── */}
                                                <div>
                                                    <div className="flex items-center justify-between mb-1">
                                                        <label className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide flex items-center gap-1.5">
                                                            Wiki URL <span className="text-[#ff3b30]">*</span>
                                                            {fetchingName && (
                                                                <span className="flex items-center gap-1 text-[#0066cc] dark:text-[#0a84ff] font-normal normal-case">
                                                                    <Loader2 size={10} className="animate-spin" /> Đang lấy tên...
                                                                </span>
                                                            )}
                                                        </label>
                                                        {wikiSpaceId.trim() && !showSaveInput && !fetchingName && (
                                                            <button onClick={() => setShowSaveInput(true)} disabled={isLoading}
                                                                className="flex items-center gap-1 text-[11px] text-[#0066cc] dark:text-[#0a84ff] hover:opacity-70 transition-opacity">
                                                                <Bookmark size={10} /> Lưu lại
                                                            </button>
                                                        )}
                                                    </div>
                                                    <input value={wikiSpaceId} onChange={e => setWikiSpaceId(e.target.value)}
                                                        disabled={isLoading}
                                                        placeholder="https://congdongagi.sg.larksuite.com/wiki/..."
                                                        className="w-full px-3 py-2 rounded-xl bg-[#00000006] dark:bg-[#ffffff08] border border-[#00000012] dark:border-[#ffffff12] text-[12px] font-mono text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] outline-none focus:ring-2 focus:ring-[#0066cc]/25 transition-all disabled:opacity-60" />
                                                </div>

                                                {/* Save name input */}
                                                <AnimatePresence>
                                                    {showSaveInput && (
                                                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                                                            className="overflow-hidden">
                                                            <div className="flex gap-2">
                                                                <input
                                                                    value={saveName} onChange={e => setSaveName(e.target.value)}
                                                                    onKeyDown={e => e.key === 'Enter' && handleSaveWiki()}
                                                                    placeholder="Tên wiki (vd: CộngĐồngAGI)"
                                                                    autoFocus
                                                                    className="flex-1 px-3 py-1.5 rounded-lg bg-[#00000006] dark:bg-[#ffffff08] border border-[#00000012] dark:border-[#ffffff12] text-[12.5px] text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] outline-none focus:ring-2 focus:ring-[#0066cc]/25 transition-all" />
                                                                <button onClick={handleSaveWiki}
                                                                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#0066cc] dark:bg-[#0a84ff] text-white text-[12px] font-medium hover:opacity-80 transition-opacity">
                                                                    <Plus size={12} /> Lưu
                                                                </button>
                                                                <button onClick={() => setShowSaveInput(false)}
                                                                    className="px-2.5 py-1.5 rounded-lg bg-[#00000008] text-[#86868b] text-[12px] hover:opacity-70 transition-opacity">
                                                                    ✕
                                                                </button>
                                                            </div>
                                                        </motion.div>
                                                    )}
                                                </AnimatePresence>

                                                {/* Parent Node Token */}
                                                <div>
                                                    <label className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide block mb-1">
                                                        Parent Node Token&nbsp;
                                                        <span className="font-normal lowercase">(tuỳ chọn — để trống = root)</span>
                                                    </label>
                                                    <input value={wikiNodeToken} onChange={e => setWikiNodeToken(e.target.value)}
                                                        disabled={isLoading} placeholder="wikcn... (node cha muốn publish vào)"
                                                        className="w-full px-3 py-2 rounded-xl bg-[#00000006] dark:bg-[#ffffff08] border border-[#00000012] dark:border-[#ffffff12] text-[12.5px] font-mono text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] outline-none focus:ring-2 focus:ring-[#0066cc]/25 transition-all disabled:opacity-60" />
                                                </div>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            {/* Status */}
                            {step !== 'idle' && (
                                <div className={`rounded-xl px-4 py-3 flex items-center gap-3 ${step === 'done' ? 'bg-[#34c759]/10 border border-[#34c759]/20' : step === 'error' ? 'bg-[#ff3b30]/8 border border-[#ff3b30]/20' : 'bg-[#0066cc]/6 dark:bg-[#0a84ff]/8 border border-[#0066cc]/12'}`}>
                                    {isLoading && <Loader2 size={15} className="shrink-0 animate-spin text-[#0066cc] dark:text-[#0a84ff]" />}
                                    {step === 'done' && <CheckCircle2 size={15} className="shrink-0 text-[#34c759]" />}
                                    {step === 'error' && <AlertTriangle size={15} className="shrink-0 text-[#ff3b30]" />}
                                    <div className="flex-1 min-w-0">
                                        <p className={`text-[13px] font-medium ${step === 'done' ? 'text-[#1d8d3a] dark:text-[#30d158]' : step === 'error' ? 'text-[#ff3b30]' : 'text-[#0066cc] dark:text-[#0a84ff]'}`}>
                                            {statusLabel[step]}
                                        </p>
                                        {step === 'error' && <p className="text-[11px] text-[#ff3b30]/80 mt-0.5 break-words">{errorMsg}</p>}
                                    </div>
                                </div>
                            )}

                            {/* Result link */}
                            {step === 'done' && resultUrl && (
                                <a href={resultUrl} target="_blank" rel="noopener noreferrer"
                                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00000006] dark:bg-[#ffffff08] border border-[#00000012] hover:bg-[#0066cc]/5 transition-colors group">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[10px] text-[#86868b] mb-0.5">Mở tài liệu</p>
                                        <p className="text-[11px] text-[#0066cc] dark:text-[#0a84ff] truncate font-mono">{resultUrl}</p>
                                    </div>
                                    <ExternalLink size={13} className="shrink-0 text-[#86868b] group-hover:text-[#0066cc] transition-colors" />
                                </a>
                            )}

                            {/* Actions */}
                            <div className="flex gap-2 pt-1">
                                <button onClick={handleClose} disabled={isLoading}
                                    className="flex-1 py-2.5 rounded-xl border border-[#00000015] dark:border-[#ffffff15] text-[13.5px] font-medium text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-[#00000008] transition-all disabled:opacity-40">
                                    {step === 'done' ? 'Đóng' : 'Huỷ'}
                                </button>
                                {step !== 'done' && (
                                    <button onClick={handlePublish} disabled={!canPublish}
                                        className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[#1456f0] hover:bg-[#0e47d4] text-white text-[13.5px] font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed">
                                        {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                        {step === 'error' ? 'Thử lại' : isLoading ? 'Đang đăng...' : 'Đăng lên Lark'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
