"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { exchangeGoogleCode } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setError("Không nhận được mã xác thực từ Google.");
      return;
    }

    exchangeGoogleCode(code)
      .then(async () => {
        await refreshUser();
        router.replace("/");
      })
      .catch((err: any) => {
        setError(err.message || "Xác thực Google thất bại.");
      });
  }, [searchParams, router, refreshUser]);

  if (error) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 app-card max-w-md mx-auto">
        <XCircle className="w-12 h-12 text-rose-400 mb-3" />
        <h2 className="text-base font-semibold text-slate-100">Đăng nhập thất bại</h2>
        <p className="text-xs text-slate-400 mt-1 mb-5">{error}</p>
        <button
          onClick={() => router.push("/login")}
          className="gradient-btn px-4 py-2 text-xs font-semibold"
        >
          Quay lại màn đăng nhập
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6">
      <Loader2 className="w-10 h-10 text-[#22D3EE] animate-spin mb-3" />
      <h2 className="text-base font-semibold text-slate-100">Đang hoàn tất đăng nhập...</h2>
      <p className="text-xs text-slate-400 mt-1">Đang mã hoá và kích hoạt kết nối Google Gemini</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#22D3EE] animate-spin" />
      </div>
    }>
      <CallbackContent />
    </Suspense>
  );
}
