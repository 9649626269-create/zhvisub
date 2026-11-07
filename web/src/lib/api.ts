/**
 * ZhViSub API Client
 * Supports configurable API server URL (stored in localStorage) for LAN / APK use,
 * JWT authentication, and AI Key management.
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

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  picture?: string;
  has_google_token: boolean;
  has_api_key: boolean;
  api_provider: string;
  masked_key: string;
  api_base_url?: string;
}

export interface ApiKeyStatus {
  has_key: boolean;
  provider: string;
  masked_key: string;
  base_url?: string;
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

export function getAuthToken(): string | null {
  if (typeof window !== "undefined") {
    return localStorage.getItem("zhvisub_jwt_token");
  }
  return null;
}

export function setAuthToken(token: string | null): void {
  if (typeof window !== "undefined") {
    if (token) {
      localStorage.setItem("zhvisub_jwt_token", token);
    } else {
      localStorage.removeItem("zhvisub_jwt_token");
    }
  }
}

// Guest mode local device key storage
export function getGuestApiKey(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("zhvisub_guest_api_key") || "";
  }
  return "";
}

export function setGuestApiKey(key: string, provider: string = "gemini", baseUrl: string = ""): void {
  if (typeof window !== "undefined") {
    localStorage.setItem("zhvisub_guest_api_key", key);
    localStorage.setItem("zhvisub_guest_provider", provider);
    localStorage.setItem("zhvisub_guest_base_url", baseUrl);
  }
}

export function getGuestProvider(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("zhvisub_guest_provider") || "gemini";
  }
  return "gemini";
}

export function getGuestBaseUrl(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("zhvisub_guest_base_url") || "";
  }
  return "";
}

function getAuthHeaders(): Record<string, string> {
  const token = getAuthToken();
  if (token) {
    return { Authorization: `Bearer ${token}` };
  }
  return {};
}

export async function fetchVoices(): Promise<VoiceItem[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/voices`);
  if (!res.ok) throw new Error("Không thể tải danh sách giọng đọc.");
  return res.json();
}

export async function listJobs(page: number = 1, pageSize: number = 20): Promise<JobListResponse> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs?page=${page}&page_size=${pageSize}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Không thể tải danh sách công việc.");
  return res.json();
}

export async function getJob(id: string): Promise<JobStatus> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Không thể lấy thông tin công việc.");
  }
  return res.json();
}

export async function cancelJob(id: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}/cancel`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Không thể huỷ công việc.");
}

export async function deleteJob(id: string): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Không thể xoá công việc.");
}

export async function getSegments(id: string): Promise<Segment[]> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}/segments`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Không thể tải danh sách phụ đề.");
  return res.json();
}

export async function updateSegments(id: string, segments: Segment[]): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}/segments`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ segments }),
  });
  if (!res.ok) throw new Error("Không thể lưu cập nhật phụ đề.");
}

export async function rerenderJob(
  id: string,
  options: {
    blur?: boolean;
    blur_strength?: number;
    font_size?: number;
    color?: string;
    position?: string;
    font?: string;
    dub?: boolean;
    voice?: string;
    dub_rate?: string;
    orig_audio?: string;
    blur_regions?: BlurRegionItem[];
  }
): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/jobs/${id}/render`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify(options),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || "Không thể render lại video.");
  }
}

export function createJobWithProgress(
  formData: FormData,
  onProgress?: (percent: number) => void
): Promise<{ id: string; status: string; message: string }> {
  return new Promise((resolve, reject) => {
    const base = getApiBaseUrl();
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/jobs`);

    const token = getAuthToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(data);
        } else {
          reject(new Error(data.message || `Lỗi tải lên (HTTP ${xhr.status})`));
        }
      } catch (e) {
        reject(new Error(`Phản hồi máy chủ không hợp lệ (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      reject(new Error("Lỗi mạng khi tải video lên máy chủ. Kiểm tra kết nối API."));
    };

    xhr.send(formData);
  });
}

export function getDownloadUrl(jobId: string, type: "mp4" | "srt_vi" | "srt_zh" | "dub"): string {
  const base = getApiBaseUrl();
  return `${base}/jobs/${jobId}/download?type=${type}`;
}

export function getVideoPreviewUrl(jobId: string): string {
  const base = getApiBaseUrl();
  return `${base}/jobs/${jobId}/video`;
}

export function getFramePreviewUrl(jobId: string, timestamp: number = 0): string {
  const base = getApiBaseUrl();
  return `${base}/jobs/${jobId}/frame?t=${timestamp}`;
}

// === Auth & Google API Methods ===

export async function getGoogleAuthUrl(redirectUri?: string): Promise<string> {
  const base = getApiBaseUrl();
  const query = redirectUri ? `?redirect_uri=${encodeURIComponent(redirectUri)}` : "";
  const res = await fetch(`${base}/auth/google/url${query}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể lấy đường dẫn đăng nhập Google.");
  }
  const data = await res.json();
  return data.url;
}

export async function exchangeGoogleCode(code: string, redirectUri?: string): Promise<{ access_token: string; user: UserProfile }> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, redirect_uri: redirectUri }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Đăng nhập Google thất bại.");
  }
  const data = await res.json();
  setAuthToken(data.access_token);
  return data;
}

export async function fetchUserProfile(): Promise<UserProfile | null> {
  const token = getAuthToken();
  if (!token) return null;

  const base = getApiBaseUrl();
  const res = await fetch(`${base}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    setAuthToken(null);
    return null;
  }
  return res.json();
}

export async function disconnectGoogleAccount(): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/auth/google/disconnect`, {
    method: "POST",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Không thể ngắt kết nối Google.");
}

// === AI API Key Settings Methods ===

export async function fetchApiKeyStatus(): Promise<ApiKeyStatus> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/settings/api-key`, {
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Không thể tải trạng thái API key.");
  return res.json();
}

export async function saveApiKey(provider: string, key: string, baseUrl?: string): Promise<ApiKeyStatus> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/settings/api-key`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ provider, key, base_url: baseUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Không thể lưu API key.");
  }
  return res.json();
}

export async function deleteApiKey(): Promise<void> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/settings/api-key`, {
    method: "DELETE",
    headers: { ...getAuthHeaders() },
  });
  if (!res.ok) throw new Error("Không thể xoá API key.");
}

export async function testApiKey(provider: string, key?: string, baseUrl?: string): Promise<{ valid: boolean; message: string }> {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}/settings/api-key/test`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
    },
    body: JSON.stringify({ provider, key, base_url: baseUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || "Kiểm tra API key thất bại.");
  }
  return res.json();
}
