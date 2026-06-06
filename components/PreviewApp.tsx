"use client";

import { useState } from "react";
import type { PreviewState } from "@/lib/types";

type PreviewAppProps = {
  preview: PreviewState;
  reloadKey: number;
  onReload: () => void;
  isReloading?: boolean;
};

export function PreviewApp({ preview, reloadKey, onReload, isReloading = false }: PreviewAppProps) {
  const [url, setUrl] = useState(() => getDefaultPreviewUrl());
  const [inputUrl, setInputUrl] = useState("");

  function handleNavigate(event: React.FormEvent) {
    event.preventDefault();
    const newUrl = inputUrl.trim();
    if (newUrl) {
      setUrl(newUrl);
      setInputUrl("");
    }
  }

  return (
    <div className="preview-browser">
      <div className="preview-browser-header">
        <div className="preview-browser-controls">
          <div className="preview-browser-dot preview-browser-dot-red" />
          <div className="preview-browser-dot preview-browser-dot-yellow" />
          <div className="preview-browser-dot preview-browser-dot-green" />
        </div>
        <form className="preview-browser-bar" onSubmit={handleNavigate}>
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            placeholder={url}
          />
        </form>
        <button
          className="preview-browser-refresh"
          onClick={onReload}
          title="Build and restart preview"
          disabled={isReloading}
        >
          {isReloading ? "Reloading" : "Reload"}
        </button>
      </div>
      <iframe
        src={createRefreshableUrl(url, reloadKey)}
        className="preview-iframe"
        title={`Preview: ${preview.appName}`}
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        suppressHydrationWarning
      />
    </div>
  );
}

function getDefaultPreviewUrl() {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }

  const hostname = window.location.hostname === "0.0.0.0" ? "localhost" : window.location.hostname;
  return `${window.location.protocol}//${hostname}:3000`;
}

function createRefreshableUrl(url: string, refreshKey: number) {
  if (!refreshKey) {
    return url;
  }

  try {
    const nextUrl = new URL(url);
    nextUrl.searchParams.set("__atoms_refresh", String(refreshKey));
    return nextUrl.toString();
  } catch {
    return url;
  }
}
