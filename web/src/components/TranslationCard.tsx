"use client";

import React from "react";
import Link from "next/link";
import { Languages, Sparkles, CheckCircle2, AlertTriangle, ArrowRight, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";

interface TranslationCardProps {
  engine: "gemini" | "openai" | "fallback";
  setEngine: (engine: "gemini" | "openai" | "fallback") => void;
}

export default function TranslationCard({
  engine,
  setEngine,
}: TranslationCardProps) {
  const { hasAiConnection, activeProvider, activeKeyMasked } = useAuth();

  const isConnected = hasAiConnection || engine === "fallback";

  return (
    <div className="app-card p-5 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-[#7C5CFF]">
            <Languages className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
              Dịch thuật
            </h2>
            <p className="text-xs text-slate-400">Chọn mô hình dịch nghĩa tiếng Trung → Việt</p>
          </div>
        </div>

        {/* Status Badge */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border ${
            hasAiConnection
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : engine === "fallback"
              ? "border-blue-500/30 bg-blue-500/10 text-blue-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-400"
          }`}
        >
          {hasAiConnection ? (
            <>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Đã kết nối</span>
            </>
          ) : engine === "fallback" ? (
            <>
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Miễn phí (NLLB/Google)</span>
            </>
          ) : (
            <>
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Chưa có API key</span>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* Engine Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            {
              id: "gemini",
              title: "Google Gemini",
              desc: "Dịch tự nhiên, nhanh & ngữ cảnh tốt nhất",
              badge: "Khuyên dùng",
            },
            {
              id: "openai",
              title: "OpenAI (GPT-4o)",
              desc: "Chuẩn xác thuật ngữ & tên riêng",
              badge: "Chính xác cao",
            },
            {
              id: "fallback",
              title: "Dịch miễn phí dự phòng",
              desc: "NLLB-200 offline hoặc Google Free",
              badge: "Không cần key",
            },
          ].map((item) => {
            const isSelected = engine === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setEngine(item.id as any)}
                className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                  isSelected
                    ? "border-[#7C5CFF] bg-[#7C5CFF]/15 text-white shadow-sm"
                    : "border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 bg-[#0B1020]/40 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
                      {item.title}
                    </span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded-md bg-[#1F2A44] text-[#22D3EE] font-medium">
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
                </div>
              </button>
            );
          })}
        </div>

        {/* Connection Notice / Link to Settings */}
        {engine !== "fallback" && (
          <div className="p-3.5 rounded-2xl bg-[#0B1020]/60 dark:bg-[#0B1020]/60 bg-slate-100/60 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 flex items-center justify-between">
            <div className="text-xs">
              {hasAiConnection ? (
                <div className="text-slate-300 dark:text-slate-300 text-slate-700">
                  Đang sử dụng: <span className="font-semibold text-[#22D3EE]">{activeProvider}</span> ({activeKeyMasked})
                </div>
              ) : (
                <div className="text-amber-400">
                  Bạn cần kết nối Google hoặc nhập API key để dùng mô hình này.
                </div>
              )}
            </div>
            <Link
              href="/settings"
              className="flex items-center gap-1 text-xs font-medium text-[#7C5CFF] hover:text-[#22D3EE] transition-colors ml-2 flex-shrink-0"
            >
              <span>{hasAiConnection ? "Đổi key" : "Cài đặt ngay"}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
