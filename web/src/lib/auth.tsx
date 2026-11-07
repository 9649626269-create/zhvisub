"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  UserProfile,
  fetchUserProfile,
  getAuthToken,
  setAuthToken,
  getGoogleAuthUrl,
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
