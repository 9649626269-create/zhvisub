"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, CheckCircle2, User, Loader2, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "../lib/auth";
import { isCapacitorApp, isLocalhostUrl, getApiBaseUrl } from "../lib/api";
import { toast } from "../lib/toast";

export default function LoginScreen() {
  const { loginWithGoogle, loginAsGuest } = useAuth();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [isMobileApp, setIsMobileApp] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMobileApp(isCapacitorApp());
  }, []);

  const handleGoogle = async () => {
    const base = getApiBaseUrl();
    if (isCapacitorApp() && isLocalhostUrl(base)) {
      toast.info("Đăng nhập Google yêu cầu cấu hình IP máy chủ máy tính trong Cài đặt hoặc dùng Chế độ khách.");
      return;
    }

    setLoadingGoogle(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      setLoadingGoogle(false);
      toast.error(err.message || "Không thể kết nối dịch vụ Google.");
    }
  };

  const handleGuest = () => {
    loginAsGuest();
    toast.success("Đang sử dụng chế độ Khách (Guest Mode)");
    router.push("/");
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center px-2 py-4">
      <div className="w-full app-card p-6 space-y-5 shadow-sm relative overflow-hidden">
        {/* Brand Icon & Heading */}
        <div className="text-center space-y-1.5">
          <div className="w-13 h-13 rounded-2xl bg-[#0F8A6F] flex items-center justify-center text-white mx-auto shadow-md shadow-[#0F8A6F]/20 p-3">
            <Sparkles className="w-6 h-6 flex-shrink-0" />
          </div>
          <h1 className="text-xl font-bold font-condensed tracking-tight text-[var(--text-primary)]">
            ZhViSub AI Video Sub & Dub
          </h1>
          <p className="text-xs text-[var(--text-secondary)] max-w-xs mx-auto leading-relaxed">
            Hệ thống tự động dịch video tiếng Trung sang tiếng Việt, làm mờ hard-sub và lồng tiếng AI đồng bộ.
          </p>
        </div>

        {/* Feature Highlights: Icon + text inline with gap */}
        <div className="space-y-2 p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-app)]">
          {[
            "Tự động nhận diện phụ đề cứng bằng PaddleOCR",
            "Dịch thuật ngữ cảnh tự nhiên bằng Gemini & OpenAI",
            "Lồng tiếng AI khớp từng câu với FFmpeg atempo",
          ].map((text, i) => (
            <div key={i} className="flex items-center gap-2.5 text-xs text-[var(--text-primary)]">
              <CheckCircle2 className="w-4 h-4 text-[#0F8A6F] flex-shrink-0" />
              <span className="leading-tight">{text}</span>
            </div>
          ))}
        </div>

        {/* Login Actions */}
        <div className="space-y-2.5">
          {/* Continue with Google */}
          <button
            type="button"
            onClick={handleGoogle}
            disabled={loadingGoogle}
            className="w-full py-2.5 px-4 rounded-full bg-white dark:bg-[#24362E] hover:bg-slate-50 dark:hover:bg-[#2E453B] text-slate-800 dark:text-slate-100 font-semibold text-xs flex items-center justify-center gap-2.5 shadow-sm border border-[var(--border-app)] transition-all active:scale-[0.99] disabled:opacity-75"
          >
            {loadingGoogle ? (
              <Loader2 className="w-4 h-4 animate-spin flex-shrink-0 text-[#0F8A6F]" />
            ) : (
              <svg className="w-4 h-4 max-w-[20px] max-h-[20px] flex-shrink-0" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                />
              </svg>
            )}
            <span>{loadingGoogle ? "Đang kết nối..." : "Tiếp tục với Google"}</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-0.5 text-[var(--text-secondary)] text-[11px]">
            <div className="flex-1 h-px bg-[var(--border-app)]" />
            <span>hoặc</span>
            <div className="flex-1 h-px bg-[var(--border-app)]" />
          </div>

          {/* Continue as Guest */}
          <button
            type="button"
            onClick={handleGuest}
            className="btn-primary w-full py-2.5 text-xs shadow-sm"
          >
            <User className="w-4 h-4 flex-shrink-0" />
            <span>Dùng không cần đăng nhập (Khách)</span>
          </button>
        </div>

        {/* Link to Settings */}
        <div className="pt-1 text-center">
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F8A6F] hover:underline"
          >
            <SettingsIcon className="w-3.5 h-3.5" />
            <span>Cài đặt IP máy chủ & API Key</span>
          </Link>
        </div>

        {/* Footer Note */}
        <p className="text-[11px] text-center text-[var(--text-secondary)] leading-relaxed">
          Chế độ khách lưu API key trực tiếp trên thiết bị của bạn. Khi đăng nhập Google, token được mã hoá an toàn chuẩn AES.
        </p>
      </div>
    </div>
  );
}
