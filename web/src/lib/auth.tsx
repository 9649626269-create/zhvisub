"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  UserProfile,
  fetchUserProfile,
  getAuthToken,
  setAuthToken,
  getGoogleAuthUrl,
  fetchGoogleConfig,
  loginGoogleNative,
  isCapacitorApp,
  getGuestApiKey,
  getGuestProvider,
  setGuestApiKey,
  disconnectGoogleAccount,
} from "./api";

interface AuthContextType {
  user: UserProfile | null;
  isGuest: boolean;
  isLoading: boolean;
  hasAiConnection: boolean;
  activeProvider: string;
  activeKeyMasked: string;
  loginWithGoogle: (redirectUri?: string) => Promise<void>;
  loginAsGuest: () => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
  updateGuestKey: (key: string, provider?: string, baseUrl?: string) => void;
  disconnectGoogle: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isGuest: true,
  isLoading: true,
  hasAiConnection: false,
  activeProvider: "gemini",
  activeKeyMasked: "",
  loginWithGoogle: async () => {},
  loginAsGuest: () => {},
  logout: () => {},
  refreshUser: async () => {},
  updateGuestKey: () => {},
  disconnectGoogle: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isGuest, setIsGuest] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [guestKey, setGuestKeyState] = useState<string>("");
  const [guestProvider, setGuestProviderState] = useState<string>("gemini");

  const refreshUser = async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      if (token) {
        const profile = await fetchUserProfile();
        if (profile) {
          setUser(profile);
          setIsGuest(false);
        } else {
          setUser(null);
          setIsGuest(true);
        }
      } else {
        setUser(null);
        setIsGuest(true);
      }
    } catch {
      setUser(null);
      setIsGuest(true);
    } finally {
      // Load guest keys
      setGuestKeyState(getGuestApiKey());
      setGuestProviderState(getGuestProvider());
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const loginWithGoogle = async (redirectUri?: string) => {
    if (isCapacitorApp()) {
      // 1. Fetch Google Client ID & scopes from backend configuration
      const config = await fetchGoogleConfig();
      if (!config.client_id) {
        throw new Error(
          "Chưa cấu hình GOOGLE_CLIENT_ID trên server (hãy kiểm tra biến môi trường trong file .env)."
        );
      }

      // 2. Initialize native SocialLogin plugin with webClientId and offline mode
      const { SocialLogin } = await import("@capgo/capacitor-social-login");
      await SocialLogin.initialize({
        google: {
          webClientId: config.client_id,
          mode: "offline",
        },
      });

      // 3. Show native bottom-sheet Google Account picker
      const res = await SocialLogin.login({
        provider: "google",
        options: {
          scopes: config.scopes,
          style: "bottom",
        },
      });

      const serverAuthCode = (res.result as any)?.serverAuthCode;
      const idToken = (res.result as any)?.idToken;

      if (!serverAuthCode && !idToken) {
        throw new Error("Không nhận được mã xác thực từ Google Sign-In.");
      }

      // 4. Exchange code at backend and store JWT
      await loginGoogleNative({
        server_auth_code: serverAuthCode,
        id_token: idToken,
      });

      // 5. Update user state
      await refreshUser();
      return;
    }

    // Fallback: Web browser redirect flow
    const url = await getGoogleAuthUrl(redirectUri);
    window.location.href = url;
  };

  const loginAsGuest = () => {
    setAuthToken(null);
    setUser(null);
    setIsGuest(true);
    setGuestKeyState(getGuestApiKey());
  };

  const logout = () => {
    if (isCapacitorApp()) {
      import("@capgo/capacitor-social-login")
        .then(({ SocialLogin }) => {
          SocialLogin.logout({ provider: "google" }).catch(() => {});
        })
        .catch(() => {});
    }
    setAuthToken(null);
    setUser(null);
    setIsGuest(true);
  };

  const updateGuestKey = (key: string, provider: string = "gemini", baseUrl: string = "") => {
    setGuestApiKey(key, provider, baseUrl);
    setGuestKeyState(key);
    setGuestProviderState(provider);
  };

  const disconnectGoogle = async () => {
    if (isCapacitorApp()) {
      try {
        const { SocialLogin } = await import("@capgo/capacitor-social-login");
        await SocialLogin.logout({ provider: "google" }).catch(() => {});
      } catch {}
    }
    await disconnectGoogleAccount();
    await refreshUser();
  };

  // Determine active key status
  const hasAiConnection = Boolean(
    (user && (user.has_google_token || user.has_api_key)) ||
    (isGuest && guestKey.trim().length > 0)
  );

  const activeProvider = user?.has_google_token
    ? "Google Gemini (OAuth)"
    : user?.api_provider || guestProvider;

  const activeKeyMasked = user?.has_google_token
    ? "OAuth Token Đã kết nối"
    : user?.masked_key || (guestKey ? `****${guestKey.slice(-4)}` : "");

  return (
    <AuthContext.Provider
      value={{
        user,
        isGuest,
        isLoading,
        hasAiConnection,
        activeProvider,
        activeKeyMasked,
        loginWithGoogle,
        loginAsGuest,
        logout,
        refreshUser,
        updateGuestKey,
        disconnectGoogle,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
