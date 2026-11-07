"use client";

import { Suspense, useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  cancelJob,
  getDownloadUrl,
  getFrameUrl,
  getJob,
  getJobSegments,
  getVideoUrl,
  JobStatus,
  Segment,
  triggerRerender,
  updateJobSegments,
} from "@/lib/api";

const STEP_LABELS: Record<string, string> = {
  ingest: "Nhận video",
  asr: "Nhận diện giọng nói",
  ocr: "Quét phụ đề cứng",
  translate: "Dịch sang tiếng Việt",
  dub: "Tạo lồng tiếng",
  render: "Render video",
  done: "Hoàn tất",
};

function JobContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const jobId = searchParams.get("id");

  const [job, setJob] = useState<JobStatus | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  // Playback & Subtitle sync state
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [activeSegmentIndex, setActiveSegmentIndex] = useState<number>(-1);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Manual blur drawing state
  const [showBlurDrawer, setShowBlurDrawer] = useState<boolean>(false);
  const [manualRegions, setManualRegions] = useState<{ x: number; y: number; w: number; h: number }[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [frameImg, setFrameImg] = useState<HTMLImageElement | null>(null);

  // Poll job status
  useEffect(() => {
    if (!jobId) {
      setError("Không tìm thấy mã công việc (Job ID).");
      setLoading(false);
      return;
    }

    let intervalId: any;

    const poll = async () => {
      try {
        const data = await getJob(jobId);
        setJob(data);
        setLoading(false);

        if (data.status === "completed") {
          clearInterval(intervalId);
          // Load segments
          const segs = await getJobSegments(jobId);
          setSegments(segs);
        } else if (data.status === "failed" || data.status === "cancelled") {
          clearInterval(intervalId);
        }
      } catch (err: any) {
        setError(err.message || "Lỗi khi kiểm tra tiến độ.");
        setLoading(false);
      }
    };

    poll();
    intervalId = setInterval(poll, 1500);

    return () => clearInterval(intervalId);
  }, [jobId]);

  // Video timeupdate sync
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const t = videoRef.current.currentTime;
    setCurrentTime(t);

    // Sync audio if dubbing exists
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

    // Find active segment
    const activeIdx = segments.findIndex((s) => t >= s.start && t <= s.end);
    setActiveSegmentIndex(activeIdx);
  };

  const handleSeek = (timeSec: number) => {
    if (videoRef.current) {
      videoRef.current.currentTime = timeSec;
      videoRef.current.play().catch(() => {});
    }
  };

  const handleCancel = async () => {
    if (!jobId) return;
    try {
      await cancelJob(jobId);
      const updated = await getJob(jobId);
      setJob(updated);
    } catch (err: any) {
      alert("Lỗi huỷ công việc: " + err.message);
    }
  };

  const handleSegmentChange = (idx: number, field: "vi" | "zh" | "dub_text", val: string) => {
    setSegments((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };
      return copy;
    });
  };

  const handleSaveSegments = async () => {
    if (!jobId) return;
    try {
      await updateJobSegments(jobId, segments);
      alert("Đã lưu phụ đề thành công!");
    } catch (err: any) {
      alert("Lỗi lưu phụ đề: " + err.message);
    }
  };

  const handleRerender = async () => {
    if (!jobId || !job) return;
    try {
      await updateJobSegments(jobId, segments);
      await triggerRerender(jobId, job.options, manualRegions.length > 0 ? manualRegions : undefined);
      alert("Đã gửi yêu cầu render lại. Hệ thống đang xử lý!");
      window.location.reload();
    } catch (err: any) {
      alert("Lỗi render lại: " + err.message);
    }
  };

  // Canvas drawing for manual blur regions
  const loadFrameImage = () => {
    if (!jobId) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = getFrameUrl(jobId, currentTime);
    img.onload = () => {
      setFrameImg(img);
      drawCanvas(img, manualRegions, null);
    };
  };

  const drawCanvas = (
    img: HTMLImageElement,
    regions: { x: number; y: number; w: number; h: number }[],
    activeBox: { x: number; y: number; w: number; h: number } | null
  ) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    // Draw existing regions
    ctx.strokeStyle = "#38bdf8";
    ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
    ctx.lineWidth = 2;

    for (const r of regions) {
      const rx = r.x * canvas.width;
      const ry = r.y * canvas.height;
      const rw = r.w * canvas.width;
      const rh = r.h * canvas.height;
      ctx.fillRect(rx, ry, rw, rh);
      ctx.strokeRect(rx, ry, rw, rh);
    }

    // Draw active box being dragged
    if (activeBox) {
      ctx.strokeStyle = "#f43f5e";
      ctx.fillStyle = "rgba(244, 63, 94, 0.4)";
      ctx.fillRect(activeBox.x, activeBox.y, activeBox.w, activeBox.h);
      ctx.strokeRect(activeBox.x, activeBox.y, activeBox.w, activeBox.h);
    }
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setIsDrawing(true);
    setStartPoint({ x, y });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPoint || !canvasRef.current || !frameImg) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const box = {
      x: Math.min(startPoint.x, x),
      y: Math.min(startPoint.y, y),
      w: Math.abs(x - startPoint.x),
      h: Math.abs(y - startPoint.y),
    };
    setCurrentBox(box);
    drawCanvas(frameImg, manualRegions, box);
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentBox || !canvasRef.current || !frameImg) {
      setIsDrawing(false);
      return;
    }
    const canvas = canvasRef.current;
    const norm = {
      x: currentBox.x / canvas.width,
      y: currentBox.y / canvas.height,
      w: currentBox.w / canvas.width,
      h: currentBox.h / canvas.height,
    };
    if (norm.w > 0.02 && norm.h > 0.02) {
      const updated = [...manualRegions, norm];
      setManualRegions(updated);
      drawCanvas(frameImg, updated, null);
    }
    setIsDrawing(false);
    setCurrentBox(null);
  };

  if (loading) {
    return (
      <div className="text-center py-24 space-y-3">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-slate-400 text-sm">Đang tải dữ liệu công việc...</p>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="p-8 text-center bg-[#151d30] rounded-2xl border border-red-500/30 max-w-lg mx-auto space-y-4">
        <p className="text-red-400 text-base font-semibold">❌ {error || "Không tìm thấy công việc."}</p>
        <button
          onClick={() => router.push("/")}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition"
        >
          Quay lại trang chủ
        </button>
      </div>
    );
  }

  const isCompleted = job.status === "completed";
  const isFailed = job.status === "failed";
  const isCancelled = job.status === "cancelled";
  const isProcessing = job.status === "pending" || job.status === "processing";

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-[#151d30] p-5 rounded-2xl border border-[#23314e] flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-slate-100">{job.video_filename || "Video không tên"}</h1>
            <span
              className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                isCompleted
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  : isFailed
                  ? "bg-red-500/10 text-red-400 border border-red-500/30"
                  : isCancelled
                  ? "bg-slate-500/10 text-slate-400 border border-slate-500/30"
                  : "bg-blue-500/10 text-blue-400 border border-blue-500/30 animate-pulse"
              }`}
            >
              {isCompleted ? "Hoàn thành" : isFailed ? "Thất bại" : isCancelled ? "Đã huỷ" : "Đang xử lý"}
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Độ dài: {job.video_duration.toFixed(1)}s • Độ phân giải: {job.video_width}x{job.video_height} • Mã:{" "}
            <span className="font-mono text-slate-500">{job.id.slice(0, 8)}</span>
          </p>
        </div>

        {isProcessing && (
          <button
            onClick={handleCancel}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-red-600/20 text-red-400 hover:bg-red-600 hover:text-white border border-red-500/30 transition"
          >
            🛑 Huỷ công việc
          </button>
        )}
      </div>

      {/* Progress & Stepper Bar (Visible when processing or failed) */}
      {!isCompleted && (
        <div className="bg-[#151d30] p-6 rounded-2xl border border-[#23314e] space-y-6">
          <div>
            <div className="flex justify-between text-sm font-semibold mb-2">
              <span className="text-slate-300">{job.step_log || "Đang xử lý..."}</span>
              <span className="text-blue-400 font-mono">{Math.round(job.overall_progress * 100)}%</span>
            </div>
            <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-300 ${
                  isFailed
                    ? "bg-red-500"
                    : isCancelled
                    ? "bg-slate-600"
                    : "bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-300 animate-pulse"
                }`}
                style={{ width: `${Math.round(job.overall_progress * 100)}%` }}
              />
            </div>
          </div>

          {/* Pipeline Steps Indicator */}
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
            {["ingest", "asr", "ocr", "translate", "dub", "render"].map((st) => {
              const currentStepIdx = ["ingest", "asr", "ocr", "translate", "dub", "render"].indexOf(job.current_step);
              const thisStepIdx = ["ingest", "asr", "ocr", "translate", "dub", "render"].indexOf(st);
              const isPast = thisStepIdx < currentStepIdx || isCompleted;
              const isCurrent = st === job.current_step;

              return (
                <div
                  key={st}
                  className={`p-2 rounded-xl border transition ${
                    isCurrent
                      ? "border-blue-500 bg-blue-500/10 text-blue-400 font-bold"
                      : isPast
                      ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"
                      : "border-slate-800 bg-slate-900/40 text-slate-500"
                  }`}
                >
                  <p>{STEP_LABELS[st]}</p>
                </div>
              );
            })}
          </div>

          {isFailed && (
            <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs space-y-1">
              <p className="font-bold">Mã lỗi: {job.error_code || "UNKNOWN"}</p>
              <p>{job.error_message}</p>
            </div>
          )}
        </div>
      )}

      {/* Editor & Preview Workspace (Visible when completed) */}
      {isCompleted && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Video Preview with Subtitle Overlay */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-[#151d30] p-4 rounded-2xl border border-[#23314e] space-y-4">
              <h2 className="text-sm font-semibold text-slate-300 flex items-center justify-between">
                <span>Xem trước phụ đề</span>
                <span className="text-xs text-slate-500">HTML overlay mô phỏng</span>
              </h2>

              {/* Video Player Box */}
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video flex items-center justify-center group">
                <video
                  ref={videoRef}
                  src={getVideoUrl(job.id)}
                  onTimeUpdate={handleTimeUpdate}
                  controls
                  playsInline
                  className="w-full h-full object-contain"
                />

                {/* Hidden Audio Player for Dubbing Sync */}
                {job.has_dub && (
                  <audio
                    ref={audioRef}
                    src={getDownloadUrl(job.id, "dub")}
                    preload="auto"
                    className="hidden"
                  />
                )}

                {/* Subtitle HTML Overlay */}
                {activeSegmentIndex >= 0 && segments[activeSegmentIndex] && (
                  <div
                    className={`absolute left-0 right-0 px-4 text-center pointer-events-none transition-all ${
                      job.options.position === "top" ? "top-4" : "bottom-12"
                    }`}
                  >
                    <span className="inline-block px-3 py-1 bg-black/75 backdrop-blur-sm text-white font-semibold text-sm sm:text-base rounded-md border border-black/40 shadow-lg">
                      {segments[activeSegmentIndex].vi}
                    </span>
                  </div>
                )}
              </div>

              {/* Manual Blur Drawer Button & Tools */}
              <div className="flex items-center justify-between text-xs pt-2 border-t border-[#23314e]">
                <button
                  onClick={() => {
                    setShowBlurDrawer(!showBlurDrawer);
                    if (!showBlurDrawer) loadFrameImage();
                  }}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  🖌️ {showBlurDrawer ? "Đóng vùng mờ" : "Chỉnh tay vùng làm mờ"}
                </button>
                {manualRegions.length > 0 && (
                  <button
                    onClick={() => setManualRegions([])}
                    className="text-red-400 hover:underline"
                  >
                    Xoá các vùng đã vẽ ({manualRegions.length})
                  </button>
                )}
              </div>

              {/* Canvas Overlay for Drawing Blur Boxes */}
              {showBlurDrawer && (
                <div className="p-3 bg-[#0f172a] rounded-xl border border-blue-500/30 space-y-2">
                  <p className="text-xs text-blue-300">
                    Kéo chuột hoặc ngón tay để vẽ hình chữ nhật lên khung hình cần làm mờ.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={loadFrameImage}
                      className="px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-500"
                    >
                      Lấy khung hình tại {currentTime.toFixed(1)}s
                    </button>
                  </div>
                  <canvas
                    ref={canvasRef}
                    width={job.video_width || 640}
                    height={job.video_height || 360}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    className="w-full aspect-video border border-slate-700 rounded-lg cursor-crosshair bg-black"
                  />
                </div>
              )}
            </div>

            {/* Download Buttons Bar */}
            <div className="bg-[#151d30] p-4 rounded-2xl border border-[#23314e] space-y-3">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Tải file kết quả</h3>
              <div className="grid grid-cols-2 gap-2 text-xs font-medium">
                <a
                  href={getDownloadUrl(job.id, "mp4")}
                  download="video_vietsub.mp4"
                  className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-center transition flex items-center justify-center gap-1.5"
                >
                  📥 Video MP4
                </a>
                <a
                  href={getDownloadUrl(job.id, "srt_vi")}
                  download="subtitles_vi.srt"
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-center border border-slate-700 transition flex items-center justify-center gap-1.5"
                >
                  📄 Phụ đề Việt (.srt)
                </a>
                <a
                  href={getDownloadUrl(job.id, "srt_zh")}
                  download="subtitles_zh.srt"
                  className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-center border border-slate-700 transition flex items-center justify-center gap-1.5"
                >
                  📄 Phụ đề Trung (.srt)
                </a>
                {job.has_dub && (
                  <a
                    href={getDownloadUrl(job.id, "dub")}
                    download="dubbing.wav"
                    className="p-2.5 rounded-xl bg-teal-600/30 hover:bg-teal-600 text-teal-300 hover:text-white text-center border border-teal-500/30 transition flex items-center justify-center gap-1.5"
                  >
                    🎵 Lồng tiếng (.wav)
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Subtitle List & Editor */}
          <div className="lg:col-span-6 space-y-4">
            <div className="bg-[#151d30] p-4 rounded-2xl border border-[#23314e] space-y-4 flex flex-col h-[650px]">
              <div className="flex items-center justify-between pb-3 border-b border-[#23314e]">
                <div>
                  <h2 className="text-base font-bold text-slate-100">Danh sách câu phụ đề</h2>
                  <p className="text-xs text-slate-400">{segments.length} câu thoại</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleSaveSegments}
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition"
                  >
                    💾 Lưu phụ đề
                  </button>
                  <button
                    onClick={handleRerender}
                    className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white rounded-lg text-xs font-bold transition shadow"
                  >
                    ⚡ Render lại
                  </button>
                </div>
              </div>

              {/* Scrollable Subtitle Rows */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                {segments.map((seg, idx) => {
                  const isActive = idx === activeSegmentIndex;

                  return (
                    <div
                      key={seg.id}
                      className={`p-3 rounded-xl border transition ${
                        isActive
                          ? "bg-blue-950/40 border-blue-500/80 shadow-md"
                          : "bg-[#0f172a]/70 border-[#23314e] hover:border-slate-600"
                      }`}
                    >
                      {/* Row Header with timestamp & seek button */}
                      <div className="flex items-center justify-between text-xs mb-2">
                        <button
                          onClick={() => handleSeek(seg.start)}
                          className="font-mono text-cyan-400 hover:underline font-semibold flex items-center gap-1"
                        >
                          ▶ {seg.start.toFixed(2)}s - {seg.end.toFixed(2)}s
                        </button>

                        {/* Dubbing badges */}
                        {seg.dub_status && (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-[10px] text-slate-400">
                              {seg.dub_speed ? `${seg.dub_speed.toFixed(2)}x` : ""}
                            </span>
                            <span
                              className={`px-1.5 py-0.2 text-[10px] font-semibold rounded ${
                                seg.dub_status === "ok"
                                  ? "bg-emerald-500/10 text-emerald-400"
                                  : seg.dub_status === "stretched"
                                  ? "bg-blue-500/10 text-blue-400"
                                  : seg.dub_status === "shortened"
                                  ? "bg-amber-500/10 text-amber-400"
                                  : "bg-red-500/10 text-red-400"
                              }`}
                            >
                              {seg.dub_status}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Chinese text (Editable for .srt zh) */}
                      <div className="space-y-1 mb-2">
                        <label className="text-[10px] uppercase tracking-wider text-slate-500 block">Tiếng Trung:</label>
                        <input
                          type="text"
                          value={seg.zh}
                          onChange={(e) => handleSegmentChange(idx, "zh", e.target.value)}
                          className="w-full px-2.5 py-1 text-xs rounded bg-[#0b0f19] border border-slate-800 text-slate-300 focus:outline-none focus:border-slate-600"
                        />
                      </div>

                      {/* Vietnamese text (Directly edited for rendering & SRT vi) */}
                      <div className="space-y-1">
                        <label className="text-[10px] uppercase tracking-wider text-blue-400 block font-semibold">
                          Tiếng Việt (phụ đề & render):
                        </label>
                        <textarea
                          rows={2}
                          value={seg.vi}
                          onChange={(e) => handleSegmentChange(idx, "vi", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-xs rounded bg-[#0b0f19] border border-slate-700 text-slate-100 focus:outline-none focus:border-blue-500 resize-none font-medium"
                        />
                      </div>

                      {/* Dub text (if shortened by LLM) */}
                      {seg.dub_text && (
                        <div className="space-y-1 mt-1.5 pt-1.5 border-t border-slate-800/80">
                          <label className="text-[10px] uppercase tracking-wider text-amber-400 block">
                            Lời đọc lồng tiếng đã rút gọn:
                          </label>
                          <input
                            type="text"
                            value={seg.dub_text}
                            onChange={(e) => handleSegmentChange(idx, "dub_text", e.target.value)}
                            className="w-full px-2.5 py-1 text-xs rounded bg-[#0b0f19] border border-amber-900/40 text-amber-200 focus:outline-none focus:border-amber-600"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function JobPage() {
  return (
    <Suspense fallback={<div className="text-center py-24 text-slate-400">Đang chuẩn bị...</div>}>
      <JobContent />
    </Suspense>
  );
}
