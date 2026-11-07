"use client";

import React from "react";
import { Mic, Volume2, Gauge, Check } from "lucide-react";
import { VoiceItem } from "../lib/api";

interface DubbingOptionsProps {
  dub: boolean;
  setDub: (val: boolean) => void;
  voice: string;
  setVoice: (val: string) => void;
  dubRate: string;
  setDubRate: (val: string) => void;
  origAudio: string;
  setOrigAudio: (val: string) => void;
  voicesList: VoiceItem[];
}

export default function DubbingOptions({
  dub,
  setDub,
  voice,
  setVoice,
  dubRate,
  setDubRate,
  origAudio,
  setOrigAudio,
  voicesList,
}: DubbingOptionsProps) {
  const parseRateNumber = (rateStr: string): number => {
    const num = parseInt(rateStr.replace("%", "").replace("+", "")) || 0;
    return parseFloat((1 + num / 100).toFixed(2));
  };

  const currentMultiplier = parseRateNumber(dubRate);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const mult = parseFloat(e.target.value);
    const percentDiff = Math.round((mult - 1.0) * 100);
    const formatted = percentDiff >= 0 ? `+${percentDiff}%` : `${percentDiff}%`;
    setDubRate(formatted);
  };

  const defaultVoices: VoiceItem[] =
    voicesList.length > 0
      ? voicesList
      : [
          { name: "vi-VN-HoaiMyNeural", gender: "Female", locale: "vi-VN" },
          { name: "vi-VN-NamMinhNeural", gender: "Male", locale: "vi-VN" },
        ];

  return (
    <div className="app-card space-y-4">
      {/* Dub Switch Row */}
      <div className="flex items-center justify-between py-1">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Lồng tiếng AI
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5">
            Đọc đồng bộ theo thời lượng câu gốc (FFmpeg atempo)
          </p>
        </div>

        <label className="m3-switch">
          <input
            type="checkbox"
            checked={dub}
            onChange={(e) => setDub(e.target.checked)}
          />
          <div className="m3-switch-track">
            <div className="m3-switch-thumb" />
          </div>
        </label>
      </div>

      {dub && (
        <div className="space-y-4 pt-2 border-t border-[var(--border-app)] animate-in fade-in duration-200">
          {/* Voice & Original Audio in two columns if space allows */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Voice select */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Giọng đọc AI
              </label>
              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value)}
                className="app-input py-2.5 text-xs cursor-pointer"
              >
                {defaultVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name.includes("HoaiMy")
                      ? "Hoài My (Nữ - Truyền cảm)"
                      : v.name.includes("NamMinh")
                      ? "Nam Minh (Nam - Trầm ấm)"
                      : `${v.name} (${v.gender})`}
                  </option>
                ))}
              </select>
            </div>

            {/* Original audio mixing */}
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Âm thanh gốc
              </label>
              <select
                value={origAudio}
                onChange={(e) => setOrigAudio(e.target.value)}
                className="app-input py-2.5 text-xs cursor-pointer"
              >
                <option value="duck">Giảm ~15dB khi lồng tiếng (Mặc định)</option>
                <option value="mute">Tắt hoàn toàn tiếng gốc</option>
                <option value="keep">Giữ nguyên âm lượng gốc</option>
              </select>
            </div>
          </div>

          {/* Speed Multiplier Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="text-[var(--text-primary)]">Tốc độ cơ sở</span>
              <span className="px-2 py-0.5 rounded-full bg-[#BFF3E4] dark:bg-[#1C3B32] text-[#0F8A6F] dark:text-[#A6EDD9] font-bold text-[11px]">
                {currentMultiplier}x ({dubRate})
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.2"
              step="0.05"
              value={currentMultiplier}
              onChange={handleSliderChange}
              className="w-full h-2 bg-[#DDD8CC] dark:bg-[#24362E] rounded-full appearance-none cursor-pointer accent-[#0F8A6F]"
            />
            <div className="flex justify-between text-[10px] text-[var(--text-secondary)] mt-1">
              <span>Chậm (0.8x)</span>
              <span>Chuẩn (1.0x)</span>
              <span>Nhanh (1.2x)</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
