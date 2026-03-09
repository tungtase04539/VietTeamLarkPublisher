import { useState, useRef, useCallback } from 'react';
import { X, Languages, Upload, ImagePlus, Maximize2, Copy, CheckCircle2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card } from '../lib/useCardStore';
import { translateMarkdown } from '../lib/translate';
import LarkPublishDialog from './LarkPublishDialog';

// ─── Inline Mini Image Uploader ──────────────────────────────────────────────

interface MatchResult {
    file: File;
    basename: string;
    dataUrl: string;
    matched: boolean;
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
    const regex = new RegExp(`(\\]\\()([^)]*(?:^|/)${escaped}(?:\\.[a-zA-Z0-9]+)?)(\\))`, 'g');
    let count = 0;
    const result = markdown.replace(regex, (_match, open, _url, close) => {
        count++;
        return `${open}${dataUrl}${close}`;
    });
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
}

function MiniImageUploader({ markdownInput, onMarkdownChange }: MiniImageUploaderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<MatchResult[]>([]);
    const [isDragging, setIsDragging] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const totalMatched = results.filter(r => r.matched).length;

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;
        let updated = markdownInput;
        const newResults: MatchResult[] = [];
        for (const file of imageFiles) {
            const basename = getBasename(file.name);
            const dataUrl = await fileToDataUrl(file);
            const { result, count } = replaceImageInMarkdown(updated, basename, dataUrl);
            if (count > 0) updated = result;
            newResults.push({ file, basename, dataUrl, matched: count > 0 });
        }
        if (updated !== markdownInput) onMarkdownChange(updated);
        setResults(prev => [...prev, ...newResults]);
    }, [markdownInput, onMarkdownChange]);

    const handleInsertUnmatched = (r: MatchResult) => {
        const cursor = `![${r.basename}](${r.dataUrl})\n`;
        onMarkdownChange(markdownInput + '\n' + cursor);
        setResults(prev => prev.filter(x => x.basename !== r.basename));
    };

    return (
        <div className="relative">
            <button
                onClick={() => setIsOpen(p => !p)}
                title="Tải ảnh lên"
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                    isOpen
                        ? 'bg-[#0066cc]/12 text-[#0066cc] dark:bg-[#0a84ff]/15 dark:text-[#0a84ff]'
                        : 'bg-[#00000008] dark:bg-[#ffffff10] text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'
                }`}
            >
                <ImagePlus size={12} />
                <span>Tải ảnh</span>
                {totalMatched > 0 && (
                    <span className="bg-[#34c759] text-white rounded-full text-[9px] font-bold w-3.5 h-3.5 flex items-center justify-center">
                        {totalMatched}
                    </span>
                )}
            </button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 6, scale: 0.97 }}
                        transition={{ duration: 0.15 }}
                        className="absolute bottom-full left-0 mb-2 w-72 bg-white dark:bg-[#1c1c1e] rounded-xl shadow-apple-lg border border-[#00000015] dark:border-[#ffffff15] z-50 overflow-hidden"
                    >
                        <div className="flex items-center justify-between px-3 py-2 border-b border-[#00000010] dark:border-[#ffffff10]">
                            <span className="text-[12px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] flex items-center gap-1.5">
                                <ImagePlus size={12} className="text-[#0066cc] dark:text-[#0a84ff]" />
                                Tải ảnh tự động
                            </span>
                            <button onClick={() => setIsOpen(false)} className="p-0.5 rounded-full hover:bg-[#00000008]">
                                <X size={13} className="text-[#86868b]" />
                            </button>
                        </div>

                        {/* Drop zone */}
                        <div
                            onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
                            onDragLeave={() => setIsDragging(false)}
                            onDrop={e => { e.preventDefault(); setIsDragging(false); processFiles(e.dataTransfer.files); }}
                            onClick={() => inputRef.current?.click()}
                            className={`mx-3 my-2.5 rounded-lg border-2 border-dashed cursor-pointer flex flex-col items-center justify-center gap-1 py-3 transition-all ${
                                isDragging
                                    ? 'border-[#0066cc] bg-[#0066cc]/5'
                                    : 'border-[#00000015] dark:border-[#ffffff15] hover:border-[#0066cc]/40 hover:bg-[#0066cc]/3'
                            }`}
                        >
                            <ImagePlus size={18} className={isDragging ? 'text-[#0066cc]' : 'text-[#86868b]'} />
                            <p className="text-[12px] text-[#86868b]">{isDragging ? 'Thả ảnh vào đây' : 'Kéo thả hoặc click chọn ảnh'}</p>
                        </div>
                        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (e.target.files) { processFiles(e.target.files); e.target.value = ''; } }} />

                        {/* Results */}
                        {results.length > 0 && (
                            <div className="mx-3 mb-3 space-y-1 max-h-32 overflow-y-auto">
                                {results.map(r => (
                                    <div key={r.basename} className={`flex items-center gap-2 p-1.5 rounded-lg text-[11px] ${r.matched ? 'bg-[#34c759]/8 border border-[#34c759]/20' : 'bg-[#ff9500]/8 border border-[#ff9500]/20'}`}>
                                        <img src={r.dataUrl} alt={r.basename} className="w-8 h-6 object-cover rounded shrink-0" />
                                        <span className="flex-1 truncate font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">{r.basename}</span>
                                        <span className="text-[10px] text-[#86868b] shrink-0">{formatBytes(r.file.size)}</span>
                                        {r.matched ? (
                                            <CheckCircle2 size={12} className="text-[#34c759] shrink-0" />
                                        ) : (
                                            <button onClick={() => handleInsertUnmatched(r)} className="shrink-0 px-1.5 py-0.5 rounded bg-[#ff9500] text-white text-[10px]">Chèn</button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </motion.div>
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
    const [showConfirmDelete, setShowConfirmDelete] = useState(false);

    const handleTranslate = async () => {
        if (isTranslating || !card.markdownInput.trim()) return;
        setIsTranslating(true);
        setTranslateDone(false);
        setTranslateProgress(null);
        try {
            const result = await translateMarkdown(
                card.markdownInput,
                (current, total) => setTranslateProgress({ current, total })
            );
            onUpdate(card.id, { markdownInput: result });
            setTranslateDone(true);
            setTimeout(() => setTranslateDone(false), 2500);
        } catch (err) {
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
                className="flex flex-col bg-white dark:bg-[#1c1c1e] rounded-2xl border border-[#00000012] dark:border-[#ffffff12] shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden"
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

                {/* Editor */}
                <div className="flex-1 relative">
                    <textarea
                        value={card.markdownInput}
                        onChange={e => onUpdate(card.id, { markdownInput: e.target.value })}
                        placeholder="Nhập nội dung Markdown..."
                        className="w-full h-full min-h-[160px] resize-none px-3 py-2.5 text-[12.5px] font-mono text-[#1d1d1f] dark:text-[#f5f5f7] bg-transparent placeholder-[#86868b] outline-none leading-relaxed"
                        style={{ minHeight: 160 }}
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
                <div className="flex items-center gap-1.5 px-3 pb-3 pt-1 border-t border-[#00000008] dark:border-[#ffffff08] flex-wrap">
                    {/* Image Upload */}
                    <MiniImageUploader
                        markdownInput={card.markdownInput}
                        onMarkdownChange={val => onUpdate(card.id, { markdownInput: val })}
                    />

                    {/* Translate */}
                    <motion.button
                        whileHover={!isTranslating ? { scale: 1.02 } : {}}
                        whileTap={!isTranslating ? { scale: 0.96 } : {}}
                        onClick={handleTranslate}
                        disabled={isTranslating || !card.markdownInput.trim()}
                        title="Dịch sang Tiếng Việt"
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium transition-all disabled:opacity-50 ${
                            translateDone
                                ? 'bg-[#34c759]/12 text-[#1d8d3a] dark:text-[#30d158]'
                                : isTranslating
                                ? 'bg-[#0066cc]/10 text-[#0066cc] dark:bg-[#0a84ff]/10 dark:text-[#0a84ff] cursor-not-allowed'
                                : 'bg-[#00000008] dark:bg-[#ffffff10] text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-[#0066cc]/8'
                        }`}
                    >
                        {translateDone ? (
                            <CheckCircle2 size={12} />
                        ) : isTranslating ? (
                            <Loader2 size={12} className="animate-spin" />
                        ) : (
                            <Languages size={12} />
                        )}
                        <span>{translateDone ? 'Xong!' : isTranslating ? '...' : 'Dịch Việt'}</span>
                    </motion.button>

                    {/* Lark Publish */}
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => setIsPublishOpen(true)}
                        disabled={!card.markdownInput.trim()}
                        title="Đăng lên Lark"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-[#1456f0]/8 text-[#1456f0] dark:bg-[#3b82f6]/10 dark:text-[#60a5fa] hover:bg-[#1456f0]/15 transition-all disabled:opacity-50"
                    >
                        <Upload size={12} />
                        <span>Lark</span>
                    </motion.button>

                    {/* Spacer */}
                    <div className="flex-1" />

                    {/* Open Single Mode */}
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => onOpenSingle(card.markdownInput, card.activeTheme)}
                        title="Mở chế độ đơn (Single Mode) với nội dung này"
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[12px] font-medium bg-black/5 dark:bg-white/8 text-[#1d1d1f] dark:text-[#f5f5f7] hover:bg-black/10 dark:hover:bg-white/12 transition-all"
                    >
                        <Maximize2 size={12} />
                        <span>Mở đơn</span>
                    </motion.button>
                </div>
            </motion.div>

            {/* Lark Publish Dialog (per card) */}
            <LarkPublishDialog
                isOpen={isPublishOpen}
                onClose={() => setIsPublishOpen(false)}
                markdownInput={card.markdownInput}
                activeTheme={card.activeTheme}
            />
        </>
    );
}
