"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import {
  ArrowLeft,
  RotateCw,
  Sun,
  Moon,
  User,
  Settings as SettingsIcon,
  LogOut,
  LogIn,
} from "lucide-react";

export default function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { user, isGuest, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Determine screen title
  const isJobDetail = pathname.startsWith("/job");
  let screenTitle = "Xử lý video";
  if (isJobDetail) screenTitle = "Chi tiết job";
  else if (pathname.startsWith("/history")) screenTitle = "Lịch sử";
  else if (pathname.startsWith("/settings")) screenTitle = "Cài đặt";
  else if (pathname.startsWith("/login")) screenTitle = "Đăng nhập";

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleRefresh = () => {
    window.location.reload();
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-[var(--bg-app)] px-4 py-3 transition-colors flex items-center justify-between">
      {/* Left side: Back Button (if sub-screen) + Large Bold Title */}
      <div className="flex items-center gap-3">
        {isJobDetail && (
          <button
            onClick={() => router.push("/")}
            aria-label="Quay lại"
            className="w-10 h-10 rounded-full flex items-center justify-center text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="text-xl sm:text-2xl font-bold font-condensed tracking-tight text-[var(--text-primary)]">
          {screenTitle}
        </h1>
      </div>

      {/* Right side actions: Refresh, Theme Toggle, User */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {/* Refresh button */}
        <button
          onClick={handleRefresh}
          aria-label="Làm mới"
          className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
        >
          <RotateCw className="w-5 h-5" />
        </button>

        {/* Theme Toggle (Sun/Moon) */}
        <button
          onClick={toggleTheme}
          aria-label="Đổi giao diện sáng/tối"
          className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5 text-amber-400" />
          ) : (
            <Moon className="w-5 h-5 text-slate-700" />
          )}
        </button>

        {/* User Account / Login */}
        <div className="relative" ref={dropdownRef}>
          {user && !isGuest ? (
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-all"
            >
              {user.picture ? (
                <img
                  src={user.picture}
                  alt={user.name || "Avatar"}
                  className="w-7 h-7 rounded-full object-cover border border-[var(--border-app)]"
                />
              ) : (
                <div className="w-7 h-7 rounded-full bg-[var(--primary)] text-white flex items-center justify-center text-xs font-bold">
                  {user.name ? user.name[0].toUpperCase() : "U"}
                </div>
              )}
            </button>
          ) : (
            <Link
              href="/login"
              className="w-9 h-9 rounded-full flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 active:scale-95 transition-all"
              title="Đăng nhập"
            >
              <LogIn className="w-5 h-5" />
            </Link>
          )}

          {/* Dropdown Menu */}
          {dropdownOpen && user && (
            <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-[var(--card-app)] border border-[var(--border-app)] shadow-xl p-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="px-3 py-2 border-b border-[var(--border-app)] mb-1">
                <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                  {user.name}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] truncate">{user.email}</p>
              </div>
              <Link
                href="/settings"
                onClick={() => setDropdownOpen(false)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[var(--text-primary)] hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
              >
                <SettingsIcon className="w-4 h-4 text-[var(--primary)]" />
                <span>Cài đặt & API Key</span>
              </Link>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                  router.push("/login");
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-500 hover:bg-rose-500/10 transition-colors text-left"
              >
                <LogOut className="w-4 h-4" />
                <span>Đăng xuất</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
