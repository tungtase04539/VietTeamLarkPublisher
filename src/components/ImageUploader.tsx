import React, { useRef, useState, useCallback } from 'react';
import { ImagePlus, X, Trash2, Languages, Loader2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateImageKey, storeImage, deleteImage, getImage } from '../lib/imageStore';
import { loadTranslateSettings } from '../lib/translateSettings';

interface UploadedImage {
    key: string;
    name: string;
    size: number;
    preview: string; // blob URL for thumbnail only
}

interface ImageUploaderProps {
    onInsertImage: (markdownSyntax: string) => void;
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

async function translateImageWithGemini(dataUrl: string): Promise<string> {
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
        candidates?: { finishReason?: string; content?: { parts?: { text?: string; inlineData?: { mimeType: string; data: string } }[] } }[]
    };
    console.log('[Nano Banana] Full response:', JSON.stringify(data, null, 2));
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const imgPart = parts.find(p => p.inlineData?.data);
    if (!imgPart?.inlineData) {
        const textMsg = parts.find(p => p.text)?.text ?? '';
        const reason = data.candidates?.[0]?.finishReason ?? 'unknown';
        throw new Error(`Nano Banana (${reason}): ${textMsg.slice(0, 300) || 'Không trả về ảnh. Xem Console để biết chi tiết.'}`);
    }
    return `data:${imgPart.inlineData.mimeType};base64,${imgPart.inlineData.data}`;
}

