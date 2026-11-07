"use client";

import React, { useState, useEffect } from "react";
import HistoryList from "../../components/HistoryList";
import { listJobs, JobStatus } from "../../lib/api";
import { History, Loader2, RotateCcw } from "lucide-react";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listJobs(1, 50);
      setJobs(data.items || []);
    } catch (err: any) {
      setError(err.message || "Không thể tải danh sách lịch sử.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  return (
    <div className="space-y-6 pb-20">
      {/* Title & Refresh */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 dark:text-slate-100 text-slate-900">
            Lịch sử video
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Xem lại các video đã xử lý, tải về bản dịch và file âm thanh
          </p>
        </div>

        <button
          onClick={fetchHistory}
          disabled={loading}
          className="p-2.5 rounded-xl border border-[#1F2A44] hover:border-[#7C5CFF] text-slate-300 hover:text-white bg-[#121A2F]/60 transition-colors"
          title="Làm mới danh sách"
        >
          <RotateCcw className={`w-4 h-4 ${loading ? "animate-spin text-[#22D3EE]" : ""}`} />
        </button>
      </div>

      {loading && jobs.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center p-6">
          <Loader2 className="w-8 h-8 text-[#22D3EE] animate-spin mb-3" />
          <p className="text-xs text-slate-400">Đang tải lịch sử công việc...</p>
        </div>
      ) : error ? (
        <div className="app-card p-6 text-center text-rose-400 text-xs">
          <p>{error}</p>
          <button
            onClick={fetchHistory}
            className="mt-3 gradient-btn px-4 py-1.5 text-xs font-semibold"
          >
            Thử lại
          </button>
        </div>
      ) : (
        <HistoryList jobs={jobs} onRefresh={fetchHistory} />
      )}
    </div>
  );
}
