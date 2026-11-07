"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import UploadCard from "../components/UploadCard";
import ProcessingOptions from "../components/ProcessingOptions";
import DubbingOptions from "../components/DubbingOptions";
import TranslationCard from "../components/TranslationCard";
import { useAuth } from "../lib/auth";
import {
  createJobWithProgress,
  fetchVoices,
  VoiceItem,
  getGuestApiKey,
} from "../lib/api";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";

export default function CreateJobPage() {
  const router = useRouter();
  const { hasAiConnection, user } = useAuth();

  // Video source states
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState<string>("");

  // Subtitle & Blur states
  const [blur, setBlur] = useState<boolean>(true);
  const [blurStrength, setBlurStrength] = useState<number>(30);
  const [position, setPosition] = useState<string>("bottom");

  // Dubbing states
  const [dub, setDub] = useState<boolean>(false);
  const [voice, setVoice] = useState<string>("vi-VN-HoaiMyNeural");
  const [dubRate, setDubRate] = useState<string>("+0%");
  const [origAudio, setOrigAudio] = useState<string>("duck");
  const [voicesList, setVoicesList] = useState<VoiceItem[]>([]);

  // Translation states
  const [translateEngine, setTranslateEngine] = useState<"gemini" | "openai" | "fallback">("gemini");

  // Submitting states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [uploadPercent, setUploadPercent] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Load voices list on mount
  useEffect(() => {
    fetchVoices()
      .then((data) => {
        if (data && data.length > 0) {
          setVoicesList(data);
          setVoice(data[0].name);
        }
      })
      .catch(() => {});
  }, []);

  const handleVideoSelected = (file: File | null, url: string) => {
    setSelectedFile(file);
    setVideoUrl(url);
    setErrorMsg(null);
  };

  // Validation
  const hasVideo = Boolean(selectedFile || videoUrl.trim());
  const isKeyValid = hasAiConnection || translateEngine === "fallback";
  const canSubmit = hasVideo && isKeyValid && !isSubmitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    setUploadPercent(0);
    setErrorMsg(null);

    const formData = new FormData();
    if (selectedFile) {
      formData.append("file", selectedFile);
    } else {
      formData.append("url", videoUrl);
    }

    formData.append("blur", String(blur));
    formData.append("blur_strength", String(blurStrength));
    formData.append("position", position);
    formData.append("dub", String(dub));
    formData.append("voice", voice);
    formData.append("dub_rate", dubRate);
    formData.append("orig_audio", origAudio);
    formData.append("translate_engine", translateEngine);

    // Pass guest key if in guest mode
    const guestKey = getGuestApiKey();
    if (guestKey) {
      formData.append("user_api_key", guestKey);
    }

    try {
      const res = await createJobWithProgress(formData, (percent) => {
        setUploadPercent(percent);
      });
      router.push(`/job?id=${res.id}`);
    } catch (err: any) {
      setErrorMsg(err.message || "Không thể tạo công việc dịch video.");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Page Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100 dark:text-slate-100 text-slate-900">
          Tạo bản dịch video mới
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Tự động nhận diện chữ cứng, xóa phụ đề gốc và chèn phụ đề / lồng tiếng Việt
        </p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="font-bold underline ml-2">Đóng</button>
        </div>
      )}

      {/* 2-Column Responsive Layout on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Left Column: Source Video + Translation Engine */}
        <div className="space-y-5">
          <UploadCard
            selectedFile={selectedFile}
            videoUrl={videoUrl}
            onVideoSelected={handleVideoSelected}
          />

          <TranslationCard
            engine={translateEngine}
            setEngine={setTranslateEngine}
          />
        </div>

        {/* Right Column: Subtitle Blur & Placement + AI Dubbing */}
        <div className="space-y-5">
          <ProcessingOptions
            blur={blur}
            setBlur={setBlur}
            blurStrength={blurStrength}
            setBlurStrength={setBlurStrength}
            position={position}
            setPosition={setPosition}
          />

          <DubbingOptions
            dub={dub}
            setDub={setDub}
            voice={voice}
            setVoice={setVoice}
            dubRate={dubRate}
            setDubRate={setDubRate}
            origAudio={origAudio}
            setOrigAudio={setOrigAudio}
            voicesList={voicesList}
          />
        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-16 lg:bottom-0 left-0 lg:left-64 right-0 z-30 p-4 bg-[#0B1020]/90 dark:bg-[#0B1020]/90 bg-white/90 backdrop-blur-md border-t border-[#1F2A44] dark:border-[#1F2A44] border-slate-200">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Progress or Status note */}
          <div className="text-xs text-slate-400 text-center sm:text-left">
            {isSubmitting ? (
              <div className="flex items-center gap-2 text-[#22D3EE] font-medium">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang tải video lên máy chủ ({uploadPercent}%)...</span>
              </div>
            ) : !hasVideo ? (
              <span>Vui lòng chọn file video hoặc dán link video để tiếp tục</span>
            ) : !isKeyValid ? (
              <span className="text-amber-400">Thiếu API key cho mô hình dịch này</span>
            ) : (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                Đã sẵn sàng xử lý video
              </span>
            )}
          </div>

          {/* Action Button */}
          <button
            type="button"
            disabled={!canSubmit}
            onClick={handleSubmit}
            className="w-full sm:w-auto gradient-btn px-8 py-3.5 text-sm font-semibold flex items-center justify-center gap-2.5 shadow-xl shadow-[#7C5CFF]/20"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang tải lên {uploadPercent}%</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Bắt đầu xử lý</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
