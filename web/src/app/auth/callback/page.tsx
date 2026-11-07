"use client";

import React, { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, XCircle } from "lucide-react";
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
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 app-card max-w-sm mx-auto my-8 space-y-4">
        <div className="w-12 h-12 rounded-full bg-[#F6DADA] text-[#B3261E] flex items-center justify-center mx-auto">
          <XCircle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-[var(--text-primary)]">Đăng nhập thất bại</h2>
        <p className="text-xs text-[var(--text-secondary)] leading-relaxed">{error}</p>
        <button
          onClick={() => router.push("/login")}
          className="btn-primary py-2 px-5 text-xs"
        >
          Quay lại màn đăng nhập
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 space-y-3">
      <Loader2 className="w-8 h-8 text-[#0F8A6F] animate-spin mb-1" />
      <h2 className="text-base font-bold text-[var(--text-primary)]">Đang hoàn tất kết nối...</h2>
      <p className="text-xs text-[var(--text-secondary)]">Đang mã hoá và kích hoạt tài khoản Google</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-[#0F8A6F] animate-spin" />
        </div>
      }
    >
      <CallbackContent />
    </Suspense>
  );
}
