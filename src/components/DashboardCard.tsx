import { useState, useRef, useCallback } from 'react';
import { X, Languages, Upload, ImagePlus, Maximize2, Copy, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../lib/useCardStore';
import { translateMarkdown } from '../lib/translate';
import { loadTranslateSettings } from '../lib/translateSettings';
import LarkPublishDialog, { type PublishConfig } from './LarkPublishDialog';
import { runLarkPublish } from '../lib/larkRunner';
import { getThemeAccentHex } from '../lib/themes';
import ThemeSelector from './ThemeSelector';
import { appendLog, appendLog as _logLark, IMAGE_TRANSLATE_COST_USD } from '../lib/cardLog';
import { generateImageKey, storeImage } from '../lib/imageStore';

// ─── Nano Banana image translation ───────────────────────────────────────────

async function translateImageNanoBanana(dataUrl: string): Promise<string> {
    const settings = loadTranslateSettings();
    const apiKey = settings.apiKey || '';
    const [header, base64Data] = dataUrl.split(',');
    const mimeMatch = header.match(/data:([^;]+)/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [
                    { text: 'Translate all text visible in this image to Vietnamese. Keep the exact same visual layout, colors, and design — only change the language of the text.' },
                    { inline_data: { mime_type: mimeType, data: base64Data } },
                ]}],
                generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
            }),
        }
    );
    if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: { message?: string } };
        throw new Error(err?.error?.message ?? `HTTP ${res.status}`);
    }
    const data = await res.json() as {
        candidates?: { finishReason?: string; content?: { parts?: { inlineData?: { mimeType: string; data: string } }[] } }[]
    };
    console.log('[Nano Banana] Full response:', JSON.stringify(data, null, 2));
    const imgPart = (data.candidates?.[0]?.content?.parts ?? []).find(p => p.inlineData?.data);
    if (!imgPart?.inlineData) {
        const textMsg = (data.candidates?.[0]?.content?.parts ?? []).find(p => (p as any).text);
        throw new Error(`Nano Banana không trả về ảnh. finishReason: ${data.candidates?.[0]?.finishReason ?? 'unknown'}${textMsg ? ' | ' + ((textMsg as any).text || '').slice(0, 200) : ''}`);
    }
    return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
}

// ─── Inline Mini Image Uploader ──────────────────────────────────────────────

interface MatchResult {
    basename: string;
    dataUrl: string;
    matched: boolean;
    size: number;
}

