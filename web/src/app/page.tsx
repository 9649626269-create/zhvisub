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
import { toast } from "../lib/toast";
import { Sparkles, Loader2, ArrowRight, CloudCheck, Play } from "lucide-react";

export default function CreateJobPage() {
  const router = useRouter();
  const { hasAiConnection } = useAuth();

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

  // Load voices on mount
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
  };

  const hasVideo = Boolean(selectedFile || videoUrl.trim());
  const isKeyValid = hasAiConnection || translateEngine === "fallback";
  const canSubmit = hasVideo && isKeyValid && !isSubmitting;

  const handleSubmit = async () => {
    if (!hasVideo) {
      toast.error("Vui lòng chọn file video hoặc dán đường link video.");
      return;
    }
    if (!isKeyValid) {
      toast.error("Vui lòng cài đặt API key hoặc chọn chế độ Miễn phí dự phòng.");
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    setUploadPercent(0);

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

    const guestKey = getGuestApiKey();
    if (guestKey) {
      formData.append("user_api_key", guestKey);
    }

    try {
      const res = await createJobWithProgress(formData, (percent) => {
        setUploadPercent(percent);
      });
      toast.success("Tạo công việc thành công! Đang chuyển hướng...");
      router.push(`/job?id=${res.id}`);
    } catch (err: any) {
      toast.error(err.message || "Tạo công việc thất bại.");
      setIsSubmitting(false);
      setUploadPercent(0);
    }
  };

  return (
    <div className="space-y-4 pb-6">
      {/* 1. Hero Banner */}
      <div className="hero-banner flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold font-condensed tracking-tight text-white leading-tight">
            Dịch, lồng tiếng, render.
          </h2>
          <p className="text-xs text-white/90">
            Mọi tác vụ AI chạy trên server Linly / GPU.
          </p>
        </div>
        <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center text-white flex-shrink-0">
          <Sparkles className="w-6 h-6" />
        </div>
      </div>

      {/* 2. Card 01 · Nguồn video */}
      <UploadCard
        onVideoSelected={handleVideoSelected}
        selectedFile={selectedFile}
        videoUrl={videoUrl}
      />

      {/* 3. Card 02 · Cấu hình nhanh (Xử lý phụ đề & làm mờ) */}
      <ProcessingOptions
        blur={blur}
        setBlur={setBlur}
        blurStrength={blurStrength}
        setBlurStrength={setBlurStrength}
        position={position}
        setPosition={setPosition}
      />

      {/* 4. Lồng tiếng AI */}
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

      {/* 5. Mô hình dịch thuật */}
      <TranslationCard
        engine={translateEngine}
        setEngine={setTranslateEngine}
      />

      {/* 6. Nút Bắt đầu xử lý (Primary Action) */}
      <div className="pt-2">
        <button
          type="button"
          disabled={!canSubmit}
          onClick={handleSubmit}
          className="btn-primary w-full py-3.5 text-sm shadow-md"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>
                {uploadPercent > 0 && uploadPercent < 100
                  ? `Đang tải video lên (${uploadPercent}%)...`
                  : "Đang khởi tạo job..."}
              </span>
            </>
          ) : (
            <>
              <Play className="w-5 h-5 fill-current" />
              <span>Bắt đầu xử lý</span>
            </>
          )}
        </button>

        {/* Upload progress bar when uploading */}
        {isSubmitting && uploadPercent > 0 && (
          <div className="mt-3 space-y-1">
            <div className="w-full bg-[#DDD8CC] dark:bg-[#24362E] h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#0F8A6F] h-full transition-all duration-200 rounded-full"
                style={{ width: `${uploadPercent}%` }}
              />
            </div>
            <div className="flex justify-between text-[11px] text-[var(--text-secondary)]">
              <span>Đang tải lên</span>
              <span className="font-bold">{uploadPercent}%</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
