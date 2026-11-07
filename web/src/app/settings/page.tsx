"use client";

import { useState, useEffect } from "react";
import { getApiBaseUrl, setApiBaseUrl } from "@/lib/api";

export default function SettingsPage() {
  const [apiUrl, setApiUrl] = useState<string>("");
  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    setApiUrl(getApiBaseUrl());
  }, []);

  const handleSave = () => {
    setApiBaseUrl(apiUrl);
    setTestResult({ ok: true, message: "Đã lưu địa chỉ máy chủ thành công!" });
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);

    const target = apiUrl.trim().replace(/\/+$/, "");
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(`${target}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setTestResult({
          ok: true,
          message: `Kết nối thành công tới ${data.app || "ZhViSub"} (Phiên bản ${data.version || "1.0"})`,
        });
      } else {
        setTestResult({
          ok: false,
          message: `Máy chủ phản hồi với mã lỗi HTTP ${res.status}.`,
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: `Không thể kết nối tới máy chủ (${err.message}). Vui lòng kiểm tra lại địa chỉ IP/cổng mạng LAN.`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 pb-12">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Cài đặt kết nối</h1>
        <p className="text-xs text-slate-400">
          Cấu hình địa chỉ máy chủ xử lý video (cho mạng nội bộ LAN hoặc ứng dụng APK Android).
        </p>
      </div>

      <div className="bg-[#151d30] p-6 rounded-2xl border border-[#23314e] space-y-5">
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-slate-200">Địa chỉ API Server Backend</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
              placeholder="http://192.168.1.100:8000"
              className="flex-1 px-4 py-2.5 rounded-xl bg-[#0b0f19] border border-[#2a3b5c] text-slate-100 text-sm focus:outline-none focus:border-blue-500 transition font-mono"
            />
            <button
              onClick={handleSave}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm transition"
            >
              Lưu
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Mặc định: <code className="text-slate-400">http://localhost:8000</code>. Nếu chạy trên điện thoại hoặc máy khác trong mạng LAN, hãy nhập IP máy chủ (ví dụ: <code className="text-slate-400">http://192.168.1.x:8000</code>).
          </p>
        </div>

        <div className="pt-2">
          <button
            onClick={handleTestConnection}
            disabled={testing}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition flex items-center gap-2 disabled:opacity-50"
          >
            {testing ? "Đang thử kết nối..." : "🔌 Kiểm tra kết nối máy chủ"}
          </button>
        </div>

        {testResult && (
          <div
            className={`p-4 rounded-xl text-xs flex items-center gap-2 ${
              testResult.ok
                ? "bg-emerald-950/50 text-emerald-300 border border-emerald-500/30"
                : "bg-red-950/50 text-red-300 border border-red-500/30"
            }`}
          >
            <span>{testResult.ok ? "✅" : "❌"}</span>
            <span>{testResult.message}</span>
          </div>
        )}
      </div>

      {/* Network guidance card */}
      <div className="bg-[#151d30]/60 p-5 rounded-2xl border border-[#23314e] text-xs text-slate-400 space-y-2">
        <h3 className="font-semibold text-slate-300">Lưu ý khi sử dụng qua mạng LAN & APK:</h3>
        <ul className="list-disc pl-4 space-y-1">
          <li>Máy chủ backend và điện thoại chạy app cần kết nối chung một mạng Wi-Fi/LAN.</li>
          <li>Đảm bảo tường lửa (firewall) trên máy chủ mở cổng 8000.</li>
          <li>Ứng dụng Android APK đã được cấu hình bật cho phép kết nối mạng HTTP nội bộ (cleartext traffic).</li>
        </ul>
      </div>
    </div>
  );
}