function getBasename(filename: string): string {
    return filename.split('/').pop()!.replace(/\.[^.]+$/, '');
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

function replaceImageInMarkdown(
    markdown: string, basename: string, dataUrl: string
): { result: string; count: number } {
    const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let count = 0;

    // Pattern 1: match by URL path containing basename (e.g. ![alt](path/to/basename.png))
    const urlPattern = new RegExp(`(\\]\\()([^)]*(?:^|/)${escaped}(?:\\.[a-zA-Z0-9]+)?)(\\))`, 'g');
    // Pattern 2: Image Token syntax
    const tokenPattern = new RegExp(`!\\[Image Token:\\s*${escaped}\\]\\([^)]+\\)`, 'g');
    // Pattern 3: match by alt text exactly (e.g. ![basename](data:... or any url))
    // This handles the case where image was already embedded as base64 — URL no longer contains basename
    const altPattern = new RegExp(`!\\[${escaped}\\]\\([^)]+\\)`, 'g');

    let result = markdown;

    // Apply URL pattern first (most specific)
    result = result.replace(urlPattern, (_match, open, _url, close) => { count++; return `${open}${dataUrl}${close}`; });
    // Apply token pattern
    result = result.replace(tokenPattern, () => { count++; return `![${basename}](${dataUrl})`; });
    // Apply alt-text pattern only on remaining unmatched occurrences (count still 0 means nothing hit above)
    if (count === 0) {
        result = result.replace(altPattern, () => { count++; return `![${basename}](${dataUrl})`; });
    }

    return { result, count };
}


function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface MiniImageUploaderProps {
    markdownInput: string;
    onMarkdownChange: (val: string) => void;
    cardId: string;
    cardTitle: string;
}

function MiniImageUploader({ markdownInput, onMarkdownChange, cardId, cardTitle }: MiniImageUploaderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<MatchResult[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    // translatedDataUrl maps basename → translated data URL
    const [translations, setTranslations] = useState<Record<string, string>>({});
    const [translating, setTranslating] = useState<Record<string, boolean>>({});
    const [replaced, setReplaced] = useState<Record<string, boolean>>({});
    const inputRef = useRef<HTMLInputElement>(null);

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        let current = markdownInput;
        const newResults: MatchResult[] = [];
        for (const file of imageFiles) {
            const basename = getBasename(file.name);
            const dataUrl = await fileToDataUrl(file);
            // Store in imageStore (img:// key) instead of embedding base64 into markdownInput
            const key = generateImageKey();
            storeImage(key, dataUrl);
            const imgRef = `img://${key}`;
            const { result, count } = replaceImageInMarkdown(current, basename, imgRef);
            if (count > 0) current = result;
            newResults.push({ basename, dataUrl, matched: count > 0, size: file.size });
        }
        if (current !== markdownInput) onMarkdownChange(current);
        setResults(prev => {
            const existingNames = new Set(prev.map(r => r.basename));
            return [...prev, ...newResults.filter(r => !existingNames.has(r.basename))];
        });
    }, [markdownInput, onMarkdownChange]);

    const handleInsertUnmatched = (r: MatchResult) => {
        // Store in imageStore and insert img:// ref
        const key = generateImageKey();
        storeImage(key, r.dataUrl);
        onMarkdownChange(markdownInput + `\n\n![${r.basename}](img://${key})\n`);
        setResults(prev => prev.map(x => x.basename === r.basename ? { ...x, matched: true } : x));
    };

    const handleTranslate = async (r: MatchResult) => {
        setTranslating(prev => ({ ...prev, [r.basename]: true }));
        const t0 = Date.now();
        try {
            const translatedDataUrl = await translateImageNanoBanana(r.dataUrl);
            const durationMs = Date.now() - t0;
            setTranslations(prev => ({ ...prev, [r.basename]: translatedDataUrl }));
            // Log the image translate event (cardId injected from parent via prop, here use 'mini' as fallback)
            appendLog({
                cardId: cardId,
                cardTitle: cardTitle,
                type: 'image_translate',
                timestamp: new Date().toISOString(),
                durationMs,
                costUsd: IMAGE_TRANSLATE_COST_USD,
                imageCount: 1,
                model: 'gemini-3.1-flash-image-preview',
                success: true,
            });
        } catch (err) {
            appendLog({
                cardId: cardId,
                cardTitle: cardTitle,
                type: 'image_translate',
                timestamp: new Date().toISOString(),
                durationMs: Date.now() - t0,
                costUsd: 0,
                imageCount: 1,
                model: 'gemini-3.1-flash-image-preview',
                success: false,
                errorMsg: err instanceof Error ? err.message : String(err),
            });
            alert(`Dịch ảnh thất bại: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setTranslating(prev => ({ ...prev, [r.basename]: false }));
        }
    };

    // Replace original image in markdown with translated version (same name)
    const handleReplace = (r: MatchResult) => {
        const translatedDataUrl = translations[r.basename];
        if (!translatedDataUrl) return;
        // Store translated image via imageStore
        const key = generateImageKey();
        storeImage(key, translatedDataUrl);
        const imgRef = `img://${key}`;
        const { result, count } = replaceImageInMarkdown(markdownInput, r.basename, imgRef);
        if (count > 0) {
            onMarkdownChange(result);
        } else {
            onMarkdownChange(markdownInput + `\n\n![${r.basename}](img://${key})\n`);
        }
        setResults(prev => prev.map(x => x.basename === r.basename ? { ...x, dataUrl: translatedDataUrl } : x));
        setTranslations(prev => { const n = { ...prev }; delete n[r.basename]; return n; });
        setReplaced(prev => ({ ...prev, [r.basename]: true }));
        setTimeout(() => setReplaced(prev => ({ ...prev, [r.basename]: false })), 2500);
    };

    const totalImages = results.length;
    const allMatched = results.length > 0 && results.every(r => r.matched);
    const hasUnmatched = results.some(r => !r.matched);
    // hasImages but with unmatched → orange; all matched → green; no images → red (only if md has content)
    const imgBtnColor = isOpen
        ? 'bg-[#0066cc]/12 text-[#0066cc] dark:bg-[#0a84ff]/15 dark:text-[#0a84ff]'
        : allMatched
        ? 'bg-[#34c759]/10 text-[#1d8d3a] dark:text-[#30d158] hover:bg-[#34c759]/20'
        : hasUnmatched
        ? 'bg-[#ff9500]/10 text-[#ff9500] hover:bg-[#ff9500]/20'
        : markdownInput.trim()
        ? 'bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/20'
        : 'bg-[#00000008] dark:bg-[#ffffff10] text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]';

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(p => !p)}
                title="Tải ảnh lên"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${imgBtnColor}`}
            >
                <ImagePlus size={12} />
                <span>Tải ảnh</span>
                {totalImages > 0 && (
                    <span className={`rounded-full text-[9px] font-bold w-3.5 h-3.5 flex items-center justify-center text-white ${
                        allMatched ? 'bg-[#34c759]' : hasUnmatched ? 'bg-[#ff9500]' : 'bg-[#ff3b30]'
                    }`}>
                        {totalImages}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Fullscreen backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]"
                            onClick={() => setIsOpen(false)}
                        />
                        {/* Fullscreen modal panel */}
                        <motion.div
                            initial={{ opacity: 0, scale: 0.96, y: 16 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96, y: 16 }}
                            transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                            className="fixed inset-4 md:inset-8 bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-[#00000015] dark:border-[#ffffff15] z-[201] flex flex-col overflow-hidden"
                            onClick={e => e.stopPropagation()}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#00000010] dark:border-[#ffffff10] shrink-0">
                                <span className="text-[14px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-2">
                                    <ImagePlus size={15} className="text-[#0066cc] dark:text-[#0a84ff]" />
                                    Tải & Dịch Ảnh
                                    {results.length > 0 && <span className="text-[#86868b] font-normal text-[13px]">({results.length} ảnh)</span>}
                                </span>
                                <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-full hover:bg-[#00000008] dark:hover:bg-[#ffffff10] transition-colors">
                                    <X size={15} className="text-[#86868b]" />
                                </button>
                            </div>

                            {/* Scrollable content */}
                            <div className="flex-1 overflow-y-auto p-5 space-y-5">
                                {/* Drop zone */}
                                <div
                                    onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                                    onDragLeave={() => setIsDragging(false)}
                                    onDrop={e => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); }}
                                    onClick={() => inputRef.current?.click()}
                                    className={`rounded-xl border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-2 py-7 transition-all ${
                                        isDragging ? 'border-[#0066cc] bg-[#0066cc]/5' : 'border-[#00000015] dark:border-[#ffffff15] hover:border-[#0066cc]/40 hover:bg-[#0066cc]/3'
                                    }`}
                                >
                                    <ImagePlus size={26} className={isDragging ? 'text-[#0066cc]' : 'text-[#86868b]'} />
                                    <p className="text-[13px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">{isDragging ? 'Thả ảnh vào đây' : 'Kéo thả hoặc click để chọn ảnh'}</p>
                                    <p className="text-[11px] text-[#86868b]">Hỗ trợ chọn nhiều ảnh cùng lúc</p>
                                </div>
                                <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) { processFiles(e.target.files); e.target.value = ''; }}} />

                                {/* Column headers */}
                                {results.length > 0 && (
                                    <div className="grid grid-cols-2 gap-4 pb-1 border-b border-[#00000008] dark:border-[#ffffff08]">
                                        <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide text-center">Ảnh gốc</p>
                                        <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide text-center">Ảnh đã dịch</p>
                                    </div>
                                )}

                                {/* Side-by-side image rows */}
                                {results.map(r => {
                                    const translatedUrl = translations[r.basename];
                                    const isTranslating = translating[r.basename];
                                    const hasTranslation = !!translatedUrl;
                                    const isReplaced = replaced[r.basename];

                                    return (
                                        <div key={r.basename} className="grid grid-cols-2 gap-4 items-start">
                                            {/* ─── Left: Original ─── */}
                                            <div className="flex flex-col gap-1.5">
                                                <div className="relative rounded-xl overflow-hidden border border-[#00000012] dark:border-[#ffffff12] bg-[#f5f5f7] dark:bg-[#2c2c2e] shadow-sm group">
                                                    <div className="relative w-full" style={{ paddingBottom: '72%' }}>
                                                        <img src={r.dataUrl} alt={r.basename} className="absolute inset-0 w-full h-full object-contain bg-[#f5f5f7] dark:bg-[#2c2c2e]" />

                                                        {/* Overlay: replaced confirmation */}
                                                        {isReplaced && (
                                                            <div className="absolute inset-0 flex items-center justify-center bg-[#34c759]/25 backdrop-blur-sm">
                                                                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#34c759] text-white text-[12px] font-semibold shadow-lg">
                                                                    <CheckCircle2 size={13} />
                                                                    Đã thay thế!
                                                                </div>
                                                            </div>
                                                        )}

                                                        {/* Overlay: translate button centered */}
                                                        {!isReplaced && (
                                                            <div className={`absolute inset-0 flex items-center justify-center transition-opacity ${hasTranslation ? 'opacity-0 group-hover:opacity-100' : 'bg-black/20 opacity-0 group-hover:opacity-100'}`}>
                                                                <button
                                                                    onClick={() => handleTranslate(r)}
                                                                    disabled={isTranslating || hasTranslation}
                                                                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold shadow-lg backdrop-blur-sm transition-all ${
                                                                        hasTranslation
                                                                            ? 'bg-[#34c759]/90 text-white cursor-default'
                                                                            : isTranslating
                                                                            ? 'bg-white/90 text-[#0066cc] cursor-not-allowed'
                                                                            : 'bg-white/90 text-[#1d1d1f] hover:bg-[#0066cc] hover:text-white'
                                                                    }`}
                                                                >
                                                                    {isTranslating
                                                                        ? <Loader2 size={12} className="animate-spin" />
                                                                        : hasTranslation
                                                                        ? <CheckCircle2 size={12} />
                                                                        : <Languages size={12} />}
                                                                    {isTranslating ? 'Đang dịch...' : hasTranslation ? 'Đã dịch' : 'Dịch ảnh'}
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Info row */}
                                                <div className="flex items-center justify-between px-0.5">
                                                    <p className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate max-w-[70%]">{r.basename}</p>
                                                    <p className="text-[10px] text-[#86868b] shrink-0">{r.size > 0 ? formatBytes(r.size) : (r.matched ? '✓ khớp' : '—')}</p>
                                                </div>
                                                {!r.matched && (
                                                    <button onClick={() => handleInsertUnmatched(r)} className="w-full py-1 rounded-lg bg-[#ff9500]/10 text-[#ff9500] text-[10.5px] font-semibold hover:bg-[#ff9500]/20 transition-colors">
                                                        + Chèn vào markdown
                                                    </button>
                                                )}
                                            </div>

                                            {/* ─── Right: Translated ─── */}
                                            <div className="flex flex-col gap-1.5">
                                                <div className={`relative rounded-xl overflow-hidden border bg-[#f5f5f7] dark:bg-[#2c2c2e] shadow-sm group transition-all ${
                                                    hasTranslation ? 'border-[#34c759]/50' : 'border-[#00000012] dark:border-[#ffffff12]'
                                                }`}>
                                                    <div className="relative w-full" style={{ paddingBottom: '72%' }}>
                                                        {hasTranslation ? (
                                                            <>
                                                                <img src={translatedUrl} alt={`${r.basename} (dịch)`} className="absolute inset-0 w-full h-full object-contain bg-[#f5f5f7] dark:bg-[#2c2c2e]" />
                                                                {/* Overlay buttons: Replace + Dịch lại */}
                                                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/30 backdrop-blur-[2px] opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    {/* Replace button */}
                                                                    <button
                                                                        onClick={() => handleReplace(r)}
                                                                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold shadow-lg transition-all ${
                                                                            isReplaced
                                                                                ? 'bg-[#34c759] text-white'
                                                                                : 'bg-white/95 text-[#1d8d3a] hover:bg-[#34c759] hover:text-white'
                                                                        }`}
                                                                    >
                                                                        {isReplaced ? <CheckCircle2 size={12} /> : <CheckCircle2 size={12} />}
                                                                        {isReplaced ? 'Đã thay thế!' : '↩ Thay thế ảnh gốc'}
                                                                    </button>
                                                                    {/* Re-translate button */}
                                                                    <button
                                                                        onClick={() => {
                                                                            setTranslations(prev => { const n = { ...prev }; delete n[r.basename]; return n; });
                                                                            handleTranslate(r);
                                                                        }}
                                                                        disabled={isTranslating}
                                                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-medium shadow-md bg-black/50 text-white/90 hover:bg-black/70 disabled:opacity-50 transition-all"
                                                                    >
                                                                        <Languages size={11} />
                                                                        Dịch lại
                                                                    </button>
                                                                </div>
                                                            </>
                                                        ) : (
                                                            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                                                {isTranslating ? (
                                                                    <>
                                                                        <Loader2 size={24} className="animate-spin text-[#0066cc]" />
                                                                        <p className="text-[11px] text-[#0066cc] font-medium">Đang dịch...</p>
                                                                    </>
                                                                ) : (
                                                                    <>
                                                                        <div className="w-10 h-10 rounded-full bg-[#00000008] dark:bg-[#ffffff08] flex items-center justify-center">
                                                                            <Languages size={20} className="text-[#86868b]/50" />
                                                                        </div>
                                                                        <p className="text-[11px] text-[#86868b]/60">Hover ảnh gốc → Dịch ảnh</p>
                                                                    </>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Info row */}
                                                <div className="flex items-center px-0.5 h-[18px]">
                                                    {hasTranslation && (
                                                        <p className="text-[11px] font-medium text-[#34c759] truncate">{r.basename} <span className="text-[10px] text-[#86868b] font-normal">(dịch)</span></p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}


                                {results.length === 0 && (
                                    <p className="text-center text-[12px] text-[#86868b]/60 py-2">Chưa có ảnh nào. Kéo thả hoặc click vào vùng trên để thêm ảnh.</p>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
}



// ─── Dashboard Card ───────────────────────────────────────────────────────────

interface DashboardCardProps {
    card: Card;
    onUpdate: (id: string, patch: Partial<Omit<Card, 'id'>>) => void;
    onRemove: (id: string) => void;
    onDuplicate: (id: string) => void;
    onOpenSingle: (markdownInput: string, activeTheme: string) => void;
}

export default function DashboardCard({ card, onUpdate, onRemove, onDuplicate, onOpenSingle }: DashboardCardProps) {
    const [isTranslating, setIsTranslating] = useState(false);
    const [translateDone, setTranslateDone] = useState(false);
    const [translateProgress, setTranslateProgress] = useState<{ current: number; total: number } | null>(null);
    const [isPublishOpen, setIsPublishOpen] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishUrl, setPublishUrl] = useState<string | null>(null);
    const [publishError, setPublishError] = useState<string | null>(null);
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);
    const [isDroppingMd, setIsDroppingMd] = useState(false);

    const handleMdDrop = (e: React.DragEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        setIsDroppingMd(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.md') || f.type === 'text/markdown' || f.type === 'text/plain');
        if (files.length === 0) return;
        const file = files[0];
        const reader = new FileReader();
        reader.onload = () => {
            const text = String(reader.result || '');
            if (card.markdownInput.trim() && !window.confirm(`Thả và dịch "${file.name}"?`)) return;
            const title = file.name.replace(/\.md$/i, '');
            onUpdate(card.id, { markdownInput: text, title: title || card.title });
            handleTranslate(text);
        };
        reader.readAsText(file, 'utf-8');
    };

    const handleBackgroundPublish = async (cfg: PublishConfig) => {
        setIsPublishing(true);
        setPublishUrl(null);
        setPublishError(null);
        const t0 = Date.now();
        try {
            const url = await runLarkPublish(
                {
                    title: cfg.title,
                    wikiEnabled: cfg.wikiEnabled,
                    wikiSpaceId: cfg.wikiSpaceId,
                    wikiNodeToken: cfg.wikiNodeToken,
                    accentHex: getThemeAccentHex(card.activeTheme),
                },
                card.markdownInput,
            );
            setPublishUrl(url);
            _logLark({
                cardId: card.id,
                cardTitle: card.title || card.id,
                type: 'lark_publish',
                timestamp: new Date().toISOString(),
                durationMs: Date.now() - t0,
                larkUrl: url,
                success: true,
            });
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setPublishError(msg);
            _logLark({
                cardId: card.id,
                cardTitle: card.title || card.id,
                type: 'lark_publish',
                timestamp: new Date().toISOString(),
                durationMs: Date.now() - t0,
                success: false,
                errorMsg: msg,
            });
        } finally {
            setIsPublishing(false);
        }
    };

    const handleTranslate = async (contentOverride?: string) => {
        const content = contentOverride ?? card.markdownInput;
        if (isTranslating || !content.trim()) return;
        setIsTranslating(true);
        setTranslateDone(false);
        setTranslateProgress(null);
        const t0 = Date.now();
        const inputLen = content.length;
        try {
            const result = await translateMarkdown(
                content,
                (current, total) => setTranslateProgress({ current, total })
            );
            const durationMs = Date.now() - t0;
            const inputTokens = Math.round(inputLen / 4);
            const outputTokens = Math.round(result.length / 4);
            const costUsd = (inputTokens * 0.075 + outputTokens * 0.30) / 1_000_000;
            const settings = loadTranslateSettings();
            appendLog({
                cardId: card.id,
                cardTitle: card.title || card.id,
                type: 'text_translate',
                timestamp: new Date().toISOString(),
                durationMs,
                inputTokens,
                outputTokens,
                costUsd,
                model: settings.model || 'gemini-2.5-flash',
                success: true,
            });
            // Merge any images added to the card DURING translation (user may have uploaded while waiting)
            const currentContent = card.markdownInput; // read latest state at this moment
            const imgLineRegex = /^!\[.*?\]\((?:data:|img:\/\/).+\)$/;
            const resultLines = new Set(result.split('\n').filter(l => imgLineRegex.test(l.trim())));
            const addedImgLines = currentContent
                .split('\n')
                .filter(l => imgLineRegex.test(l.trim()) && !resultLines.has(l));
            const finalResult = addedImgLines.length > 0
                ? result.trimEnd() + '\n\n' + addedImgLines.join('\n')
                : result;
            onUpdate(card.id, { markdownInput: finalResult });
            setTranslateDone(true);
            setTimeout(() => setTranslateDone(false), 3000);
        } catch (err) {
            appendLog({
                cardId: card.id,
                cardTitle: card.title || card.id,
                type: 'text_translate',
                timestamp: new Date().toISOString(),
                durationMs: Date.now() - t0,
                success: false,
                errorMsg: err instanceof Error ? err.message : String(err),
            });
            alert(`Dịch thất bại: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setIsTranslating(false);
            setTranslateProgress(null);
        }
    };

    return (
        <>
            <motion.div
                layout
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -10 }}
                transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                className={`flex flex-col bg-white dark:bg-[#1c1c1e] rounded-2xl border shadow-sm hover:shadow-md transition-all duration-300 overflow-hidden ${
                    translateDone
                        ? 'border-[#34c759]/50 shadow-[0_0_0_1px_rgba(52,199,89,0.2)]'
                        : 'border-[#00000012] dark:border-[#ffffff12]'
                }`}
            >
                {/* Card Header */}
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[#00000008] dark:border-[#ffffff08]">
                    <div className="w-2 h-2 rounded-full bg-gradient-to-br from-[#0066cc] to-[#5ac8fa] shrink-0" />
                    <input
                        value={card.title}
                        onChange={e => onUpdate(card.id, { title: e.target.value })}
                        className="flex-1 text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] bg-transparent outline-none placeholder-[#86868b] truncate"
                        placeholder="Tiêu đề thẻ..."
                    />
                    <div className="flex items-center gap-0.5 shrink-0">
                        <button
                            onClick={() => onDuplicate(card.id)}
                            title="Nhân đôi thẻ"
                            className="p-1 rounded-full text-[#86868b] hover:text-[#0066cc] dark:hover:text-[#0a84ff] hover:bg-[#0066cc]/8 transition-all"
                        >
                            <Copy size={12} />
                        </button>
                        <AnimatePresence>
                            {showConfirmDelete ? (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.8 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.8 }}
                                    className="flex items-center gap-1"
                                >
                                    <button
                                        onClick={() => onRemove(card.id)}
                                        className="px-2 py-0.5 rounded-full bg-[#ff3b30] text-white text-[10px] font-medium"
                                    >
                                        Xoá
                                    </button>
                                    <button
                                        onClick={() => setShowConfirmDelete(false)}
                                        className="px-2 py-0.5 rounded-full bg-[#00000008] dark:bg-[#ffffff10] text-[#86868b] text-[10px] font-medium"
                                    >
                                        Huỷ
                                    </button>
                                </motion.div>
                            ) : (
                                <button
                                    onClick={() => setShowConfirmDelete(true)}
                                    title="Xoá thẻ"
                                    className="p-1 rounded-full text-[#86868b] hover:text-[#ff3b30] hover:bg-[#ff3b30]/8 transition-all"
                                >
                                    <X size={12} />
                                </button>
                            )}
                        </AnimatePresence>
                    </div>
                </div>

                {/* Theme Selector */}
                <div className="border-b border-[#00000008] dark:border-[#ffffff08] overflow-x-auto no-scrollbar">
                    <ThemeSelector
                        activeTheme={card.activeTheme}
                        onThemeChange={(themeId) => onUpdate(card.id, { activeTheme: themeId })}
                    />
                </div>

                {/* Editor */}
                <div className="flex-1 relative">
                    <textarea
                        value={card.markdownInput}
                        onChange={e => onUpdate(card.id, { markdownInput: e.target.value })}
                        placeholder={"Nhập nội dung Markdown...\n\nHoặc kéo thả file .md vào đây"}
                        className={`w-full h-full min-h-[160px] resize-none px-3 py-2.5 text-[12.5px] font-mono text-[#1d1d1f] dark:text-[#f5f5f7] bg-transparent placeholder-[#86868b] outline-none leading-relaxed transition-all ${isDroppingMd ? 'ring-2 ring-inset ring-[#0066cc]/50 bg-[#0066cc]/4' : ''}`}
                        style={{ minHeight: 160 }}
                        onDragOver={e => { if (Array.from(e.dataTransfer.items).some(i => i.kind === 'file')) { e.preventDefault(); setIsDroppingMd(true); } }}
                        onDragLeave={() => setIsDroppingMd(false)}
                        onDrop={handleMdDrop}
                    />
                    {isTranslating && (
                        <div className="absolute inset-0 bg-white/60 dark:bg-black/40 flex items-center justify-center rounded-b-none">
                            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0066cc]/10 dark:bg-[#0a84ff]/10">
                                <Loader2 size={13} className="animate-spin text-[#0066cc] dark:text-[#0a84ff]" />
                                <span className="text-[12px] text-[#0066cc] dark:text-[#0a84ff] font-medium">
                                    {translateProgress
                                        ? `Dịch ${translateProgress.current}/${translateProgress.total}...`
                                        : 'Đang dịch...'}
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Character count hint */}
                <div className="px-3 py-1 flex items-center gap-1">
                    {card.markdownInput.length > 0 ? (
                        <span className="text-[10px] text-[#86868b]">{card.markdownInput.length} ký tự</span>
                    ) : (
                        <span className="text-[10px] text-[#86868b]/50">Trống</span>
                    )}
                </div>

                {/* Action bar */}
                <div className="flex items-center gap-1.5 px-3 pb-3 pt-2 border-t border-[#00000008] dark:border-[#ffffff08]">
                    {/* Left group: Translate + Lark */}
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                        {/* Translate */}
                        <motion.button
                            whileHover={!isTranslating ? { scale: 1.02 } : {}}
                            whileTap={!isTranslating ? { scale: 0.96 } : {}}
                            onClick={() => handleTranslate()}
                            disabled={isTranslating || !card.markdownInput.trim()}
                            title="Dịch sang Tiếng Việt"
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all disabled:opacity-50 ${
                                translateDone
                                    ? 'bg-[#34c759]/14 text-[#1d8d3a] dark:text-[#30d158]'
                                    : isTranslating
                                    ? 'bg-[#0066cc]/10 text-[#0066cc] dark:bg-[#0a84ff]/12 dark:text-[#0a84ff] cursor-not-allowed'
                                    : 'bg-[#0066cc]/8 text-[#0066cc] dark:bg-[#0a84ff]/10 dark:text-[#0a84ff] hover:bg-[#0066cc]/15 dark:hover:bg-[#0a84ff]/18'
                            }`}
                        >
                            {translateDone ? (
                                <CheckCircle2 size={12} />
                            ) : isTranslating ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <Languages size={12} />
                            )}
                            <span>{translateDone ? 'Xong!' : isTranslating ? 'Đang dịch...' : 'Dịch Việt'}</span>
                        </motion.button>

                        {/* Lark Publish */}
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setIsPublishOpen(true)}
                            disabled={!card.markdownInput.trim() || isPublishing}
                            title={isPublishing ? 'Đang đăng lên Lark...' : 'Đăng lên Lark'}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition-all disabled:opacity-60 ${
                                isPublishing
                                    ? 'bg-[#1456f0]/10 text-[#1456f0] cursor-not-allowed'
                                    : publishError
                                    ? 'bg-[#ff3b30]/10 text-[#ff3b30] hover:bg-[#ff3b30]/20'
                                    : 'bg-[#5b21b6]/8 text-[#5b21b6] dark:bg-[#7c3aed]/10 dark:text-[#a78bfa] hover:bg-[#5b21b6]/15'
                            }`}
                        >
                            {isPublishing ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                            <span>{isPublishing ? 'Đăng...' : publishError ? 'Lỗi!' : 'Đăng Lark'}</span>
                        </motion.button>

                        {/* Success link */}
                        {publishUrl && (
                            <motion.a
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{ opacity: 1, scale: 1 }}
                                href={publishUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title={publishUrl}
                                className="flex items-center gap-1 px-2 py-1.5 rounded-full text-[11px] font-semibold bg-[#34c759]/12 text-[#1d8d3a] dark:text-[#30d158] hover:bg-[#34c759]/22 transition-all"
                            >
                                <ExternalLink size={11} />
                                Xem bài
                            </motion.a>
                        )}

                        {publishError && (
                            <span title={publishError} className="text-[10px] text-[#ff3b30] max-w-[80px] truncate cursor-help">
                                {publishError.slice(0, 22)}…
                            </span>
                        )}
                    </div>

                    {/* Right group: Image upload + Open single */}
                    <div className="flex items-center gap-1 shrink-0">
                        <MiniImageUploader
                            markdownInput={card.markdownInput}
                            onMarkdownChange={val => onUpdate(card.id, { markdownInput: val })}
                            cardId={card.id}
                            cardTitle={card.title || card.id}
                        />

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => onOpenSingle(card.markdownInput, card.activeTheme)}
                            title="Mở chế độ đơn (Single Mode)"
                            className="p-1.5 rounded-full text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/6 dark:hover:bg-white/10 transition-all"
                        >
                            <Maximize2 size={13} />
                        </motion.button>
                    </div>
                </div>
            </motion.div>

            {/* Lark Publish Dialog (per card) */}
            <LarkPublishDialog
                isOpen={isPublishOpen}
                onClose={() => setIsPublishOpen(false)}
                markdownInput={card.markdownInput}
                activeTheme={card.activeTheme}
                cardId={card.id}
                cardTitle={card.title || card.id}
                onPublishStarted={handleBackgroundPublish}
            />
        </>
    );
}
