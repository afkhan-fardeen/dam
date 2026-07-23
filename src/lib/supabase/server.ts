import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            const secure =
              process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false;
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                secure: secure ? options?.secure : false,
                sameSite: options?.sameSite ?? "lax",
                path: options?.path ?? "/",
              }),
            );
          } catch {
            // Server Component — middleware refreshes sessions.
          }
        },
      },
    },
  );
}

/** Session client for Route Handlers: cookies first, else Bearer token. */
export async function createRouteClient(request?: Request) {
  const authHeader = request?.headers.get("authorization");
  const bearer = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (bearer) {
    return createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
  }

  return createClient();
}
