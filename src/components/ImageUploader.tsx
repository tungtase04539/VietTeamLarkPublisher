import React, { useRef, useState, useCallback } from 'react';
import { ImagePlus, X, CheckCircle2, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { generateImageKey, storeImage, deleteImage } from '../lib/imageStore';

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

export default function ImageUploader({ onInsertImage }: ImageUploaderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [images, setImages] = useState<UploadedImage[]>([]);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    const processFiles = useCallback(async (files: FileList | File[]) => {
        const imageFiles = Array.from(files).filter(f => f.type.startsWith('image/'));
        if (imageFiles.length === 0) return;

        for (const file of imageFiles) {
            const key = generateImageKey();
            const dataUrl = await fileToDataUrl(file);
            storeImage(key, dataUrl);                       // store base64 internally
            const preview = URL.createObjectURL(file);     // blob URL just for thumbnail

            const uploaded: UploadedImage = { key, name: file.name, size: file.size, preview };
            setImages(prev => [...prev, uploaded]);

            // Insert clean reference into markdown
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

    return (
        <>
            {/* Trigger button */}
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
                                <span className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Tải ảnh</span>
                            </div>
                            <button onClick={() => setIsOpen(false)} className="p-1 rounded-full hover:bg-[#00000008] dark:hover:bg-[#ffffff10]">
                                <X size={15} className="text-[#86868b]" />
                            </button>
                        </div>

                        {/* Info */}
                        <div className="mx-4 mt-3 px-3 py-2 rounded-xl bg-[#0066cc]/6 dark:bg-[#0a84ff]/8 border border-[#0066cc]/12">
                            <p className="text-[12px] text-[#0066cc] dark:text-[#0a84ff] leading-relaxed">
                                Ảnh được lưu trong bộ nhớ phiên làm việc. Editor hiển thị <code className="bg-[#0066cc]/10 px-1 rounded text-[11px]">img://key</code> — preview và Lark publish đều render đúng.
                            </p>
                        </div>

                        {/* Drop zone */}
                        <div
                            onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
                            onDragLeave={() => setIsDraggingOver(false)}
                            onDrop={handleDrop}
                            onClick={() => inputRef.current?.click()}
                            className={`mx-4 mt-3 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200 flex flex-col items-center justify-center gap-1.5 py-5
                                ${isDraggingOver
                                    ? 'border-[#0066cc] dark:border-[#0a84ff] bg-[#0066cc]/5'
                                    : 'border-[#00000015] dark:border-[#ffffff15] bg-[#00000004] hover:border-[#0066cc]/40 hover:bg-[#0066cc]/3'
                                }`}
                        >
                            <ImagePlus size={20} className={isDraggingOver ? 'text-[#0066cc]' : 'text-[#86868b]'} />
                            <p className="text-[13px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                                {isDraggingOver ? 'Thả ảnh vào đây' : 'Kéo thả hoặc click để chọn ảnh'}
                            </p>
                            <p className="text-[11px] text-[#86868b]">Hỗ trợ chọn nhiều ảnh cùng lúc</p>
                        </div>
                        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />

                        {/* Uploaded list */}
                        {images.length > 0 && (
                            <div className="overflow-y-auto px-4 pb-4 mt-3 space-y-1.5" style={{ maxHeight: '28vh' }}>
                                {images.map(img => (
                                    <div key={img.key} className="flex items-center gap-3 p-2 rounded-xl bg-[#34c759]/8 border border-[#34c759]/20">
                                        <img src={img.preview} alt={img.name} className="w-12 h-9 object-cover rounded-lg shrink-0 border border-[#00000010]" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[12.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{img.name}</p>
                                            <p className="text-[11px] text-[#86868b]">{formatBytes(img.size)}</p>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            <CheckCircle2 size={14} className="text-[#34c759]" />
                                            <button onClick={() => handleRemove(img.key, img.preview)} className="p-1 rounded-full hover:bg-[#ff3b30]/10 text-[#86868b] hover:text-[#ff3b30] transition-colors">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {images.length === 0 && (
                            <p className="text-center text-[12px] text-[#86868b] py-3 pb-4">Chưa có ảnh nào.</p>
                        )}
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}
