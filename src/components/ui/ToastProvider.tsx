import React, { createContext, useCallback, useContext, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
}

interface ToastContextValue {
  showToast: (type: ToastType, title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextValue>({ showToast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (type: ToastType, title: string, message?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, title, message }]);
      setTimeout(() => removeToast(id), 4800);
    },
    [removeToast]
  );

  const iconMap: Record<ToastType, React.ReactNode> = {
    success: <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />,
    error: <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />,
    warning: <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />,
    info: <Info className="w-4 h-4 text-[#376FA6] shrink-0" />,
  };

  const borderMap: Record<ToastType, string> = {
    success: 'border-emerald-200 bg-emerald-50/95 text-emerald-950',
    error: 'border-red-200 bg-red-50/95 text-red-950',
    warning: 'border-amber-200 bg-amber-50/95 text-amber-950',
    info: 'border-slate-200 bg-white text-slate-900',
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[90] flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className={`pointer-events-auto flex items-start gap-3 p-3.5 rounded-xl border shadow-sm transition-all ${borderMap[t.type]}`}
          >
            <div className="mt-0.5">{iconMap[t.type]}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-snug">{t.title}</p>
              {t.message && <p className="text-xs opacity-85 mt-0.5 leading-relaxed">{t.message}</p>}
            </div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              aria-label="Close notification"
              className="p-1 rounded-md hover:bg-black/5 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
