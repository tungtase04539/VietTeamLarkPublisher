import React, { useRef } from 'react';
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

    const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        handleSmartPaste(e, markdownInput, onInputChange);
    };

    // Track cursor position whenever user interacts with textarea
    const trackSelection = () => {
        const el = editorScrollRef.current;
        if (!el) return;
        lastSelectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
    };

    // Insert image markdown at the last known cursor position
    const handleInsertImage = (markdownSyntax: string) => {
        const { start, end } = lastSelectionRef.current;
        // Wrap the image with blank lines for proper Markdown paragraph spacing
        const before = markdownInput.substring(0, start);
        const after = markdownInput.substring(end);
        const needsLeadingNewline = before.length > 0 && !before.endsWith('\n\n');
        const needsTrailingNewline = after.length > 0 && !after.startsWith('\n');
        const prefix = needsLeadingNewline ? '\n\n' : '';
        const suffix = needsTrailingNewline ? '\n\n' : '';
        const inserted = `${prefix}${markdownSyntax}${suffix}`;
        const newValue = before + inserted + after;
        onInputChange(newValue);

        // Restore focus + move cursor after the inserted image
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
                className="w-full flex-1 p-8 md:p-10 resize-none bg-transparent outline-none font-mono text-[15px] md:text-[16px] leading-[1.8] no-scrollbar text-[#1d1d1f] dark:text-[#f5f5f7] placeholder-[#86868b] dark:placeholder-[#6e6e73]"
                value={markdownInput}
                onChange={(e) => onInputChange(e.target.value)}
                onPaste={onPaste}
                onScroll={scrollSyncEnabled ? onEditorScroll : undefined}
                onKeyUp={trackSelection}
                onMouseUp={trackSelection}
                onClick={trackSelection}
                onKeyDown={trackSelection}
                placeholder="Nhập nội dung Markdown tại đây..."
                spellCheck={false}
            />

            {/* Bottom Action / Info Bar for Editor */}
            <div className="relative flex-shrink-0 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 sm:py-4 border-t border-[#00000010] dark:border-[#ffffff10] bg-[#fbfbfd]/50 dark:bg-[#1c1c1e]/50 backdrop-blur-md">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Wand2 size={14} className="text-[#0066cc] dark:text-[#0a84ff] shrink-0" />
                    <span className="text-[12.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7]">
                        <span className="hidden sm:inline">Hỗ trợ dán trực tiếp <span className="text-[#86868b] dark:text-[#a1a1a6]">Lark, Notion, Word...</span> — tự động chuyển sang Markdown</span>
                        <span className="sm:hidden">Dán văn bản — tự động chuyển sang Markdown</span>
                    </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    {/* Image Uploader — popup anchored above bottom bar */}
                    <ImageUploader
                        markdownInput={markdownInput}
                        onMarkdownChange={onInputChange}
                        onInsertImage={handleInsertImage}
                    />

                    <div className="text-[12px] font-mono text-[#86868b] dark:text-[#a1a1a6]">
                        {markdownInput.length} ký tự
                    </div>
                </div>
            </div>
        </div>
    );
}

