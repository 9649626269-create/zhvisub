import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "../lib/theme";
import { AuthProvider } from "../lib/auth";
import { ToastProvider } from "../lib/toast";
import ErrorBoundary from "../components/ErrorBoundary";
import AppLayout from "../components/AppLayout";
import "./globals.css";

export const metadata: Metadata = {
  title: "ZhViSub — AI Video Sub & Dub",
  description: "Tự động dịch video tiếng Trung sang tiếng Việt, làm mờ hard-sub và lồng tiếng AI đồng bộ.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0F8A6F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Condensed:wght@700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <ErrorBoundary>
          <ThemeProvider>
            <AuthProvider>
              <ToastProvider>
                <AppLayout>{children}</AppLayout>
              </ToastProvider>
            </AuthProvider>
          </ThemeProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
