import React, { useRef, useState, useCallback } from 'react';
import { ImagePlus, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MatchResult {
    file: File;
    basename: string;
    dataUrl: string;
    matched: boolean; // true = found in markdown and replaced
}

interface ImageUploaderProps {
    markdownInput: string;
    onMarkdownChange: (val: string) => void;
    onInsertImage: (markdownSyntax: string) => void; // fallback for unmatched
}

function formatBytes(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

/**
 * Get the base name of a file — no extension, no path.
 * "images/HhrkbqMWQoZEdWxsMyOc6xf0nMc.png" → "HhrkbqMWQoZEdWxsMyOc6xf0nMc"
 * "HhrkbqMWQoZEdWxsMyOc6xf0nMc.png"         → "HhrkbqMWQoZEdWxsMyOc6xf0nMc"
 */
function getBasename(filename: string): string {
    return filename
        .split('/').pop()!       // remove directory prefix
        .replace(/\.[^.]+$/, ''); // remove extension
}

/**
 * Replace image URL in markdown for a given basename.
 * Matches pattern: ](anything/{basename}.anyExt)
 * or ](  {basename}.anyExt)
 */
function replaceImageInMarkdown(markdown: string, basename: string, dataUrl: string): { result: string; count: number } {
    // Escape special regex characters in the basename
    const escaped = basename.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match the URL part inside ![...](HERE)
    const regex = new RegExp(`(\\]\\()([^)]*(?:^|/)${escaped}(?:\\.[a-zA-Z0-9]+)?)(\\))`, 'g');
    let count = 0;
    const result = markdown.replace(regex, (_match, open, _url, close) => {
        count++;
        return `${open}${dataUrl}${close}`;
    });
    return { result, count };
}

export default function ImageUploader({ markdownInput, onMarkdownChange, onInsertImage }: ImageUploaderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [results, setResults] = useState<MatchResult[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const totalMatched = results.filter(r => r.matched).length;
    const unmatched = results.filter(r => !r.matched);

    const processFiles = useCallback(async (files: FileList | File[], currentMarkdown: string) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        let updatedMarkdown = currentMarkdown;
        const newResults: MatchResult[] = [];

        for (const file of imageFiles) {
            const basename = getBasename(file.name);
            const dataUrl = await fileToDataUrl(file);
            const { result, count } = replaceImageInMarkdown(updatedMarkdown, basename, dataUrl);
            const matched = count > 0;
            if (matched) {
                updatedMarkdown = result;
            }
            newResults.push({ file, basename, dataUrl, matched });
        }

        // Apply all matched replacements at once
        if (updatedMarkdown !== currentMarkdown) {
            onMarkdownChange(updatedMarkdown);
        }

        setResults(prev => [...prev, ...newResults]);
    }, [onMarkdownChange]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            processFiles(e.target.files, markdownInput);
            e.target.value = '';
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDraggingOver(false);
        if (e.dataTransfer.files) processFiles(e.dataTransfer.files, markdownInput);
    };

    const handleInsertUnmatched = (r: MatchResult) => {
        onInsertImage(`![${r.basename}](${r.dataUrl})`);
        setResults(prev => prev.filter(x => x.basename !== r.basename));
    };

    const handleClear = () => setResults([]);

    return (
        <>
            {/* Trigger button */}
            <button
                onClick={() => setIsOpen(prev => !prev)}
                title="Tải ảnh lên — tự động khớp theo tên file trong Markdown"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-all shrink-0
                    ${isOpen
                        ? 'bg-[#0066cc]/12 dark:bg-[#0a84ff]/15 text-[#0066cc] dark:text-[#0a84ff]'
                        : 'bg-[#00000008] dark:bg-[#ffffff10] text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-[#0066cc]/8'
                    }`}
            >
                <ImagePlus size={13} />
                <span className="hidden sm:inline">Tải ảnh</span>
                {totalMatched > 0 && (
                    <span className="ml-0.5 bg-[#34c759] dark:bg-[#30d158] text-white rounded-full text-[10px] font-bold w-4 h-4 flex items-center justify-center shrink-0">
                        {totalMatched}
                    </span>
                )}
            </button>

            {/* Panel */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 8, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                        className="absolute bottom-full left-0 right-0 mb-2 mx-2 sm:mx-4 bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-apple-lg border border-[#00000015] dark:border-[#ffffff15] z-50 overflow-hidden"
                        style={{ maxHeight: '65vh' }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[#00000010] dark:border-[#ffffff10]">
                            <div className="flex items-center gap-2">
                                <ImagePlus size={15} className="text-[#0066cc] dark:text-[#0a84ff]" />
                                <span className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Tải ảnh tự động</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {results.length > 0 && (
                                    <button
                                        onClick={handleClear}
                                        className="text-[11px] text-[#86868b] hover:text-[#ff3b30] dark:hover:text-[#ff453a] transition-colors px-2 py-0.5 rounded-full hover:bg-[#ff3b30]/8"
                                    >
                                        Xóa tất cả
                                    </button>
                                )}
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="p-1 rounded-full hover:bg-[#00000008] dark:hover:bg-[#ffffff10]"
                                >
                                    <X size={15} className="text-[#86868b]" />
                                </button>
                            </div>
                        </div>

                        {/* How it works hint */}
                        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-[#0066cc]/6 dark:bg-[#0a84ff]/8 border border-[#0066cc]/12 dark:border-[#0a84ff]/20">
                            <p className="text-[12px] text-[#0066cc] dark:text-[#0a84ff] leading-relaxed">
                                <span className="font-semibold">Cách dùng:</span> Tải ảnh có tên trùng với tên file trong Markdown (VD: <code className="bg-[#0066cc]/10 px-1 rounded text-[11px]">HhrkbqMW.png</code> → tự động thay thế <code className="bg-[#0066cc]/10 px-1 rounded text-[11px]">images/HhrkbqMW.png</code>)
                            </p>
                        </div>

                        {/* Drop zone */}
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                            onDragLeave={() => setIsDraggingOver(false)}
                            onDrop={handleDrop}
                            onClick={() => inputRef.current?.click()}
                            className={`mx-4 mt-3 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-1.5 py-4
                                ${isDraggingOver
                                    ? 'border-[#0066cc] dark:border-[#0a84ff] bg-[#0066cc]/5'
                                    : 'border-[#00000015] dark:border-[#ffffff15] bg-[#00000004] hover:border-[#0066cc]/40 hover:bg-[#0066cc]/3'
                                }`}
                        >
                            <ImagePlus size={20} className={isDraggingOver ? 'text-[#0066cc] dark:text-[#0a84ff]' : 'text-[#86868b]'} />
                            <p className="text-[13px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                                {isDraggingOver ? 'Thả ảnh vào đây' : 'Kéo thả hoặc click để chọn ảnh'}
                            </p>
                            <p className="text-[11px] text-[#86868b]">Hỗ trợ chọn nhiều ảnh cùng lúc</p>
                        </div>
                        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />

                        {/* Results list */}
                        {results.length > 0 && (
                            <div className="overflow-y-auto px-4 pb-4 mt-3 space-y-1.5" style={{ maxHeight: '28vh' }}>
                                {/* Summary bar */}
                                <div className="flex items-center gap-3 mb-2">
                                    {totalMatched > 0 && (
                                        <span className="flex items-center gap-1 text-[12px] font-medium text-[#1d8d3a] dark:text-[#30d158]">
                                            <CheckCircle2 size={13} />
                                            {totalMatched} ảnh tự động khớp
                                        </span>
                                    )}
                                    {unmatched.length > 0 && (
                                        <span className="flex items-center gap-1 text-[12px] font-medium text-[#ff9500] dark:text-[#ff9f0a]">
                                            <AlertCircle size={13} />
                                            {unmatched.length} không tìm thấy trong Markdown
                                        </span>
                                    )}
                                </div>

                                {results.map((r) => (
                                    <div
                                        key={r.basename}
                                        className={`flex items-center gap-3 p-2 rounded-xl transition-colors ${
                                            r.matched
                                                ? 'bg-[#34c759]/8 dark:bg-[#30d158]/8 border border-[#34c759]/20 dark:border-[#30d158]/20'
                                                : 'bg-[#ff9500]/8 dark:bg-[#ff9f0a]/8 border border-[#ff9500]/20 dark:border-[#ff9f0a]/20'
                                        }`}
                                    >
                                        {/* Thumbnail */}
                                        <img
                                            src={r.dataUrl}
                                            alt={r.basename}
                                            className="w-12 h-9 object-cover rounded-lg shrink-0 border border-[#00000010]"
                                        />

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{r.basename}</p>
                                            <p className="text-[11px] text-[#86868b]">{formatBytes(r.file.size)}</p>
                                        </div>

                                        {/* Status / Action */}
                                        {r.matched ? (
                                            <div className="flex items-center gap-1 text-[#1d8d3a] dark:text-[#30d158] shrink-0">
                                                <CheckCircle2 size={15} />
                                                <span className="text-[12px] font-medium hidden sm:inline">Đã khớp</span>
                                            </div>
                                        ) : (
                                            <button
                                                onClick={() => handleInsertUnmatched(r)}
                                                className="shrink-0 px-2.5 py-1 rounded-full bg-[#ff9500] dark:bg-[#ff9f0a] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                                            >
                                                Chèn tại cursor
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        {results.length === 0 && (
                            <p className="text-center text-[12px] text-[#86868b] py-3 pb-4">
                                Chưa có ảnh nào được tải lên.
                            </p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
