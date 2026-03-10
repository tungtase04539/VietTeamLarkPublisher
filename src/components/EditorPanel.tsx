import React, { useRef, useEffect, useState } from 'react';

import { Wand2 } from 'lucide-react';
import { handleSmartPaste } from '../lib/htmlToMarkdown';
import ImageUploader from './ImageUploader';

interface EditorPanelProps {
    markdownInput: string;
    onInputChange: (value: string) => void;
    editorScrollRef: React.RefObject<HTMLTextAreaElement>;
    onEditorScroll: () => void;
    scrollSyncEnabled: boolean;
}

export default function EditorPanel({ markdownInput, onInputChange, editorScrollRef, onEditorScroll, scrollSyncEnabled }: EditorPanelProps) {
    const lastSelectionRef = useRef<{ start: number; end: number }>({ start: 0, end: 0 });
    // currentMarkdownRef stays in sync synchronously so batch insertions don't use stale closure value
    const currentMarkdownRef = useRef(markdownInput);
    useEffect(() => { currentMarkdownRef.current = markdownInput; }, [markdownInput]);
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
            if (markdownInput.trim() && !window.confirm(`Thay thế nội dung hiện tại bằng "${file.name}"?`)) return;
            onInputChange(text);
        };
        reader.readAsText(file, 'utf-8');
    };

    const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        handleSmartPaste(e, markdownInput, onInputChange);
    };

    const trackSelection = () => {
        const el = editorScrollRef.current;
        if (!el) return;
        lastSelectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
    };

    const handleInsertImage = (markdownSyntax: string) => {
        // Use ref so consecutive calls in the same event tick see the latest value
        const currentMarkdown = currentMarkdownRef.current;

        // ── Smart match: replace existing Image Token refs in-place ─
        const newSrcMatch = markdownSyntax.match(/\(img:\/\/([^)]+)\)/);
        const altMatch = markdownSyntax.match(/^!\[([^\]]*)\]/);
        if (newSrcMatch && altMatch) {
            const newImgSrc = `img://${newSrcMatch[1]}`;
            const altText = altMatch[1];

            const tokenPattern = new RegExp(
                `!\\[Image Token:\\s*${altText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\([^)]+\\)`,
                'g'
            );
            const localPattern = new RegExp(
                `!\\[[^\\]]*\\]\\(images/${altText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:\\.[a-z]+)?\\)`,
                'g'
            );

            const withTokenReplaced = currentMarkdown.replace(tokenPattern, `![${altText}](${newImgSrc})`);
            if (withTokenReplaced !== currentMarkdown) {
                currentMarkdownRef.current = withTokenReplaced; // update ref synchronously
                onInputChange(withTokenReplaced);
                return;
            }
            const withLocalReplaced = currentMarkdown.replace(localPattern, `![${altText}](${newImgSrc})`);
            if (withLocalReplaced !== currentMarkdown) {
                currentMarkdownRef.current = withLocalReplaced;
                onInputChange(withLocalReplaced);
                return;
            }
        }

        // ── Default: insert at cursor position ──────────────────────
        const { start, end } = lastSelectionRef.current;
        const before = currentMarkdown.substring(0, start);
        const after = currentMarkdown.substring(end);
        const needsLeadingNewline = before.length > 0 && !before.endsWith('\n\n');
        const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');
        const prefix = needsLeadingNewline ? '\n\n' : '';
        const suffix = needsTrailingNewline ? '\n\n' : '';
        const inserted = `${prefix}${markdownSyntax}${suffix}`;
        const newValue = before + inserted + after;
        currentMarkdownRef.current = newValue; // update ref synchronously
        onInputChange(newValue);

        setTimeout(() => {
            const el = editorScrollRef.current;
            if (!el) return;
            el.focus();
            const newPos = start + inserted.length;
            el.selectionStart = el.selectionEnd = newPos;
            lastSelectionRef.current = { start: newPos, end: newPos };
        }, 0);
    };



    return (
        <div className="border-r border-[#00000015] dark:border-[#ffffff15] flex flex-col relative z-30 bg-transparent flex-1 min-h-0">
            <textarea
                ref={editorScrollRef}
                className={`w-full flex-1 p-8 md:p-10 resize-none bg-transparent outline-none font-mono text-[15px] md:text-[16px] leading-[1.8] no-scrollbar text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] dark:placeholder-[#6e6e73] transition-all ${
                    isDroppingMd ? 'ring-2 ring-inset ring-[#0066cc]/50 bg-[#0066cc]/4' : ''
                }`}
                value={markdownInput}
                onChange={(e) => onInputChange(e.target.value)}
                onPaste={onPaste}
                onScroll={scrollSyncEnabled ? onEditorScroll : undefined}
                onKeyUp={trackSelection}
                onMouseUp={trackSelection}
                onClick={trackSelection}
                onKeyDown={trackSelection}
                onDragOver={(e) => { if (Array.from(e.dataTransfer.items).some(i => i.type === 'text/plain' || i.kind === 'file')) { e.preventDefault(); setIsDroppingMd(true); } }}
                onDragLeave={() => setIsDroppingMd(false)}
                onDrop={handleMdDrop}
                placeholder="Nhập nội dung Markdown tại đây...\n\nHoặc kéo thả file .md vào đây"
                spellCheck={false}
            />

            {/* Bottom Action Bar */}
            <div className="relative flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-[#00000010] dark:border-[#ffffff10] bg-[#fbfbfd]/50 dark:bg-[#1c1c1e]/50 backdrop-blur-md">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Wand2 size={14} className="text-[#0066cc] dark:text-[#0a84ff] shrink-0" />
                    <span className="text-[12.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                        <span className="hidden sm:inline">Hỗ trợ dán trực tiếp <span className="text-[#86868b] dark:text-[#a1a1a6]">Lark, Notion, Word...</span> — tự động chuyển sang Markdown</span>
                        <span className="sm:hidden">Dán văn bản — tự động chuyển sang Markdown</span>
                    </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <ImageUploader onInsertImage={handleInsertImage} />
                    <div className="text-[12px] font-mono text-[#86868b] dark:text-[#a1a1a6]">
                        {markdownInput.length} ký tự
                    </div>
                </div>
            </div>
        </div>
    );
}
