import { loadTranslateSettings, DEFAULT_PROMPT, appendUsageRecord, getActivePreset } from './translateSettings';


const BUILT_IN_GEMINI_KEY = "AIzaSyCR6zeN6db7CouFl7Xm0hQiuTlJvwL63Ug";

// ── API caller per provider ─────────────────────────────────────
async function callGeminiAPI(text: string, model: string, apiKey: string, systemPrompt: string): Promise<string> {
    const key = apiKey || BUILT_IN_GEMINI_KEY;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            system_instruction: { parts: [{ text: systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text }] }],
            generationConfig: { temperature: 0.1, topP: 0.8, maxOutputTokens: 65536 },
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message: string } };
        throw new Error(err?.error?.message || `Gemini API error: ${res.status}`);
    }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const result = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!result) throw new Error('Gemini trả về kết quả rỗng');
    return result;
}

async function callOpenAIAPI(text: string, model: string, apiKey: string, baseUrl: string, systemPrompt: string): Promise<string> {
    const url = `${baseUrl.replace(/\/$/, '')}/chat/completions`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: text },
            ],
            temperature: 0.1,
            max_tokens: 16384,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message: string } };
        throw new Error(err?.error?.message || `OpenAI API error: ${res.status}`);
    }
    const data = await res.json() as { choices?: { message?: { content?: string } }[] };
    const result = data?.choices?.[0]?.message?.content;
    if (!result) throw new Error('OpenAI trả về kết quả rỗng');
    return result;
}

async function callAnthropicAPI(text: string, model: string, apiKey: string, systemPrompt: string): Promise<string> {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
            model,
            system: systemPrompt,
            messages: [{ role: 'user', content: text }],
            max_tokens: 16384,
            temperature: 0.1,
        }),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message: string } };
        throw new Error(err?.error?.message || `Anthropic API error: ${res.status}`);
    }
    const data = await res.json() as { content?: { type: string; text?: string }[] };
    const result = data?.content?.find(c => c.type === 'text')?.text;
    if (!result) throw new Error('Claude trả về kết quả rỗng');
    return result;
}

async function callTranslateAPI(text: string): Promise<string> {
    const settings = loadTranslateSettings();
    const prompt = settings.customPrompt.trim() || DEFAULT_PROMPT;

    switch (settings.provider) {
        case 'gemini':
            return callGeminiAPI(text, settings.model, settings.apiKey, prompt);
        case 'openai':
            return callOpenAIAPI(text, settings.model, settings.apiKey, 'https://api.openai.com/v1', prompt);
        case 'anthropic':
            return callAnthropicAPI(text, settings.model, settings.apiKey, prompt);
        case '302ai':
            return callOpenAIAPI(text, settings.model, settings.ai302Key, 'https://api.302.ai/v1', prompt);
        case 'openai-compatible':
            return callOpenAIAPI(text, settings.model, settings.apiKey, settings.baseUrl, prompt);
        default:
            return callGeminiAPI(text, 'gemini-2.5-flash', '', prompt);
    }
}

// ── Code protection helpers ──────────────────────────────────────
function protectCodeBlocks(content: string): { protected: string; map: Map<string, string> } {
    const map = new Map<string, string>();
    let counter = 0;
    let result = content.replace(/(`{3,}|~{3,})([\s\S]*?)\1/g, (_match) => {
        const key = `[CODE_BLOCK_${counter++}]`;
        map.set(key, _match);
        return key;
    });
    result = result.replace(/`([^`\n]+)`/g, (_match) => {
        const key = `[INLINE_CODE_${counter++}]`;
        map.set(key, _match);
        return key;
    });
    return { protected: result, map };
}

function restoreCodeBlocks(content: string, map: Map<string, string>): string {
    let result = content;
    for (const [key, value] of map) {
        result = result.split(key).join(value);
    }
    return result;
}

function splitIntoChunks(content: string, maxChunkSize = 3000): string[] {
    const paragraphs = content.split(/\n{2,}/);
    const chunks: string[] = [];
    let current = '';
    for (const para of paragraphs) {
        if (current.length + para.length + 2 > maxChunkSize && current.length > 0) {
            chunks.push(current);
            current = para;
        } else {
            current = current ? current + '\n\n' + para : para;
        }
    }
    if (current) chunks.push(current);
    return chunks;
}

// ── Main export ───────────────────────────────────────────────────
export async function translateMarkdown(
    content: string,
    onProgress?: (current: number, total: number) => void,
): Promise<string> {
    if (!content.trim()) return content;
    const { protected: protectedContent, map: codeMap } = protectCodeBlocks(content);
    const chunks = splitIntoChunks(protectedContent);
    const translatedChunks: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
        onProgress?.(i + 1, chunks.length);
        const translated = await callTranslateAPI(chunks[i]);
        const cleaned = translated.replace(/^```(?:markdown)?\n?/, '').replace(/\n?```$/, '');
        translatedChunks.push(cleaned);
    }
    const joined = translatedChunks.join('\n\n');
    const result = restoreCodeBlocks(joined, codeMap);

    // ── Track usage ──────────────────────────────────────────────
    try {
        const preset = getActivePreset();
        const inputTokens = Math.round(content.length / 4);
        const outputTokens = Math.round(result.length / 4);
        const costUsd = (inputTokens * preset.priceIn + outputTokens * preset.priceOut) / 1_000_000;
        appendUsageRecord({
            date: new Date().toISOString(),
            model: preset.model || 'custom',
            modelLabel: preset.label,
            inputTokens,
            outputTokens,
            costUsd,
        });
    } catch { /* ignore tracking errors */ }

    return result;
}

