"use client";

type SkeletonProps = {
  className?: string;
  dark?: boolean;
  rows?: number;
};

export function Skeleton({
  className = "",
  dark = false,
  rows = 3,
}: SkeletonProps) {
  return (
    <div
      className={`surface p-4 flex flex-col gap-3 ${className}`}
      aria-hidden
      role="presentation"
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className={dark ? "glass-shimmer-dark" : "flat-skeleton"}
          style={{
            height: i === 0 ? 14 : 12,
            width: i === 0 ? "40%" : i === rows - 1 ? "55%" : "100%",
          }}
        />
      ))}
    </div>
  );
}

export function PreviewSkeleton({ className = "" }: { className?: string }) {
  return (
    <div
      className={`preview-stage absolute inset-0 flex items-center justify-center ${className}`}
      aria-busy
      aria-label="Loading preview"
    >
      <div className="flat-skeleton w-[70%] h-[55%] max-w-md opacity-30" />
    </div>
  );
}

/** @deprecated Use Skeleton */
export const GlassSkeleton = Skeleton;
