const STORAGE_KEY = 'raphael_translate_settings';
const USAGE_STORAGE_KEY = 'raphael_translate_usage';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | '302ai' | 'openai-compatible';

export interface TranslateSettings {
    provider: ModelProvider;
    model: string;
    apiKey: string;
    ai302Key: string;       // separate field for 302.ai key
    baseUrl: string;        // for custom endpoints
    customPrompt: string;   // empty = use default
}

// ── Usage tracking ───────────────────────────────────────────────
export interface UsageRecord {
    date: string;           // ISO date string
    model: string;
    modelLabel: string;
    inputTokens: number;    // estimated
    outputTokens: number;   // estimated
    costUsd: number;        // estimated
}

export function loadUsageRecords(): UsageRecord[] {
    try {
        const raw = localStorage.getItem(USAGE_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

export function appendUsageRecord(r: UsageRecord): void {
    const records = loadUsageRecords();
    records.push(r);
    // Keep last 500 records
    if (records.length > 500) records.splice(0, records.length - 500);
    localStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(records));
}

export function clearUsageRecords(): void {
    localStorage.removeItem(USAGE_STORAGE_KEY);
}

// ── Default prompt ───────────────────────────────────────────────
export const DEFAULT_PROMPT = `You are a professional Markdown-aware translator. Your job is to translate text from Chinese or English to Vietnamese.

STRICT RULES — you MUST follow all of these exactly:
1. ONLY translate human-readable text. Do NOT translate any Markdown syntax tokens.
2. Preserve ALL Markdown syntax characters exactly: #, ##, ###, **bold**, *italic*, ~~strike~~, \`inline code\`, > blockquote, -, *, 1., |, ---, ***, ___, ===
3. Code blocks (\`\`\`...\`\`\`) are ALREADY replaced with placeholders like [CODE_BLOCK_0]. Do NOT touch them.
4. In links [text](url): translate ONLY the text part, NEVER change the URL.
5. In images ![alt](url): you may translate the alt text, but NEVER change the URL.
6. In tables: translate cell content, but preserve ALL pipe characters | and separator rows like |---|---|.
7. Preserve ALL blank lines and line spacing exactly as in the input.
8. Do NOT add any explanations, comments, or wrapping. Return ONLY the translated Markdown.
9. Do NOT change the number of lines. Every input line maps to one output line.
10. HTML tags like <br>, <span>, <p> must be kept exactly as-is.
11. IMPORTANT: @mentions that contain Chinese characters (e.g. @图片1, @图片2, @素材3) MUST be translated. Translate the Chinese label part ONLY, keep the @ and any number suffix. Example: @图片1 → @Hình ảnh 1, @素材2 → @Chất liệu 2.
12. ALL Chinese characters anywhere in the text — including inside parentheses, labels, captions, or @mentions — MUST be translated. Do not leave any Chinese character untranslated.`;

export const AI302_BASE_URL = 'https://api.302.ai/v1';

export interface PresetModel {
    provider: ModelProvider;
    label: string;          // display name
    desc: string;           // short description
    model: string;          // API model name
    placeholder: string;
    group: string;
    priceIn: number;        // $ per 1M input tokens
    priceOut: number;       // $ per 1M output tokens
}

export const PRESET_MODELS: PresetModel[] = [
    // ── Mặc định ────────────────────────────────────────────────────────────────────────────
    {
        group: '🌟 Mặc định', provider: 'gemini', model: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash', desc: 'Miễn phí, nhanh, chất lượng tốt',
        placeholder: 'AIza... (để trống = key tích hợp sẵn)', priceIn: 0, priceOut: 0,
    },

    // ── 302.ai — Claude ──────────────────────────────────────────────────────────────────────
    {
        group: '🔥 302.ai — Claude', provider: '302ai', model: 'claude-opus-4-6',
        label: 'Claude Opus 4.6 ★', desc: 'Mạnh nhất, agentic, context 1M token',
        placeholder: 'sk-0POS...', priceIn: 5.0, priceOut: 25.0,
    },
    {
        group: '🔥 302.ai — Claude', provider: '302ai', model: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6', desc: 'Cân bằng tốt nhất — chất lượng cao, tốc độ vừa',
        placeholder: 'sk-0POS...', priceIn: 3.0, priceOut: 15.0,
    },
    {
        group: '🔥 302.ai — Claude', provider: '302ai', model: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5', desc: 'Nhanh & rẻ nhất dòng Claude',
        placeholder: 'sk-0POS...', priceIn: 1.0, priceOut: 5.0,
    },

    // ── 302.ai — GPT ────────────────────────────────────────────────────────────────────────
    {
        group: '🔥 302.ai — GPT', provider: '302ai', model: 'gpt-5.4',
        label: 'GPT-5.4 ★', desc: 'Mới nhất OpenAI, reasoning cực mạnh, context 1M',
        placeholder: 'sk-0POS...', priceIn: 1.75, priceOut: 14.0,
    },
    {
        group: '🔥 302.ai — GPT', provider: '302ai', model: 'gpt-5.3-instant',
        label: 'GPT-5.3 Instant', desc: 'Hội thoại tự nhiên, phản hồi nhanh',
        placeholder: 'sk-0POS...', priceIn: 1.75, priceOut: 14.0,
    },
    {
        group: '🔥 302.ai — GPT', provider: '302ai', model: 'gpt-4o',
        label: 'GPT-4o', desc: 'Ổn định, đa năng, benchmark cao',
        placeholder: 'sk-0POS...', priceIn: 2.5, priceOut: 10.0,
    },
    {
        group: '🔥 302.ai — GPT', provider: '302ai', model: 'gpt-4o-mini',
        label: 'GPT-4o Mini', desc: 'Nhanh, rẻ — tốt cho nội dung ngắn',
        placeholder: 'sk-0POS...', priceIn: 0.15, priceOut: 0.6,
    },

    // ── 302.ai — Gemini ─────────────────────────────────────────────────────────────────────
    {
        group: '🔥 302.ai — Gemini', provider: '302ai', model: 'gemini-3.1-pro',
        label: 'Gemini 3.1 Pro ★', desc: '77.1% ARC-AGI-2, context 1M, reasoning vượt trội',
        placeholder: 'sk-0POS...', priceIn: 2.0, priceOut: 12.0,
    },
    {
        group: '🔥 302.ai — Gemini', provider: '302ai', model: 'gemini-3.1-flash-lite-preview',
        label: 'Gemini 3.1 Flash Lite', desc: 'Siêu nhanh & rẻ nhất dòng Gemini 3',
        placeholder: 'sk-0POS...', priceIn: 0.25, priceOut: 1.5,
    },
    {
        group: '🔥 302.ai — Gemini', provider: '302ai', model: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro', desc: 'Context 1M token, coding + reasoning mạnh',
        placeholder: 'sk-0POS...', priceIn: 1.25, priceOut: 5.0,
    },
    {
        group: '🔥 302.ai — Gemini', provider: '302ai', model: 'gemini-2.5-flash',
        label: 'Gemini 2.5 Flash', desc: 'Nhanh & rẻ, chất lượng tốt qua 302.ai',
        placeholder: 'sk-0POS...', priceIn: 0.075, priceOut: 0.3,
    },

    // ── 302.ai — DeepSeek ───────────────────────────────────────────────────────────────────
    {
        group: '🔥 302.ai — DeepSeek', provider: '302ai', model: 'deepseek-v4',
        label: 'DeepSeek V4 ★', desc: 'Mới nhất, multimodal, đối thủ GPT-4o',
        placeholder: 'sk-0POS...', priceIn: 0.28, priceOut: 0.42,
    },
    {
        group: '🔥 302.ai — DeepSeek', provider: '302ai', model: 'deepseek-v3',
        label: 'DeepSeek V3.2', desc: 'Hiệu năng cao, cực rẻ, agentic tốt',
        placeholder: 'sk-0POS...', priceIn: 0.28, priceOut: 0.42,
    },
    {
        group: '🔥 302.ai — DeepSeek', provider: '302ai', model: 'deepseek-r1',
        label: 'DeepSeek R1', desc: 'Reasoning step-by-step, toán & logic xuất sắc',
        placeholder: 'sk-0POS...', priceIn: 0.55, priceOut: 2.19,
    },

    // ── 302.ai — Grok ───────────────────────────────────────────────────────────────────────
    {
        group: '🔥 302.ai — Grok', provider: '302ai', model: 'grok-4',
        label: 'Grok 4 ★', desc: 'Flagship xAI mới nhất, STEM & coding mạnh',
        placeholder: 'sk-0POS...', priceIn: 3.0, priceOut: 15.0,
    },
    {
        group: '🔥 302.ai — Grok', provider: '302ai', model: 'grok-4-fast-non-reasoning',
        label: 'Grok 4 Fast', desc: 'Phiên bản nhanh của Grok 4, giá rất rẻ',
        placeholder: 'sk-0POS...', priceIn: 0.2, priceOut: 0.5,
    },

    // ── Gemini direct ────────────────────────────────────────────────────────────────────────
    {
        group: '🔵 Gemini direct', provider: 'gemini', model: 'gemini-2.5-pro',
        label: 'Gemini 2.5 Pro', desc: 'API trực tiếp Google', placeholder: 'AIza...', priceIn: 1.25, priceOut: 5.0,
    },
    {
        group: '🔵 Gemini direct', provider: 'gemini', model: 'gemini-2.0-flash',
        label: 'Gemini 2.0 Flash', desc: 'API trực tiếp Google', placeholder: 'AIza...', priceIn: 0.075, priceOut: 0.3,
    },

    // ── OpenAI direct ────────────────────────────────────────────────────────────────────────
    {
        group: '🟢 OpenAI direct', provider: 'openai', model: 'gpt-4o',
        label: 'GPT-4o', desc: 'API trực tiếp OpenAI', placeholder: 'sk-...', priceIn: 2.5, priceOut: 10.0,
    },
    {
        group: '🟢 OpenAI direct', provider: 'openai', model: 'gpt-4o-mini',
        label: 'GPT-4o Mini', desc: 'API trực tiếp OpenAI', placeholder: 'sk-...', priceIn: 0.15, priceOut: 0.6,
    },

    // ── Anthropic direct ─────────────────────────────────────────────────────────────────────
    {
        group: '🟠 Claude direct', provider: 'anthropic', model: 'claude-sonnet-4-6',
        label: 'Claude Sonnet 4.6', desc: 'API trực tiếp Anthropic', placeholder: 'sk-ant-...', priceIn: 3.0, priceOut: 15.0,
    },
    {
        group: '🟠 Claude direct', provider: 'anthropic', model: 'claude-haiku-4-5',
        label: 'Claude Haiku 4.5', desc: 'API trực tiếp Anthropic', placeholder: 'sk-ant-...', priceIn: 1.0, priceOut: 5.0,
    },

    // ── Custom ───────────────────────────────────────────────────────────────────────────────
    {
        group: '⚙️ Custom', provider: 'openai-compatible', model: '',
        label: 'Custom (OpenAI-compatible)', desc: 'Bất kỳ endpoint nào tương thích OpenAI',
        placeholder: 'API Key', priceIn: 0, priceOut: 0,
    },
];

// ── Helpers ──────────────────────────────────────────────────────
export function estimateCost(inputChars: number, outputChars: number, preset: PresetModel): number {
    // Rough estimate: 4 chars ≈ 1 token
    const inputTokens = Math.round(inputChars / 4);
    const outputTokens = Math.round(outputChars / 4);
    return (inputTokens * preset.priceIn + outputTokens * preset.priceOut) / 1_000_000;
}

export const DEFAULT_SETTINGS: TranslateSettings = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    apiKey: '',
    ai302Key: '',
    baseUrl: 'https://api.openai.com/v1',
    customPrompt: '',
};

export function loadTranslateSettings(): TranslateSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS };
        return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } as TranslateSettings;
    } catch {
        return { ...DEFAULT_SETTINGS };
    }
}

export function saveTranslateSettings(s: TranslateSettings): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

export function getActivePreset(): PresetModel {
    const s = loadTranslateSettings();
    return PRESET_MODELS.find(p => p.provider === s.provider && p.model === s.model)
        ?? PRESET_MODELS[0];
}
