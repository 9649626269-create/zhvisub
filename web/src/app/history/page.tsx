"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { deleteJob, getDownloadUrl, JobStatus, listJobs } from "@/lib/api";

export default function HistoryPage() {
  const [jobs, setJobs] = useState<JobStatus[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [total, setTotal] = useState<number>(0);

  const loadJobs = async (p: number = 1) => {
    setLoading(true);
    try {
      const data = await listJobs(p, 20);
      setJobs(data.items);
      setTotal(data.total);
      setPage(data.page);
    } catch (err: any) {
      setError(err.message || "Lỗi tải lịch sử.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadJobs(1);
  }, []);

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xoá video và toàn bộ dữ liệu của công việc này?")) {
      return;
    }
    try {
      await deleteJob(id);
      setJobs((prev) => prev.filter((j) => j.id !== id));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (err: any) {
      alert("Lỗi xoá công việc: " + err.message);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">Lịch sử công việc</h1>
          <p className="text-xs text-slate-400">Quản lý và tải lại các video đã xử lý ({total} công việc)</p>
        </div>
        <button
          onClick={() => loadJobs(page)}
          className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
        >
          🔄 Làm mới
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm">
          ❌ {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-24 space-y-3">
          <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-400 text-xs">Đang tải danh sách...</p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-20 bg-[#151d30] rounded-2xl border border-[#23314e] space-y-3">
          <p className="text-slate-400 text-sm">Chưa có công việc nào.</p>
          <Link
            href="/"
            className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition"
          >
            Tạo công việc đầu tiên
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => {
            const isCompleted = job.status === "completed";
            const isFailed = job.status === "failed";
            const isCancelled = job.status === "cancelled";

            return (
              <div
                key={job.id}
                className="bg-[#151d30] p-4 rounded-xl border border-[#23314e] hover:border-slate-600 transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-200 text-sm">
                      {job.video_filename || "Video không tên"}
                    </span>
                    <span
                      className={`px-2 py-0.2 text-[10px] font-semibold rounded-full ${
                        isCompleted
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : isFailed
                          ? "bg-red-500/10 text-red-400 border border-red-500/30"
                          : isCancelled
                          ? "bg-slate-500/10 text-slate-400 border border-slate-500/30"
                          : "bg-blue-500/10 text-blue-400 border border-blue-500/30"
                      }`}
                    >
                      {isCompleted ? "Hoàn thành" : isFailed ? "Thất bại" : isCancelled ? "Đã huỷ" : "Đang xử lý"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Thời lượng: {job.video_duration.toFixed(1)}s • Phân giải: {job.video_width}x{job.video_height} •{" "}
                    {job.created_at ? new Date(job.created_at).toLocaleString("vi-VN") : ""}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <Link
                    href={`/job/?id=${job.id}`}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium transition"
                  >
                    Xem chi tiết
                  </Link>

                  {isCompleted && (
                    <>
                      <a
                        href={getDownloadUrl(job.id, "mp4")}
                        download
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        MP4
                      </a>
                      <a
                        href={getDownloadUrl(job.id, "srt_vi")}
                        download
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                      >
                        SRT (Vi)
                      </a>
                      {job.has_dub && (
                        <a
                          href={getDownloadUrl(job.id, "dub")}
                          download
                          className="px-2.5 py-1.5 rounded-lg bg-teal-900/40 hover:bg-teal-800 text-teal-300 border border-teal-700 transition"
                        >
                          Dub
                        </a>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => handleDelete(job.id)}
                    className="px-2.5 py-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 border border-red-800/40 transition"
                  >
                    Xoá
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
