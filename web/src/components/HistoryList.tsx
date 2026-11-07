"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Film,
  Download,
  Loader2,
  Calendar,
  Clock,
  Layers,
} from "lucide-react";
import { JobStatus, getDownloadUrl, deleteJob } from "../lib/api";
import { toast } from "../lib/toast";

interface HistoryListProps {
  jobs: JobStatus[];
  onRefresh: () => void;
}

export default function HistoryList({ jobs, onRefresh }: HistoryListProps) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
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

  const handleCopy = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    toast.success("Đã sao chép Job ID!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingId(id);
    try {
      await deleteJob(id);
      toast.success("Đã xoá job thành công!");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Không thể xoá job.");
    } finally {
      setDeletingId(null);
    }
  };

  const filteredJobs = jobs.filter((job) => {
    return (
      job.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (job.video_filename && job.video_filename.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  });

  return (
    <div className="space-y-4 pb-8">
      {/* Search Input */}
      <div className="relative flex items-center">
        <Search className="w-4 h-4 absolute left-3.5 text-[var(--text-secondary)] pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Tìm theo ID hoặc tên video..."
          className="app-input pl-10 py-2.5 text-xs"
        />
      </div>

      {/* Jobs List */}
      {filteredJobs.length === 0 ? (
        <div className="app-card text-center py-12 space-y-2 text-[var(--text-secondary)]">
          <Layers className="w-10 h-10 mx-auto opacity-40 text-[#0F8A6F]" />
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            Không tìm thấy video nào
          </p>
          <p className="text-[11px]">
            {jobs.length === 0
              ? "Bạn chưa có công việc xử lý nào. Hãy bắt đầu tạo mới!"
              : "Không có video khớp với từ khóa tìm kiếm."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredJobs.map((job) => {
            const isCompleted = job.status === "completed";
            const isProcessing = job.status === "processing" || job.status === "pending";
            const isFailed = job.status === "failed";

            return (
              <div
                key={job.id}
                onClick={() => router.push(`/job?id=${job.id}`)}
                className="app-card p-4 space-y-3 cursor-pointer hover:border-[#0F8A6F]/60 transition-all active:scale-[0.99]"
              >
                {/* Top Row: Job ID (bold) + Copy button + Status Chip */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono font-bold text-xs text-[var(--text-primary)] truncate">
                      {job.id}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => handleCopy(job.id, e)}
                      className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[#0F8A6F] hover:bg-black/5 dark:hover:bg-white/10"
                      title="Sao chép ID"
                    >
                      {copiedId === job.id ? (
                        <Check className="w-3.5 h-3.5 text-[#0F8A6F]" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>

                  {/* Status chip */}
                  <span
                    className={`chip whitespace-nowrap flex-shrink-0 ${
                      isCompleted
                        ? "chip-mint"
                        : isProcessing
                        ? "bg-[#BFF3E4] text-[#0B6B57]"
                        : "chip-error"
                    }`}
                  >
                    {isCompleted
                      ? "Hoàn tất"
                      : isProcessing
                      ? "Đang xử lý"
                      : job.status === "cancelled"
                      ? "Đã huỷ"
                      : "Thất bại"}
                  </span>
                </div>

                {/* Middle: Progress bar + Percentage */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[11px] text-[var(--text-secondary)] truncate">
                      {job.current_step || (isCompleted ? "Hoàn tất video" : "Khởi tạo")}
                    </span>
                    <span className="font-bold text-[#0F8A6F] text-xs">
                      {job.overall_progress}%
                    </span>
                  </div>
                  <div className="w-full bg-[#DDD8CC] dark:bg-[#24362E] h-1.5 rounded-full overflow-hidden">
                    <div
                      className="bg-[#0F8A6F] h-full rounded-full transition-all duration-300"
                      style={{ width: `${job.overall_progress}%` }}
                    />
                  </div>
                </div>

                {/* Bottom Row: Created Time + Actions */}
                <div className="flex items-center justify-between pt-1 text-[11px] text-[var(--text-secondary)] border-t border-[var(--border-app)]/60">
                  <span className="truncate">
                    {formatDate(job.created_at)}
                  </span>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {isCompleted && (
                      <a
                        href={getDownloadUrl(job.id, "mp4")}
                        download
                        className="p-1.5 rounded-full text-[#0F8A6F] hover:bg-[#BFF3E4]/30"
                        title="Tải video MP4"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    )}
                    <button
                      type="button"
                      disabled={deletingId === job.id}
                      onClick={(e) => handleDelete(job.id, e)}
                      className="p-1.5 rounded-full text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                      title="Xoá job"
                    >
                      {deletingId === job.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
