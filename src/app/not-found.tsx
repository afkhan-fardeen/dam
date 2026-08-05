"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-base-200">
      <div className="card bg-base-100 w-full max-w-md shadow-md border border-base-300">
        <div className="card-body gap-4">
          <h1 className="card-title type-page">Page not found</h1>
          <p className="text-sm text-base-content/70">
            That link does not match anything in Company assets. The page may
            have moved, or you may not have access to it.
          </p>
          <p className="text-sm text-base-content/60">
            Try going home and searching, or open a space from the sidebar.
          </p>
          <div className="card-actions justify-end">
            <Link href="/" className="btn btn-primary btn-sm">
              Go home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
