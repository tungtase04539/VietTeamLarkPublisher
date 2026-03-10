// ─── Per-card Activity Log ─────────────────────────────────────────────────
// Stores log entries for each card in localStorage.
// Optimised: in-memory cache avoids repeated JSON.parse on every read.

export type LogEventType = 'text_translate' | 'image_translate' | 'lark_publish';

export interface LogEntry {
    id: string;
    cardId: string;
    cardTitle: string;
    type: LogEventType;
    timestamp: string;          // ISO
    durationMs: number;
    inputTokens?: number;
    outputTokens?: number;
    costUsd?: number;
    model?: string;
    // image translate extras
    imageCount?: number;
    // lark publish extras
    larkUrl?: string;
    success: boolean;
    errorMsg?: string;
}

const STORAGE_KEY = 'raphael_card_log_v1';
const MAX_ENTRIES = 500;

// ── In-memory cache ───────────────────────────────────────────────────────────
let _cache: LogEntry[] | null = null;
let _saveTimer: ReturnType<typeof setTimeout> | null = null;

function getCache(): LogEntry[] {
    if (_cache !== null) return _cache;
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        _cache = raw ? (JSON.parse(raw) as LogEntry[]) : [];
    } catch {
        _cache = [];
    }
    return _cache;
}

/** Flush the in-memory cache to localStorage (debounced ~200ms) */
function scheduleSave() {
    if (_saveTimer !== null) clearTimeout(_saveTimer);
    _saveTimer = setTimeout(() => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(_cache ?? []));
        } catch { /* ignore quota errors */ }
        _saveTimer = null;
    }, 200);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function appendLog(entry: Omit<LogEntry, 'id'>): LogEntry {
    const cache = getCache();
    const newEntry: LogEntry = { ...entry, id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` };
    // Prepend and truncate — mutate in place to avoid re-allocating the whole array
    cache.unshift(newEntry);
    if (cache.length > MAX_ENTRIES) cache.length = MAX_ENTRIES;
    scheduleSave();
    return newEntry;
}

export function getLogs(cardId?: string): LogEntry[] {
    const cache = getCache();
    if (!cardId) return cache;
    return cache.filter(e => e.cardId === cardId);
}

export function clearLogs(cardId?: string) {
    const cache = getCache();
    if (!cardId) {
        cache.length = 0;
    } else {
        const toKeep = cache.filter(e => e.cardId !== cardId);
        cache.length = 0;
        cache.push(...toKeep);
    }
    scheduleSave();
}

// ─── Gemini Flash image pricing (approximate) ──────────────────────────────
// gemini-3.1-flash-image-preview: input ~$0.075/1M token, output ~$0.30/1M
// Image requests are priced differently, ~$0.002/image for generation
export const IMAGE_TRANSLATE_COST_USD = 0.002; // per call

// ─── Per-card aggregate stats ─────────────────────────────────────────────
export interface CardStats {
    cardId: string;
    textTranslateCount: number;
    imageTranslateCount: number;
    larkPublishCount: number;
    totalDurationMs: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    lastActivity: string | null;
}

export function getCardStats(cardId: string): CardStats {
    const entries = getLogs(cardId);
    const stats: CardStats = {
        cardId,
        textTranslateCount: 0,
        imageTranslateCount: 0,
        larkPublishCount: 0,
        totalDurationMs: 0,
        totalCostUsd: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        lastActivity: null,
    };
    for (const e of entries) {
        if (!e.success) continue;
        if (e.type === 'text_translate') stats.textTranslateCount++;
        if (e.type === 'image_translate') stats.imageTranslateCount += (e.imageCount ?? 1);
        if (e.type === 'lark_publish') stats.larkPublishCount++;
        stats.totalDurationMs += e.durationMs;
        stats.totalCostUsd += e.costUsd ?? 0;
        stats.totalInputTokens += e.inputTokens ?? 0;
        stats.totalOutputTokens += e.outputTokens ?? 0;
        if (!stats.lastActivity || e.timestamp > stats.lastActivity) stats.lastActivity = e.timestamp;
    }
    return stats;
}

export function getAllStats(cardIds: string[]): CardStats[] {
    return cardIds.map(getCardStats);
}

// ─── Global aggregate ─────────────────────────────────────────────────────
export interface GlobalStats {
    textTranslateCount: number;
    imageTranslateCount: number;
    larkPublishCount: number;
    totalCostUsd: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    totalEntries: number;
}

export function getGlobalStats(): GlobalStats {
    // Use cache — single pass over the array
    const all = getCache();
    const entries = all.filter(e => e.success);
    return {
        textTranslateCount: entries.filter(e => e.type === 'text_translate').length,
        imageTranslateCount: entries.filter(e => e.type === 'image_translate').reduce((s, e) => s + (e.imageCount ?? 1), 0),
        larkPublishCount: entries.filter(e => e.type === 'lark_publish').length,
        totalCostUsd: entries.reduce((s, e) => s + (e.costUsd ?? 0), 0),
        totalInputTokens: entries.reduce((s, e) => s + (e.inputTokens ?? 0), 0),
        totalOutputTokens: entries.reduce((s, e) => s + (e.outputTokens ?? 0), 0),
        totalEntries: all.length,
    };
}
