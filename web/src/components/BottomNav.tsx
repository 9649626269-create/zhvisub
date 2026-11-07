"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers, Activity, History, Sliders } from "lucide-react";

export default function BottomNav() {
  const pathname = usePathname();

  const navItems = [
    { label: "Tạo mới", href: "/", icon: Layers },
    { label: "Tiến trình", href: "/job", icon: Activity },
    { label: "Lịch sử", href: "/history", icon: History },
    { label: "Cài đặt", href: "/settings", icon: Sliders },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--card-app)]/95 backdrop-blur-md border-t border-[var(--border-app)] transition-colors">
      <div className="max-w-[480px] mx-auto h-16 grid grid-cols-4 items-center px-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/" && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex flex-col items-center justify-center py-1 transition-all"
            >
              <div
                className={`flex items-center justify-center transition-all ${
                  isActive
                    ? "bg-[#BFF3E4] dark:bg-[#1C3B32] text-[#0F8A6F] dark:text-[#A6EDD9] px-4 py-1 rounded-full"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-2 py-1"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
              </div>
              <span
                className={`text-[11px] mt-0.5 tracking-tight transition-colors ${
                  isActive
                    ? "font-bold text-[var(--text-primary)]"
                    : "font-normal text-[var(--text-secondary)]"
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
