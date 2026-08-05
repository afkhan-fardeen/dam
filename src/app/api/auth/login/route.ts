import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

type Body = {
  email?: string;
  password?: string;
};

function publicAuthError(message: string, code?: string): string {
  const lower = message.toLowerCase();
  if (
    code === "invalid_credentials" ||
    lower.includes("invalid login") ||
    lower.includes("invalid credentials")
  ) {
    return "Could not sign in. Check your email and password.";
  }
  if (lower.includes("email not confirmed")) {
    return "Email is not confirmed yet. Ask an admin to confirm the account.";
  }
  if (lower.includes("too many requests")) {
    return "Too many sign-in attempts. Wait a minute and try again.";
  }
  return message || "Could not sign in.";
}

export async function POST(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      {
        error:
          "Auth is not configured on this deployment. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        code: "missing_env",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  const password = body.password ?? "";
  if (!email || !password) {
    return NextResponse.json(
      { error: "Enter your email and password." },
      { status: 400 },
    );
  }

  const isHttps = request.nextUrl.protocol === "https:";
  const success = NextResponse.json({ ok: true });

  try {
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            success.cookies.set(name, value, {
              ...options,
              secure: isHttps ? (options.secure ?? true) : false,
              sameSite: options.sameSite ?? "lax",
              path: options.path ?? "/",
            });
          });
        },
      },
    });

    const { data: signData, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json(
        {
          error: publicAuthError(error.message, error.code),
          code: error.code ?? "auth_error",
        },
        { status: 401 },
      );
    }

    const userId = signData.user?.id;
    if (userId) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_active")
        .eq("id", userId)
        .maybeSingle();

      if (profile && profile.is_active === false) {
        await supabase.auth.signOut();
        return NextResponse.json(
          {
            error: "Could not sign in. Check your email and password.",
            code: "invalid_credentials",
          },
          { status: 401 },
        );
      }
    }

    return success;
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Sign-in failed unexpectedly.";
    return NextResponse.json(
      { error: message, code: "server_error" },
      { status: 500 },
    );
  }
}
