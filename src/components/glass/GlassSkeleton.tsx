"use client";

type GlassSkeletonProps = {
  className?: string;
  dark?: boolean;
  rows?: number;
};

/** Tier B–shaped shimmer placeholder — never a spinner. */
export function GlassSkeleton({
  className = "",
  dark = false,
  rows = 3,
}: GlassSkeletonProps) {
  const band = dark ? "glass-shimmer-dark" : "glass-shimmer";
  return (
    <div
      className={`glass-content p-4 flex flex-col gap-3 ${className}`}
      aria-hidden
      role="presentation"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={`${band} h-3 ${i === 0 ? "w-2/5" : i === rows - 1 ? "w-3/5" : "w-full"}`}
          style={{
            height: i === 0 ? 14 : 12,
            width: i === 0 ? "40%" : i === rows - 1 ? "55%" : "100%",
            opacity: dark ? 1 : undefined,
            background: dark ? undefined : undefined,
          }}
        />
      ))}
    </div>
  );
}

type PreviewSkeletonProps = {
  className?: string;
};

/** Dark-stage shimmer for media preview loading. */
export function PreviewSkeleton({ className = "" }: PreviewSkeletonProps) {
  return (
    <div
      className={`preview-stage absolute inset-0 flex items-center justify-center ${className}`}
      aria-busy
      aria-label="Loading preview"
    >
      <div className="glass-shimmer-dark w-[70%] h-[55%] max-w-md" />
    </div>
  );
}
