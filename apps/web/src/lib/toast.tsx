'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

interface Toast {
  id: number;
  text: string;
  kind: 'info' | 'error';
}

const Ctx = createContext<(text: string, kind?: Toast['kind']) => void>(() => undefined);
export const useToast = () => useContext(Ctx);

let seq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, kind: Toast['kind'] = 'info') => {
    const id = seq++;
    setToasts((t) => [...t.slice(-2), { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-36 z-[70] flex flex-col items-center gap-2 px-4 md:bottom-28" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`animate-fade-in rounded-full px-4 py-2 text-sm font-medium shadow-lg ${
              t.kind === 'error' ? 'bg-red-600 text-white' : 'bg-gold text-ink'
            }`}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
