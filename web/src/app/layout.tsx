import type { Metadata } from "next";
import { ThemeProvider } from "../lib/theme";
import { AuthProvider } from "../lib/auth";
import AppLayout from "../components/AppLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZhViSub — Tự động dịch và lồng tiếng video Trung sang Việt",
  description: "Dịch video tiếng Trung sang tiếng Việt, làm mờ phụ đề cứng và lồng tiếng AI đồng bộ.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ThemeProvider>
          <AuthProvider>
            <AppLayout>{children}</AppLayout>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
