import { useState, useCallback, useEffect } from 'react';

export interface Card {
    id: string;
    title: string;
    markdownInput: string;
    activeTheme: string;
}

const STORAGE_KEY = 'raphael_cards';

function generateId(): string {
    return Math.random().toString(36).slice(2, 9);
}

function extractTitle(markdown: string): string {
    const h1 = markdown.match(/^#\s+(.+)$/m);
    return h1 ? h1[1].trim().slice(0, 50) : 'Thẻ mới';
}

function loadCards(): Card[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw) as Card[];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveCards(cards: Card[]) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch { /* ignore */ }
}

function makeDefaultCard(defaultTheme = 'default'): Card {
    return {
        id: generateId(),
        title: 'Thẻ mới',
        markdownInput: '',
        activeTheme: defaultTheme,
    };
}

export function useCardStore(defaultTheme = 'default') {
    const [cards, setCards] = useState<Card[]>(() => {
        const saved = loadCards();
        if (saved.length > 0) return saved;
        return [makeDefaultCard(defaultTheme)];
    });

    // Persist on every change
    useEffect(() => {
        saveCards(cards);
    }, [cards]);

    const addCard = useCallback(() => {
        setCards(prev => [...prev, makeDefaultCard(defaultTheme)]);
    }, [defaultTheme]);

    const removeCard = useCallback((id: string) => {
        setCards(prev => {
            const next = prev.filter(c => c.id !== id);
            return next.length > 0 ? next : [makeDefaultCard(defaultTheme)];
        });
    }, [defaultTheme]);

    const updateCard = useCallback((id: string, patch: Partial<Omit<Card, 'id'>>) => {
        setCards(prev => prev.map(c => {
            if (c.id !== id) return c;
            const updated = { ...c, ...patch };
            // Auto-update title from markdown if not manually set
            if (patch.markdownInput !== undefined) {
                const autoTitle = extractTitle(patch.markdownInput);
                if (autoTitle !== 'Thẻ mới' || updated.title === 'Thẻ mới') {
                    updated.title = autoTitle;
                }
            }
            return updated;
        }));
    }, []);

    const duplicateCard = useCallback((id: string) => {
        setCards(prev => {
            const idx = prev.findIndex(c => c.id === id);
            if (idx === -1) return prev;
            const src = prev[idx];
            const copy: Card = { ...src, id: generateId(), title: src.title + ' (copy)' };
            const next = [...prev];
            next.splice(idx + 1, 0, copy);
            return next;
        });
    }, []);

    return { cards, addCard, removeCard, updateCard, duplicateCard };
}
