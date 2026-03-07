import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BarChart2, Trash2, DollarSign, Zap } from 'lucide-react';
import { loadUsageRecords, clearUsageRecords, type UsageRecord } from '../lib/translateSettings';

interface Props { isOpen: boolean; onClose: () => void; }

function formatDate(iso: string) {
    const d = new Date(iso);
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function formatCost(usd: number) {
    if (usd === 0) return <span className="text-[#34c759] font-semibold">Miễn phí</span>;
    if (usd < 0.001) return <span className="text-[#86868b]">&lt;$0.001</span>;
    return <span>${usd.toFixed(4)}</span>;
}

function formatCostNum(usd: number) {
    if (usd === 0) return '0';
    return usd < 0.001 ? '<0.001' : usd.toFixed(4);
}

export default function UsageStatsPanel({ isOpen, onClose }: Props) {
    const [records, setRecords] = useState<UsageRecord[]>([]);

    useEffect(() => { if (isOpen) setRecords(loadUsageRecords().reverse()); }, [isOpen]);

    const totalCost = records.reduce((s, r) => s + r.costUsd, 0);
    const totalSessions = records.length;

    // Group by model
    const byModel = records.reduce<Record<string, { label: string; count: number; cost: number }>>((acc, r) => {
        if (!acc[r.model]) acc[r.model] = { label: r.modelLabel, count: 0, cost: 0 };
        acc[r.model].count += 1;
        acc[r.model].cost += r.costUsd;
        return acc;
    }, {});
    const modelStats = Object.entries(byModel).sort((a, b) => b[1].cost - a[1].cost);

    const handleClear = () => {
        clearUsageRecords();
        setRecords([]);
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" onClick={onClose} />
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.97 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 flex items-center justify-center z-[201] p-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-full max-w-xl bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-[#00000012] dark:border-[#ffffff12] overflow-hidden flex flex-col max-h-[85vh]">
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-[#00000010] dark:border-[#ffffff10] shrink-0">
                                <div className="flex items-center gap-2">
                                    <BarChart2 size={16} className="text-[#0066cc] dark:text-[#0a84ff]" />
                                    <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">Thống kê chi tiêu dịch thuật</h2>
                                </div>
                                <button onClick={onClose} className="p-2 rounded-full hover:bg-[#00000008] dark:hover:bg-[#ffffff10] text-[#86868b]">
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="overflow-y-auto flex-1">
                                {/* Summary cards */}
                                <div className="grid grid-cols-2 gap-3 px-6 pt-5">
                                    <div className="bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-xl p-4">
                                        <div className="flex items-center gap-1.5 text-[#86868b] mb-1">
                                            <DollarSign size={13} />
                                            <span className="text-[11px] uppercase tracking-wide font-medium">Tổng chi phí</span>
                                        </div>
                                        <p className="text-[22px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">
                                            {totalCost === 0 ? <span className="text-[#34c759]">$0</span> : `$${formatCostNum(totalCost)}`}
                                        </p>
                                        <p className="text-[11px] text-[#86868b] mt-0.5">USD ước tính</p>
                                    </div>
                                    <div className="bg-[#f5f5f7] dark:bg-[#2c2c2e] rounded-xl p-4">
                                        <div className="flex items-center gap-1.5 text-[#86868b] mb-1">
                                            <Zap size={13} />
                                            <span className="text-[11px] uppercase tracking-wide font-medium">Số lần dịch</span>
                                        </div>
                                        <p className="text-[22px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7]">{totalSessions}</p>
                                        <p className="text-[11px] text-[#86868b] mt-0.5">phiên dịch</p>
                                    </div>
                                </div>

                                {/* Model breakdown */}
                                {modelStats.length > 0 && (
                                    <div className="px-6 pt-4">
                                        <p className="text-[12px] font-semibold text-[#86868b] uppercase tracking-widest mb-2">Theo model</p>
                                        <div className="space-y-1.5">
                                            {modelStats.map(([model, stat]) => {
                                                const pct = totalCost > 0 ? (stat.cost / totalCost) * 100 : 0;
                                                return (
                                                    <div key={model} className="flex items-center gap-3 p-2.5 rounded-xl bg-[#f5f5f7] dark:bg-[#2c2c2e]">
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                                <span className="text-[12.5px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate">{stat.label}</span>
                                                                <span className="text-[12px] font-mono shrink-0">{formatCost(stat.cost)}</span>
                                                            </div>
                                                            {/* Progress bar */}
                                                            <div className="h-1 bg-[#00000010] dark:bg-[#ffffff10] rounded-full overflow-hidden">
                                                                <motion.div
                                                                    initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                                                                    transition={{ duration: 0.4, ease: 'easeOut' }}
                                                                    className="h-full bg-[#0066cc] dark:bg-[#0a84ff] rounded-full"
                                                                />
                                                            </div>
                                                            <p className="text-[10.5px] text-[#86868b] mt-0.5">{stat.count} lần dịch</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                )}

                                {/* Recent history */}
                                {records.length > 0 ? (
                                    <div className="px-6 pt-4 pb-5">
                                        <p className="text-[12px] font-semibold text-[#86868b] uppercase tracking-widest mb-2">Lịch sử gần đây</p>
                                        <div className="space-y-1">
                                            {records.slice(0, 30).map((r, i) => (
                                                <div key={i} className="flex items-center gap-2 py-2 border-b border-[#00000008] dark:border-[#ffffff08] last:border-0">
                                                    <div className="flex-1 min-w-0">
                                                        <span className="text-[12px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] truncate block">{r.modelLabel}</span>
                                                        <span className="text-[10.5px] text-[#86868b]">{formatDate(r.date)}</span>
                                                    </div>
                                                    <div className="shrink-0 text-right">
                                                        <div className="text-[12px] font-mono">{formatCost(r.costUsd)}</div>
                                                        <div className="text-[10px] text-[#86868b]">~{(r.inputTokens + r.outputTokens).toLocaleString()} tokens</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div className="px-6 py-10 text-center">
                                        <BarChart2 size={32} className="text-[#c7c7cc] mx-auto mb-3" />
                                        <p className="text-[13px] text-[#86868b]">Chưa có lịch sử dịch.</p>
                                        <p className="text-[12px] text-[#b0b0b5] mt-1">Thống kê sẽ xuất hiện sau khi bạn dịch lần đầu.</p>
                                    </div>
                                )}
                            </div>

                            {/* Footer */}
                            {records.length > 0 && (
                                <div className="flex items-center justify-between px-6 py-3 border-t border-[#00000010] dark:border-[#ffffff10] bg-[#f5f5f7]/50 dark:bg-[#2c2c2e]/50 shrink-0">
                                    <p className="text-[11px] text-[#86868b]">Chi phí ước tính · ~4 ký tự = 1 token</p>
                                    <button onClick={handleClear}
                                        className="flex items-center gap-1.5 text-[12px] text-[#86868b] hover:text-[#ff3b30] transition-colors">
                                        <Trash2 size={12} /> Xóa lịch sử
                                    </button>
                                </div>
                            )}
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
