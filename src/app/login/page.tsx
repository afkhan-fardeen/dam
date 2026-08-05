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
    <div className="min-h-screen flex items-center justify-center px-6">
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="glass-strong glass-appear w-full max-w-[360px] p-7 flex flex-col gap-5"
        style={{ borderRadius: 20 }}
      >
        <h1 className="type-page text-center">Assets</h1>

        <label className="flex flex-col gap-1.5">
          <span className="type-caption">Email</span>
          <input
            type="email"
            name="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="glass-input type-body py-2"
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
        />

        {error ? <p className="type-caption text-[#ff3b30]">{error}</p> : null}

        <button
          type="submit"
          disabled={busy}
          className="btn-glass-primary w-full py-2.5 text-[14px] font-medium disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="type-caption text-center">
          No account? Contact your admin.
        </p>
      </form>
    </div>
  );
}
