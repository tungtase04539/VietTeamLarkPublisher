import { useState } from 'react';
import { Languages, Image, Upload, Coins, Trash2, RefreshCw, ExternalLink } from 'lucide-react';
import { getLogs, getGlobalStats, getCardStats, clearLogs, type LogEntry, type GlobalStats } from '../lib/cardLog';
import { Card } from '../lib/useCardStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}

function fmtCost(usd: number): string {
    if (!usd || usd === 0) return '—';
    if (usd < 0.0001) return `<$0.0001`;
    return `$${usd.toFixed(4)}`;
}

function fmtTokens(n: number): string {
    if (!n || n === 0) return '—';
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
    return String(n);
}

function fmtTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}

const TYPE_META: Record<LogEntry['type'], { label: string; icon: React.ReactNode; color: string }> = {
    text_translate: { label: 'Dịch text', icon: <Languages size={10} />, color: 'text-[#0066cc]' },
    image_translate: { label: 'Dịch ảnh', icon: <Image size={10} />, color: 'text-[#9b59b6]' },
    lark_publish: { label: 'Đăng Lark', icon: <Upload size={10} />, color: 'text-[#ff9500]' },
};

// ─── Stat card ─────────────────────────────────────────────────────────────────

function StatBox({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
    return (
        <div className="flex flex-col gap-0.5 px-3 py-2.5 rounded-xl bg-white dark:bg-[#2c2c2e] border border-[#00000010] dark:border-[#ffffff10] shadow-sm min-w-0">
            <div className={`flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wide ${color}`}>
                {icon}
                <span className="truncate">{label}</span>
            </div>
            <p className="text-[14px] font-bold text-[#1d1d1f] dark:text-[#f5f5f7] tabular-nums">{value}</p>
        </div>
    );
}

// ─── Per-card stats row ────────────────────────────────────────────────────────

function CardStatsRow({ card }: { card: Card }) {
    const stats = getCardStats(card.id);
    const hasActivity = stats.textTranslateCount + stats.imageTranslateCount + stats.larkPublishCount > 0;
    if (!hasActivity) return null;
    return (
        <tr className="hover:bg-[#00000004] dark:hover:bg-[#ffffff04] transition-colors">
            <td className="px-3 py-1.5 text-[11px] font-medium text-[#1d1d1f] dark:text-[#f5f5f7] max-w-[130px] truncate">{card.title || card.id}</td>
            <td className="px-3 py-1.5 text-center">
                {stats.textTranslateCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-[#0066cc]">
                        <Languages size={9} />{stats.textTranslateCount}
                    </span>
                )}
            </td>
            <td className="px-3 py-1.5 text-center">
                {stats.imageTranslateCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-[#9b59b6]">
                        <Image size={9} />{stats.imageTranslateCount}
                    </span>
                )}
            </td>
            <td className="px-3 py-1.5 text-center">
                {stats.larkPublishCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-[#ff9500]">
                        <Upload size={9} />{stats.larkPublishCount}
                    </span>
                )}
            </td>
            <td className="px-3 py-1.5 text-[10px] text-[#86868b] text-right tabular-nums">{fmtTokens(stats.totalInputTokens + stats.totalOutputTokens)}</td>
            <td className="px-3 py-1.5 text-[10px] font-medium text-[#ff9500] text-right tabular-nums">{fmtCost(stats.totalCostUsd)}</td>
        </tr>
    );
}

// ─── Log table row ─────────────────────────────────────────────────────────────

function LogTableRow({ entry }: { entry: LogEntry }) {
    const meta = TYPE_META[entry.type];
    return (
        <tr className={`text-[10.5px] border-b border-[#00000006] dark:border-[#ffffff06] ${
            entry.success ? 'hover:bg-[#00000004] dark:hover:bg-[#ffffff04]' : 'bg-[#ff3b30]/3'
        } transition-colors`}>
            <td className="px-3 py-1.5 text-[#86868b] whitespace-nowrap tabular-nums">{fmtTime(entry.timestamp)}</td>
            <td className="px-3 py-1.5 font-medium text-[#1d1d1f] dark:text-[#f5f5f7] max-w-[110px] truncate">{entry.cardTitle}</td>
            <td className="px-3 py-1.5 whitespace-nowrap">
                <span className={`inline-flex items-center gap-1 ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                    {entry.imageCount && entry.imageCount > 1 && (
                        <span className="text-[#9b59b6] font-medium">×{entry.imageCount}</span>
                    )}
                    {!entry.success && (
                        <span className="ml-1 px-1 py-0.5 rounded text-[8px] font-bold bg-[#ff3b30]/10 text-[#ff3b30]">LỖI</span>
                    )}
                </span>
            </td>
            <td className="px-3 py-1.5 text-[#86868b] text-right tabular-nums whitespace-nowrap">{fmtDuration(entry.durationMs)}</td>
            <td className="px-3 py-1.5 text-[#86868b] text-right tabular-nums">
                {(entry.inputTokens ?? 0) > 0 ? fmtTokens((entry.inputTokens ?? 0) + (entry.outputTokens ?? 0)) : '—'}
            </td>
            <td className="px-3 py-1.5 text-right tabular-nums">
                {(entry.costUsd ?? 0) > 0
                    ? <span className="text-[#ff9500] font-medium">{fmtCost(entry.costUsd!)}</span>
                    : <span className="text-[#86868b]">—</span>
                }
            </td>
            <td className="px-3 py-1.5 text-center">
                {entry.larkUrl ? (
                    <a
                        href={entry.larkUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={entry.larkUrl}
                        className="inline-flex items-center gap-0.5 text-[#0066cc] dark:text-[#0a84ff] hover:underline"
                    >
                        <ExternalLink size={10} />
                        <span className="max-w-[80px] truncate font-mono text-[9.5px]">{entry.larkUrl.replace(/^https?:\/\//, '').slice(0, 20)}…</span>
                    </a>
                ) : (
                    <span className="text-[#86868b]/40">—</span>
                )}
            </td>
        </tr>
    );
}

// ─── Shared table components ──────────────────────────────────────────────────

function LogTable({ logs }: { logs: LogEntry[] }) {
    return (
        <div className="overflow-auto rounded-xl border border-[#00000008] dark:border-[#ffffff08] bg-white dark:bg-[#1c1c1e] shadow-sm">
            <table className="w-full min-w-[640px] border-collapse text-left">
                <thead className="sticky top-0 bg-[#f5f5f7] dark:bg-[#2c2c2e] z-10">
                    <tr className="text-[9px] font-semibold uppercase tracking-wide text-[#86868b] border-b border-[#00000010] dark:border-[#ffffff10]">
                        <th className="px-3 py-2 whitespace-nowrap">Thời gian</th>
                        <th className="px-3 py-2">Thẻ</th>
                        <th className="px-3 py-2">Loại</th>
                        <th className="px-3 py-2 text-right whitespace-nowrap">Thời lượng</th>
                        <th className="px-3 py-2 text-right">Tokens</th>
                        <th className="px-3 py-2 text-right">Chi phí</th>
                        <th className="px-3 py-2 text-center">Link Lark</th>
                    </tr>
                </thead>
                <tbody>
                    {logs.map(entry => <LogTableRow key={entry.id} entry={entry} />)}
                </tbody>
            </table>
        </div>
    );
}

function CardTable({ cards }: { cards: Card[] }) {
    const allEmpty = cards.every(c => {
        const s = getCardStats(c.id);
        return s.textTranslateCount + s.imageTranslateCount + s.larkPublishCount === 0;
    });
    return (
        <div className="overflow-auto rounded-xl border border-[#00000008] dark:border-[#ffffff08] bg-white dark:bg-[#1c1c1e] shadow-sm">
            <table className="w-full border-collapse text-left">
                <thead className="bg-[#f5f5f7] dark:bg-[#2c2c2e]">
                    <tr className="text-[9px] font-semibold uppercase tracking-wide text-[#86868b] border-b border-[#00000010] dark:border-[#ffffff10]">
                        <th className="px-3 py-2">Thẻ</th>
                        <th className="px-3 py-2 text-center">Dịch text</th>
                        <th className="px-3 py-2 text-center">Dịch ảnh</th>
                        <th className="px-3 py-2 text-center">Lark</th>
                        <th className="px-3 py-2 text-right">Tokens</th>
                        <th className="px-3 py-2 text-right">Chi phí</th>
                    </tr>
                </thead>
                <tbody>
                    {cards.map(card => <CardStatsRow key={card.id} card={card} />)}
                </tbody>
            </table>
            {allEmpty && <p className="text-[11px] text-[#86868b]/60 text-center py-3">Chưa có hoạt động</p>}
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface MultiLogPanelProps {
    cards: Card[];
    onOpenUsage: () => void;
    fullPage?: boolean;
}

export default function MultiLogPanel({ cards, onOpenUsage, fullPage = false }: MultiLogPanelProps) {
    const [tab, setTab] = useState<'stats' | 'log'>('log');
    const [globalStats, setGlobalStats] = useState<GlobalStats>(() => getGlobalStats());
    const [logs, setLogs] = useState<LogEntry[]>(() => getLogs().slice(0, 100));
    const [, setTick] = useState(0);

    const refresh = () => {
        setGlobalStats(getGlobalStats());
        setLogs(getLogs().slice(0, 100));
        setTick(t => t + 1);
    };

    const totalActivities = globalStats.textTranslateCount + globalStats.imageTranslateCount + globalStats.larkPublishCount;

    const ActionButtons = () => (
        <div className="flex items-center gap-0.5">
            <button onClick={onOpenUsage} className="px-2 py-1 rounded text-[10px] text-[#86868b] hover:text-[#0066cc] dark:hover:text-[#0a84ff] hover:bg-[#0066cc]/8 transition-colors">Chi phí ↗</button>
            <button onClick={refresh} title="Làm mới" className="p-1 rounded hover:bg-[#00000008] dark:hover:bg-[#ffffff10] text-[#86868b] hover:text-[#0066cc] transition-colors"><RefreshCw size={11} /></button>
            <button onClick={() => { clearLogs(); refresh(); }} title="Xoá tất cả log" className="p-1 rounded hover:bg-[#ff3b30]/10 text-[#86868b] hover:text-[#ff3b30] transition-colors"><Trash2 size={11} /></button>
        </div>
    );

    // ── Full-page layout: stat cards always visible ───────────────────────────
    if (fullPage) {
        return (
            <div className="px-4 sm:px-8 py-6 space-y-6">
                {/* Summary stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                    <StatBox label="Dịch text" value={String(globalStats.textTranslateCount)} icon={<Languages size={9} />} color="text-[#0066cc] dark:text-[#0a84ff]" />
                    <StatBox label="Dịch ảnh" value={String(globalStats.imageTranslateCount)} icon={<Image size={9} />} color="text-[#9b59b6]" />
                    <StatBox label="Đăng Lark" value={String(globalStats.larkPublishCount)} icon={<Upload size={9} />} color="text-[#ff9500]" />
                    <StatBox label="Tổng tokens" value={fmtTokens(globalStats.totalInputTokens + globalStats.totalOutputTokens)} icon={<Coins size={9} />} color="text-[#34c759] dark:text-[#30d158]" />
                    <StatBox label="Chi phí API" value={fmtCost(globalStats.totalCostUsd)} icon={<Coins size={9} />} color="text-[#ff9500]" />
                    <StatBox label="Hoạt động" value={String(totalActivities)} icon={<Coins size={9} />} color="text-[#86868b]" />
                </div>

                {/* Log table */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide">
                            Activity Log {logs.length > 0 && <span className="normal-case font-normal">({logs.length} mục)</span>}
                        </span>
                        <ActionButtons />
                    </div>
                    {logs.length === 0
                        ? <p className="text-[11px] text-[#86868b]/60 text-center py-12">Log sẽ xuất hiện sau khi bạn dịch hoặc đăng bài.</p>
                        : <LogTable logs={logs} />
                    }
                </div>

                {/* Per-card breakdown */}
                {cards.length > 0 && (
                    <div>
                        <p className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wide mb-3">Theo thẻ</p>
                        <CardTable cards={cards} />
                    </div>
                )}
            </div>
        );
    }

    // ── Compact (inline) layout: tabbed ──────────────────────────────────────
    return (
        <div className="px-4 sm:px-6 py-3">
            <div className="flex items-center gap-1 mb-2.5">
                {(['log', 'stats'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                            tab === t
                                ? 'bg-[#0066cc]/10 text-[#0066cc] dark:bg-[#0a84ff]/15 dark:text-[#0a84ff]'
                                : 'text-[#86868b] hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] hover:bg-[#00000008]'
                        }`}
                    >
                        {t === 'log' ? `Log${logs.length > 0 ? ` (${logs.length})` : ''}` : `Thống kê${totalActivities > 0 ? ` (${totalActivities})` : ''}`}
                    </button>
                ))}
                <div className="ml-auto"><ActionButtons /></div>
            </div>

            {tab === 'log' && (
                logs.length === 0
                    ? <p className="text-[11px] text-[#86868b]/60 text-center py-4">Log sẽ xuất hiện sau khi bạn dịch hoặc đăng bài.</p>
                    : <div className="max-h-[260px] overflow-auto"><LogTable logs={logs} /></div>
            )}

            {tab === 'stats' && (
                <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <StatBox label="Dịch text" value={String(globalStats.textTranslateCount)} icon={<Languages size={9} />} color="text-[#0066cc] dark:text-[#0a84ff]" />
                        <StatBox label="Dịch ảnh" value={String(globalStats.imageTranslateCount)} icon={<Image size={9} />} color="text-[#9b59b6]" />
                        <StatBox label="Tokens" value={fmtTokens(globalStats.totalInputTokens + globalStats.totalOutputTokens)} icon={<Coins size={9} />} color="text-[#34c759] dark:text-[#30d158]" />
                        <StatBox label="Chi phí API" value={fmtCost(globalStats.totalCostUsd)} icon={<Coins size={9} />} color="text-[#ff9500]" />
                    </div>
                    {cards.length > 0 && <CardTable cards={cards} />}
                </div>
            )}
        </div>
    );
}
