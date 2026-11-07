"use client";

import React, { useState, useRef } from "react";
import {
  Link as LinkIcon,
  UploadCloud,
  FolderHeart,
  Globe,
  Clipboard,
  X,
  Film,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "../lib/toast";

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
  const [activeTab, setActiveTab] = useState<"url" | "file" | "library">(
    videoUrl ? "url" : selectedFile ? "file" : "url"
  );
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
      toast.error("Dung lượng video vượt quá giới hạn 2GB!");
      return;
    }

    onVideoSelected(file, "");

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

  const handleUrlChange = (val: string) => {
    setUrlInput(val);
    const trimmed = val.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      onVideoSelected(null, trimmed);
    } else {
      onVideoSelected(null, "");
    }
  };

  const handlePasteClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        handleUrlChange(text);
        toast.success("Đã dán link từ bộ nhớ tạm!");
      }
    } catch {
      toast.info("Không thể đọc bộ nhớ tạm. Hãy dán trực tiếp.");
    }
  };

  return (
    <div className="app-card space-y-4">
      {/* Card Header Label */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-[#0F8A6F] tracking-wide uppercase">
          01 · Nguồn video
        </span>
      </div>

      {/* Segmented Button (Pill Style) */}
      <div className="segmented-container">
        <button
          type="button"
          onClick={() => {
            setActiveTab("url");
            if (urlInput) onVideoSelected(null, urlInput);
          }}
          className={`segmented-item ${activeTab === "url" ? "active" : ""}`}
        >
          {activeTab === "url" && <Check className="w-4 h-4" />}
          <span>Nhập link</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("file");
            if (selectedFile) onVideoSelected(selectedFile, "");
          }}
          className={`segmented-item ${activeTab === "file" ? "active" : ""}`}
        >
          {activeTab === "file" && <Check className="w-4 h-4" />}
          <span>Chọn file</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveTab("library");
            toast.info("Tính năng Thư viện đang được phát triển.");
          }}
          className={`segmented-item ${activeTab === "library" ? "active" : ""}`}
        >
          {activeTab === "library" && <Check className="w-4 h-4" />}
          <span>Thư viện</span>
        </button>
      </div>

      {/* Tab: Nhập link */}
      {activeTab === "url" && (
        <div className="space-y-2">
          <div className="relative flex items-center">
            {/* Left Globe icon */}
            <div className="absolute left-3.5 text-[var(--text-secondary)] pointer-events-none">
              <Globe className="w-5 h-5" />
            </div>

            {/* Outlined Input with Floating Label */}
            <input
              type="url"
              value={urlInput}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="Link YouTube, TikTok, Douyin, Facebook…"
              className="app-input pl-11 pr-20 py-3 text-xs"
            />

            {/* Right Action Icons: Paste & Clear */}
            <div className="absolute right-2 flex items-center gap-1">
              {urlInput ? (
                <button
                  type="button"
                  onClick={() => handleUrlChange("")}
                  className="p-1.5 rounded-full text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10"
                >
                  <X className="w-4 h-4" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handlePasteClipboard}
                  className="p-1.5 rounded-full text-[#0F8A6F] hover:bg-[#BFF3E4]/30"
                  title="Dán từ clipboard"
                >
                  <Clipboard className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          <p className="text-[11px] text-[var(--text-secondary)] pl-1">
            Có thể dán nguyên nội dung chia sẻ từ Douyin.
          </p>
        </div>
      )}

      {/* Tab: Chọn file */}
      {activeTab === "file" && (
        <div>
          {selectedFile ? (
            <div className="p-3 rounded-2xl bg-[var(--bg-app)] border border-[var(--border-app)] flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {previewThumbnail ? (
                  <img
                    src={previewThumbnail}
                    alt="Video thumbnail"
                    className="w-14 h-14 rounded-xl object-cover border border-[var(--border-app)] flex-shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-[#0F8A6F]/10 text-[#0F8A6F] flex items-center justify-center flex-shrink-0">
                    <Film className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {selectedFile.name}
                  </p>
                  <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                    {formatFileSize(selectedFile.size)}
                    {videoDuration ? ` · ${formatDuration(videoDuration)}` : ""}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleRemove}
                className="p-2 rounded-full text-rose-500 hover:bg-rose-500/10 flex-shrink-0"
                title="Xoá video"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-2xl text-center cursor-pointer transition-all ${
                isDragging
                  ? "border-[#0F8A6F] bg-[#BFF3E4]/20"
                  : "border-[var(--border-app)] hover:border-[#0F8A6F]/60 bg-[var(--bg-app)]/50"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="video/mp4,video/quicktime,video/x-matroska"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
                className="hidden"
              />
              <div className="w-11 h-11 rounded-full bg-[#BFF3E4]/60 text-[#0F8A6F] flex items-center justify-center mx-auto mb-2">
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Kéo thả hoặc nhấn để chọn video
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] mt-1">
                Hỗ trợ MP4, MOV, MKV (Tối đa 2GB)
              </p>
            </div>
          )}
        </div>
      )}

      {/* Tab: Thư viện */}
      {activeTab === "library" && (
        <div className="p-6 text-center text-xs text-[var(--text-secondary)]">
          <FolderHeart className="w-8 h-8 mx-auto mb-2 opacity-50" />
          <p>Chưa có video nào trong thư viện tạm.</p>
        </div>
      )}
    </div>
  );
}
