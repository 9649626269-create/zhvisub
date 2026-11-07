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
  // Parse numeric rate e.g. "+0%" -> 1.0
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

  const defaultVoices: VoiceItem[] = voicesList.length > 0 ? voicesList : [
    { name: "vi-VN-HoaiMyNeural", gender: "Female", locale: "vi-VN" },
    { name: "vi-VN-NamMinhNeural", gender: "Male", locale: "vi-VN" },
  ];

  return (
    <div className="app-card p-5 transition-all">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-[#7C5CFF]">
            <Mic className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
              Lồng tiếng AI
            </h2>
            <p className="text-xs text-slate-400">Đọc đồng bộ theo thời gian câu gốc</p>
          </div>
        </div>

        {/* AI Dub Switch */}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={dub}
            onChange={(e) => setDub(e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-[#1F2A44] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-gradient-to-r peer-checked:from-[#7C5CFF] peer-checked:to-[#22D3EE]"></div>
        </label>
      </div>

      {dub ? (
        <div className="mt-4 space-y-4 animate-in fade-in duration-200">
          {/* Voice Selection */}
          <div>
            <label className="block text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
              Chọn giọng đọc (Nam / Nữ)
            </label>
            <div className="grid grid-cols-2 gap-2">
              {defaultVoices.map((v) => {
                const isSelected = voice === v.name;
                const isFemale = v.gender.toLowerCase() === "female" || v.name.includes("HoaiMy");
                return (
                  <button
                    key={v.name}
                    type="button"
                    onClick={() => setVoice(v.name)}
                    className={`p-3 rounded-2xl border text-left flex items-center justify-between transition-all ${
                      isSelected
                        ? "border-[#7C5CFF] bg-[#7C5CFF]/15 text-white shadow-sm"
                        : "border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 bg-[#0B1020]/40 text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <div>
                      <div className="text-xs font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
                        {isFemale ? "Hoài My (Nữ)" : "Nam Minh (Nam)"}
                      </div>
                      <div className="text-[10px] text-slate-400">{v.name}</div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#22D3EE]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Reading Speed Slider */}
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
              <span className="flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-[#22D3EE]" /> Tốc độ cơ sở
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] font-semibold text-[#22D3EE]">
                {currentMultiplier.toFixed(2)}x ({dubRate})
              </span>
            </div>
            <input
              type="range"
              min="0.8"
              max="1.2"
              step="0.05"
              value={currentMultiplier}
              onChange={handleSliderChange}
              className="w-full h-1.5 bg-[#1F2A44] rounded-lg appearance-none cursor-pointer accent-[#7C5CFF]"
            />
            <div className="flex justify-between text-[10px] text-slate-500 mt-1">
              <span>0.80x (Chậm)</span>
              <span>1.00x (Chuẩn)</span>
              <span>1.20x (Nhanh)</span>
            </div>
          </div>

          {/* Original Audio Volume Mode */}
          <div>
            <label className="block text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
              Xử lý âm thanh gốc của video
            </label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: "duck", label: "Giảm 15dB", desc: "Mặc định, rõ lời" },
                { id: "mute", label: "Tắt tiếng", desc: "Chỉ giữ lồng tiếng" },
                { id: "keep", label: "Giữ nguyên", desc: "Không giảm nhạc" },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setOrigAudio(opt.id)}
                  className={`p-2.5 rounded-xl border text-center transition-all ${
                    origAudio === opt.id
                      ? "border-[#22D3EE] bg-[#22D3EE]/15 text-white shadow-sm"
                      : "border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 bg-[#0B1020]/40 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <div className="text-xs font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
                    {opt.label}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">{opt.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="mt-4 text-xs text-slate-400">
          Chức năng lồng tiếng đang tắt. Video sẽ giữ nguyên 100% âm thanh và nhạc nền gốc.
        </p>
      )}
    </div>
  );
}
