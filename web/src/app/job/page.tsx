"use client";

import React, { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  getJob,
  cancelJob,
  getSegments,
  updateSegments,
  rerenderJob,
  JobStatus,
  Segment,
  BlurRegionItem,
  getVideoPreviewUrl,
  getFramePreviewUrl,
} from "../../lib/api";
import ProgressStepper from "../../components/ProgressStepper";
import {
  Sparkles,
  RotateCcw,
  Edit3,
  Sliders,
  Play,
  Pause,
  Save,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Maximize2,
  Crop,
  Layers,
} from "lucide-react";

function JobContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("id");

  const [job, setJob] = useState<JobStatus | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Playback & Subtitle sync state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Segment editing & saving
  const [isSavingSegments, setIsSavingSegments] = useState<boolean>(false);
  const [isRerendering, setIsRerendering] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Manual blur drawing canvas state
  const [showBlurDrawer, setShowBlurDrawer] = useState<boolean>(false);
  const [manualRegions, setManualRegions] = useState<BlurRegionItem[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<BlurRegionItem | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Polling job status
  const pollStatus = async () => {
    if (!jobId) return;
    try {
      const data = await getJob(jobId);
      setJob(data);
      setLoading(false);

      if (data.status === "completed") {
        const segs = await getSegments(jobId);
        setSegments(segs);
      }
    } catch (err: any) {
      setError(err.message || "Không thể tải trạng thái công việc.");
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!jobId) {
      setError("Vui lòng cung cấp mã công việc (Job ID) hợp lệ.");
      setLoading(false);
      return;
    }

    pollStatus();
    const interval = setInterval(() => {
      if (job?.status === "completed" || job?.status === "failed" || job?.status === "cancelled") {
        clearInterval(interval);
      } else {
        pollStatus();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [jobId, job?.status]);

  const handleCancel = async () => {
    if (!jobId) return;
    if (!confirm("Bạn có chắc chắn muốn huỷ công việc này?")) return;
    try {
      await cancelJob(jobId);
      pollStatus();
    } catch (err: any) {
      alert(err.message || "Không thể huỷ công việc.");
    }
  };

  // Video timeupdate sync with dubbing audio
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    if (audioRef.current && job?.has_dub) {
      if (Math.abs(audioRef.current.currentTime - t) > 0.15) {
        audioRef.current.currentTime = t;
      }
      if (videoRef.current.paused && !audioRef.current.paused) {
        audioRef.current.pause();
      } else if (!videoRef.current.paused && audioRef.current.paused) {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  // Active subtitle cue at current video time
  const activeSegment = segments.find(
    (s) => currentTime >= s.start && currentTime <= s.end
  );

  // Save subtitle changes
  const handleSaveSegments = async () => {
    if (!jobId) return;
    setIsSavingSegments(true);
    setSaveMessage(null);
    try {
      await updateSegments(jobId, segments);
      setSaveMessage("Đã lưu các thay đổi phụ đề!");
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: any) {
      alert(err.message || "Lỗi khi lưu phụ đề.");
    } finally {
      setIsSavingSegments(false);
    }
  };

  // Trigger Re-render
  const handleRerender = async () => {
    if (!jobId) return;
    if (!confirm("Bắt đầu render lại video với các thay đổi phụ đề / vùng làm mờ mới?")) return;
    setIsRerendering(true);
    try {
      // First save segments
      await updateSegments(jobId, segments);
      await rerenderJob(jobId, {
        blur: job?.options?.blur ?? true,
        blur_strength: job?.options?.blur_strength ?? 30,
        dub: job?.options?.dub ?? false,
        voice: job?.options?.voice,
        dub_rate: job?.options?.dub_rate,
        orig_audio: job?.options?.orig_audio,
        blur_regions: manualRegions.length > 0 ? manualRegions : undefined,
      });
      setIsRerendering(false);
      pollStatus();
    } catch (err: any) {
      alert(err.message || "Lỗi khi kích hoạt render lại.");
      setIsRerendering(false);
    }
  };

  if (loading && !job) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6">
        <Loader2 className="w-8 h-8 text-[#22D3EE] animate-spin mb-3" />
        <p className="text-sm font-semibold text-slate-200">Đang tải thông tin tiến trình...</p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="app-card p-8 text-center max-w-md mx-auto my-12">
        <AlertTriangle className="w-12 h-12 text-rose-400 mx-auto mb-3" />
        <h2 className="text-base font-semibold text-slate-100">Không tìm thấy công việc</h2>
        <p className="text-xs text-slate-400 mt-1 mb-5">{error || "Công việc không tồn tại hoặc đã bị xoá."}</p>
        <Link href="/" className="gradient-btn px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-2">
          <Sparkles className="w-4 h-4" />
          <span>Tạo video mới</span>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 dark:text-slate-100 text-slate-900">
            Tiến trình & Trình chỉnh sửa
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            Theo dõi từng bước thực thi và tùy biến phụ đề / vùng mờ trước khi xuất bản
          </p>
        </div>

        {job.status === "completed" && (
          <button
            type="button"
            disabled={isRerendering}
            onClick={handleRerender}
            className="gradient-btn px-5 py-2.5 text-xs font-semibold flex items-center justify-center gap-2 shadow-lg self-start sm:self-center"
          >
            {isRerendering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RotateCcw className="w-4 h-4" />
            )}
            <span>Render lại video</span>
          </button>
        )}
      </div>

      {/* Stepper Component */}
      <ProgressStepper job={job} onCancel={handleCancel} onRefresh={pollStatus} />

      {/* Subtitle Editor Section (When segments are available) */}
      {segments.length > 0 && (
        <div className="app-card p-5 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-[#7C5CFF]">
                <Edit3 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
                  Trình chỉnh sửa phụ đề & khẩu hình ({segments.length} câu)
                </h3>
                <p className="text-xs text-slate-400">
                  Sửa trực tiếp bản dịch tiếng Việt, hệ thống sẽ tự động cập nhật và cho phép render lại
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSavingSegments}
                onClick={handleSaveSegments}
                className="gradient-btn px-4 py-2 text-xs font-semibold flex items-center gap-1.5"
              >
                {isSavingSegments ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Lưu thay đổi</span>
              </button>
            </div>
          </div>

          {saveMessage && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{saveMessage}</span>
            </div>
          )}

          {/* Video Preview with HTML Subtitle Overlay */}
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[#1F2A44] shadow-2xl">
            <video
              ref={videoRef}
              controls
              playsInline
              src={getVideoPreviewUrl(job.id)}
              onTimeUpdate={handleTimeUpdate}
              className="w-full h-full object-contain"
            />
            {/* HTML Subtitle Overlay Mockup */}
            {activeSegment && (
              <div className="absolute bottom-6 left-4 right-4 pointer-events-none flex justify-center">
                <div className="bg-black/80 backdrop-blur-sm border border-white/10 px-4 py-1.5 rounded-xl text-center max-w-lg">
                  <p className="text-[11px] text-slate-400 line-through mb-0.5">{activeSegment.zh}</p>
                  <p className="text-sm font-semibold text-white drop-shadow-md">{activeSegment.vi}</p>
                </div>
              </div>
            )}
          </div>

          {/* Subtitles Table / Card List */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {segments.map((seg, idx) => (
              <div
                key={seg.id}
                onClick={() => {
                  if (videoRef.current) videoRef.current.currentTime = seg.start;
                }}
                className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
                  currentTime >= seg.start && currentTime <= seg.end
                    ? "border-[#7C5CFF] bg-[#7C5CFF]/10 shadow-sm"
                    : "border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 bg-[#0B1020]/40 hover:border-slate-600"
                }`}
              >
                <div className="flex items-center justify-between text-[11px] text-slate-400 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-300">#{idx + 1}</span>
                    <span className="font-mono bg-[#1F2A44] px-2 py-0.5 rounded-md text-[#22D3EE]">
                      {seg.start.toFixed(2)}s → {seg.end.toFixed(2)}s
                    </span>
                  </div>
                  {seg.dub_status && (
                    <span
                      className={`px-2 py-0.5 rounded-md uppercase font-semibold text-[9px] ${
                        seg.dub_status === "overflow"
                          ? "bg-rose-500/20 text-rose-400"
                          : seg.dub_status === "shortened"
                          ? "bg-amber-500/20 text-amber-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}
                    >
                      Dub: {seg.dub_status} ({seg.dub_speed ? seg.dub_speed.toFixed(2) : "1.00"}x)
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Chinese text */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                      Gốc tiếng Trung
                    </label>
                    <input
                      type="text"
                      value={seg.zh}
                      onChange={(e) => {
                        const newSegs = [...segments];
                        newSegs[idx].zh = e.target.value;
                        setSegments(newSegs);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] text-xs text-slate-200"
                    />
                  </div>

                  {/* Vietnamese translation */}
                  <div>
                    <label className="text-[10px] uppercase font-bold text-[#22D3EE] block mb-1">
                      Bản dịch tiếng Việt (dùng để render)
                    </label>
                    <input
                      type="text"
                      value={seg.vi}
                      onChange={(e) => {
                        const newSegs = [...segments];
                        newSegs[idx].vi = e.target.value;
                        setSegments(newSegs);
                      }}
                      className="w-full px-3 py-2 rounded-xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] text-xs font-semibold text-white focus:border-[#22D3EE]"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobPage() {
  return (
    <Suspense fallback={
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#22D3EE] animate-spin" />
      </div>
    }>
      <JobContent />
    </Suspense>
  );
}
