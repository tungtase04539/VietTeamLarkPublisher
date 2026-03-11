/**
 * larkRunner.ts
 * Shared Lark publish logic used by both LarkPublishDialog (in-dialog mode)
 * and DashboardCard (background mode).
 */

import { getLarkToken, markdownToLarkBlocks, resolveImageBlocks } from './larkPublish';
import { resolveSpaceId, moveDocToWiki } from './larkWiki';
import { getAllImages } from './imageStore';
import { insertBlocksIntoDoc, type PublishResult } from './larkInsert';

export type PublishRunConfig = {
    title: string;
    wikiEnabled: boolean;
    wikiSpaceId: string;
    wikiNodeToken: string;
    accentHex?: string;
};

export type { PublishResult };

const LARK_BASE = '/lark-api';


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
