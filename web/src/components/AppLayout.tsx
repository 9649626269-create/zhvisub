"use client";

import React from "react";
import Header from "./Header";
import BottomNav from "./BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] transition-colors flex justify-center">
      {/* Mobile-first frame: centered, max-width ~480px on desktop */}
      <div className="w-full max-w-[480px] min-h-screen flex flex-col relative shadow-sm border-x border-[var(--border-app)]/30">
        <Header />
        <main className="flex-1 px-4 pt-2 pb-28 min-w-0">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  );
}
