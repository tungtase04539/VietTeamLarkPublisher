import { CheckCircle2, Loader2, Languages, Upload, Settings2 } from 'lucide-react';
import { motion } from 'framer-motion';

interface ToolbarProps {
    onTranslate: () => void;
    isTranslating: boolean;
    translateDone: boolean;
    translateProgress: { current: number; total: number } | null;
    onPublishLark: () => void;
    onOpenTranslateSettings: () => void;
}

export default function Toolbar({ onTranslate, isTranslating, translateDone, translateProgress, onPublishLark, onOpenTranslateSettings }: ToolbarProps) {
    return (
        <div className="flex items-center justify-end px-4 sm:px-6 py-3 max-w-[1024px]">
            <div className="flex items-center gap-2 sm:gap-4">
                {/* Translate settings gear */}
                <button
                    onClick={onOpenTranslateSettings}
                    title="Cài đặt model dịch"
                    className="p-2 rounded-full text-[#86868b] dark:text-[#a1a1a6] hover:text-[#0066cc] dark:hover:text-[#0a84ff] hover:bg-[#0066cc]/10 dark:hover:bg-[#0a84ff]/10 transition-all"
                >
                    <Settings2 size={14} />
                </button>

                {/* Translate to Vietnamese button */}
                <motion.button
                    whileHover={!isTranslating ? { scale: 1.02 } : {}}
                    whileTap={!isTranslating ? { scale: 0.96 } : {}}
                    onClick={onTranslate}
                    disabled={isTranslating}
                    title="Dịch nội dung sang Tiếng Việt (giữ nguyên cấu trúc Markdown)"
                    className={`apple-export-btn border-transparent transition-all ${
                        translateDone
                            ? '!bg-[#34c759]/15 dark:!bg-[#30d158]/15 !text-[#1d8d3a] dark:!text-[#30d158] border-[#34c759]/30'
                            : isTranslating
                                ? '!bg-[#0066cc]/10 dark:!bg-[#0a84ff]/10 !text-[#0066cc] dark:!text-[#0a84ff] border-[#0066cc]/20 cursor-not-allowed opacity-90'
                                : '!bg-[#00000008] dark:!bg-[#ffffff10] hover:!bg-[#0066cc]/10 dark:hover:!bg-[#0a84ff]/10 hover:!text-[#0066cc] dark:hover:!text-[#0a84ff]'
                    }`}
                >
                    {translateDone ? (
                        <CheckCircle2 size={14} />
                    ) : isTranslating ? (
                        <Loader2 className="animate-spin" size={14} />
                    ) : (
                        <Languages size={14} />
                    )}
                    <span className="hidden sm:inline">
                        {translateDone
                            ? 'Đã dịch!'
                            : isTranslating
                                ? translateProgress
                                    ? `Đang dịch ${translateProgress.current}/${translateProgress.total}...`
                                    : 'Đang dịch...'
                                : 'Dịch Việt'}
                    </span>
                    <span className="sm:hidden">
                        {translateDone ? 'Xong!' : isTranslating ? '...' : 'Dịch'}
                    </span>
                </motion.button>

                {/* Publish to Lark button */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={onPublishLark}
                    title="Đăng nội dung lên Lark (Feishu)"
                    className="apple-export-btn !bg-[#1456f0]/8 dark:!bg-[#3b82f6]/10 !text-[#1456f0] dark:!text-[#60a5fa] border-transparent hover:!bg-[#1456f0]/15 dark:hover:!bg-[#3b82f6]/20 transition-all"
                >
                    <Upload size={14} />
                    <span className="hidden sm:inline">Đăng Lark</span>
                    <span className="sm:hidden">Lark</span>
                </motion.button>
            </div>
        </div>
    );
}
