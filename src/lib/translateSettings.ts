const STORAGE_KEY = 'raphael_translate_settings';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | '302ai' | 'openai-compatible';

export interface TranslateSettings {
    provider: ModelProvider;
    model: string;
    apiKey: string;
    ai302Key: string;       // separate field for 302.ai key
    baseUrl: string;        // for custom endpoints
    customPrompt: string;   // empty = use default
}

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
10. HTML tags like <br>, <span>, <p> must be kept exactly as-is.`;

export const AI302_BASE_URL = 'https://api.302.ai/v1';

export interface PresetModel {
    provider: ModelProvider;
    label: string;
    model: string;
    placeholder: string;
    group: string;
}

export const PRESET_MODELS: PresetModel[] = [
    // ── Mặc định ────────────────────────────────────────────
    { group: '🌟 Mặc định',   provider: 'gemini',    label: 'Gemini 2.5 Flash (mặc định, miễn phí)', model: 'gemini-2.5-flash',                placeholder: 'AIza... (để trống = dùng key tích hợp)' },

    // ── 302.ai — 1 key dùng được tất cả ────────────────────
    // Claude mới nhất
    { group: '🔥 302.ai — Claude', provider: '302ai', label: 'Claude Opus 4.6 ★ (mạnh nhất, agentic)',  model: 'claude-opus-4-6',                 placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — Claude', provider: '302ai', label: 'Claude Sonnet 4.6 (cân bằng tốt nhất)',   model: 'claude-sonnet-4-6',               placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — Claude', provider: '302ai', label: 'Claude Haiku 4.5 (nhanh, rẻ)',            model: 'claude-haiku-4-5',                placeholder: 'sk-0POS...' },
    // GPT mới nhất
    { group: '🔥 302.ai — GPT',    provider: '302ai', label: 'GPT-5.4 ★ (mới nhất, reasoning cực mạnh)',model: 'gpt-5.4',                          placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — GPT',    provider: '302ai', label: 'GPT-5.3 Instant (hội thoại tốt)',         model: 'gpt-5.3-instant',                 placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — GPT',    provider: '302ai', label: 'GPT-4o (ổn định, đa năng)',               model: 'gpt-4o',                          placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — GPT',    provider: '302ai', label: 'GPT-4o Mini (nhanh, rẻ)',                 model: 'gpt-4o-mini',                     placeholder: 'sk-0POS...' },
    // Gemini mới nhất
    { group: '🔥 302.ai — Gemini', provider: '302ai', label: 'Gemini 3.1 Pro ★ (77.1% ARC-AGI-2)',     model: 'gemini-3.1-pro',                  placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — Gemini', provider: '302ai', label: 'Gemini 3.1 Flash Lite (siêu nhanh, rẻ)',  model: 'gemini-3.1-flash-lite-preview',   placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — Gemini', provider: '302ai', label: 'Gemini 2.5 Pro (context 1M)',             model: 'gemini-2.5-pro',                  placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — Gemini', provider: '302ai', label: 'Gemini 2.5 Flash (nhanh, rẻ)',            model: 'gemini-2.5-flash',                placeholder: 'sk-0POS...' },
    // DeepSeek mới nhất
    { group: '🔥 302.ai — DeepSeek', provider: '302ai', label: 'DeepSeek V4 ★ (multimodal, mới nhất)', model: 'deepseek-v4',                     placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — DeepSeek', provider: '302ai', label: 'DeepSeek V3.2 (general, agentic)',      model: 'deepseek-v3',                     placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai — DeepSeek', provider: '302ai', label: 'DeepSeek R1 (reasoning, step-by-step)', model: 'deepseek-r1',                     placeholder: 'sk-0POS...' },
    // Grok
    { group: '🔥 302.ai — Grok',   provider: '302ai', label: 'Grok 3 (xAI, mới nhất)',                 model: 'grok-3',                          placeholder: 'sk-0POS...' },

    // ── Gemini direct ───────────────────────────────────────
    { group: '🔵 Gemini direct',  provider: 'gemini',    label: 'Gemini 2.5 Pro',      model: 'gemini-2.5-pro',      placeholder: 'AIza...' },
    { group: '🔵 Gemini direct',  provider: 'gemini',    label: 'Gemini 2.0 Flash',    model: 'gemini-2.0-flash',    placeholder: 'AIza...' },

    // ── OpenAI direct ───────────────────────────────────────
    { group: '🟢 OpenAI direct',  provider: 'openai',    label: 'GPT-4o',              model: 'gpt-4o',              placeholder: 'sk-...' },
    { group: '🟢 OpenAI direct',  provider: 'openai',    label: 'GPT-4o Mini',         model: 'gpt-4o-mini',         placeholder: 'sk-...' },

    // ── Anthropic direct ────────────────────────────────────
    { group: '🟠 Claude direct',  provider: 'anthropic', label: 'Claude Sonnet 4.6',   model: 'claude-sonnet-4-6',   placeholder: 'sk-ant-...' },
    { group: '🟠 Claude direct',  provider: 'anthropic', label: 'Claude Haiku 4.5',    model: 'claude-haiku-4-5',    placeholder: 'sk-ant-...' },

    // ── Custom ──────────────────────────────────────────────
    { group: '⚙️ Custom',  provider: 'openai-compatible', label: 'Custom (OpenAI-compatible)', model: '', placeholder: 'API Key' },
];


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
