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
    { group: '🌟 Mặc định',   provider: 'gemini',    label: 'Gemini 2.5 Flash (mặc định, miễn phí)', model: 'gemini-2.5-flash',            placeholder: 'AIza... (để trống = dùng key tích hợp)' },

    // ── 302.ai — 1 key dùng được tất cả ────────────────────
    { group: '🔥 302.ai',     provider: '302ai',      label: 'Claude 3.5 Sonnet',                      model: 'claude-3-5-sonnet-20241022',   placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai',     provider: '302ai',      label: 'Claude 3.5 Haiku (nhanh, rẻ)',           model: 'claude-3-5-haiku-20241022',    placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai',     provider: '302ai',      label: 'GPT-4o',                                 model: 'gpt-4o',                       placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai',     provider: '302ai',      label: 'GPT-4o Mini (nhanh, rẻ)',                model: 'gpt-4o-mini',                  placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai',     provider: '302ai',      label: 'Gemini 2.5 Pro',                         model: 'gemini-2.5-pro',               placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai',     provider: '302ai',      label: 'Gemini 2.5 Flash',                       model: 'gemini-2.5-flash',             placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai',     provider: '302ai',      label: 'DeepSeek V3',                            model: 'deepseek-v3',                  placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai',     provider: '302ai',      label: 'DeepSeek R1 (reasoning)',                model: 'deepseek-r1',                  placeholder: 'sk-0POS...' },
    { group: '🔥 302.ai',     provider: '302ai',      label: 'Grok 3',                                 model: 'grok-3',                       placeholder: 'sk-0POS...' },

    // ── Gemini direct ───────────────────────────────────────
    { group: '🔵 Gemini',     provider: 'gemini',    label: 'Gemini 2.0 Flash',                       model: 'gemini-2.0-flash',             placeholder: 'AIza...' },
    { group: '🔵 Gemini',     provider: 'gemini',    label: 'Gemini 1.5 Pro',                         model: 'gemini-1.5-pro',               placeholder: 'AIza...' },

    // ── OpenAI direct ───────────────────────────────────────
    { group: '🟢 OpenAI',     provider: 'openai',    label: 'GPT-4o',                                 model: 'gpt-4o',                       placeholder: 'sk-...' },
    { group: '🟢 OpenAI',     provider: 'openai',    label: 'GPT-4o Mini',                            model: 'gpt-4o-mini',                  placeholder: 'sk-...' },

    // ── Anthropic direct ────────────────────────────────────
    { group: '🟠 Claude',     provider: 'anthropic', label: 'Claude 3.5 Sonnet',                      model: 'claude-3-5-sonnet-20241022',   placeholder: 'sk-ant-...' },
    { group: '🟠 Claude',     provider: 'anthropic', label: 'Claude 3.5 Haiku',                       model: 'claude-3-5-haiku-20241022',    placeholder: 'sk-ant-...' },

    // ── Custom ──────────────────────────────────────────────
    { group: '⚙️ Custom',     provider: 'openai-compatible', label: 'Custom (OpenAI-compatible)',     model: '',                             placeholder: 'API Key' },
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