export default function ImageUploader({ onInsertImage }: ImageUploaderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [images, setImages] = useState<UploadedImage[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [translating, setTranslating] = useState<Record<string, boolean>>({});
    const [translateDone, setTranslateDone] = useState<Record<string, boolean>>({});
    const inputRef = useRef<HTMLInputElement>(null);

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        for (const file of imageFiles) {
            const key = generateImageKey();
            const dataUrl = await fileToDataUrl(file);
            storeImage(key, dataUrl);
            const preview = URL.createObjectURL(file);
            const uploaded: UploadedImage = { key, name: file.name, size: file.size, preview };
            setImages(prev => [...prev, uploaded]);
            const safeName = file.name.replace(/\.[^.]+$/, '');
            onInsertImage(`![${safeName}](img://${key})`);
        }
    }, [onInsertImage]);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) { processFiles(e.target.files); e.target.value = ''; }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); setIsDraggingOver(false);
        if (e.dataTransfer.files) processFiles(e.dataTransfer.files);
    };

    const handleRemove = (key: string, preview: string) => {
        deleteImage(key);
        URL.revokeObjectURL(preview);
        setImages(prev => prev.filter(img => img.key !== key));
    };

    const handleTranslate = async (img: UploadedImage) => {
        const dataUrl = getImage(img.key);
        if (!dataUrl) { alert('Không tìm thấy data ảnh. Hãy tải lại ảnh.'); return; }
        setTranslating(prev => ({ ...prev, [img.key]: true }));
        try {
            const translatedDataUrl = await translateImageWithGemini(dataUrl);
            const newKey = generateImageKey();
            storeImage(newKey, translatedDataUrl);
            const translatedName = img.name.replace(/(\.[^.]+)?$/, '_vi$1');
            setImages(prev => [...prev, { key: newKey, name: translatedName, size: 0, preview: translatedDataUrl }]);
            onInsertImage(`![${translatedName.replace(/\.[^.]+$/, '')}](img://${newKey})`);
            setTranslateDone(prev => ({ ...prev, [img.key]: true }));
            setTimeout(() => setTranslateDone(prev => ({ ...prev, [img.key]: false })), 3000);
        } catch (err) {
            alert(`Dịch ảnh thất bại: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setTranslating(prev => ({ ...prev, [img.key]: false }));
        }
    };

    return (
        <>
            {/* Trigger */}
            <button
                onClick={() => setIsOpen(prev => !prev)}
                title="Tải ảnh lên"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-medium transition-all shrink-0
                    ${isOpen
                        ? 'bg-[#0066cc]/12 dark:bg-[#0a84ff]/15 text-[#0066cc] dark:text-[#0a84ff]'
                        : 'bg-[#00000008] dark:bg-[#ffffff10] text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-[#0066cc]/8'
                    }`}
            >
                <ImagePlus size={13} />
                <span className="hidden sm:inline">Tải ảnh</span>
                {images.length > 0 && (
                    <span className="ml-0.5 bg-[#34c759] dark:bg-[#30d158] text-white rounded-full text-[10px] font-bold w-4 h-4 flex items-center justify-center shrink-0">
                        {images.length}
                    </span>
                )}
            </button>

            {/* Fullscreen Modal */}
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200]"
                            onClick={() => setIsOpen(false)}
                        />
                        {/* Modal panel */}
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
                                <div className="flex items-center gap-2">
                                    <ImagePlus size={15} className="text-[#0066cc] dark:text-[#0a84ff]" />
                                    <span className="text-[14px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                                        Tải & Dịch Ảnh
                                        {images.length > 0 && <span className="ml-1.5 text-[#86868b] font-normal text-[13px]">({images.length} ảnh)</span>}
                                    </span>
                                </div>
                                <button onClick={() => setIsOpen(false)} className="p-1.5 rounded-full hover:bg-[#00000008] dark:hover:bg-[#ffffff10] transition-colors">
                                    <X size={15} className="text-[#86868b]" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-5">
                                {/* Drop zone */}
                                <div
                                    onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                                    onDragLeave={() => setIsDraggingOver(false)}
                                    onDrop={handleDrop}
                                    onClick={() => inputRef.current?.click()}
                                    className={`rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-2 py-8 mb-5
                                        ${isDraggingOver
                                            ? 'border-[#0066cc] dark:border-[#0a84ff] bg-[#0066cc]/5'
                                            : 'border-[#00000015] dark:border-[#ffffff15] bg-[#00000004] hover:border-[#0066cc]/40 hover:bg-[#0066cc]/3'
                                        }`}
                                >
                                    <ImagePlus size={28} className={isDraggingOver ? 'text-[#0066cc]' : 'text-[#86868b]'} />
                                    <p className="text-[13px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                                        {isDraggingOver ? 'Thả ảnh vào đây' : 'Kéo thả hoặc click để chọn ảnh'}
                                    </p>
                                    <p className="text-[11px] text-[#86868b]">Hỗ trợ chọn nhiều ảnh cùng lúc</p>
                                </div>
                                <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />

                                {/* Image grid */}
                                {images.length > 0 ? (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                        {images.map(img => (
                                            <div key={img.key} className="relative group rounded-xl overflow-hidden border border-[#00000012] dark:border-[#ffffff12] bg-[#f5f5f7] dark:bg-[#2c2c2e] shadow-sm">
                                                {/* Image preview */}
                                                <div className="relative w-full" style={{ paddingBottom: '66%' }}>
                                                    <img
                                                        src={img.preview}
                                                        alt={img.name}
                                                        className="absolute inset-0 w-full h-full object-cover"
                                                    />
                                                    {/* Overlay actions */}
                                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-between p-2">
                                                        <motion.button
                                                            whileHover={{ scale: 1.05 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={() => handleTranslate(img)}
                                                            disabled={translating[img.key]}
                                                            title="Dịch nội dung ảnh sang Tiếng Việt"
                                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all shadow-sm ${
                                                                translateDone[img.key]
                                                                    ? 'bg-[#34c759] text-white'
                                                                    : 'bg-white/90 backdrop-blur-sm text-[#1d1d1f] hover:bg-[#0066cc] hover:text-white'
                                                            } disabled:opacity-60`}
                                                        >
                                                            {translating[img.key] ? <Loader2 size={10} className="animate-spin" /> : translateDone[img.key] ? <CheckCircle2 size={10} /> : <Languages size={10} />}
                                                            {translating[img.key] ? 'Đang dịch...' : translateDone[img.key] ? 'Xong!' : 'Dịch ảnh'}
                                                        </motion.button>
                                                        <button
                                                            onClick={() => handleRemove(img.key, img.preview)}
                                                            className="p-1.5 rounded-lg bg-black/40 backdrop-blur-sm text-white/80 hover:text-[#ff3b30] hover:bg-black/60 transition-colors"
                                                            title="Xoá ảnh"
                                                        >
                                                            <Trash2 size={12} />
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Image info */}
                                                <div className="px-2.5 py-2">
                                                    <p className="text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{img.name}</p>
                                                    <div className="flex items-center justify-between mt-0.5">
                                                        <p className="text-[10px] text-[#86868b]">{formatBytes(img.size)}</p>
                                                        <motion.button
                                                            whileHover={{ scale: 1.05 }}
                                                            whileTap={{ scale: 0.95 }}
                                                            onClick={() => handleTranslate(img)}
                                                            disabled={translating[img.key]}
                                                            title="Dịch nội dung ảnh"
                                                            className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                                                                translateDone[img.key]
                                                                    ? 'bg-[#34c759]/15 text-[#1d8d3a] dark:text-[#30d158]'
                                                                    : translating[img.key]
                                                                    ? 'bg-[#0066cc]/10 text-[#0066cc] cursor-not-allowed'
                                                                    : 'bg-[#0066cc]/8 text-[#0066cc] dark:text-[#0a84ff] hover:bg-[#0066cc]/15'
                                                            }`}
                                                        >
                                                            {translating[img.key] ? <Loader2 size={8} className="animate-spin" /> : translateDone[img.key] ? <CheckCircle2 size={8} /> : <Languages size={8} />}
                                                            {translating[img.key] ? 'Dịch...' : translateDone[img.key] ? 'Xong' : 'Dịch'}
                                                        </motion.button>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-center text-[12px] text-[#86868b]/60">Chưa có ảnh nào. Kéo thả hoặc click vào vùng trên để thêm ảnh.</p>
                                )}
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
