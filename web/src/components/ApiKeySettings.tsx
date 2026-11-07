"use client";

import React, { useState, useEffect } from "react";
import {
  KeyRound,
  ShieldCheck,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Sparkles,
  Unlink,
  Server,
  Save,
  Trash2,
} from "lucide-react";
import { useAuth } from "../lib/auth";
import {
  saveApiKey,
  deleteApiKey,
  testApiKey,
  fetchApiKeyStatus,
  ApiKeyStatus,
  getGuestApiKey,
  getGuestProvider,
  getGuestBaseUrl,
  isCapacitorApp,
} from "../lib/api";
import { toast } from "../lib/toast";

export default function ApiKeySettings() {
  const { user, isGuest, loginWithGoogle, disconnectGoogle, updateGuestKey } = useAuth();

  // Form states
  const [provider, setProvider] = useState<string>("gemini");
  const [apiKeyInput, setApiKeyInput] = useState<string>("");
  const [baseUrlInput, setBaseUrlInput] = useState<string>("");
  const [showKey, setShowKey] = useState<boolean>(false);

  // Status & Testing states
  const [serverKeyStatus, setServerKeyStatus] = useState<ApiKeyStatus | null>(null);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ valid: boolean; message: string } | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState<boolean>(false);

  // Load existing status
  useEffect(() => {
    if (!isGuest && user) {
      fetchApiKeyStatus()
        .then((res) => {
          setServerKeyStatus(res);
          setProvider(res.provider || "gemini");
          if (res.base_url) setBaseUrlInput(res.base_url);
        })
        .catch(() => {});
    } else {
      const guestKey = getGuestApiKey();
      const guestProv = getGuestProvider();
      const guestBase = getGuestBaseUrl();
      setApiKeyInput(guestKey);
      setProvider(guestProv || "gemini");
      setBaseUrlInput(guestBase);
    }
  }, [user, isGuest]);

  const handleGoogleLogin = async () => {
    setIsGoogleLoading(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setIsGoogleLoading(false);
      toast.error(err.message || "Không thể kết nối dịch vụ Google.");
    }
  };

  const handleTestKey = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const keyToTest = apiKeyInput.trim();
      const res = await testApiKey(provider, keyToTest || undefined, baseUrlInput.trim() || undefined);
      setTestResult(res);
      if (res.valid) {
        toast.success(res.message || "Khoá API hợp lệ!");
      } else {
        toast.error(res.message || "Khoá API không hợp lệ.");
      }
    } catch (err: any) {
      const msg = err.message || "Lỗi kết nối khi kiểm tra API key.";
      setTestResult({ valid: false, message: msg });
      toast.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      if (!isGuest && user) {
        if (!apiKeyInput.trim()) {
          toast.error("Vui lòng nhập khoá API.");
          setIsSaving(false);
          return;
        }
        const updated = await saveApiKey(provider, apiKeyInput.trim(), baseUrlInput.trim() || undefined);
        setServerKeyStatus(updated);
        setApiKeyInput("");
        toast.success("Đã lưu mã hoá trên máy chủ!");
      } else {
        updateGuestKey(apiKeyInput.trim(), provider, baseUrlInput.trim());
        toast.success("Đã lưu khoá API trên thiết bị (Guest Mode)!");
      }
    } catch (err: any) {
      toast.error(err.message || "Không thể lưu khoá API.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteServerKey = async () => {
    try {
      await deleteApiKey();
      setServerKeyStatus(null);
      setApiKeyInput("");
      toast.success("Đã xoá khoá API lưu trên máy chủ.");
    } catch (err: any) {
      toast.error(err.message || "Không thể xoá key.");
    }
  };

  return (
    <div className="space-y-4">
      {/* 2. Card: Cách 1: Đăng nhập Google (Tự động kết nối Gemini) */}
      <div className="app-card space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Cách 1: Đăng nhập Google (Tự động kết nối Gemini)
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5 leading-relaxed">
              Sử dụng token generative-language của chính bạn, lưu mã hoá an toàn.
            </p>
          </div>

          {user?.has_google_token && (
            <span className="chip chip-mint flex-shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã kết nối
            </span>
          )}
        </div>

        {user && !isGuest && user.has_google_token ? (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-app)]">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.picture ? (
                <img src={user.picture} alt="Avatar" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[#0F8A6F] text-white flex items-center justify-center font-bold text-xs">
                  {user.name ? user.name[0] : "G"}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">{user.name}</p>
                <p className="text-[11px] text-[var(--text-secondary)] truncate">{user.email}</p>
              </div>
            </div>

            <button
              type="button"
              onClick={disconnectGoogle}
              className="btn-secondary py-1.5 px-3 text-xs text-rose-500 border-rose-300 hover:border-rose-500"
            >
              <Unlink className="w-3.5 h-3.5" />
              <span>Ngắt kết nối</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={isGoogleLoading}
            onClick={handleGoogleLogin}
            className="w-full py-3 px-4 rounded-full bg-gradient-to-r from-[#0F8A6F] to-[#7C5CFF] hover:opacity-95 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-75"
          >
            {isGoogleLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4" />
            )}
            <span>{isGoogleLoading ? "Đang kết nối..." : "Tiếp tục với Google"}</span>
          </button>
        )}
      </div>

      {/* 3. Card: Cách 2: Tự nhập API Key */}
      <div className="app-card space-y-4">
        {/* Header with Link button */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-bold text-[var(--text-primary)]">
              Cách 2: Tự nhập API Key
            </h3>
            <p className="text-xs text-[var(--text-secondary)] mt-0.5">
              Lưu an toàn trên thiết bị (Guest Mode)
            </p>
          </div>

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-bold text-[#0F8A6F] hover:underline flex-shrink-0"
          >
            <span>Lấy key Google</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Existing Saved Key on Server */}
        {!isGuest && serverKeyStatus?.has_key && (
          <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[#0F8A6F]/30 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#0F8A6F]" />
              <span className="text-xs">
                Khoá đã lưu: <strong className="font-mono text-[#0F8A6F]">{serverKeyStatus.masked_key}</strong>
              </span>
            </div>
            <button
              onClick={handleDeleteServerKey}
              className="p-1 rounded-full text-rose-500 hover:bg-rose-500/10"
              title="Xoá key"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-3.5">
          {/* Segmented Provider Selection (4 equal buttons, wrapping cleanly) */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
              Nhà cung cấp AI
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {[
                { id: "gemini", label: "Google Gemini" },
                { id: "openai", label: "OpenAI" },
                { id: "anthropic", label: "Anthropic" },
                { id: "custom", label: "Tuỳ chỉnh URL" },
              ].map((p) => {
                const isActive = provider === p.id;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setProvider(p.id)}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold text-center transition-all ${
                      isActive
                        ? "bg-[#BFF3E4] dark:bg-[#1C3B32] text-[#0F8A6F] dark:text-[#A6EDD9] border border-[#0F8A6F]"
                        : "bg-[var(--bg-app)] text-[var(--text-secondary)] border border-[var(--border-app)] hover:border-[#0F8A6F]/40"
                    }`}
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Base URL (if custom) */}
          {provider === "custom" && (
            <div>
              <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
                Base URL tương thích OpenAI
              </label>
              <input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="app-input py-2.5 text-xs font-mono"
              />
            </div>
          )}

          {/* API Key Input with Outlined Style & Eye Toggle */}
          <div>
            <label className="block text-xs font-semibold text-[var(--text-primary)] mb-1.5">
              Khoá API Key ({provider.toUpperCase()})
            </label>
            <div className="relative flex items-center">
              <input
                type={showKey ? "text" : "password"}
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={
                  provider === "gemini"
                    ? "AIzaSy..."
                    : provider === "openai"
                    ? "sk-..."
                    : "Nhập khoá API..."
                }
                className="app-input py-2.5 pr-10 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-[var(--text-secondary)] mt-1 pl-1">
              Key không bao giờ xuất hiện trong log và chỉ hiển thị 4 ký tự cuối.
            </p>
          </div>

          {/* Test result status chip */}
          {testResult && (
            <div
              className={`p-2.5 rounded-2xl text-xs flex items-center gap-2 ${
                testResult.valid
                  ? "bg-[#D1F5EA] text-[#0B6B57]"
                  : "bg-[#F6DADA] text-[#B3261E]"
              }`}
            >
              {testResult.valid ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span className="leading-tight">{testResult.message}</span>
            </div>
          )}

          {/* Two Equal Buttons Side-by-Side: NO OVERLAPPING */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <button
              type="button"
              disabled={isTesting || (!apiKeyInput.trim() && !serverKeyStatus?.has_key)}
              onClick={handleTestKey}
              className="btn-secondary w-full py-2.5 text-xs font-semibold"
            >
              {isTesting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Server className="w-4 h-4" />
              )}
              <span>Kiểm tra key</span>
            </button>

            <button
              type="submit"
              disabled={isSaving || !apiKeyInput.trim()}
              className="btn-primary w-full py-2.5 text-xs font-semibold"
            >
              {isSaving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              <span>Lưu trên máy</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
