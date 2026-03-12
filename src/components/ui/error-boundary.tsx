"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  fallback?: ReactNode;
  sectionName?: string;
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[ChartErrorBoundary] ${this.props.sectionName ?? "unknown"}:`, error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex min-h-[200px] items-center justify-center rounded-2xl border border-rose-200 bg-rose-50/60 p-6 dark:border-rose-800 dark:bg-rose-950/30">
          <div className="text-center">
            <p className="text-sm font-medium text-rose-700 dark:text-rose-400">
              {this.props.sectionName ? `${this.props.sectionName}の` : ""}描画中にエラーが発生しました
            </p>
            <p className="mt-1 text-xs text-rose-600/70 dark:text-rose-500/70">
              {this.state.error?.message ?? "不明なエラー"}
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
