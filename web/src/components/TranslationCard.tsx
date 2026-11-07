"use client";

import React from "react";
import Link from "next/link";
import { Languages, Check, ArrowRight, ShieldCheck, AlertCircle } from "lucide-react";
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

  return (
    <div className="app-card space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Mô hình dịch AI (zh → vi)
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Dịch thuật ngữ cảnh tự nhiên kèm glossary
          </p>
        </div>

        {/* Status Chip */}
        <span
          className={`chip ${
            hasAiConnection || engine === "fallback" ? "chip-mint" : "chip-error"
          }`}
        >
          {hasAiConnection ? "Đã kết nối AI" : engine === "fallback" ? "Offline" : "Chưa có key"}
        </span>
      </div>

      {/* 3 Engine Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {[
          {
            id: "gemini",
            title: "Google Gemini",
            desc: "Dịch tự nhiên, nhanh & ngữ cảnh tốt",
            badge: "Khuyên dùng",
          },
          {
            id: "openai",
            title: "OpenAI GPT-4o",
            desc: "Chuẩn xác thuật ngữ & tên riêng",
            badge: "Chính xác cao",
          },
          {
            id: "fallback",
            title: "Miễn phí dự phòng",
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
              className={`p-3 rounded-2xl border text-left flex flex-col justify-between transition-all ${
                isSelected
                  ? "bg-[#BFF3E4] dark:bg-[#1C3B32] border-[#0F8A6F] text-[#0B6B57] dark:text-[#A6EDD9]"
                  : "bg-[var(--card-app)] border-[var(--border-app)] text-[var(--text-primary)] hover:border-[#0F8A6F]/40"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold">{item.title}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/5 dark:bg-white/10 font-semibold">
                    {item.badge}
                  </span>
                </div>
                <p className="text-[11px] text-[var(--text-secondary)] leading-normal">
                  {item.desc}
                </p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Notice if engine needs key */}
      {engine !== "fallback" && !hasAiConnection && (
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[#F6DADA] dark:bg-[#3E1E1C] text-[#B3261E] dark:text-[#F2938C] text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Cần kết nối Google hoặc nhập API key</span>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-1 font-bold underline text-xs ml-2 flex-shrink-0"
          >
            <span>Cài đặt</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}
