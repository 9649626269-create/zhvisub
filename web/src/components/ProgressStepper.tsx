"use client";

import React from "react";
import {
  CheckCircle2,
  Clock,
  Loader2,
  XCircle,
  Download,
  AlertCircle,
  FileVideo,
  FileText,
  Volume2,
  X,
  Play,
  RotateCcw,
} from "lucide-react";
import { JobStatus, getDownloadUrl, getVideoPreviewUrl } from "../lib/api";

interface ProgressStepperProps {
  job: JobStatus;
  onCancel: () => void;
  onRefresh?: () => void;
}

interface StepDefinition {
  id: string;
  label: string;
  desc: string;
}

const STEPS: StepDefinition[] = [
  { id: "audio", label: "Tách âm thanh", desc: "Trích xuất WAV 16kHz mono" },
  { id: "asr", label: "Nhận diện giọng nói", desc: "faster-whisper large-v3 tiếng Trung" },
  { id: "ocr", label: "OCR phụ đề", desc: "Phát hiện tọa độ và thời gian phụ đề cứng" },
  { id: "translate", label: "Dịch thuật", desc: "Dịch sang tiếng Việt tự nhiên theo ngữ cảnh" },
  { id: "render_sub", label: "Làm mờ & chèn sub", desc: "Gaussian blur vùng cứng & chèn chữ" },
  { id: "dub", label: "Lồng tiếng AI", desc: "Thuật toán ngân sách thời gian & atempo" },
  { id: "export", label: "Xuất file", desc: "Đóng gói MP4 H.264 / AAC hoàn chỉnh" },
];

