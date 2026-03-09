import { motion, AnimatePresence } from 'framer-motion';
import { Plus, LayoutGrid } from 'lucide-react';
import { Card } from '../lib/useCardStore';
import DashboardCard from './DashboardCard';

interface MultiDashboardProps {
    cards: Card[];
    onAddCard: () => void;
    onUpdateCard: (id: string, patch: Partial<Omit<Card, 'id'>>) => void;
    onRemoveCard: (id: string) => void;
    onDuplicateCard: (id: string) => void;
    onOpenSingle: (markdownInput: string, activeTheme: string) => void;
}

export default function MultiDashboard({
    cards,
    onAddCard,
    onUpdateCard,
    onRemoveCard,
    onDuplicateCard,
    onOpenSingle,
}: MultiDashboardProps) {
    return (
        <div className="flex-1 overflow-y-auto bg-[#f5f5f7] dark:bg-[#0a0a0a] transition-colors">
            {/* Top bar */}
            <div className="sticky top-0 z-10 bg-[#f5f5f7]/80 dark:bg-[#0a0a0a]/80 backdrop-blur-md border-b border-[#00000010] dark:border-[#ffffff10] px-4 sm:px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <LayoutGrid size={15} className="text-[#0066cc] dark:text-[#0a84ff]" />
                    <span className="text-[13px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                        Multi Mode
                    </span>
                    <span className="text-[11px] text-[#86868b] bg-[#00000008] dark:bg-[#ffffff10] px-2 py-0.5 rounded-full">
                        {cards.length} thẻ
                    </span>
                </div>
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.96 }}
                    onClick={onAddCard}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0066cc] dark:bg-[#0a84ff] text-white text-[12.5px] font-semibold hover:opacity-90 transition-opacity shadow-sm"
                >
                    <Plus size={14} />
                    Thêm thẻ
                </motion.button>
            </div>

            {/* Grid */}
            <div className="p-4 sm:p-6">
                <motion.div
                    layout
                    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
                >
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

                    {/* Add card CTA (ghost card) */}
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
            </div>
        </div>
    );
}
