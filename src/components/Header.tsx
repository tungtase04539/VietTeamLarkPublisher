import { Moon, Sun, LayoutGrid, SquarePen } from 'lucide-react';
import { motion } from 'framer-motion';

interface HeaderProps {
    themeMode: 'light' | 'dark';
    onToggleTheme: () => void;
    appMode: 'single' | 'multi';
    onToggleMode: () => void;
}

export default function Header({ themeMode, onToggleTheme, appMode, onToggleMode }: HeaderProps) {
    return (
        <header className="glass flex items-center justify-between px-5 sm:px-7 py-3 sticky top-0 z-[100]">
            {/* Logo */}
            <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-[9px] flex items-center justify-center bg-gradient-to-br from-[#1456f0] to-[#5b21b6] shadow-[0_2px_10px_rgba(20,86,240,0.35)]">
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M16.5 7.5L5 19H10.5C13.5376 19 16 16.5376 16 13.5C16 10.4624 13.5376 8 10.5 8H8.5V11.5L16.5 7.5Z" fill="white" />
                        <path d="M8.5 4H10.5C15.7467 4 20 8.25329 20 13.5C20 18.7467 15.7467 23 10.5 23H4V4H8.5Z" fill="none" strokeWidth="2.5" stroke="white" />
                        <path d="M4 11.5H8.5" strokeWidth="2.5" strokeLinecap="round" stroke="white" />
                    </svg>
                </div>
                <span className="font-bold text-[15px] tracking-tight text-[#1d1d1f] dark:text-white truncate">
                    VietTeamLarkPublisher
                    <span className="hidden lg:inline font-normal text-[#86868b] dark:text-[#a1a1a6] ml-1.5 text-[13px]">Soạn thảo &amp; Xuất bản Lark</span>
                </span>
            </div>

            {/* Segmented mode toggle — center */}
            <div className="absolute left-1/2 -translate-x-1/2 flex items-center bg-black/6 dark:bg-white/10 p-1 rounded-full gap-0.5">
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => appMode === 'multi' && onToggleMode()}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 ${
                        appMode === 'single'
                            ? 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] shadow-sm'
                            : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'
                    }`}
                >
                    <SquarePen size={13} />
                    Single
                </motion.button>
                <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={() => appMode === 'single' && onToggleMode()}
                    className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full text-[13px] font-semibold transition-all duration-200 ${
                        appMode === 'multi'
                            ? 'bg-white dark:bg-[#2c2c2e] text-[#1d1d1f] dark:text-[#f5f5f7] shadow-sm'
                            : 'text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7]'
                    }`}
                >
                    <LayoutGrid size={13} />
                    Multi
                </motion.button>
            </div>

            {/* Right controls */}
            <div className="flex items-center gap-1">
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={onToggleTheme}
                    title={themeMode === 'light' ? 'Chuyển sang Dark mode' : 'Chuyển sang Light mode'}
                    className="p-2 rounded-full text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-black/6 dark:hover:bg-white/10 transition-all"
                >
                    {themeMode === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </motion.button>
            </div>
        </header>
    );
}
