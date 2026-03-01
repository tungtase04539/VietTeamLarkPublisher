import { useEffect, useState, useRef } from 'react';
import { PenLine, Eye } from 'lucide-react';
import html2pdf from 'html2pdf.js';
import { md, preprocessMarkdown, applyTheme } from './lib/markdown';
import { makeWeChatCompatible } from './lib/wechatCompat';
import { THEMES } from './lib/themes';
import { defaultContent } from './defaultContent';
import Header from './components/Header';
import ThemeSelector from './components/ThemeSelector';
import Toolbar from './components/Toolbar';
import EditorPanel from './components/EditorPanel';
import PreviewPanel from './components/PreviewPanel';

export default function App() {
    const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
    const [markdownInput, setMarkdownInput] = useState<string>(defaultContent);
    const [renderedHtml, setRenderedHtml] = useState<string>('');
    const [activeTheme, setActiveTheme] = useState(THEMES[0].id);
    const [copied, setCopied] = useState(false);
    const [isCopying, setIsCopying] = useState(false);
    const [previewDevice, setPreviewDevice] = useState<'mobile' | 'tablet' | 'pc'>('pc');
    const [activePanel, setActivePanel] = useState<'editor' | 'preview'>('editor');
    const previewRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        // Enforce light mode as default, do not follow system preferences
    }, []);

    const toggleTheme = () => {
        setThemeMode((prev) => {
            const next = prev === 'light' ? 'dark' : 'light';
            if (next === 'dark') document.documentElement.classList.add('dark');
            else document.documentElement.classList.remove('dark');
            return next;
        });
    };

    useEffect(() => {
        const rawHtml = md.render(preprocessMarkdown(markdownInput));
        const styledHtml = applyTheme(rawHtml, activeTheme);
        setRenderedHtml(styledHtml);
    }, [markdownInput, activeTheme]);

    const handleCopy = async () => {
        if (!previewRef.current) return;
        setIsCopying(true);
        try {
            const finalHtmlForCopy = await makeWeChatCompatible(renderedHtml, activeTheme);

            const blob = new Blob([finalHtmlForCopy], { type: 'text/html' });
            const textBlob = new Blob([previewRef.current.innerText], { type: 'text/plain' });

            const clipboardItem = new ClipboardItem({
                'text/html': blob,
                'text/plain': textBlob
            });
            await navigator.clipboard.write([clipboardItem]);

            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Copy failed', err);
            alert('复制格式失败，请检查浏览器剪贴板权限');
        } finally {
            setIsCopying(false);
        }
    };

    const handleExportHtml = () => {
        const blob = new Blob([renderedHtml], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Raphael_Article_${new Date().getTime()}.html`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleExportPdf = () => {
        if (!previewRef.current) return;
        const element = previewRef.current;
        const opt = {
            margin: 10,
            filename: `Raphael_Article_${new Date().getTime()}.pdf`,
            image: { type: 'jpeg' as const, quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, letterRendering: true, backgroundColor: document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff' },
            jsPDF: { unit: 'mm' as const, format: 'a4', orientation: 'portrait' as const }
        };
        const clonedElement = element.cloneNode(true) as HTMLElement;
        const cloneContainer = document.createElement('div');
        cloneContainer.style.background = document.documentElement.classList.contains('dark') ? '#000000' : '#ffffff';
        cloneContainer.appendChild(clonedElement);

        document.body.appendChild(cloneContainer);
        html2pdf().set(opt).from(cloneContainer).save().then(() => {
            document.body.removeChild(cloneContainer);
        });
    };

    const deviceWidthClass = () => {
        if (previewDevice === 'mobile') return 'w-[480px] max-w-full';
        if (previewDevice === 'tablet') return 'w-[768px] max-w-full';
        return 'w-[840px] xl:w-[1024px] max-w-[95%]';
    };

    const gridLayoutClass = () => {
        if (previewDevice === 'mobile') return 'md:grid-cols-[61.8fr_38.2fr]';
        if (previewDevice === 'tablet') return 'md:grid-cols-[50fr_50fr]';
        return 'md:grid-cols-[38.2fr_61.8fr]';
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden antialiased bg-[#fbfbfd] dark:bg-black transition-colors duration-300">

            <Header themeMode={themeMode} onToggleTheme={toggleTheme} />

            {/* 移动端 Tab 切换 */}
            <div className="md:hidden glass-toolbar flex items-center z-[90]">
                <button
                    onClick={() => setActivePanel('editor')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold transition-colors border-b-2 ${activePanel === 'editor' ? 'text-[#0066cc] dark:text-[#0a84ff] border-[#0066cc] dark:border-[#0a84ff]' : 'text-[#86868b] dark:text-[#a1a1a6] border-transparent'}`}
                >
                    <PenLine size={15} />
                    编辑
                </button>
                <button
                    onClick={() => setActivePanel('preview')}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 text-[13px] font-semibold transition-colors border-b-2 ${activePanel === 'preview' ? 'text-[#0066cc] dark:text-[#0a84ff] border-[#0066cc] dark:border-[#0a84ff]' : 'text-[#86868b] dark:text-[#a1a1a6] border-transparent'}`}
                >
                    <Eye size={15} />
                    预览
                </button>
            </div>

            {/* 排版设置 & 工具栏 (桌面端) */}
            <div className={`glass-toolbar hidden md:grid grid-cols-1 ${gridLayoutClass()} px-0 z-[90] transition-all duration-500`}>
                <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                <Toolbar
                    previewDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onExportPdf={handleExportPdf}
                    onExportHtml={handleExportHtml}
                    onCopy={handleCopy}
                    copied={copied}
                    isCopying={isCopying}
                />
            </div>

            {/* 移动端工具栏 (主题 + 复制按钮) */}
            <div className="md:hidden glass-toolbar flex items-center z-[90]">
                <ThemeSelector activeTheme={activeTheme} onThemeChange={setActiveTheme} />
                <Toolbar
                    previewDevice={previewDevice}
                    onDeviceChange={setPreviewDevice}
                    onExportPdf={handleExportPdf}
                    onExportHtml={handleExportHtml}
                    onCopy={handleCopy}
                    copied={copied}
                    isCopying={isCopying}
                />
            </div>

            {/* 编辑区 & 预览区 */}
            <main className={`flex-1 overflow-hidden grid grid-cols-1 ${gridLayoutClass()} relative transition-all duration-500`}>
                <div className={`${activePanel === 'editor' ? 'flex' : 'hidden'} md:flex flex-col overflow-hidden`}>
                    <EditorPanel markdownInput={markdownInput} onInputChange={setMarkdownInput} />
                </div>
                <div className={`${activePanel === 'preview' ? 'flex' : 'hidden'} md:flex flex-col overflow-hidden`}>
                    <PreviewPanel renderedHtml={renderedHtml} deviceWidthClass={deviceWidthClass()} previewRef={previewRef} />
                </div>
            </main>

        </div>
    );
}
