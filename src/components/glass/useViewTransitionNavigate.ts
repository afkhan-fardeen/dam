"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";

function supportsViewTransition(): boolean {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    typeof (
      document as Document & {
        startViewTransition?: (cb: () => void) => unknown;
      }
    ).startViewTransition === "function"
  );
}

/**
 * Client navigation wrapped in View Transitions when available.
 * Falls back to plain router.push (App Router still avoids full reload).
 */
export function navigateWithTransition(
  router: { push: (href: string) => void },
  href: string,
) {
  if (supportsViewTransition()) {
    (
      document as Document & {
        startViewTransition: (cb: () => void) => unknown;
      }
    ).startViewTransition(() => {
      router.push(href);
    });
    return;
  }
  router.push(href);
}

export function useViewTransitionNavigate() {
  const router = useRouter();
  return useCallback(
    (href: string) => {
      navigateWithTransition(router, href);
    },
    [router],
  );
}
