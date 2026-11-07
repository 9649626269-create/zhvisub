"use client";

import React, { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";
import { Sun, Moon, Sparkles, User, Settings as SettingsIcon, LogOut, LogIn } from "lucide-react";

export default function Header() {
  const { theme, toggleTheme } = useTheme();
  const { user, isGuest, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  return (
    <header className="fixed top-0 left-0 right-0 z-40 h-16 bg-[#0B1020]/90 dark:bg-[#0B1020]/90 bg-white/90 backdrop-blur-md border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 px-4 md:px-8 transition-colors">
      <div className="max-w-7xl mx-auto h-full flex items-center justify-between">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-[#7C5CFF] to-[#22D3EE] flex items-center justify-center text-white shadow-md shadow-[#7C5CFF]/30 group-hover:scale-105 transition-transform">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] bg-clip-text text-transparent">
              ZhViSub
            </span>
            <span className="text-[10px] font-medium text-slate-400 -mt-1 hidden sm:block">
              AI Video Sub & Dub
            </span>
          </div>
        </Link>

        {/* Right Actions: Theme Toggle & User Menu */}
        <div className="flex items-center gap-3">
          {/* Theme Toggle Button */}
          <button
            onClick={toggleTheme}
            aria-label="Đổi chế độ sáng / tối"
            className="w-10 h-10 rounded-xl flex items-center justify-center border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 hover:border-[#7C5CFF] bg-[#121A2F]/60 dark:bg-[#121A2F]/60 bg-slate-100 text-slate-300 dark:text-slate-300 text-slate-700 transition-colors"
          >
            {theme === "dark" ? (
              <Sun className="w-5 h-5 text-amber-400 hover:rotate-45 transition-transform" />
            ) : (
              <Moon className="w-5 h-5 text-indigo-600 hover:-rotate-12 transition-transform" />
            )}
          </button>

          {/* User Account / Avatar */}
          <div className="relative" ref={dropdownRef}>
            {user && !isGuest ? (
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 p-1.5 rounded-xl border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 hover:border-[#7C5CFF] bg-[#121A2F]/80 dark:bg-[#121A2F]/80 bg-slate-100 transition-all"
              >
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.name || "Avatar"}
                    className="w-7 h-7 rounded-lg object-cover"
                  />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-tr from-[#7C5CFF] to-[#22D3EE] flex items-center justify-center text-white text-xs font-semibold">
                    {user.name ? user.name[0].toUpperCase() : "U"}
                  </div>
                )}
                <span className="text-xs font-medium text-slate-200 dark:text-slate-200 text-slate-800 max-w-[100px] truncate hidden sm:inline">
                  {user.name || user.email}
                </span>
              </button>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 hover:border-[#7C5CFF] bg-[#121A2F]/60 dark:bg-[#121A2F]/60 bg-slate-100 text-slate-200 dark:text-slate-200 text-slate-700 transition-colors"
              >
                <LogIn className="w-4 h-4 text-[#22D3EE]" />
                <span>Đăng nhập</span>
              </Link>
            )}

            {/* Dropdown Menu */}
            {dropdownOpen && user && (
              <div className="absolute right-0 mt-2 w-52 rounded-2xl bg-[#121A2F] dark:bg-[#121A2F] bg-white border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 shadow-2xl p-1.5 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
                <div className="px-3 py-2 border-b border-[#1F2A44] dark:border-[#1F2A44] border-slate-100 mb-1">
                  <p className="text-xs font-semibold text-slate-200 dark:text-slate-200 text-slate-800 truncate">
                    {user.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate">{user.email}</p>
                </div>
                <Link
                  href="/settings"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-300 dark:text-slate-300 text-slate-700 hover:bg-[#1F2A44]/50 dark:hover:bg-[#1F2A44]/50 hover:bg-slate-100 transition-colors"
                >
                  <SettingsIcon className="w-4 h-4 text-[#7C5CFF]" />
                  <span>Cài đặt & API Key</span>
                </Link>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                    router.push("/login");
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-rose-400 hover:bg-rose-500/10 transition-colors text-left"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
