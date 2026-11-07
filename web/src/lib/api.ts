/**
 * ZhViSub API Client
 * Supports configurable API server URL (stored in localStorage) for LAN / APK use.
 */

export interface VoiceItem {
  name: string;
  gender: string;
  locale: string;
}

export interface JobStatus {
  id: string;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  current_step: string;
  step_progress: number;
  overall_progress: number;
  step_log: string;
  options: Record<string, any>;
  error_code?: string;
  error_message?: string;
  video_filename: string;
  video_duration: number;
  video_width: number;
  video_height: number;
  has_dub: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface JobListResponse {
  total: number;
  page: number;
  page_size: number;
  items: JobStatus[];
}

export interface Segment {
  id: number;
  start: number;
  end: number;
  zh: string;
  vi: string;
  dub_text?: string;
  dub_speed?: number;
  dub_status?: "ok" | "stretched" | "shortened" | "overflow";
}

export interface BlurRegionItem {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const DEFAULT_API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function getApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem("zhvisub_api_url");
    if (saved) return saved.replace(/\/+$/, "");
  }
  return DEFAULT_API_URL.replace(/\/+$/, "");
}

export function setApiBaseUrl(url: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("zhvisub_api_url", url.trim().replace(/\/+$/, ""));
  }
}

export async function fetchVoices(): Promise<VoiceItem[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/voices`);
  if (!res.ok) throw new Error("Không thể tải danh sách giọng đọc.");
  return res.json();
}

export async function listJobs(page: number = 1, pageSize: number = 20): Promise<JobListResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs?page=${page}&page_size=${pageSize}`);
  if (!res.ok) throw new Error("Không thể tải danh sách công việc.");
  return res.json();
}

export async function getJob(id: string): Promise<JobStatus> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Không thể lấy thông tin công việc.");
  }
  return res.json();
}

export async function cancelJob(id: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}/cancel`, { method: "POST" });
  if (!res.ok) throw new Error("Không thể huỷ công việc.");
}

export async function deleteJob(id: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Không thể xoá công việc.");
}

export async function getJobSegments(id: string): Promise<Segment[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}/segments`);
  if (!res.ok) throw new Error("Không thể tải danh sách phụ đề.");
  return res.json();
}

export async function updateJobSegments(id: string, segments: Segment[]): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}/segments`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ segments }),
  });
  if (!res.ok) throw new Error("Lỗi lưu phụ đề.");
}

export async function triggerRerender(
  id: string,
  options: Record<string, any>,
  blurRegions?: BlurRegionItem[]
): Promise<void> {
  const base = getApiBaseUrl();
  const payload = {
    ...options,
    blur_regions: blurRegions,
  };
  const res = await fetch(`${base}/jobs/${id}/render`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Không thể bắt đầu render lại.");
  }
}

export function getVideoUrl(id: string): string {
  return `${getApiBaseUrl()}/jobs/${id}/video`;
}

export function getFrameUrl(id: string, t: number): string {
  return `${getApiBaseUrl()}/jobs/${id}/frame?t=${t.toFixed(2)}`;
}

export function getDownloadUrl(id: string, type: "mp4" | "srt_vi" | "srt_zh" | "dub"): string {
  return `${getApiBaseUrl()}/jobs/${id}/download?type=${type}`;
}

export function uploadJobWithProgress(
  formData: FormData,
  onProgress: (percent: number) => void
): Promise<{ id: string; status: string }> {
  return new Promise((resolve, reject) => {
    const base = getApiBaseUrl();
    const xhr = new XMLHttpRequest();

    xhr.open("POST", `${base}/jobs`, true);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100);
        onProgress(percent);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          resolve(data);
        } catch {
          reject(new Error("Phản hồi máy chủ không hợp lệ."));
        }
      } else {
        try {
          const err = JSON.parse(xhr.responseText);
          reject(new Error(err.message || `Lỗi tải lên (${xhr.status})`));
        } catch {
          reject(new Error(`Tải lên thất bại với mã lỗi HTTP ${xhr.status}`));
        }
      }
    };

    xhr.onerror = () => {
      reject(new Error("Lỗi kết nối tới máy chủ. Vui lòng kiểm tra địa chỉ API trong mục Cài đặt."));
    };

    xhr.send(formData);
  });
}
