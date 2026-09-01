"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";

const PORTAL_EMAIL =
  process.env.NEXT_PUBLIC_PORTAL_LOGIN_EMAIL?.trim().toLowerCase() || "";
const DISPLAY_NAME =
  process.env.NEXT_PUBLIC_PORTAL_DISPLAY_NAME?.trim() || "Main Drive";

function wrongPasswordMessage(raw?: string, code?: string): string {
  const lower = (raw || "").toLowerCase();
  if (
    code === "invalid_credentials" ||
    lower.includes("invalid login") ||
    lower.includes("invalid credentials") ||
    lower.includes("wrong password")
  ) {
    return "Wrong password.";
  }
  if (lower.includes("too many requests")) {
    return "Too many sign-in attempts. Wait a minute and try again.";
  }
  return raw || "Could not unlock.";
}

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const initials = useMemo(() => {
    return DISPLAY_NAME.split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "MD";
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);
    const nextPassword = String(data.get("password") ?? password);

    if (!PORTAL_EMAIL) {
      setError(
        "Portal unlock is not configured. Set NEXT_PUBLIC_PORTAL_LOGIN_EMAIL.",
      );
      setBusy(false);
      return;
    }

    if (!nextPassword) {
      setError("Enter your password.");
      setBusy(false);
      return;
    }

    setPassword(nextPassword);

    try {
      const supabase = createClient();
      const { data: signData, error: signError } =
        await supabase.auth.signInWithPassword({
          email: PORTAL_EMAIL,
          password: nextPassword,
        });

      if (signError) {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password: nextPassword }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };

        if (!res.ok) {
          setError(
            wrongPasswordMessage(
              json.error || signError.message,
              json.code || signError.code,
            ),
          );
          setBusy(false);
          return;
        }
      } else if (signData.user?.id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("is_active")
          .eq("id", signData.user.id)
          .maybeSingle();

        if (profile && profile.is_active === false) {
          await supabase.auth.signOut();
          setError("Wrong password.");
          setBusy(false);
          return;
        }
      }

      void fetch("/api/activity/login", { method: "POST" }).catch(() => null);
      window.location.assign("/");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not reach the unlock service. Check your connection.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="login-page unlock-page">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="login-card unlock-card surface"
      >
        <div className="unlock-avatar" aria-hidden>
          {initials}
        </div>
        <header className="login-card-header unlock-header">
          <h1 className="unlock-name">{DISPLAY_NAME}</h1>
          <p className="type-caption unlock-caption">Enter password to unlock</p>
        </header>

        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
          autoFocus
          className="login-field"
          inputClassName="login-input"
        />

        {error ? (
          <p className="type-caption text-[var(--danger)] flat-shake" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="btn-flat-primary login-submit disabled:opacity-40"
        >
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
    </div>
  );
}
