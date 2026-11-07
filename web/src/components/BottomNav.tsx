"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PlusCircle, Activity, History, Sliders } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { label: "Tạo mới", href: "/", icon: PlusCircle },
    { label: "Tiến trình", href: "/job", icon: Activity },
    { label: "Lịch sử", href: "/history", icon: History },
    { label: "Cài đặt", href: "/settings", icon: Sliders },
  ];

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-16 bg-[#0B1020]/95 dark:bg-[#0B1020]/95 bg-white/95 backdrop-blur-lg border-t border-[#1F2A44] dark:border-[#1F2A44] border-slate-200 px-2 transition-colors">
      <div className="grid grid-cols-4 h-full max-w-lg mx-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 transition-all relative ${
                isActive
                  ? "text-transparent bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE] bg-clip-text font-semibold"
                  : "text-slate-400 dark:text-slate-400 text-slate-500 hover:text-slate-200"
              }`}
            >
              <Icon
                className={`w-5 h-5 transition-transform ${
                  isActive ? "text-[#22D3EE] scale-110" : "text-slate-400"
                }`}
              />
              <span className="text-[11px] tracking-tight">{item.label}</span>
              {isActive && (
                <div className="absolute bottom-1 w-6 h-0.5 rounded-full bg-gradient-to-r from-[#7C5CFF] to-[#22D3EE]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
