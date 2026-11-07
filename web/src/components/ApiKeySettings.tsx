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
} from "../lib/api";

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
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

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
      // Guest mode: load from localStorage
      const guestKey = getGuestApiKey();
      const guestProv = getGuestProvider();
      const guestBase = getGuestBaseUrl();
      setApiKeyInput(guestKey);
      setProvider(guestProv);
      setBaseUrlInput(guestBase);
    }
  }, [user, isGuest]);

  const handleTestKey = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const keyToTest = apiKeyInput.trim();
      const res = await testApiKey(provider, keyToTest || undefined, baseUrlInput.trim() || undefined);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        valid: false,
        message: err.message || "Lỗi kết nối khi kiểm tra API key.",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      if (!isGuest && user) {
        // Save encrypted on server
        if (!apiKeyInput.trim()) {
          alert("Vui lòng nhập khoá API.");
          setIsSaving(false);
          return;
        }
        const updated = await saveApiKey(provider, apiKeyInput.trim(), baseUrlInput.trim() || undefined);
        setServerKeyStatus(updated);
        setApiKeyInput("");
      } else {
        // Save in guest mode (localStorage)
        updateGuestKey(apiKeyInput.trim(), provider, baseUrlInput.trim());
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      alert(err.message || "Không thể lưu khoá API.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteServerKey = async () => {
    if (!confirm("Bạn có chắc chắn muốn xoá khoá API đã lưu?")) return;
    try {
      await deleteApiKey();
      setServerKeyStatus(null);
      setApiKeyInput("");
    } catch (err: any) {
      alert(err.message || "Không thể xoá key.");
    }
  };

  return (
    <div className="space-y-6">
      {/* Method A: Google Account Connect (generative-language) */}
      <div className="app-card p-5">
        <div className="flex items-center justify-between pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-[#7C5CFF]">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
                Cách 1: Đăng nhập Google (Tự động kết nối Gemini)
              </h3>
              <p className="text-xs text-slate-400">
                Sử dụng token generative-language của chính bạn, lưu mã hoá phía server
              </p>
            </div>
          </div>

          {user?.has_google_token && (
            <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-xl">
              <CheckCircle2 className="w-3.5 h-3.5" /> Đã kết nối
            </span>
          )}
        </div>

        <div className="mt-4">
          {user && !isGuest ? (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-[#0B1020]/60 border border-[#1F2A44]">
              <div className="flex items-center gap-3">
                {user.picture ? (
                  <img src={user.picture} alt="Google Avatar" className="w-9 h-9 rounded-xl object-cover" />
                ) : (
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#7C5CFF] to-[#22D3EE] text-white flex items-center justify-center font-bold text-xs">
                    {user.name[0]}
                  </div>
                )}
                <div>
                  <div className="text-xs font-semibold text-slate-200">{user.name}</div>
                  <div className="text-[11px] text-slate-400">{user.email}</div>
                </div>
              </div>

              {user.has_google_token ? (
                <button
                  type="button"
                  onClick={disconnectGoogle}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-all self-end sm:self-center"
                >
                  <Unlink className="w-3.5 h-3.5" />
                  <span>Ngắt kết nối</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => loginWithGoogle()}
                  className="gradient-btn px-4 py-2 text-xs font-semibold self-end sm:self-center"
                >
                  Cấp quyền Gemini
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-[#0B1020]/40 border border-[#1F2A44]">
              <p className="text-xs text-slate-400 max-w-md">
                Đăng nhập tài khoản Google để sử dụng hạn ngạch Gemini miễn phí hàng ngày mà không cần tự tạo API key thủ công.
              </p>
              <button
                type="button"
                onClick={() => loginWithGoogle()}
                className="gradient-btn px-4 py-2.5 text-xs font-semibold flex items-center gap-2 whitespace-nowrap"
              >
                <Sparkles className="w-4 h-4" />
                <span>Tiếp tục với Google</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Method B: Manual API Key Input */}
      <div className="app-card p-5">
        <div className="flex items-center justify-between pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 flex items-center justify-center text-[#22D3EE]">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
                Cách 2: Tự nhập API Key (Gemini / OpenAI / Anthropic)
              </h3>
              <p className="text-xs text-slate-400">
                {isGuest ? "Lưu an toàn trên thiết bị (Guest Mode)" : "Mã hoá AES 256-bit trên máy chủ"}
              </p>
            </div>
          </div>

          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs font-semibold text-[#22D3EE] hover:underline"
          >
            <span>Lấy key Google</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>

        {/* Existing Saved Key on Server */}
        {!isGuest && serverKeyStatus?.has_key && (
          <div className="mt-4 p-3.5 rounded-2xl bg-[#0B1020]/60 border border-emerald-500/20 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <div>
                <span className="text-xs font-semibold text-slate-200">
                  Khoá đã lưu: <span className="font-mono text-[#22D3EE]">{serverKeyStatus.masked_key}</span>
                </span>
                <span className="text-[10px] text-slate-400 ml-2 uppercase font-medium">
                  ({serverKeyStatus.provider})
                </span>
              </div>
            </div>
            <button
              onClick={handleDeleteServerKey}
              className="text-xs text-rose-400 hover:bg-rose-500/10 p-1.5 rounded-lg transition-colors"
              title="Xoá key đã lưu"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="mt-4 space-y-4">
          {/* Provider Select */}
          <div>
            <label className="block text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
              Nhà cung cấp AI
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: "gemini", label: "Google Gemini" },
                { id: "openai", label: "OpenAI" },
                { id: "anthropic", label: "Anthropic" },
                { id: "custom", label: "Tuỳ chỉnh URL" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition-all ${
                    provider === p.id
                      ? "border-[#7C5CFF] bg-[#7C5CFF]/15 text-white shadow-sm font-semibold"
                      : "border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 bg-[#0B1020]/40 text-slate-400 hover:text-slate-200"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Custom Base URL (if custom) */}
          {provider === "custom" && (
            <div>
              <label className="block text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
                Base URL tương thích OpenAI (Ví dụ: http://localhost:11434/v1)
              </label>
              <input
                type="text"
                value={baseUrlInput}
                onChange={(e) => setBaseUrlInput(e.target.value)}
                placeholder="http://localhost:11434/v1"
                className="w-full px-4 py-2.5 rounded-xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 text-xs text-slate-100 dark:text-slate-100 text-slate-900 focus:outline-none focus:border-[#7C5CFF]"
              />
            </div>
          )}

          {/* API Key Input with Show/Hide */}
          <div>
            <label className="block text-xs font-medium text-slate-300 dark:text-slate-300 text-slate-700 mb-1.5">
              Khoá API Key ({provider.toUpperCase()})
            </label>
            <div className="relative">
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
                className="w-full px-4 py-2.5 pr-10 rounded-xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 text-xs font-mono text-slate-100 dark:text-slate-100 text-slate-900 focus:outline-none focus:border-[#7C5CFF]"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Bảo mật: Key không bao giờ xuất hiện trong log và chỉ hiển thị 4 ký tự cuối.
            </p>
          </div>

          {/* Test Result Message */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                testResult.valid
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
            >
              {testResult.valid ? (
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 flex-shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {/* Buttons: Test & Save */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              disabled={isTesting || (!apiKeyInput.trim() && !serverKeyStatus?.has_key)}
              onClick={handleTestKey}
              className="px-4 py-2.5 rounded-xl border border-[#1F2A44] hover:border-[#7C5CFF] text-xs font-semibold text-slate-200 flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Server className="w-3.5 h-3.5 text-[#22D3EE]" />}
              <span>Kiểm tra key</span>
            </button>

            <button
              type="submit"
              disabled={isSaving || !apiKeyInput.trim()}
              className="gradient-btn px-5 py-2.5 text-xs font-semibold flex items-center gap-2"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span>{isGuest ? "Lưu trên máy" : "Mã hoá & Lưu"}</span>
            </button>

            {saveSuccess && (
              <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" /> Đã lưu thành công!
              </span>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
