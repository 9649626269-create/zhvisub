"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Search,
  Film,
  Download,
  Trash2,
  ExternalLink,
  Calendar,
  Clock,
  Sparkles,
  Inbox,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { JobStatus, getDownloadUrl, deleteJob } from "../lib/api";

interface HistoryListProps {
  jobs: JobStatus[];
  onRefresh: () => void;
}

export default function HistoryList({ jobs, onRefresh }: HistoryListProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const formatDate = (isoString?: string) => {
    if (!isoString) return "Mới đây";
    try {
      const d = new Date(isoString);
      return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · ${d.toLocaleDateString("vi-VN")}`;
    } catch {
      return isoString;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Bạn có chắc chắn muốn xoá video này và toàn bộ dữ liệu liên quan?")) return;
    setDeletingId(id);
    try {
      await deleteJob(id);
      onRefresh();
    } catch (err: any) {
      alert(err.message || "Không thể xoá video.");
    } finally {
      setDeletingId(null);
    }
  };

  // Filter jobs
  const filteredJobs = jobs.filter((job) => {
    const matchesSearch =
      (job.video_filename && job.video_filename.toLowerCase().includes(searchQuery.toLowerCase())) ||
      job.id.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "completed" && job.status === "completed") ||
      (statusFilter === "processing" && (job.status === "processing" || job.status === "pending")) ||
      (statusFilter === "failed" && (job.status === "failed" || job.status === "cancelled"));

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-5">
      {/* Search & Filter Bar */}
      <div className="app-card p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        {/* Search Input */}
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm theo tên file hoặc mã job..."
            className="w-full px-4 py-2.5 pl-10 rounded-xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 text-xs text-slate-100 dark:text-slate-100 text-slate-900 focus:outline-none focus:border-[#7C5CFF]"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
        </div>

        {/* Status Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 text-xs">
          {[
            { id: "all", label: "Tất cả" },
            { id: "completed", label: "Hoàn thành" },
            { id: "processing", label: "Đang xử lý" },
            { id: "failed", label: "Thất bại" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl font-medium whitespace-nowrap transition-all ${
                statusFilter === tab.id
                  ? "bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200 bg-[#0B1020]/40 border border-[#1F2A44]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards List or Empty State */}
      {filteredJobs.length === 0 ? (
        <div className="app-card p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#7C5CFF]/10 to-[#22D3EE]/10 border border-[#7C5CFF]/20 flex items-center justify-center text-slate-400 mb-4">
            <Inbox className="w-8 h-8 text-[#22D3EE]" />
          </div>
          <h3 className="text-base font-semibold text-slate-200 dark:text-slate-200 text-slate-800">
            Chưa có video nào
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            {searchQuery
              ? "Không tìm thấy kết quả phù hợp với từ khoá tìm kiếm."
              : "Bạn chưa dịch video nào. Bắt đầu tải lên video tiếng Trung đầu tiên ngay!"}
          </p>
          <Link
            href="/"
            className="mt-5 gradient-btn px-5 py-2.5 text-xs font-semibold flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>Tạo video mới</span>
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3.5">
          {filteredJobs.map((job) => (
            <div
              key={job.id}
              className="app-card p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 hover:border-[#7C5CFF]/40 transition-all"
            >
              {/* Left Info */}
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#7C5CFF]/15 to-[#22D3EE]/15 border border-[#1F2A44] flex items-center justify-center text-[#7C5CFF] flex-shrink-0">
                  <Film className="w-6 h-6" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-slate-100 dark:text-slate-100 text-slate-800 truncate">
                    {job.video_filename || `Video ${job.id.slice(0, 8)}`}
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {formatDate(job.created_at)}
                    </span>
                    {job.video_duration > 0 && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {Math.floor(job.video_duration)}s
                      </span>
                    )}
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                        job.status === "completed"
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : job.status === "processing"
                          ? "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                          : job.status === "failed"
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                          : "bg-slate-500/10 text-slate-400 border border-slate-500/20"
                      }`}
                    >
                      {job.status === "completed"
                        ? "Hoàn thành"
                        : job.status === "processing"
                        ? "Đang xử lý"
                        : job.status === "failed"
                        ? "Thất bại"
                        : "Đã huỷ"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Action Buttons */}
              <div className="flex items-center gap-2 self-end sm:self-center">
                <Link
                  href={`/job?id=${job.id}`}
                  className="px-3 py-2 rounded-xl text-xs font-semibold border border-[#1F2A44] hover:border-[#7C5CFF] bg-[#0B1020]/60 text-slate-200 dark:text-slate-200 text-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[#22D3EE]" />
                  <span>Xem</span>
                </Link>

                {job.status === "completed" && (
                  <a
                    href={getDownloadUrl(job.id, "mp4")}
                    download
                    className="p-2 rounded-xl text-xs font-semibold bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] text-white shadow-sm hover:opacity-90 transition-opacity"
                    title="Tải video MP4"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                )}

                <button
                  type="button"
                  disabled={deletingId === job.id}
                  onClick={() => handleDelete(job.id)}
                  className="p-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all"
                  title="Xoá video"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
