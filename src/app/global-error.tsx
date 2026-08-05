"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex items-center justify-center px-6 bg-base-200">
          <div className="card bg-base-100 w-full max-w-md shadow-md border border-base-300">
            <div className="card-body gap-4">
              <h1 className="text-xl font-semibold">Something went wrong</h1>
              <p className="text-sm text-base-content/70">
                The app hit an unexpected error. Try again. If it keeps
                happening, contact an admin.
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
      </body>
    </html>
  );
}
