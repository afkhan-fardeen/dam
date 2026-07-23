"use client";

import { useState } from "react";
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
    const nextEmail = String(data.get("email") ?? email).trim();
    const nextPassword = String(data.get("password") ?? password);
    setEmail(nextEmail);
    setPassword(nextPassword);

    if (!nextEmail || !nextPassword) {
      setError("Enter your email and password.");
      setBusy(false);
      return;
    }

    try {
      // Server sets auth cookies on the response — more reliable on mobile /
      // LAN HTTP than client-side createBrowserClient cookie writes.
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: nextEmail, password: nextPassword }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        ok?: boolean;
      };

      if (!res.ok) {
        setError(json.error || "Could not sign in. Check your email and password.");
        setBusy(false);
        return;
      }

      void fetch("/api/activity/login", { method: "POST" }).catch(() => null);
      window.location.assign("/");
    } catch {
      setError("Could not reach the sign-in service. Check your connection.");
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 bg-base-200">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="card bg-base-100 w-full max-w-sm shadow-md border border-base-300"
      >
        <div className="card-body gap-6">
          <h1 className="card-title type-page">Company assets</h1>

          <fieldset className="fieldset w-full">
            <legend className="fieldset-legend text-xs opacity-60 py-0">
              Email
            </legend>
            <input
              type="email"
              name="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input input-bordered w-full"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </fieldset>

          <PasswordField
            label="Password"
            name="password"
            value={password}
            onChange={setPassword}
            required
            autoComplete="current-password"
          />

          {error ? <p className="text-sm text-error">{error}</p> : null}

          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary w-full"
          >
            {busy ? (
              <span className="loading loading-spinner loading-sm" />
            ) : null}
            {busy ? "Signing in…" : "Sign in"}
          </button>

          <p className="text-sm text-base-content/60">
            Contact your admin if you need access or a password reset.
          </p>
        </div>
      </form>
    </div>
  );
}
