/**
 * In-memory image store.
 * Editor markdown contains short references like ![alt](img://uuid)
 * This module stores the actual base64 data and resolves them for preview/publish.
 */

const store = new Map<string, string>(); // uuid → base64 data URL

let _counter = 0;

export function generateImageKey(): string {
    _counter++;
    return `img_${Date.now()}_${_counter}`;
}

export function storeImage(key: string, dataUrl: string): void {
    store.set(key, dataUrl);
}

export function getImage(key: string): string | undefined {
    return store.get(key);
}

export function deleteImage(key: string): void {
    store.delete(key);
}

export function getAllImages(): Map<string, string> {
    return store;
}

/** Resolve all img://key references in markdown to actual base64 data URLs */
export function resolveImgRefs(markdown: string): string {
    return markdown.replace(/\(img:\/\/([^)]+)\)/g, (_match, key) => {
        const dataUrl = store.get(key);
        return dataUrl ? `(${dataUrl})` : `(img://${key})`;
    });
}

/** Extract all img://key references in markdown */
export function extractImgKeys(markdown: string): string[] {
    const matches = [...markdown.matchAll(/\(img:\/\/([^)]+)\)/g)];
    return matches.map(m => m[1]);
}
