"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircle, Activity, History, Sliders, ShieldCheck } from "lucide-react";
import { useAuth } from "../lib/auth";

export default function Sidebar() {
  const pathname = usePathname();
  const { hasAiConnection, activeProvider } = useAuth();

  const navItems = [
    { label: "Tạo mới", href: "/", icon: PlusCircle },
    { label: "Tiến trình", href: "/job", icon: Activity },
    { label: "Lịch sử", href: "/history", icon: History },
    { label: "Cài đặt", href: "/settings", icon: Sliders },
  ];

  return (
    <aside className="hidden lg:flex flex-col w-64 fixed top-16 left-0 bottom-0 z-30 bg-[#0B1020]/95 dark:bg-[#0B1020]/95 bg-slate-50/95 backdrop-blur-md border-r border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 p-4 transition-colors">
      <div className="flex-1 space-y-1.5 pt-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-medium transition-all ${
                isActive
                  ? "bg-gradient-to-r from-[#7C5CFF]/20 to-[#22D3EE]/20 border border-[#7C5CFF]/40 text-white shadow-md shadow-[#7C5CFF]/10"
                  : "text-slate-400 dark:text-slate-400 text-slate-600 hover:text-white hover:bg-[#121A2F] dark:hover:bg-[#121A2F] hover:bg-slate-200/60"
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-colors ${
                  isActive ? "text-[#22D3EE]" : "text-slate-400 group-hover:text-slate-200"
                }`}
              />
              <span className={isActive ? "font-semibold" : ""}>{item.label}</span>
              {isActive && (
                <div className="ml-auto w-1.5 h-4 rounded-full bg-gradient-to-b from-[#7C5CFF] to-[#22D3EE]" />
              )}
            </Link>
          );
        })}
      </div>

      {/* Connection & Status Widget */}
      <div className="p-3.5 rounded-2xl bg-[#121A2F]/80 dark:bg-[#121A2F]/80 bg-white border border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 shadow-sm">
        <div className="flex items-center gap-2 mb-1.5">
          <ShieldCheck className={`w-4 h-4 ${hasAiConnection ? "text-emerald-400" : "text-amber-400"}`} />
          <span className="text-xs font-medium text-slate-200 dark:text-slate-200 text-slate-700">
            {hasAiConnection ? "AI Đã kết nối" : "Chưa có API Key"}
          </span>
        </div>
        <p className="text-[11px] text-slate-400 truncate">
          Engine: {activeProvider || "Mặc định (.env)"}
        </p>
      </div>
    </aside>
  );
}
