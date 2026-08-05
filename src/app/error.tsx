"use client";

import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-base-200">
      <div className="card bg-base-100 w-full max-w-md shadow-md border border-base-300">
        <div className="card-body gap-4">
          <h1 className="card-title type-page">Something went wrong</h1>
          <p className="text-sm text-base-content/70">
            {error.message ||
              "The page failed to load. Try again, or go back home."}
          </p>
          <div className="card-actions justify-end gap-2">
            <Link href="/" className="btn btn-ghost btn-sm">
              Go home
            </Link>
            <button type="button" className="btn btn-primary btn-sm" onClick={reset}>
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
