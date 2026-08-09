"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type VirtualPhotoGridProps<T> = {
  items: T[];
  /** Approximate cell size in px */
  cellSize?: number;
  gap?: number;
  renderItem: (item: T, index: number) => ReactNode;
  getKey: (item: T, index: number) => string;
  className?: string;
};

/**
 * Lightweight windowed grid for dense Photos mode — no external deps.
 * Renders only rows near the scroll viewport.
 */
export function VirtualPhotoGrid<T>({
  items,
  cellSize = 116,
  gap = 4,
  renderItem,
  getKey,
  className = "",
}: VirtualPhotoGridProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(480);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
      setViewportH(el.clientHeight);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    setViewportH(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  const cols = Math.max(1, Math.floor((width + gap) / (cellSize + gap)));
  const rowH = cellSize + gap;
  const rowCount = Math.ceil(items.length / cols);
  const totalH = rowCount * rowH;
  const overscan = 3;
  const startRow = Math.max(0, Math.floor(scrollTop / rowH) - overscan);
  const endRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportH) / rowH) + overscan,
  );

  const visible = useMemo(() => {
    const out: { item: T; index: number; row: number; col: number }[] = [];
    for (let row = startRow; row < endRow; row++) {
      for (let col = 0; col < cols; col++) {
        const index = row * cols + col;
        if (index >= items.length) break;
        out.push({ item: items[index]!, index, row, col });
      }
    }
    return out;
  }, [items, startRow, endRow, cols]);

  if (items.length < 60) {
    return (
      <div
        className={`grid gap-1 ${className}`}
        style={{
          gridTemplateColumns: `repeat(auto-fill, minmax(${cellSize}px, 1fr))`,
        }}
      >
        {items.map((item, i) => (
          <div key={getKey(item, i)}>{renderItem(item, i)}</div>
        ))}
      </div>
    );
  }

  return (
    <div
      ref={scrollerRef}
      className={`relative overflow-auto max-h-[70vh] ${className}`}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: totalH, position: "relative" }}>
        {visible.map(({ item, index, row, col }) => (
          <div
            key={getKey(item, index)}
            style={{
              position: "absolute",
              top: row * rowH,
              left: col * (cellSize + gap),
              width: cellSize,
              height: cellSize,
            }}
          >
            {renderItem(item, index)}
          </div>
        ))}
      </div>
    </div>
  );
}
