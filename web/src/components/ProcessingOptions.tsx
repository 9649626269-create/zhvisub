"use client";

import React, { useState } from "react";
import { EyeOff, Info, Check, Scan, Sparkles } from "lucide-react";

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
  const [blurMode, setBlurMode] = useState<"manual" | "ai">("ai");
  const [stopOnBlurFail, setStopOnBlurFail] = useState<boolean>(true);

  return (
    <div className="app-card space-y-4">
      {/* Card Header Label */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#0F8A6F] tracking-wide uppercase">
          02 · Cấu hình nhanh
        </span>
      </div>

      {/* Main Blur Switch */}
      <div className="flex items-center justify-between py-1">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Xoá phụ đề gốc
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Làm mờ phụ đề cứng bằng PaddleOCR & FFmpeg
          </p>
        </div>

        <label className="m3-switch">
          <input
            type="checkbox"
            checked={blur}
            onChange={(e) => setBlur(e.target.checked)}
          />
          <div className="m3-switch-track">
            <div className="m3-switch-thumb" />
          </div>
        </label>
      </div>

      {/* When Blur is Enabled */}
      {blur && (
        <div className="space-y-4 pt-2 border-t border-[var(--border-app)] animate-in fade-in duration-200">
          {/* Two Radio Selection Cards: Manual Blur vs AI Region Processing */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Option 1: Làm mờ thủ công */}
            <div
              onClick={() => setBlurMode("manual")}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                blurMode === "manual"
                  ? "bg-[#BFF3E4] dark:bg-[#1C3B32] border-[#0F8A6F] text-[#0B6B57] dark:text-[#A6EDD9]"
                  : "bg-[var(--card-app)] border-[var(--border-app)] text-[var(--text-primary)] hover:border-[#0F8A6F]/40"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 ${
                  blurMode === "manual"
                    ? "border-[#0F8A6F] bg-[#0F8A6F] text-white"
                    : "border-[var(--text-secondary)]"
                }`}
              >
                {blurMode === "manual" && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-xs font-bold leading-tight">Làm mờ thủ công</p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-normal">
                  FFmpeg làm mờ đúng vùng và thời gian bạn chọn.
                </p>
              </div>
            </div>

            {/* Option 2: AI xử lý vùng chọn */}
            <div
              onClick={() => setBlurMode("ai")}
              className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3 ${
                blurMode === "ai"
                  ? "bg-[#BFF3E4] dark:bg-[#1C3B32] border-[#0F8A6F] text-[#0B6B57] dark:text-[#A6EDD9]"
                  : "bg-[var(--card-app)] border-[var(--border-app)] text-[var(--text-primary)] hover:border-[#0F8A6F]/40"
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-0.5 flex-shrink-0 ${
                  blurMode === "ai"
                    ? "border-[#0F8A6F] bg-[#0F8A6F] text-white"
                    : "border-[var(--text-secondary)]"
                }`}
              >
                {blurMode === "ai" && <div className="w-2 h-2 rounded-full bg-white" />}
              </div>
              <div>
                <p className="text-xs font-bold leading-tight">AI xử lý vùng chọn</p>
                <p className="text-[11px] text-[var(--text-secondary)] mt-1 leading-normal">
                  AI chỉ dò và xoá chữ bên trong vùng đã khoanh.
                </p>
              </div>
            </div>
          </div>

          {/* Info callout */}
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#0F8A6F]/10 text-[#0F8A6F] dark:text-[#A6EDD9]">
            <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] leading-relaxed">
              Kéo trực tiếp trên video để tạo vùng. Toạ độ được lưu theo tỷ lệ nên không lệch khi backend xử lý độ phân giải khác.
            </p>
          </div>

          {/* Blur Strength Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="text-[var(--text-primary)]">Mức mờ Gaussian</span>
              <span className="px-2 py-0.5 rounded-full bg-[#BFF3E4] dark:bg-[#1C3B32] text-[#0B6B57] dark:text-[#A6EDD9] font-bold text-[11px]">
                {blurStrength}
              </span>
            </div>
            <input
              type="range"
              min="10"
              max="100"
              value={blurStrength}
              onChange={(e) => setBlurStrength(parseInt(e.target.value) || 30)}
              className="w-full h-2 bg-[#DDD8CC] dark:bg-[#24362E] rounded-full appearance-none cursor-pointer accent-[#0F8A6F]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1">
              <span>Nhẹ (10)</span>
              <span>Chuẩn (30)</span>
              <span>Mạnh (80+)</span>
            </div>
          </div>

          {/* Subtitle Position Select */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
              Vị trí phụ đề Việt
            </label>
            <select
              value={position}
              onChange={(e) => setPosition(e.target.value)}
              className="app-input py-2.5 text-xs cursor-pointer"
            >
              <option value="bottom">Đáy khung hình (Khuyến nghị)</option>
              <option value="middle">Giữa khung hình</option>
              <option value="top">Đỉnh khung hình</option>
            </select>
          </div>

          {/* Switch: Dừng job nếu xoá phụ đề thất bại */}
          <div className="flex items-center justify-between pt-2">
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)]">
                Dừng job nếu xóa phụ đề thất bại
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Nếu backend không tạo được video sạch, job sẽ báo lỗi thay vì xuất video còn chữ.
              </p>
            </div>
            <label className="m3-switch">
              <input
                type="checkbox"
                checked={stopOnBlurFail}
                onChange={(e) => setStopOnBlurFail(e.target.checked)}
              />
              <div className="m3-switch-track">
                <div className="m3-switch-thumb" />
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
