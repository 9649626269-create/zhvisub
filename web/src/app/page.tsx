"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { fetchVoices, uploadJobWithProgress, VoiceItem } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();

  // Input state: file or URL
  const [mode, setMode] = useState<"file" | "url">("file");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [urlInput, setUrlInput] = useState<string>("");

  // Options state
  const [blur, setBlur] = useState<boolean>(true);
  const [blurStrength, setBlurStrength] = useState<number>(30);
  const [fontSize, setFontSize] = useState<number>(0);
  const [font, setFont] = useState<string>("Noto Sans");
  const [color, setColor] = useState<string>("&H00FFFFFF");
  const [position, setPosition] = useState<"bottom" | "top">("bottom");

  const [dub, setDub] = useState<boolean>(false);
  const [voices, setVoices] = useState<VoiceItem[]>([]);
  const [voice, setVoice] = useState<string>("vi-VN-HoaiMyNeural");
  const [dubRate, setDubRate] = useState<string>("+0%");
  const [origAudio, setOrigAudio] = useState<"duck" | "mute" | "keep">("duck");

  // Upload progress and UI state
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchVoices()
      .then((data) => {
        setVoices(data);
        if (data.length > 0) {
          const defaultVoice = data.find((v) => v.name.includes("HoaiMy")) || data[0];
          setVoice(defaultVoice.name);
        }
      })
      .catch((err) => {
        console.warn("Could not fetch voices:", err);
      });
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setErrorMessage("");
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0]);
      setMode("file");
      setErrorMessage("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage("");

    if (mode === "file" && !selectedFile) {
      setErrorMessage("Vui lòng chọn một file video để xử lý.");
      return;
    }
    if (mode === "url" && !urlInput.trim()) {
      setErrorMessage("Vui lòng dán đường link video hợp lệ.");
      return;
    }

    const formData = new FormData();
    if (mode === "file" && selectedFile) {
      formData.append("file", selectedFile);
    } else {
      formData.append("url", urlInput.trim());
    }

    formData.append("blur", blur ? "true" : "false");
    formData.append("blur_strength", blurStrength.toString());
    formData.append("font_size", fontSize.toString());
    formData.append("font", font);
    formData.append("color", color);
    formData.append("position", position);
    formData.append("dub", dub ? "true" : "false");
    formData.append("voice", voice);
    formData.append("dub_rate", dubRate);
    formData.append("orig_audio", origAudio);

    setIsUploading(true);
    setUploadProgress(0);

    try {
      const result = await uploadJobWithProgress(formData, (percent) => {
        setUploadProgress(percent);
      });
      router.push(`/job/?id=${result.id}`);
    } catch (err: any) {
      setIsUploading(false);
      setErrorMessage(err.message || "Tải lên thất bại. Vui lòng thử lại.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      {/* Header Banner */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 via-cyan-400 to-teal-300 bg-clip-text text-transparent">
          Dịch & Lồng Tiếng Video Tiếng Trung
        </h1>
        <p className="text-slate-400 text-sm sm:text-base max-w-xl mx-auto">
          Tự động nhận diện giọng nói, phát hiện và xoá mờ phụ đề cứng gốc, tạo phụ đề Việt và lồng tiếng khớp khẩu hình.
        </p>
      </div>

      {errorMessage && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 text-sm flex items-center justify-between">
          <span>❌ {errorMessage}</span>
          <button onClick={() => setErrorMessage("")} className="text-red-400 hover:text-white">✕</button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Source Mode Selector */}
        <div className="bg-[#151d30] p-1.5 rounded-xl border border-[#23314e] flex">
          <button
            type="button"
            onClick={() => setMode("file")}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
              mode === "file" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"
            }`}
          >
            📁 Tải lên file video
          </button>
          <button
            type="button"
            onClick={() => setMode("url")}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
              mode === "url" ? "bg-blue-600 text-white shadow-md" : "text-slate-400 hover:text-white"
            }`}
          >
            🔗 Dán link trực tiếp
          </button>
        </div>

        {/* Video Upload Box */}
        {mode === "file" ? (
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-[#2b3a5a] hover:border-blue-500 rounded-2xl p-8 text-center cursor-pointer bg-[#111827]/60 hover:bg-[#151d30] transition group"
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="video/mp4,video/quicktime,video/x-matroska,video/webm,.mp4,.mov,.mkv,.webm"
              className="hidden"
            />
            <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 group-hover:scale-110 transition">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            {selectedFile ? (
              <div className="space-y-1">
                <p className="font-semibold text-blue-400">{selectedFile.name}</p>
                <p className="text-xs text-slate-400">{(selectedFile.size / (1024 * 1024)).toFixed(1)} MB</p>
                <p className="text-xs text-slate-500 pt-1">Nhấp để chọn file khác</p>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-300">Kéo thả video vào đây hoặc <span className="text-blue-400 underline">duyệt tìm file</span></p>
                <p className="text-xs text-slate-500">Hỗ trợ MP4, MOV, MKV, WebM (tối đa 2GB)</p>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-[#151d30] p-6 rounded-2xl border border-[#23314e] space-y-2">
            <label className="block text-sm font-semibold text-slate-300">Đường dẫn video trực tiếp (HTTP / HTTPS)</label>
            <input
              type="url"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://example.com/video.mp4"
              className="w-full px-4 py-2.5 rounded-xl bg-[#0b0f19] border border-[#2a3b5c] text-slate-100 placeholder-slate-600 text-sm focus:outline-none focus:border-blue-500 transition"
            />
            <p className="text-xs text-slate-500">Hệ thống sẽ tải video trực tiếp về server với bảo vệ an toàn SSRF.</p>
          </div>
        )}

        {/* Upload Progress Bar */}
        {isUploading && (
          <div className="bg-[#151d30] p-4 rounded-xl border border-[#23314e] space-y-2">
            <div className="flex justify-between text-xs font-semibold text-slate-300">
              <span>Đang tải video lên máy chủ...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 transition-all duration-200"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        {/* Options Sections */}
        <div className="space-y-4">
          {/* Section 1: Blur & Subtitles */}
          <div className="bg-[#151d30] p-5 rounded-2xl border border-[#23314e] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">Làm mờ phụ đề cứng gốc (OCR)</h3>
                <p className="text-xs text-slate-400">Tự động phát hiện và làm mờ chữ tiếng Trung ở đáy video</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={blur}
                  onChange={(e) => setBlur(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {blur && (
              <div className="pt-2 border-t border-[#23314e]/60 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <div className="flex justify-between text-slate-300 mb-1">
                    <span>Độ mờ Gaussian:</span>
                    <span className="font-mono text-blue-400">{blurStrength}</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    value={blurStrength}
                    onChange={(e) => setBlurStrength(parseInt(e.target.value))}
                    className="w-full accent-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 mb-1">Vị trí phụ đề:</label>
                  <select
                    value={position}
                    onChange={(e) => setPosition(e.target.value as "bottom" | "top")}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#0b0f19] border border-[#2a3b5c] text-slate-200"
                  >
                    <option value="bottom">Dưới đáy (mặc định)</option>
                    <option value="top">Trên đỉnh</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Section 2: Dubbing (TTS) */}
          <div className="bg-[#151d30] p-5 rounded-2xl border border-[#23314e] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-slate-200 text-sm">Lồng tiếng Tiếng Việt (AI Dubbing)</h3>
                <p className="text-xs text-slate-400">Đọc lời thoại tiếng Việt đồng bộ khớp với thời gian câu gốc</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={dub}
                  onChange={(e) => setDub(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

            {dub && (
              <div className="pt-2 border-t border-[#23314e]/60 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div>
                  <label className="block text-slate-300 mb-1">Giọng đọc:</label>
                  <select
                    value={voice}
                    onChange={(e) => setVoice(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#0b0f19] border border-[#2a3b5c] text-slate-200"
                  >
                    {voices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name.replace("vi-VN-", "").replace("Neural", "")} ({v.gender === "Female" ? "Nữ" : "Nam"})
                      </option>
                    ))}
                    {voices.length === 0 && (
                      <option value="vi-VN-HoaiMyNeural">Hoài My (Nữ)</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Tốc độ cơ sở:</label>
                  <select
                    value={dubRate}
                    onChange={(e) => setDubRate(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#0b0f19] border border-[#2a3b5c] text-slate-200"
                  >
                    <option value="-10%">0.9x (Hơi chậm)</option>
                    <option value="+0%">1.0x (Chuẩn)</option>
                    <option value="+10%">1.1x (Hơi nhanh)</option>
                    <option value="+20%">1.2x (Nhanh)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 mb-1">Âm thanh gốc:</label>
                  <select
                    value={origAudio}
                    onChange={(e) => setOrigAudio(e.target.value as "duck" | "mute" | "keep")}
                    className="w-full px-3 py-1.5 rounded-lg bg-[#0b0f19] border border-[#2a3b5c] text-slate-200"
                  >
                    <option value="duck">Giảm -15dB khi nói (Duck)</option>
                    <option value="mute">Tắt hoàn toàn tiếng gốc</option>
                    <option value="keep">Giữ nguyên âm lượng gốc</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isUploading}
          className="w-full py-3.5 px-6 rounded-xl font-bold text-white bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 transition shadow-lg shadow-blue-500/25 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {isUploading ? (
            <>
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
              </svg>
              <span>Đang tải lên ({uploadProgress}%)...</span>
            </>
          ) : (
            <>
              <span>🚀 Bắt đầu xử lý video</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
}
