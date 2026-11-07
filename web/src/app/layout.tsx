import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZhViSub — Tự động dịch và lồng tiếng video Trung sang Việt",
  description: "Ứng dụng tự động dịch video tiếng Trung sang tiếng Việt, làm mờ phụ đề cứng và lồng tiếng khớp thời gian.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className="dark">
      <body className="bg-[#0b0f19] text-slate-100 min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 w-full max-w-6xl mx-auto px-4 py-6">
          {children}
        </main>
      </body>
    </html>
  );
}
