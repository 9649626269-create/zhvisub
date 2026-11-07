"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Shield, KeyRound, ArrowRight, CheckCircle2, User } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function LoginScreen() {
  const { loginWithGoogle, loginAsGuest } = useAuth();
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const router = useRouter();

  const handleGoogle = async () => {
    setLoadingGoogle(true);
    try {
      await loginWithGoogle();
    } catch (err: any) {
      alert(err.message || "Lỗi khởi tạo đăng nhập Google.");
      setLoadingGoogle(false);
    }
  };

  const handleGuest = () => {
    loginAsGuest();
    router.push("/");
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md app-card p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        {/* Glow decoration */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-[#7C5CFF]/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-[#22D3EE]/20 rounded-full blur-3xl pointer-events-none" />

        {/* Brand Icon & Heading */}
        <div className="text-center mb-8 relative">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-[#7C5CFF] to-[#22D3EE] flex items-center justify-center text-white mx-auto shadow-lg shadow-[#7C5CFF]/30 mb-4">
            <Sparkles className="w-7 h-7" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-100 dark:text-slate-100 text-slate-800">
            Chào mừng đến với <span className="gradient-text">ZhViSub</span>
          </h1>
          <p className="text-xs text-slate-400 mt-2 max-w-xs mx-auto leading-relaxed">
            Hệ thống tự động dịch video tiếng Trung sang tiếng Việt, làm mờ hardsub và lồng tiếng AI đồng bộ.
          </p>
        </div>

        {/* Feature Highlights */}
        <div className="space-y-2.5 mb-8 p-3.5 rounded-2xl bg-[#0B1020]/50 dark:bg-[#0B1020]/50 bg-slate-50 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
          {[
            "Tự động nhận diện phụ đề cứng bằng PaddleOCR",
            "Dịch thuật ngữ cảnh tự nhiên bằng Gemini & OpenAI",
            "Lồng tiếng AI khớp từng câu với FFmpeg atempo",
          ].map((text, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-slate-300 dark:text-slate-300 text-slate-700">
              <CheckCircle2 className="w-4 h-4 text-[#22D3EE] flex-shrink-0" />
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* Login Actions */}
        <div className="space-y-3.5">
          {/* Continue with Google */}
          <button
            onClick={handleGoogle}
            disabled={loadingGoogle}
            className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-semibold text-sm flex items-center justify-center gap-3 shadow-md hover:shadow-lg transition-all border border-slate-200 active:scale-[0.99] disabled:opacity-75"
          >
            {/* Google G Logo */}
            <svg className="w-5 h-5" viewBox="0 0 24 24">
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
            <span>{loadingGoogle ? "Đang chuyển hướng..." : "Tiếp tục với Google"}</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-3 my-2 text-slate-500 text-xs">
            <div className="flex-1 h-px bg-[#1F2A44] dark:bg-[#1F2A44] bg-slate-200" />
            <span>hoặc</span>
            <div className="flex-1 h-px bg-[#1F2A44] dark:bg-[#1F2A44] bg-slate-200" />
          </div>

          {/* Continue as Guest */}
          <button
            onClick={handleGuest}
            className="w-full py-3.5 px-4 rounded-2xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 hover:bg-[#121A2F] border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 text-slate-300 dark:text-slate-300 text-slate-700 font-semibold text-xs flex items-center justify-center gap-2 transition-all hover:border-[#7C5CFF]"
          >
            <User className="w-4 h-4 text-[#7C5CFF]" />
            <span>Dùng không cần đăng nhập (Khách)</span>
          </button>
        </div>

        {/* Footer Note */}
        <p className="text-[11px] text-center text-slate-500 mt-6 leading-relaxed">
          Chế độ khách lưu API key trực tiếp trên thiết bị của bạn. Khi đăng nhập Google, token được mã hoá an toàn chuẩn AES.
        </p>
      </div>
    </div>
  );
}
