"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PasswordField } from "@/components/PasswordField";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    // Mobile Safari / password managers often autofill without firing onChange.
    const form = e.currentTarget;
    const data = new FormData(form);
    const nextEmail = String(data.get("email") ?? email).trim().toLowerCase();
    const nextPassword = String(data.get("password") ?? password);
    setEmail(nextEmail);
    setPassword(nextPassword);

    if (!nextEmail || !nextPassword) {
      setError("Enter your email and password.");
      setBusy(false);
      return;
    }

    try {
      // Prefer browser client — sets auth cookies in the browser (works on Vercel HTTPS).
      const supabase = createClient();
      const { data: signData, error: signError } =
        await supabase.auth.signInWithPassword({
          email: nextEmail,
          password: nextPassword,
        });

      if (signError) {
        // Fallback: server route (helps some HTTP/LAN cases)
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: nextEmail, password: nextPassword }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
        };

        if (!res.ok) {
          setError(
            json.error ||
              signError.message ||
              `Could not sign in (${res.status}).`,
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
          setError("Could not sign in. Check your email and password.");
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
          : "Could not reach the sign-in service. Check your connection.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-marks" aria-hidden>
        <div className="login-track login-track--1">
          <div className="login-track-inner">
            <span>Sense Wellness</span>
            <span>Seissense</span>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
            <span>Seissense</span>
            <span>Loveboo</span>
          </div>
          <div className="login-track-inner" aria-hidden>
            <span>Sense Wellness</span>
            <span>Seissense</span>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
            <span>Seissense</span>
            <span>Loveboo</span>
          </div>
        </div>
        <div className="login-track login-track--2">
          <div className="login-track-inner">
            <span>Loveboo</span>
            <span>Sense Wellness</span>
            <span>Seissense</span>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
            <span>Seissense</span>
          </div>
          <div className="login-track-inner" aria-hidden>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
            <span>Seissense</span>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
            <span>Seissense</span>
          </div>
        </div>
        <div className="login-track login-track--3">
          <div className="login-track-inner">
            <span>Seissense</span>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
            <span>Seissense</span>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
          </div>
          <div className="login-track-inner" aria-hidden>
            <span>Seissense</span>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
            <span>Seissense</span>
            <span>Loveboo</span>
            <span>Sense Wellness</span>
          </div>
        </div>
        <div className="login-track login-track--4">
          <div className="login-track-inner">
            <span>Sense Wellness</span>
            <span>Loveboo</span>
            <span>Seissense</span>
            <span>Sense Wellness</span>
            <span>Loveboo</span>
            <span>Seissense</span>
          </div>
          <div className="login-track-inner" aria-hidden>
            <span>Sense Wellness</span>
            <span>Loveboo</span>
            <span>Seissense</span>
            <span>Sense Wellness</span>
            <span>Loveboo</span>
            <span>Seissense</span>
          </div>
        </div>
      </div>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="login-card surface"
      >
        <header className="login-card-header">
          <h1 className="login-brand">Assets</h1>
          <p className="type-caption">Sign in to your places</p>
        </header>

        <label className="login-field">
          <span className="type-caption">Email</span>
          <input
            type="email"
            name="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flat-input type-body login-input"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="you@company.com"
          />
        </label>

        <PasswordField
          label="Password"
          name="password"
          value={password}
          onChange={setPassword}
          required
          autoComplete="current-password"
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
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="type-caption login-footer">
          No account? Contact your admin.
        </p>
      </form>
    </div>
  );
}
