"use client";

import React, { useState, useEffect } from "react";
import ApiKeySettings from "../../components/ApiKeySettings";
import {
  getApiBaseUrl,
  setApiBaseUrl,
  isCapacitorApp,
  isLocalhostUrl,
  apiFetch,
} from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { toast } from "../../lib/toast";
import {
  Sliders,
  Server,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  AlertCircle,
  Wifi,
} from "lucide-react";

export default function SettingsPage() {
  const { hasAiConnection, activeProvider } = useAuth();
  const [serverUrl, setServerUrl] = useState<string>("");
  const [testingServer, setTestingServer] = useState<boolean>(false);
  const [serverStatus, setServerStatus] = useState<{
    type: "ok" | "err";
    message: string;
  } | null>(null);

  const [isAppOnMobile, setIsAppOnMobile] = useState<boolean>(false);

  useEffect(() => {
    const currentUrl = getApiBaseUrl();
    setServerUrl(currentUrl);
    setIsAppOnMobile(isCapacitorApp());
  }, []);

  const handleSaveServer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!serverUrl.trim()) {
      toast.error("Vui lòng điền địa chỉ máy chủ API.");
      return;
    }
    setApiBaseUrl(serverUrl);
    toast.success("Đã lưu địa chỉ máy chủ API!");
  };

  const handleTestServer = async () => {
    const targetUrl = serverUrl.trim().replace(/\/+$/, "");
    if (!targetUrl) {
      toast.error("Vui lòng nhập địa chỉ máy chủ.");
      return;
    }

    setTestingServer(true);
    setServerStatus(null);

    // Check if on APK and testing localhost
    if (isCapacitorApp() && isLocalhostUrl(targetUrl)) {
      setServerStatus({
        type: "err",
        message: "Điện thoại không truy cập được localhost. Hãy nhập IP máy tính, ví dụ http://192.168.1.10:8000",
      });
      toast.error("Không thể dùng localhost trên điện thoại.");
      setTestingServer(false);
      return;
    }

    try {
      const res = await apiFetch(`${targetUrl}/health`, {}, 8000);
      if (res.ok) {
        setServerStatus({
          type: "ok",
          message: "Kết nối thành công! Máy chủ API đang hoạt động bình thường.",
        });
        setApiBaseUrl(targetUrl);
        toast.success("Kết nối máy chủ thành công!");
      } else {
        setServerStatus({
          type: "err",
          message: `Máy chủ phản hồi mã lỗi HTTP ${res.status}.`,
        });
        toast.error(`Lỗi máy chủ (HTTP ${res.status})`);
      }
    } catch (err: any) {
      const msg = err.message || "Không thể kết nối tới máy chủ (kiểm tra IP & Wi-Fi)";
      setServerStatus({
        type: "err",
        message: msg,
      });
      toast.error(msg);
    } finally {
      setTestingServer(false);
    }
  };

  const isLocalhostWarning = isAppOnMobile && isLocalhostUrl(serverUrl);

  return (
    <div className="space-y-4 pb-10">
      {/* 1. Hero Banner: Cài đặt hệ thống & AI */}
      <div className="hero-banner space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-bold font-condensed tracking-tight text-white leading-tight">
              Cài đặt hệ thống & AI
            </h2>
            <p className="text-xs text-white/90 leading-relaxed">
              Quản lý kết nối AI (Google Gemini, OpenAI, Anthropic) và địa chỉ máy chủ xử lý video.
            </p>
          </div>

          <span
            className={`chip whitespace-nowrap flex-shrink-0 ${
              hasAiConnection ? "chip-mint" : "chip-error"
            }`}
          >
            {hasAiConnection
              ? `Đã có Key · ${activeProvider}`
              : "Chưa có API Key · Engine: gemini"}
          </span>
        </div>
      </div>

      {/* 2 & 3: AI Authentication & API Key Component */}
      <ApiKeySettings />

      {/* 4. Card: Địa chỉ máy chủ API (Dành cho Web & APK) */}
      <div className="app-card space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[var(--text-primary)]">
            Địa chỉ máy chủ API (Dành cho Web & APK)
          </h3>
          <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
            Khi chạy APK trên điện thoại, điền IP máy tính (VD: http://192.168.1.10:8000)
          </p>
        </div>

        {/* Warning if running in APK with localhost */}
        {isLocalhostWarning && (
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-[#F6DADA] dark:bg-[#3E1E1C] text-[#B3261E] dark:text-[#F2938C] text-xs">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              <strong>Chú ý quan trọng:</strong> Điện thoại không truy cập được localhost. Hãy nhập IP máy tính cùng mạng Wi-Fi (ví dụ: <code className="font-bold underline">http://192.168.1.10:8000</code>).
            </p>
          </div>
        )}

        <form onSubmit={handleSaveServer} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
              API Base URL
            </label>
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              placeholder="http://192.168.1.10:8000"
              className="app-input py-2.5 text-xs font-mono"
            />
          </div>

          {/* Test result chip */}
          {serverStatus && (
            <div
              className={`p-2.5 rounded-2xl text-xs flex items-center gap-2 ${
                serverStatus.type === "ok"
                  ? "bg-[#D1F5EA] text-[#0B6B57]"
                  : "bg-[#F6DADA] text-[#B3261E]"
              }`}
            >
              {serverStatus.type === "ok" ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="leading-tight">{serverStatus.message}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={testingServer}
              onClick={handleTestServer}
              className="btn-secondary w-full py-2.5 text-xs font-semibold"
            >
              {testingServer ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wifi className="w-4 h-4" />
              )}
              <span>Kiểm tra kết nối</span>
            </button>

            <button
              type="submit"
              className="btn-primary w-full py-2.5 text-xs font-semibold"
            >
              <span>Lưu địa chỉ</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
