/**
 * In-memory image store with localStorage persistence.
 * Editor markdown contains short references like ![alt](img://uuid)
 * Images are stored in a dedicated localStorage key (NOT in markdownInput),
 * so card saves remain small and the translate API never sees base64 data.
 */

const IMAGE_STORE_KEY = 'raphael_image_store';
const store = new Map<string, string>(); // uuid → base64 data URL

let _counter = 0;
let _saveImageTimer: ReturnType<typeof setTimeout> | null = null;

// ── Restore from localStorage on module load ──────────────────────────────────
try {
    const raw = localStorage.getItem(IMAGE_STORE_KEY);
    if (raw) {
        const obj = JSON.parse(raw) as Record<string, string>;
        for (const [k, v] of Object.entries(obj)) store.set(k, v);
    }
} catch { /* ignore */ }

function schedulePersist() {
    if (_saveImageTimer !== null) clearTimeout(_saveImageTimer);
    _saveImageTimer = setTimeout(() => {
        try {
            const obj: Record<string, string> = {};
            store.forEach((v, k) => { obj[k] = v; });
            localStorage.setItem(IMAGE_STORE_KEY, JSON.stringify(obj));
        } catch { /* quota ignored */ }
        _saveImageTimer = null;
    }, 500);
}

export function generateImageKey(): string {
    _counter++;
    return `img_${Date.now()}_${_counter}`;
}

export function storeImage(key: string, dataUrl: string): void {
    store.set(key, dataUrl);
    schedulePersist();
}

export function getImage(key: string): string | undefined {
    return store.get(key);
}

export function deleteImage(key: string): void {
    store.delete(key);
    schedulePersist();
}

/**
 * Remove images from the store that are no longer referenced
 * in any of the provided markdowns. Call this when cards are deleted.
 */
export function pruneOrphanedImages(allMarkdowns: string[]): void {
    const combined = allMarkdowns.join('\n');
    let pruned = false;
    store.forEach((_, key) => {
        if (!combined.includes(key)) {
            store.delete(key);
            pruned = true;
        }
    });
    if (pruned) schedulePersist();
}

export function getAllImages(): Map<string, string> {
    return store;
}

/** Resolve all img://key references in markdown to actual base64 data URLs */
export function resolveImgRefs(markdown: string): string {
    // Match the full ![alt](img://key) directive so we can replace entire block for unresolved ones
    return markdown.replace(/!\[([^\]]*)\]\(img:\/\/([^)]+)\)/g, (_match, alt, key) => {
        const dataUrl = store.get(key);
        if (dataUrl) {
            // Resolved: render as actual image
            return `![${alt}](${dataUrl})`;
        }
        // Unresolved (session expired): show inline HTML placeholder
        // (html: true is enabled in markdown-it so HTML renders correctly)
        const label = alt || `img:${key.slice(0, 10)}…`;
        return `<span style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;background:#f5f5f5;border:1.5px dashed #d0d0d0;border-radius:6px;color:#999;font-size:12px;font-family:system-ui">🖼️ ${label} — kéo thả ảnh lại để load</span>`;
    });
}

/** Extract all img://key references in markdown */
export function extractImgKeys(markdown: string): string[] {
    const matches = [...markdown.matchAll(/\(img:\/\/([^)]+)\)/g)];
    return matches.map(m => m[1]);
}
