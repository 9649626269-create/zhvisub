"use client";

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toasts: ToastMessage[];
  showToast: (message: string, type?: ToastType) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType>({
  toasts: [],
  showToast: () => {},
  removeToast: () => {},
});

// Global singleton listener for non-react or outside-hook calls
let globalToastHandler: ((msg: string, type: ToastType) => void) | null = null;

export const toast = {
  success: (msg: string) => {
    if (globalToastHandler) globalToastHandler(msg, "success");
    else console.log("[Toast Success]", msg);
  },
  error: (msg: string) => {
    if (globalToastHandler) globalToastHandler(msg, "error");
    else console.error("[Toast Error]", msg);
  },
  info: (msg: string) => {
    if (globalToastHandler) globalToastHandler(msg, "info");
    else console.log("[Toast Info]", msg);
  },
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    setToasts((prev) => [...prev.slice(-3), { id, message, type }]);

    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  useEffect(() => {
    globalToastHandler = showToast;
    return () => {
      globalToastHandler = null;
    };
  }, [showToast]);

  return (
    <ToastContext.Provider value={{ toasts, showToast, removeToast }}>
      {children}
      {/* Toast Floating Container */}
      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-2 px-4 pointer-events-none max-w-[480px] mx-auto">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-center gap-3 w-full py-3 px-4 rounded-2xl shadow-lg border transition-all animate-in fade-in slide-in-from-top-3 duration-200 ${
              t.type === "error"
                ? "bg-[#F6DADA] dark:bg-[#3E1E1C] border-[#F2938C] text-[#B3261E] dark:text-[#F2938C]"
                : t.type === "success"
                ? "bg-[#BFF3E4] dark:bg-[#1C3B32] border-[#72D9BC] text-[#0B6B57] dark:text-[#A6EDD9]"
                : "bg-[#FBF8F1] dark:bg-[#17241F] border-[#DDD8CC] dark:border-[#24362E] text-[#1B1B18] dark:text-[#F5F5F0]"
            }`}
          >
            {t.type === "error" && <AlertCircle className="w-5 h-5 flex-shrink-0" />}
            {t.type === "success" && <CheckCircle2 className="w-5 h-5 flex-shrink-0" />}
            {t.type === "info" && <Info className="w-5 h-5 flex-shrink-0" />}

            <p className="flex-1 text-xs font-medium leading-relaxed break-words">{t.message}</p>

            <button
              onClick={() => removeToast(t.id)}
              className="p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 text-current opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
