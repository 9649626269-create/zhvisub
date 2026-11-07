"use client";

import React from "react";
import { Sliders, EyeOff, LayoutTemplate, Layers } from "lucide-react";

interface ProcessingOptionsProps {
  blur: boolean;
  setBlur: (val: boolean) => void;
  blurStrength: number;
  setBlurStrength: (val: number) => void;
  position: string;
  setPosition: (val: string) => void;
}

export default function ProcessingOptions({
  blur,
  setBlur,
  blurStrength,
  setBlurStrength,
  position,
  setPosition,
}: ProcessingOptionsProps) {
  return (
    <div className="app-card p-5 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center text-[#22D3EE]">
            <EyeOff className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
              Xử lý phụ đề
            </h2>
            <p className="text-xs text-slate-400">Làm mờ phụ đề cứng gốc và bố trí phụ đề Việt</p>
          </div>
        </div>

        {/* OCR Blur Switch */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={blur}
            onChange={(e) => setBlur(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#1F2A44] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#7C5CFF] peer-checked:to-[#22D3EE]"></div>
        </label>
      </div>

      {/* Controls when Blur is Enabled */}
      {blur ? (
        <div className="mt-4 space-y-4 animate-in fade-in duration-200">
          {/* Gaussian Blur Strength Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
              <span>Độ mờ Gaussian</span>
              <span className="px-2 py-0.5 rounded-md bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] font-semibold text-[#22D3EE]">
                {blurStrength}
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={blurStrength}
              onChange={(e) => setBlurStrength(parseInt(e.target.value) || 0)}
              className="w-full h-1.5 bg-[#1F2A44] rounded-lg appearance-none cursor-pointer accent-[#22D3EE]"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>Nhẹ (10)</span>
              <span>Chuẩn (30)</span>
              <span>Mạnh (80+)</span>
            </div>
          </div>

          {/* Subtitle Position Select */}
          <div>
            <label className="block text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
              Vị trí phụ đề Việt
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "bottom", label: "Dưới đáy (mặc định)" },
                { id: "middle", label: "Ở giữa" },
                { id: "top", label: "Trên cùng" },
              ].map((pos) => (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => setPosition(pos.id)}
                  className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition-all ${
                    position === pos.id
                      ? "border-[#7C5CFF] bg-[#7C5CFF]/15 text-white shadow-sm"
                      : "border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 text-slate-400 hover:text-slate-200 bg-[#0B1020]/40"
                  }`}
                >
                  {pos.label}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Preview Frame */}
          <div className="mt-3 pt-3 border-t border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
            <span className="text-[11px] font-medium text-slate-400 block mb-2">
              Minh hoạ khung hình video & vùng làm mờ:
            </span>
            <div className="relative aspect-video w-full rounded-2xl bg-gradient-to-b from-slate-900 via-slate-800 to-slate-950 overflow-hidden border border-[#1F2A44] flex flex-col justify-between p-3 select-none">
              {/* Top area */}
              <div className="flex justify-between items-center text-[10px] text-slate-500">
                <span>16:9 HD Frame</span>
                <span className="flex items-center gap-1 text-[#22D3EE]">
                  <Layers className="w-3 h-3" /> Blur: {blurStrength}
                </span>
              </div>

              {/* Simulated Subtitle Placement */}
              <div
                className={`w-full flex justify-center transition-all duration-200 ${
                  position === "top"
                    ? "mt-1"
                    : position === "middle"
                    ? "my-auto"
                    : "mb-1"
                }`}
              >
                {/* Simulated Blur Zone & Text */}
                <div
                  className="px-4 py-1.5 rounded-lg border border-cyan-500/30 flex flex-col items-center justify-center transition-all"
                  style={{
                    backdropFilter: `blur(${Math.max(2, blurStrength / 10)}px)`,
                    backgroundColor: "rgba(11, 16, 32, 0.75)",
                  }}
                >
                  <span className="text-[10px] line-through text-slate-500">原中文硬字幕 (Đã làm mờ)</span>
                  <span className="text-xs font-semibold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                    Phụ đề tiếng Việt hiển thị ở đây
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">
          Chức năng làm mờ phụ đề cứng đang tắt. Video sẽ giữ nguyên khung hình gốc và chỉ burn-in phụ đề Việt.
        </p>
      )}
    </div>
  );
}
