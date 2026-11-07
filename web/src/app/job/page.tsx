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
  getDownloadUrl,
} from "../../lib/api";
import { toast } from "../../lib/toast";
import {
  Copy,
  Check,
  RotateCcw,
  Play,
  Pause,
  Save,
  Download,
  AlertTriangle,
  Loader2,
  X,
  FileVideo,
  FileText,
  Volume2,
  Terminal,
  Share2,
  Send,
  Rocket,
  Settings,
  Sparkles,
} from "lucide-react";

type ActiveTab = "progress" | "log" | "result" | "config" | "social";

function JobContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("id");

  const [job, setJob] = useState<JobStatus | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ActiveTab>("progress");

  // Playback & Subtitle sync state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Segment editing & saving
  const [isSavingSegments, setIsSavingSegments] = useState<boolean>(false);
  const [isRerendering, setIsRerendering] = useState<boolean>(false);
  const [copiedId, setCopiedId] = useState(false);

  // Social media publish tab state
  const [socialCaption, setSocialCaption] = useState(
    "🔥 Video tiếng Trung lồng tiếng Việt cực mượt bằng AI ZhViSub!\n#ZhViSub #AI #DichVideo #ThienDuong"
  );
  const [socialTitle, setSocialTitle] = useState("Và rau và xe sang chạy đầy đường?");
  const [stopOnPublishFail, setStopOnPublishFail] = useState(false);
  const [platforms, setPlatforms] = useState({
    tiktok: true,
    facebook: true,
    youtube: false,
    telegram: false,
  });

  const pollStatus = async () => {
    if (!jobId) return;
    try {
      const data = await getJob(jobId);
      setJob(data);
      setLoading(false);

      if (data.status === "completed" && segments.length === 0) {
        const segs = await getSegments(jobId).catch(() => []);
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

  const handleCopyId = () => {
    if (!jobId) return;
    navigator.clipboard.writeText(jobId);
    setCopiedId(true);
    toast.success("Đã sao chép Job ID!");
    setTimeout(() => setCopiedId(false), 2000);
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      await cancelJob(jobId);
      toast.success("Đã gửi lệnh huỷ công việc.");
      pollStatus();
    } catch (err: any) {
      toast.error(err.message || "Không thể huỷ công việc.");
    }
  };

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

  const activeSegment = segments.find(
    (s) => currentTime >= s.start && currentTime <= s.end
  );

  const handleSaveSegments = async () => {
    if (!jobId) return;
    setIsSavingSegments(true);
    try {
      await updateSegments(jobId, segments);
      toast.success("Đã lưu các thay đổi phụ đề!");
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi lưu phụ đề.");
    } finally {
      setIsSavingSegments(false);
    }
  };

  const handleRerender = async () => {
    if (!jobId) return;
    setIsRerendering(true);
    try {
      await updateSegments(jobId, segments);
      await rerenderJob(jobId, {
        blur: job?.options?.blur ?? true,
        blur_strength: job?.options?.blur_strength ?? 30,
        dub: job?.options?.dub ?? false,
        voice: job?.options?.voice,
        dub_rate: job?.options?.dub_rate,
        orig_audio: job?.options?.orig_audio,
      });
      toast.success("Đã kích hoạt render lại video!");
      setIsRerendering(false);
      pollStatus();
    } catch (err: any) {
      toast.error(err.message || "Lỗi khi kích hoạt render lại.");
      setIsRerendering(false);
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return "--";
    try {
      const d = new Date(isoString);
      return `${d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })} · ${d.toLocaleDateString("vi-VN")}`;
    } catch {
      return isoString;
    }
  };

  if (loading && !job) {
    return (
      <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 text-[var(--text-secondary)]">
        <Loader2 className="w-8 h-8 text-[#0F8A6F] animate-spin mb-3" />
        <p className="text-xs font-semibold">Đang tải thông tin tiến trình...</p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="app-card text-center py-10 px-4 space-y-4 my-6">
        <div className="w-12 h-12 rounded-full bg-[#F6DADA] text-[#B3261E] flex items-center justify-center mx-auto">
          <AlertTriangle className="w-6 h-6" />
        </div>
        <h2 className="text-base font-bold text-[var(--text-primary)]">Không tìm thấy công việc</h2>
        <p className="text-xs text-[var(--text-secondary)]">{error || "Công việc không tồn tại hoặc đã bị xoá."}</p>
        <Link href="/" className="btn-primary py-2 px-5 text-xs">
          <span>Tạo video mới</span>
        </Link>
      </div>
    );
  }

  const isCompleted = job.status === "completed";
  const isProcessing = job.status === "processing" || job.status === "pending";

  return (
    <div className="space-y-4 pb-10">
      {/* 1. Horizontal Scrollable Tab Bar */}
      <div className="flex border-b border-[var(--border-app)] overflow-x-auto no-scrollbar gap-1 text-xs font-semibold">
        {[
          { id: "progress", label: "Tiến trình" },
          { id: "log", label: "Log" },
          { id: "result", label: "Kết quả" },
          { id: "config", label: "Cấu hình" },
          { id: "social", label: "Mạng xã hội" },
        ].map((t) => {
          const isActive = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id as ActiveTab)}
              className={`py-3 px-3.5 whitespace-nowrap transition-colors relative ${
                isActive
                  ? "text-[#0F8A6F] font-bold"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              }`}
            >
              <span>{t.label}</span>
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#0F8A6F] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* 2. Fixed Top Sub-header under tabs: Job ID + Copy + Status chip + Progress Bar */}
      <div className="app-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          {/* Job ID & Copy */}
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="font-mono font-bold text-xs text-[var(--text-primary)] truncate">
              {job.id}
            </span>
            <button
              type="button"
              onClick={handleCopyId}
              className="p-1 rounded-full text-[var(--text-secondary)] hover:text-[#0F8A6F] hover:bg-black/5 dark:hover:bg-white/10"
              title="Sao chép ID"
            >
              {copiedId ? (
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

        {/* Progress Bar + % */}
        <div className="flex items-center gap-3">
          <div className="flex-1 bg-[#DDD8CC] dark:bg-[#24362E] h-2 rounded-full overflow-hidden">
            <div
              className="bg-[#0F8A6F] h-full rounded-full transition-all duration-300"
              style={{ width: `${job.overall_progress}%` }}
            />
          </div>
          <span className="font-bold text-xs text-[var(--text-primary)] whitespace-nowrap">
            {job.overall_progress}%
          </span>
        </div>
      </div>

      {/* TAB 1: TIẾN TRÌNH */}
      {activeTab === "progress" && (
        <div className="space-y-3">
          {/* Running Step Card (Mint background) */}
          <div className="p-4 rounded-2xl bg-[#BFF3E4] dark:bg-[#1C3B32] text-[#0B6B57] dark:text-[#A6EDD9] space-y-2">
            <div className="flex items-center gap-2">
              {isProcessing ? (
                <Loader2 className="w-5 h-5 animate-spin flex-shrink-0" />
              ) : isCompleted ? (
                <Check className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              )}
              <h3 className="text-sm font-bold">
                {job.current_step || (isCompleted ? "Xử lý hoàn tất" : "Đang chuẩn bị")}
              </h3>
            </div>

            <p className="text-xs font-mono opacity-90 leading-relaxed break-all">
              {job.step_log || "Đang xử lý trong hàng đợi background..."}
            </p>
          </div>

          {/* Date Card: Tạo lúc / Cập nhật */}
          <div className="app-card p-4 divide-y divide-[var(--border-app)] text-xs">
            <div className="flex items-center justify-between pb-3">
              <span className="text-[var(--text-secondary)]">Tạo lúc</span>
              <span className="font-bold text-[var(--text-primary)]">
                {formatDate(job.created_at)}
              </span>
            </div>
            <div className="flex items-center justify-between pt-3">
              <span className="text-[var(--text-secondary)]">Cập nhật</span>
              <span className="font-bold text-[var(--text-primary)]">
                {formatDate(job.updated_at)}
              </span>
            </div>
          </div>

          {/* Cancel button if running */}
          {isProcessing && (
            <button
              type="button"
              onClick={handleCancel}
              className="btn-secondary w-full py-2.5 text-xs text-rose-500 border-rose-300 hover:border-rose-500"
            >
              <X className="w-4 h-4" />
              <span>Hủy job</span>
            </button>
          )}

          {/* Re-render button if completed */}
          {isCompleted && (
            <button
              type="button"
              disabled={isRerendering}
              onClick={handleRerender}
              className="btn-primary w-full py-3 text-xs"
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
      )}

      {/* TAB 2: LOG */}
      {activeTab === "log" && (
        <div className="app-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
              <Terminal className="w-4 h-4 text-[#0F8A6F]" />
              <span>Nhật ký xử lý (Log)</span>
            </div>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(job.step_log || "");
                toast.success("Đã sao chép log!");
              }}
              className="text-xs text-[#0F8A6F] font-semibold hover:underline"
            >
              Sao chép
            </button>
          </div>

          <div className="p-3 rounded-2xl bg-black text-[#A6EDD9] font-mono text-[11px] leading-relaxed max-h-80 overflow-y-auto whitespace-pre-wrap break-words">
            {job.step_log || "Chưa có log đầu ra."}
          </div>
        </div>
      )}

      {/* TAB 3: KẾT QUẢ */}
      {activeTab === "result" && (
        <div className="space-y-4">
          {/* Video Player */}
          <div className="relative aspect-video rounded-2xl overflow-hidden bg-black border border-[var(--border-app)] shadow-md">
            <video
              ref={videoRef}
              controls
              playsInline
              src={getVideoPreviewUrl(job.id)}
              onTimeUpdate={handleTimeUpdate}
              className="w-full h-full object-contain"
            />
            {/* HTML Subtitle Overlay Preview */}
            {activeSegment && (
              <div className="absolute bottom-6 left-4 right-4 pointer-events-none flex justify-center">
                <div className="bg-black/80 backdrop-blur-sm border border-white/10 px-3 py-1 rounded-xl text-center max-w-sm">
                  <p className="text-[10px] text-slate-400 line-through mb-0.5">{activeSegment.zh}</p>
                  <p className="text-xs font-bold text-white drop-shadow-md">{activeSegment.vi}</p>
                </div>
              </div>
            )}
          </div>

          {/* Download cards */}
          <div className="grid grid-cols-2 gap-2">
            <a
              href={getDownloadUrl(job.id, "mp4")}
              download
              className="p-3 rounded-2xl border border-[var(--border-app)] bg-[var(--card-app)] flex items-center gap-2 hover:border-[#0F8A6F] transition-colors"
            >
              <FileVideo className="w-5 h-5 text-[#0F8A6F] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">Tải MP4</p>
                <p className="text-[10px] text-[var(--text-secondary)]">Đã ghép sub</p>
              </div>
            </a>

            <a
              href={getDownloadUrl(job.id, "srt_vi")}
              download
              className="p-3 rounded-2xl border border-[var(--border-app)] bg-[var(--card-app)] flex items-center gap-2 hover:border-[#0F8A6F] transition-colors"
            >
              <FileText className="w-5 h-5 text-[#0F8A6F] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">SRT Việt</p>
                <p className="text-[10px] text-[var(--text-secondary)]">Phụ đề tiếng Việt</p>
              </div>
            </a>

            <a
              href={getDownloadUrl(job.id, "srt_zh")}
              download
              className="p-3 rounded-2xl border border-[var(--border-app)] bg-[var(--card-app)] flex items-center gap-2 hover:border-[#0F8A6F] transition-colors"
            >
              <FileText className="w-5 h-5 text-[#0F8A6F] flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold truncate">SRT Trung</p>
                <p className="text-[10px] text-[var(--text-secondary)]">Phụ đề gốc</p>
              </div>
            </a>

            {job.has_dub && (
              <a
                href={getDownloadUrl(job.id, "dub")}
                download
                className="p-3 rounded-2xl border border-[var(--border-app)] bg-[var(--card-app)] flex items-center gap-2 hover:border-[#0F8A6F] transition-colors"
              >
                <Volume2 className="w-5 h-5 text-[#0F8A6F] flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold truncate">Audio Dub</p>
                  <p className="text-[10px] text-[var(--text-secondary)]">WAV 48kHz</p>
                </div>
              </a>
            )}
          </div>

          {/* Subtitle Editor Section */}
          {segments.length > 0 && (
            <div className="app-card p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[var(--border-app)]">
                <div>
                  <h3 className="text-xs font-bold text-[var(--text-primary)]">
                    Trình chỉnh sửa phụ đề ({segments.length} câu)
                  </h3>
                  <p className="text-[11px] text-[var(--text-secondary)]">
                    Sửa câu tiếng Việt và lưu để render lại
                  </p>
                </div>

                <button
                  type="button"
                  disabled={isSavingSegments}
                  onClick={handleSaveSegments}
                  className="btn-primary py-1.5 px-3 text-xs"
                >
                  {isSavingSegments ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  <span>Lưu</span>
                </button>
              </div>

              {/* Segments List */}
              <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {segments.map((seg, idx) => (
                  <div
                    key={seg.id}
                    className="p-2.5 rounded-2xl border border-[var(--border-app)] bg-[var(--bg-app)]/50 space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between text-[11px] text-[var(--text-secondary)]">
                      <span className="font-semibold text-[#0F8A6F]">#{idx + 1}</span>
                      <span>{seg.start.toFixed(1)}s - {seg.end.toFixed(1)}s</span>
                      {seg.dub_speed && (
                        <span className="chip chip-mint text-[10px] py-0.2 px-1.5">
                          {seg.dub_speed}x
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[var(--text-secondary)] italic">{seg.zh}</p>
                    <input
                      type="text"
                      value={seg.vi}
                      onChange={(e) => {
                        const next = [...segments];
                        next[idx] = { ...seg, vi: e.target.value };
                        setSegments(next);
                      }}
                      className="app-input py-1.5 px-2.5 text-xs font-medium"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CẤU HÌNH */}
      {activeTab === "config" && (
        <div className="app-card p-4 space-y-3 text-xs">
          <h3 className="text-sm font-bold text-[var(--text-primary)] mb-2">
            Cấu hình công việc
          </h3>
          <div className="divide-y divide-[var(--border-app)]">
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--text-secondary)]">Độ mờ làm mờ</span>
              <span className="font-bold text-[var(--text-primary)]">
                {job.options?.blur ? `${job.options?.blur_strength ?? 30}` : "Tắt"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--text-secondary)]">Vị trí phụ đề</span>
              <span className="font-bold text-[var(--text-primary)] capitalize">
                {job.options?.position || "Đáy (bottom)"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--text-secondary)]">Lồng tiếng AI</span>
              <span className="font-bold text-[var(--text-primary)]">
                {job.has_dub ? "Đã bật" : "Tắt"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--text-secondary)]">Giọng đọc</span>
              <span className="font-bold text-[var(--text-primary)] truncate max-w-[200px]">
                {job.options?.voice || "vi-VN-HoaiMyNeural"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--text-secondary)]">Tốc độ cơ sở</span>
              <span className="font-bold text-[var(--text-primary)]">
                {job.options?.dub_rate || "+0%"}
              </span>
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-[var(--text-secondary)]">Âm gốc</span>
              <span className="font-bold text-[var(--text-primary)]">
                {job.options?.orig_audio || "duck (giảm 15dB)"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MẠNG XÃ HỘI */}
      {activeTab === "social" && (
        <div className="space-y-4">
          {/* Platforms Cards */}
          <div className="space-y-2.5">
            {[
              { id: "tiktok", name: "TikTok", desc: "Đăng tự động với thẻ #shorts" },
              { id: "facebook", name: "Facebook Reels", desc: "Tối ưu hóa caption và hashtags" },
              { id: "youtube", name: "YouTube Shorts", desc: "Xuất bản video dọc 9:16" },
              { id: "telegram", name: "Telegram Channel", desc: "Gửi kèm file video chất lượng cao" },
            ].map((p) => {
              const isChecked = (platforms as any)[p.id];
              return (
                <div
                  key={p.id}
                  className="app-card p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-[#BFF3E4] dark:bg-[#1C3B32] text-[#0F8A6F] dark:text-[#A6EDD9] flex items-center justify-center font-bold text-xs flex-shrink-0">
                      {p.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">{p.name}</span>
                        <span className="chip chip-mint text-[9px] py-0.2 px-1.5">Sẵn sàng</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">{p.desc}</p>
                    </div>
                  </div>

                  <label className="m3-switch">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={(e) =>
                        setPlatforms((prev) => ({ ...prev, [p.id]: e.target.checked }))
                      }
                    />
                    <div className="m3-switch-track">
                      <div className="m3-switch-thumb" />
                    </div>
                  </label>
                </div>
              );
            })}
          </div>

          {/* Social Caption Textarea with Character Counter */}
          <div className="app-card p-4 space-y-2">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              Nội dung bài viết / Caption
            </label>
            <textarea
              rows={4}
              value={socialCaption}
              onChange={(e) => setSocialCaption(e.target.value)}
              className="app-input text-xs"
              placeholder="Nhập caption cho video..."
            />
            <div className="flex justify-end text-[11px] text-[var(--text-secondary)] font-mono">
              {socialCaption.length}/63206
            </div>
          </div>

          {/* Social Title with Character Counter */}
          <div className="app-card p-4 space-y-2">
            <label className="block text-xs font-semibold text-[var(--text-primary)]">
              Tiêu đề bài viết
            </label>
            <input
              type="text"
              value={socialTitle}
              onChange={(e) => setSocialTitle(e.target.value)}
              className="app-input text-xs"
              placeholder="Nhập tiêu đề..."
            />
            <div className="flex justify-end text-[11px] text-[var(--text-secondary)] font-mono">
              {socialTitle.length}/255
            </div>
          </div>

          {/* Switch: Dừng job nếu đăng lỗi */}
          <div className="app-card p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[var(--text-primary)]">
                Dừng job nếu đăng lỗi
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                Phù hợp khi bài đăng là đầu ra bắt buộc của workflow.
              </p>
            </div>
            <label className="m3-switch">
              <input
                type="checkbox"
                checked={stopOnPublishFail}
                onChange={(e) => setStopOnPublishFail(e.target.checked)}
              />
              <div className="m3-switch-track">
                <div className="m3-switch-thumb" />
              </div>
            </label>
          </div>

          {/* Main Action Button */}
          <button
            type="button"
            onClick={() => {
              toast.success("Đã gửi yêu cầu đăng lên các nền tảng mạng xã hội!");
            }}
            className="btn-primary w-full py-3 text-xs"
          >
            <Rocket className="w-4 h-4" />
            <span>Đăng lại mạng xã hội</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default function JobDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] flex flex-col items-center justify-center text-center p-6 text-[var(--text-secondary)]">
          <Loader2 className="w-8 h-8 text-[#0F8A6F] animate-spin mb-3" />
          <p className="text-xs">Đang tải trang chi tiết...</p>
        </div>
      }
    >
      <JobContent />
    </Suspense>
  );
}
