"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconDownload, IconExternalLink, IconX } from "@tabler/icons-react";
import type { FsNode } from "@/lib/types";
import { fileTypeLabel, formatBytes } from "@/lib/explorerFormat";

type Props = {
  node: FsNode;
  onClose: () => void;
};

type PreviewKind = "image" | "video" | "audio" | "pdf" | "other";

function previewKind(node: FsNode): PreviewKind {
  const mime = (node.mime_type || "").toLowerCase();
  const name = node.name.toLowerCase();
  if (mime.startsWith("image/") || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(name)) {
    return "image";
  }
  if (mime.startsWith("video/") || /\.(mp4|webm|mov|m4v)$/i.test(name)) {
    return "video";
  }
  if (mime.startsWith("audio/") || /\.(mp3|wav|ogg|m4a|aac|flac)$/i.test(name)) {
    return "audio";
  }
  if (mime === "application/pdf" || name.endsWith(".pdf")) {
    return "pdf";
  }
  return "other";
}

export function FsPreviewOverlay({ node, onClose }: Props) {
  const [mounted, setMounted] = useState(false);
  const [imgReady, setImgReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const kind = previewKind(node);
  const fileUrl = `/api/fs/media/file/${node.id}`;
  const thumbUrl = node.has_thumbnail
    ? `/api/fs/media/thumbnail/${node.id}`
    : null;
  const typeLabel = fileTypeLabel(node.node_type, node.mime_type, node.name);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setImgReady(false);
    setMediaError(null);
  }, [node.id]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fs-preview-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`Preview ${node.name}`}
      onClick={onClose}
    >
      <div
        className="fs-preview-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fs-preview-header">
          <div className="fs-preview-heading min-w-0">
            <h2 className="fs-preview-title truncate" title={node.name}>
              {node.name}
            </h2>
            <p className="fs-preview-meta">
              {typeLabel}
              {node.size_bytes != null ? ` · ${formatBytes(node.size_bytes)}` : ""}
            </p>
          </div>
          <div className="fs-preview-actions">
            <a
              className="xp-cmd"
              href={`${fileUrl}?download=1`}
              download={node.name}
              title="Download"
            >
              <IconDownload size={16} stroke={1.75} />
              <span className="xp-cmd-label">Download</span>
            </a>
            <a
              className="xp-cmd"
              href={fileUrl}
              target="_blank"
              rel="noreferrer"
              title="Open in new tab"
            >
              <IconExternalLink size={16} stroke={1.75} />
              <span className="xp-cmd-label">Open</span>
            </a>
            <button
              type="button"
              className="xp-cmd"
              aria-label="Close preview"
              onClick={onClose}
            >
              <IconX size={18} stroke={1.75} />
            </button>
          </div>
        </header>

        <div className="fs-preview-stage">
          {mediaError ? (
            <div className="fs-preview-fallback">
              <p className="fs-preview-fallback-title">Preview unavailable</p>
              <p className="fs-preview-fallback-hint">{mediaError}</p>
              <p className="fs-preview-fallback-hint">
                If downloads also fail, check that the Windows file server is
                online and reachable from Vercel (FILE_API_BASE_URL).
              </p>
              <div className="fs-preview-fallback-actions">
                <a
                  className="xp-cmd is-active"
                  href={`${fileUrl}?download=1`}
                  download={node.name}
                >
                  <IconDownload size={16} stroke={1.75} />
                  Download
                </a>
              </div>
            </div>
          ) : null}

          {!mediaError && kind === "image" ? (
            <div className="fs-preview-media">
              {thumbUrl && !imgReady ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={thumbUrl}
                  alt=""
                  className="fs-preview-img is-thumb"
                />
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={fileUrl}
                alt={node.name}
                className={`fs-preview-img${imgReady ? " is-ready" : " is-loading"}`}
                onLoad={() => setImgReady(true)}
                onError={() =>
                  setMediaError("Could not load image from file server")
                }
              />
            </div>
          ) : null}

          {!mediaError && kind === "video" ? (
            <video
              key={node.id}
              className="fs-preview-video"
              src={fileUrl}
              controls
              preload="metadata"
              playsInline
              onError={() =>
                setMediaError("Could not load video from file server")
              }
            />
          ) : null}

          {!mediaError && kind === "audio" ? (
            <div className="fs-preview-audio-wrap">
              <audio
                key={node.id}
                className="fs-preview-audio"
                src={fileUrl}
                controls
                preload="metadata"
                onError={() =>
                  setMediaError("Could not load audio from file server")
                }
              />
            </div>
          ) : null}

          {!mediaError && kind === "pdf" ? (
            <iframe
              key={node.id}
              className="fs-preview-iframe"
              title={node.name}
              src={fileUrl}
            />
          ) : null}

          {!mediaError && kind === "other" ? (
            <div className="fs-preview-fallback">
              <div className="xp-file-block" style={{ width: 72, height: 84 }} />
              <p className="fs-preview-fallback-title">{node.name}</p>
              <p className="fs-preview-fallback-meta">
                {typeLabel}
                {node.size_bytes != null
                  ? ` · ${formatBytes(node.size_bytes)}`
                  : ""}
              </p>
              <p className="fs-preview-fallback-hint">
                No in-browser preview for this type. Download or open in a new
                tab.
              </p>
              <div className="fs-preview-fallback-actions">
                <a className="xp-cmd is-active" href={`${fileUrl}?download=1`} download={node.name}>
                  <IconDownload size={16} stroke={1.75} />
                  Download
                </a>
                <a className="xp-cmd" href={fileUrl} target="_blank" rel="noreferrer">
                  <IconExternalLink size={16} stroke={1.75} />
                  Open in new tab
                </a>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}
