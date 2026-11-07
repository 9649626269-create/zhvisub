"use client";

import React, { useState, useEffect } from "react";
import HistoryList from "../../components/HistoryList";
import { listJobs, JobStatus } from "../../lib/api";
import { Loader2, RotateCw } from "lucide-react";

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
    <div className="space-y-4 pb-6">
      {loading && jobs.length === 0 ? (
        <div className="min-h-[40vh] flex flex-col items-center justify-center text-center p-6 text-[var(--text-secondary)]">
          <Loader2 className="w-8 h-8 text-[#0F8A6F] animate-spin mb-3" />
          <p className="text-xs">Đang tải lịch sử công việc...</p>
        </div>
      ) : error ? (
        <div className="app-card p-6 text-center text-[#B3261E] dark:text-[#F2938C] text-xs space-y-3">
          <p>{error}</p>
          <button
            onClick={fetchHistory}
            className="btn-primary py-2 px-4 text-xs"
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
