const STORAGE_KEY = 'raphael_translate_settings';

export type ModelProvider = 'gemini' | 'openai' | 'anthropic' | 'openai-compatible';

export interface TranslateSettings {
    provider: ModelProvider;
    model: string;          // e.g. "gemini-2.5-flash", "gpt-4o", "claude-3-5-sonnet-20241022"
    apiKey: string;
    baseUrl: string;        // for openai-compatible custom endpoints
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

export const PRESET_MODELS: { provider: ModelProvider; label: string; model: string; placeholder: string }[] = [
    { provider: 'gemini',    label: 'Gemini 2.5 Flash (mặc định)', model: 'gemini-2.5-flash', placeholder: 'AIza...' },
    { provider: 'gemini',    label: 'Gemini 2.0 Flash', model: 'gemini-2.0-flash', placeholder: 'AIza...' },
    { provider: 'gemini',    label: 'Gemini 1.5 Pro', model: 'gemini-1.5-pro', placeholder: 'AIza...' },
    { provider: 'openai',    label: 'GPT-4o', model: 'gpt-4o', placeholder: 'sk-...' },
    { provider: 'openai',    label: 'GPT-4o Mini', model: 'gpt-4o-mini', placeholder: 'sk-...' },
    { provider: 'openai',    label: 'GPT-4 Turbo', model: 'gpt-4-turbo', placeholder: 'sk-...' },
    { provider: 'anthropic', label: 'Claude 3.5 Sonnet', model: 'claude-3-5-sonnet-20241022', placeholder: 'sk-ant-...' },
    { provider: 'anthropic', label: 'Claude 3.5 Haiku', model: 'claude-3-5-haiku-20241022', placeholder: 'sk-ant-...' },
    { provider: 'anthropic', label: 'Claude 3 Opus', model: 'claude-3-opus-20240229', placeholder: 'sk-ant-...' },
    { provider: 'openai-compatible', label: 'Custom (OpenAI-compatible)', model: '', placeholder: 'API Key' },
];

export const DEFAULT_SETTINGS: TranslateSettings = {
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    apiKey: '',   // will use built-in key if empty for gemini
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
