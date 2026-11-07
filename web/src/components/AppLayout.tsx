"use client";

import React from "react";
import Header from "./Header";
import Sidebar from "./Sidebar";
import BottomNav from "./BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#0B1020] dark:bg-[#0B1020] bg-slate-50 text-slate-100 dark:text-slate-100 text-slate-900 transition-colors">
      <Header />
      <div className="flex-1 flex pt-16">
        <Sidebar />
        <main className="flex-1 lg:pl-64 pb-24 lg:pb-12 min-w-0">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
            {children}
          </div>
        </main>
      </div>
      <BottomNav />
    </div>
  );
}
