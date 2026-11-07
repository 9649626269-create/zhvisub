"use client";

import React, { useState, useRef } from "react";
import { UploadCloud, Link as LinkIcon, Film, Trash2, CheckCircle2, AlertCircle } from "lucide-react";

interface UploadCardProps {
  onVideoSelected: (file: File | null, url: string) => void;
  selectedFile: File | null;
  videoUrl: string;
}

export default function UploadCard({
  onVideoSelected,
  selectedFile,
  videoUrl,
}: UploadCardProps) {
  const [tab, setTab] = useState<"file" | "url">(videoUrl ? "url" : "file");
  const [urlInput, setUrlInput] = useState(videoUrl);
  const [isDragging, setIsDragging] = useState(false);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [previewThumbnail, setPreviewThumbnail] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleFile = (file: File) => {
    if (file.size > 2 * 1024 * 1024 * 1024) {
      alert("Dung lượng video vượt quá giới hạn 2GB!");
      return;
    }

    onVideoSelected(file, "");

    // Generate quick thumbnail & duration from local video
    const videoObjUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement("video");
    tempVideo.preload = "metadata";
    tempVideo.src = videoObjUrl;
    tempVideo.onloadedmetadata = () => {
      setVideoDuration(tempVideo.duration);
      tempVideo.currentTime = Math.min(1.0, tempVideo.duration / 2);
    };
    tempVideo.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
          setPreviewThumbnail(canvas.toDataURL("image/jpeg", 0.7));
        }
      } catch {
        // Ignore canvas export errors
      }
      URL.revokeObjectURL(videoObjUrl);
    };
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleRemove = () => {
    onVideoSelected(null, "");
    setUrlInput("");
    setPreviewThumbnail(null);
    setVideoDuration(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
      alert("Đường link phải bắt đầu bằng http:// hoặc https://");
      return;
    }
    onVideoSelected(null, trimmed);
  };

  return (
    <div className="app-card p-5 transition-all">
      {/* Header & Tabs */}
      <div className="flex items-center justify-between pb-4 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-purple-500/10 flex items-center justify-center text-[#7C5CFF]">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100 dark:text-slate-100 text-slate-800">
              Nguồn video
            </h2>
            <p className="text-xs text-slate-400">Chọn video tiếng Trung cần dịch</p>
          </div>
        </div>

        {/* Tab switch */}
        {!selectedFile && !videoUrl && (
          <div className="flex p-1 rounded-xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => setTab("file")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                tab === "file"
                  ? "bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Tải file
            </button>
            <button
              type="button"
              onClick={() => setTab("url")}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                tab === "url"
                  ? "bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Dán link
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        {/* Selected File / URL Preview */}
        {selectedFile || videoUrl ? (
          <div className="p-4 rounded-2xl bg-[#0B1020]/70 dark:bg-[#0B1020]/70 bg-slate-100/70 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              {previewThumbnail ? (
                <img
                  src={previewThumbnail}
                  alt="Thumbnail"
                  className="w-20 h-14 object-cover rounded-xl border border-[#1F2A44] shadow-sm flex-shrink-0"
                />
              ) : (
                <div className="w-14 h-14 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-[#7C5CFF] flex-shrink-0">
                  <Film className="w-6 h-6" />
                </div>
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-sm font-semibold text-slate-100 dark:text-slate-100 text-slate-800 truncate block">
                    {selectedFile ? selectedFile.name : videoUrl}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                  {selectedFile && <span>{formatFileSize(selectedFile.size)}</span>}
                  {videoDuration !== null && <span>Thời lượng: {formatDuration(videoDuration)}</span>}
                  {videoUrl && <span className="text-[#22D3EE]">Link trực tiếp</span>}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={handleRemove}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all self-end sm:self-center"
            >
              <Trash2 className="w-4 h-4" />
              <span>Xoá</span>
            </button>
          </div>
        ) : tab === "file" ? (
          /* Drag & Drop File Zone */
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
              isDragging
                ? "border-[#22D3EE] bg-[#7C5CFF]/10 scale-[0.99]"
                : "border-[#1F2A44] dark:border-[#1F2A44] border-slate-300 hover:border-[#7C5CFF] bg-[#0B1020]/40 dark:bg-[#0B1020]/40 bg-slate-50/50 hover:bg-[#121A2F]/40"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/quicktime,video/x-matroska,video/webm"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFile(e.target.files[0]);
                }
              }}
            />
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#7C5CFF]/20 to-[#22D3EE]/20 border border-[#7C5CFF]/30 flex items-center justify-center mx-auto mb-3 text-[#22D3EE]">
              <UploadCloud className="w-6 h-6" />
            </div>
            <p className="text-sm font-medium text-slate-200 dark:text-slate-200 text-slate-700">
              Kéo thả video vào đây hoặc <span className="text-[#22D3EE] font-semibold underline decoration-dotted">chọn file</span>
            </p>
            <p className="text-xs text-slate-400 mt-1.5">
              MP4, MOV, MKV, WebM · tối đa 2GB
            </p>
          </div>
        ) : (
          /* Link Input Form */
          <form onSubmit={handleUrlSubmit} className="space-y-3">
            <div className="relative">
              <input
                type="url"
                value={urlInput}
                onChange={(e) => setUrlInput(e.target.value)}
                placeholder="https://example.com/video.mp4"
                className="w-full px-4 py-3 pl-10 rounded-2xl bg-[#0B1020] dark:bg-[#0B1020] bg-slate-100 border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 text-sm text-slate-100 dark:text-slate-100 text-slate-900 focus:outline-none focus:border-[#7C5CFF] transition-colors"
              />
              <LinkIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            </div>
            <button
              type="submit"
              disabled={!urlInput.trim()}
              className="w-full gradient-btn py-2.5 text-xs font-semibold"
            >
              Sử dụng link này
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
