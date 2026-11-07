"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#F3F0E8] dark:bg-[#0F1A17] text-[#1B1B18] dark:text-[#F5F5F0]">
          <div className="app-card max-w-sm w-full text-center p-6 space-y-4 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-[#F6DADA] dark:bg-[#3E1E1C] text-[#B3261E] dark:text-[#F2938C] flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-lg font-bold">Đã có lỗi xảy ra</h2>
            <p className="text-xs text-[#6B6B63] dark:text-[#9E9E96] leading-relaxed">
              {this.state.error?.message || "Ứng dụng gặp sự cố giao diện không mong muốn."}
            </p>
            <button
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="btn-primary w-full text-xs py-2.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tải lại trang</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