export default function ProgressStepper({
  job,
  onCancel,
  onRefresh,
}: ProgressStepperProps) {
  // Determine active step index
  const getStepIndex = (stepName: string): number => {
    switch (stepName.toLowerCase()) {
      case "ingest":
      case "audio":
        return 0;
      case "asr":
        return 1;
      case "ocr":
        return 2;
      case "translate":
        return 3;
      case "blur":
      case "render":
      case "render_sub":
        return 4;
      case "dub":
        return 5;
      case "completed":
      case "done":
        return 6;
      default:
        return 0;
    }
  };

  const currentIndex = job.status === "completed" ? 7 : getStepIndex(job.current_step);

  return (
    <div className="space-y-6">
      {/* Overview Card */}
      <div className="app-card p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
                {job.video_filename || "Video đang xử lý"}
              </span>
              <span
                className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${
                  job.status === "completed"
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : job.status === "processing"
                    ? "bg-blue-500/20 text-blue-400 border border-blue-500/30 animate-pulse"
                    : job.status === "failed"
                    ? "bg-rose-500/20 text-rose-400 border border-rose-500/30"
                    : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                }`}
              >
                {job.status === "completed"
                  ? "Hoàn thành"
                  : job.status === "processing"
                  ? "Đang xử lý"
                  : job.status === "failed"
                  ? "Thất bại"
                  : "Chờ xử lý"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Mã công việc: <span className="font-mono text-slate-300">{job.id.slice(0, 8)}...</span>
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {(job.status === "pending" || job.status === "processing") && (
              <button
                onClick={onCancel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-rose-500/20 transition-colors"
              >
                <X className="w-4 h-4" />
                <span>Huỷ công việc</span>
              </button>
            )}
            {onRefresh && (
              <button
                onClick={onRefresh}
                className="p-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-[#1F2A44]/40 border border-[#1F2A44] transition-colors"
                title="Tải lại tiến trình"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Global Progress Bar */}
        <div className="mt-4">
          <div className="flex justify-between items-center text-xs font-medium mb-1.5">
            <span className="text-slate-300 dark:text-slate-300 text-slate-700">
              Tiến độ tổng quan
            </span>
            <span className="font-semibold text-[#22D3EE]">
              {Math.round(job.overall_progress * 100)}%
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-[#0B1020] dark:bg-[#0B1020] bg-slate-200 overflow-hidden p-0.5 border border-[#1F2A44]">
            <div
              className="h-full rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] transition-all duration-300 shadow-sm"
              style={{ width: `${Math.min(100, Math.round(job.overall_progress * 100))}%` }}
            />
          </div>
          {job.step_log && (
            <p className="text-xs font-mono text-slate-400 mt-2 bg-[#0B1020]/60 p-2.5 rounded-xl border border-[#1F2A44]/50 truncate">
              {job.step_log}
            </p>
          )}
        </div>
      </div>

      {/* Stepper Card */}
      <div className="app-card p-5">
        <h3 className="text-sm font-semibold text-slate-100 dark:text-slate-100 text-slate-800 mb-4">
          Quy trình xử lý tự động
        </h3>

        <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#1F2A44]">
          {STEPS.map((step, idx) => {
            const isDone = currentIndex > idx;
            const isCurrent = currentIndex === idx && job.status === "processing";
            const isFailed = job.status === "failed" && currentIndex === idx;
            const isWaiting = currentIndex < idx;

            // Skip dub step visually if dub is false
            if (step.id === "dub" && job.options && job.options.dub === false) {
              return null;
            }

            return (
              <div key={step.id} className="relative group">
                {/* Stepper Node Icon */}
                <div
                  className={`absolute -left-6 mt-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                    isDone
                      ? "bg-emerald-500 text-slate-950 shadow-md shadow-emerald-500/20"
                      : isCurrent
                      ? "bg-gradient-to-tr from-[#7C5CFF] to-[#22D3EE] text-white animate-pulse shadow-md shadow-[#22D3EE]/30"
                      : isFailed
                      ? "bg-rose-500 text-white"
                      : "bg-[#121A2F] border border-[#1F2A44] text-slate-500"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : isCurrent ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isFailed ? (
                    <XCircle className="w-3.5 h-3.5" />
                  ) : (
                    <Clock className="w-3 h-3" />
                  )}
                </div>

                <div className="ml-2">
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-sm font-medium ${
                        isCurrent
                          ? "text-[#22D3EE] font-semibold"
                          : isDone
                          ? "text-slate-200 dark:text-slate-200 text-slate-800"
                          : "text-slate-500"
                      }`}
                    >
                      {step.label}
                    </span>
                    <span
                      className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        isDone
                          ? "bg-emerald-500/10 text-emerald-400"
                          : isCurrent
                          ? "bg-cyan-500/10 text-cyan-400 animate-pulse"
                          : isFailed
                          ? "bg-rose-500/10 text-rose-400"
                          : "text-slate-500"
                      }`}
                    >
                      {isDone ? "Đã xong" : isCurrent ? "Đang xử lý..." : isFailed ? "Lỗi" : "Chờ"}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{step.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Completed State: Video Player & Downloads */}
      {job.status === "completed" && (
        <div className="app-card p-5 border-emerald-500/30 animate-in fade-in duration-300">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
              Video đã sẵn sàng tải về!
            </h3>
          </div>

          {/* Embedded Video Player */}
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[#1F2A44] mb-5 shadow-2xl">
            <video
              controls
              playsInline
              src={getVideoPreviewUrl(job.id)}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Download Buttons Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <a
              href={getDownloadUrl(job.id, "mp4")}
              download
              className="gradient-btn py-3 px-4 flex items-center justify-center gap-2 text-xs font-semibold shadow-lg"
            >
              <FileVideo className="w-4 h-4" />
              <span>Tải Video MP4</span>
            </a>

            <a
              href={getDownloadUrl(job.id, "srt_vi")}
              download
              className="py-3 px-4 rounded-2xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] hover:border-[#7C5CFF] text-slate-200 dark:text-slate-200 text-slate-800 flex items-center justify-center gap-2 text-xs font-semibold transition-colors"
            >
              <FileText className="w-4 h-4 text-[#7C5CFF]" />
              <span>Phụ đề Việt (.srt)</span>
            </a>

            <a
              href={getDownloadUrl(job.id, "srt_zh")}
              download
              className="py-3 px-4 rounded-2xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] hover:border-[#7C5CFF] text-slate-200 dark:text-slate-200 text-slate-800 flex items-center justify-center gap-2 text-xs font-semibold transition-colors"
            >
              <FileText className="w-4 h-4 text-[#22D3EE]" />
              <span>Phụ đề Trung (.srt)</span>
            </a>

            {job.has_dub && (
              <a
                href={getDownloadUrl(job.id, "dub")}
                download
                className="py-3 px-4 rounded-2xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] hover:border-[#7C5CFF] text-slate-200 dark:text-slate-200 text-slate-800 flex items-center justify-center gap-2 text-xs font-semibold transition-colors"
              >
                <Volume2 className="w-4 h-4 text-purple-400" />
                <span>Audio Lồng Tiếng (.wav)</span>
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
