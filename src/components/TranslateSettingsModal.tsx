import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, ChevronDown } from 'lucide-react';
import {
    loadTranslateSettings, saveTranslateSettings,
    DEFAULT_SETTINGS, DEFAULT_PROMPT, PRESET_MODELS,
    type TranslateSettings, type ModelProvider,
} from '../lib/translateSettings';

interface Props {
    isOpen: boolean;
    onClose: () => void;
}

const PROVIDER_LABELS: Record<ModelProvider, string> = {
    gemini: 'Google Gemini',
    openai: 'OpenAI',
    anthropic: 'Anthropic (Claude)',
    '302ai': '302.ai (proxy — 1 key dùng tất cả model)',
    'openai-compatible': 'Custom (OpenAI-compatible)',
};

export default function TranslateSettingsModal({ isOpen, onClose }: Props) {
    const [settings, setSettings] = useState<TranslateSettings>(loadTranslateSettings);
    const [showPrompt, setShowPrompt] = useState(false);

    useEffect(() => {
        if (isOpen) setSettings(loadTranslateSettings());
    }, [isOpen]);

    const up = <K extends keyof TranslateSettings>(k: K, v: TranslateSettings[K]) =>
        setSettings(s => ({ ...s, [k]: v }));

    const handleSave = () => {
        saveTranslateSettings(settings);
        onClose();
    };

    const handleReset = () => setSettings({ ...DEFAULT_SETTINGS });

    const handlePresetChange = (idx: number) => {
        const p = PRESET_MODELS[idx];
        setSettings(s => ({ ...s, provider: p.provider, model: p.model }));
    };

    const currentPresetIdx = PRESET_MODELS.findIndex(
        p => p.provider === settings.provider && p.model === settings.model
    );

    const apiPlaceholder = PRESET_MODELS[currentPresetIdx]?.placeholder ?? 'API Key';
    const isDefaultGemini = settings.provider === DEFAULT_SETTINGS.provider
        && settings.model === DEFAULT_SETTINGS.model
        && !settings.apiKey;

    // Group presets for display
    const groups = Array.from(new Set(PRESET_MODELS.map(p => p.group)));

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
                        onClick={onClose}
                    />
                    <motion.div
                        initial={{ opacity: 0, y: 16, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 16, scale: 0.97 }}
                        transition={{ duration: 0.2 }}
                        className="fixed inset-0 flex items-center justify-center z-[201] p-4"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="w-full max-w-lg bg-white dark:bg-[#1c1c1e] rounded-2xl shadow-2xl border border-[#00000012] dark:border-[#ffffff12] overflow-hidden">
                            {/* Header */}
                            <div className="flex items-center justify-between px-6 py-4 border-b border-[#00000010] dark:border-[#ffffff10]">
                                <div>
                                    <h2 className="text-[15px] font-semibold text-[#1d1d1f] dark:text-[#f5f5f7]">
                                        Cài đặt dịch thuật
                                    </h2>
                                    <p className="text-[12px] text-[#86868b] mt-0.5">
                                        Settings lưu cục bộ trong trình duyệt
                                    </p>
                                </div>
                                <button
                                    onClick={onClose}
                                    className="p-2 rounded-full hover:bg-[#00000008] dark:hover:bg-[#ffffff10] transition-colors text-[#86868b]"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="px-6 py-5 space-y-5">
                                {/* Model selector */}
                                <div className="space-y-1.5">
                                    <label className="text-[12px] font-medium text-[#86868b] uppercase tracking-wide">
                                        Model
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={currentPresetIdx >= 0 ? currentPresetIdx : 0}
                                            onChange={e => handlePresetChange(Number(e.target.value))}
                                            className="w-full appearance-none bg-[#f5f5f7] dark:bg-[#2c2c2e] border-0 rounded-xl px-4 py-3 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] pr-10 focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30"
                                        >
                                            {groups.map(group => (
                                                <optgroup key={group} label={group}>
                                                    {PRESET_MODELS.map((p, i) => p.group === group ? (
                                                        <option key={i} value={i}>{p.label}</option>
                                                    ) : null)}
                                                </optgroup>
                                            ))}
                                        </select>
                                        <ChevronDown size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#86868b] pointer-events-none" />
                                    </div>
                                    {settings.provider === 'openai-compatible' && (
                                        <input
                                            value={settings.model}
                                            onChange={e => up('model', e.target.value)}
                                            placeholder="Tên model, vd: deepseek-chat"
                                            className="w-full bg-[#f5f5f7] dark:bg-[#2c2c2e] border-0 rounded-xl px-4 py-3 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30 placeholder-[#86868b]"
                                        />
                                    )}
                                </div>

                                {/* 302.ai Key */}
                                {settings.provider === '302ai' && (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-medium text-[#86868b] uppercase tracking-wide">
                                            302.ai API Key
                                            <span className="ml-2 normal-case font-normal text-[#34c759]">• dùng được Claude, GPT, Gemini, DeepSeek...</span>
                                        </label>
                                        <input
                                            type="password"
                                            value={settings.ai302Key}
                                            onChange={e => up('ai302Key', e.target.value)}
                                            placeholder={apiPlaceholder}
                                            className="w-full bg-[#f5f5f7] dark:bg-[#2c2c2e] border-0 rounded-xl px-4 py-3 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30 placeholder-[#86868b] font-mono"
                                        />
                                    </div>
                                )}

                                {/* API Key (non-302ai, non-default Gemini) */}
                                {settings.provider !== '302ai' && !isDefaultGemini && (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-medium text-[#86868b] uppercase tracking-wide">API Key</label>
                                        <input
                                            type="password"
                                            value={settings.apiKey}
                                            onChange={e => up('apiKey', e.target.value)}
                                            placeholder={apiPlaceholder}
                                            className="w-full bg-[#f5f5f7] dark:bg-[#2c2c2e] border-0 rounded-xl px-4 py-3 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30 placeholder-[#86868b] font-mono"
                                        />
                                    </div>
                                )}

                                {/* Base URL (custom only) */}
                                {settings.provider === 'openai-compatible' && (
                                    <div className="space-y-1.5">
                                        <label className="text-[12px] font-medium text-[#86868b] uppercase tracking-wide">Base URL</label>
                                        <input
                                            value={settings.baseUrl}
                                            onChange={e => up('baseUrl', e.target.value)}
                                            placeholder="https://api.example.com/v1"
                                            className="w-full bg-[#f5f5f7] dark:bg-[#2c2c2e] border-0 rounded-xl px-4 py-3 text-[14px] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30 placeholder-[#86868b] font-mono"
                                        />
                                    </div>
                                )}

                                {/* Custom Prompt */}
                                <div className="space-y-1.5">
                                    <button
                                        onClick={() => setShowPrompt(s => !s)}
                                        className="flex items-center gap-1.5 text-[12px] font-medium text-[#86868b] uppercase tracking-wide hover:text-[#1d1d1f] dark:hover:text-[#f5f5f7] transition-colors"
                                    >
                                        <ChevronDown size={12} className={`transition-transform ${showPrompt ? 'rotate-180' : ''}`} />
                                        Custom Prompt
                                        {settings.customPrompt.trim()
                                            ? <span className="ml-1 text-[#ff9f0a] normal-case font-normal">• đang dùng custom</span>
                                            : <span className="ml-1 text-[#34c759] normal-case font-normal">• mặc định</span>
                                        }
                                    </button>
                                    {showPrompt && (
                                        <div className="space-y-2">
                                            <textarea
                                                value={settings.customPrompt}
                                                onChange={e => up('customPrompt', e.target.value)}
                                                placeholder={DEFAULT_PROMPT}
                                                rows={8}
                                                className="w-full bg-[#f5f5f7] dark:bg-[#2c2c2e] border-0 rounded-xl px-4 py-3 text-[13px] text-[#1d1d1f] dark:text-[#f5f5f7] focus:outline-none focus:ring-2 focus:ring-[#0066cc]/30 placeholder-[#86868b]/50 resize-none font-mono leading-relaxed"
                                            />
                                            {settings.customPrompt.trim() && (
                                                <button
                                                    onClick={() => up('customPrompt', '')}
                                                    className="text-[12px] text-[#86868b] hover:text-[#ff3b30] transition-colors"
                                                >
                                                    Xóa → về prompt mặc định
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Provider badge */}
                                <p className="text-[11px] text-[#86868b]">
                                    Provider: <span className="font-mono text-[#1d1d1f] dark:text-[#f5f5f7]">{PROVIDER_LABELS[settings.provider]}</span>
                                    {isDefaultGemini && <span className="ml-2 text-[#34c759]">• dùng API key tích hợp sẵn</span>}
                                </p>
                            </div>

                            {/* Footer */}
                            <div className="flex items-center justify-between px-6 py-4 border-t border-[#00000010] dark:border-[#ffffff10] bg-[#f5f5f7]/50 dark:bg-[#2c2c2e]/50">
                                <button
                                    onClick={handleReset}
                                    className="flex items-center gap-1.5 text-[13px] text-[#86868b] hover:text-[#ff3b30] transition-colors"
                                >
                                    <RotateCcw size={13} />
                                    Về mặc định
                                </button>
                                <div className="flex gap-3">
                                    <button
                                        onClick={onClose}
                                        className="px-4 py-2 rounded-xl text-[13px] text-[#86868b] hover:bg-[#00000008] dark:hover:bg-[#ffffff10] transition-colors"
                                    >
                                        Hủy
                                    </button>
                                    <motion.button
                                        whileHover={{ scale: 1.02 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={handleSave}
                                        className="px-5 py-2 rounded-xl text-[13px] font-semibold bg-[#0066cc] dark:bg-[#0a84ff] text-white hover:bg-[#0055b3] dark:hover:bg-[#0070d8] transition-colors"
                                    >
                                        Lưu
                                    </motion.button>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
