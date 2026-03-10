import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Settings2, BarChart2, ArrowLeft } from 'lucide-react';
import { Card } from '../lib/useCardStore';
import DashboardCard from './DashboardCard';
import MultiLogPanel from './MultiLogPanel';

interface MultiDashboardProps {
    cards: Card[];
    onAddCard: () => void;
    onUpdateCard: (id: string, patch: Partial<Omit<Card, 'id'>>) => void;
    onRemoveCard: (id: string) => void;
    onDuplicateCard: (id: string) => void;
    onOpenSingle: (markdownInput: string, activeTheme: string) => void;
    onOpenSettings: () => void;
    onOpenUsage: () => void;
}

export default function MultiDashboard({
    cards,
    onAddCard,
    onUpdateCard,
    onRemoveCard,
    onDuplicateCard,
    onOpenSingle,
    onOpenSettings,
    onOpenUsage,
}: MultiDashboardProps) {
    const [view, setView] = useState<'cards' | 'log'>('cards');

    return (
        <div className="flex-1 overflow-y-auto bg-[#f5f5f7] dark:bg-[#0a0a0a] transition-colors flex flex-col">
            {/* ── Sub-header ─────────────────────────────────────────── */}
            <div className="sticky top-0 z-10 bg-[#f5f5f7]/95 dark:bg-[#111111]/95 backdrop-blur-md border-b border-[#00000009] dark:border-[#ffffff09]">
                <div className="px-5 sm:px-7 py-2.5 flex items-center justify-between">
                    {/* Left: back (when in log) or log button */}
                    <div className="flex items-center gap-2">
                        {view === 'log' ? (
                            <button
                                onClick={() => setView('cards')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7] bg-white dark:bg-[#2c2c2e] shadow-sm hover:shadow transition-all"
                            >
                                <ArrowLeft size={13} />
                                Quay lại
                            </button>
                        ) : (
                            <button
                                onClick={() => setView('log')}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-white dark:hover:bg-[#2c2c2e] hover:shadow-sm transition-all"
                            >
                                <BarChart2 size={13} />
                                Log &amp; Thống kê
                            </button>
                        )}
                    </div>

                    {/* Right: settings + add card */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={onOpenSettings}
                            title="Cài đặt API dịch"
                            className="p-1.5 rounded-full text-[#86868b] dark:text-[#a1a1a6] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-white dark:hover:bg-[#2c2c2e] hover:shadow-sm transition-all"
                        >
                            <Settings2 size={16} />
                        </button>

                        {view === 'cards' && (
                            <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.95 }}
                                onClick={onAddCard}
                                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1456f0] dark:bg-[#1456f0] text-white text-[12.5px] font-semibold hover:bg-[#0e46cc] transition-colors shadow-sm"
                            >
                                <Plus size={14} />
                                <span className="hidden sm:inline">Thêm thẻ</span>
                            </motion.button>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Views ─────────────────────────────────────────────── */}
            <AnimatePresence mode="wait">
                {view === 'cards' ? (
                    <motion.div
                        key="cards"
                        initial={{ opacity: 0, x: -16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                        className="flex-1 p-4 sm:p-6"
                    >
                        <motion.div layout className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            <AnimatePresence mode="popLayout">
                                {cards.map(card => (
                                    <DashboardCard
                                        key={card.id}
                                        card={card}
                                        onUpdate={onUpdateCard}
                                        onRemove={onRemoveCard}
                                        onDuplicate={onDuplicateCard}
                                        onOpenSingle={onOpenSingle}
                                    />
                                ))}
                            </AnimatePresence>

                            {/* Ghost add card */}
                            <motion.button
                                layout
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.98 }}
                                onClick={onAddCard}
                                className="min-h-[220px] flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#00000015] dark:border-[#ffffff15] text-[#86868b] hover:text-[#0066cc] dark:hover:text-[#0a84ff] hover:border-[#0066cc]/40 dark:hover:border-[#0a84ff]/40 hover:bg-[#0066cc]/3 dark:hover:bg-[#0a84ff]/3 transition-all duration-200"
                            >
                                <Plus size={24} strokeWidth={1.5} />
                                <span className="text-[13px] font-medium">Thêm thẻ mới</span>
                            </motion.button>
                        </motion.div>
                    </motion.div>
                ) : (
                    <motion.div
                        key="log"
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 16 }}
                        transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
                        className="flex-1"
                    >
                        <MultiLogPanel cards={cards} onOpenUsage={onOpenUsage} fullPage />
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
