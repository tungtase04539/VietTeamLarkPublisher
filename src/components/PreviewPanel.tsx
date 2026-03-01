import React from 'react';

interface PreviewPanelProps {
    renderedHtml: string;
    deviceWidthClass: string;
    previewRef: React.RefObject<HTMLDivElement>;
}

export default function PreviewPanel({ renderedHtml, deviceWidthClass, previewRef }: PreviewPanelProps) {
    return (
        <div className="relative overflow-y-auto no-scrollbar bg-[#f2f2f7]/50 dark:bg-[#000000] pt-12 pb-32 block z-20 flex-1 min-h-0">
            <div className={`bg-white rounded-[24px] overflow-hidden shadow-apple-lg ${deviceWidthClass} transition-all duration-500 ring-1 ring-[#00000008] border-t border-white/50 mx-auto h-fit min-h-[calc(100%-48px)]`}>
                <div
                    ref={previewRef}
                    dangerouslySetInnerHTML={{ __html: renderedHtml }}
                    className="preview-content min-w-full"
                />
            </div>
        </div>
    );
}
