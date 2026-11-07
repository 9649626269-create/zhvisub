"use client";

import React, { useState, useEffect } from "react";
import ApiKeySettings from "../../components/ApiKeySettings";
import { getApiBaseUrl, setApiBaseUrl } from "../../lib/api";
import { Sliders, Server, CheckCircle2, Globe, Sparkles } from "lucide-react";

export default function SettingsPage() {
  const [serverUrl, setServerUrl] = useState<string>("");
  const [testingServer, setTestingServer] = useState<boolean>(false);
  const [serverStatus, setServerStatus] = useState<"ok" | "err" | null>(null);

  useEffect(() => {
    setServerUrl(getApiBaseUrl());
  }, []);

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(serverUrl);
    setServerStatus(null);
  };

  const handleTestServer = async () => {
    setTestingServer(true);
    setServerStatus(null);
    try {
      const res = await fetch(`${serverUrl.replace(/\/+$/, "")}/health`);
      if (res.ok) {
        setServerStatus("ok");
        setApiBaseUrl(serverUrl);
      } else {
        setServerStatus("err");
      }
    } catch {
      setServerStatus("err");
    } finally {
      setTestingServer(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 dark:text-slate-100 text-slate-900">
          Cài đặt hệ thống & AI
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          Quản lý kết nối AI (Google Gemini, OpenAI, Anthropic) và địa chỉ máy chủ xử lý video
        </p>
      </div>

      {/* AI Key & OAuth Settings Section */}
      <ApiKeySettings />

      {/* Server URL Configuration (Crucial for APK & LAN) */}
      <div className="app-card p-5">
        <div className="flex items-center gap-2.5 pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
          <div className="w-8 h-8 rounded-xl bg-blue-500/10 flex items-center justify-center text-[#22D3EE]">
            <Server className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
              Địa chỉ máy chủ API (Dành cho Web & APK)
            </h3>
            <p className="text-xs text-slate-400">
              Khi chạy ứng dụng APK trên điện thoại, điền IP máy tính (Ví dụ: http://192.168.1.10:8000)
            </p>
          </div>
        </div>

        <form onSubmit={handleSaveServer} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
              API Base URL
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={serverUrl}
                onChange={(e) => setServerUrl(e.target.value)}
                placeholder="http://localhost:8000"
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 text-xs font-mono text-slate-100 dark:text-slate-100 text-slate-900 focus:outline-none focus:border-[#7C5CFF]"
              />
              <button
                type="button"
                disabled={testingServer}
                onClick={handleTestServer}
                className="px-4 py-2.5 rounded-xl border border-[#1F2A44] hover:border-[#22D3EE] text-xs font-semibold text-slate-200 hover:text-white bg-[#0B1020]/60 transition-colors"
              >
                {testingServer ? "Đang thử..." : "Kiểm tra kết nối"}
              </button>
            </div>
          </div>

          {serverStatus === "ok" && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>Máy chủ API đang hoạt động bình thường! Đã lưu URL.</span>
            </div>
          )}

          {serverStatus === "err" && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
              Không thể kết nối tới máy chủ tại địa chỉ này. Hãy kiểm tra xem backend đã chạy chưa và thiết bị có cùng mạng LAN không.
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
