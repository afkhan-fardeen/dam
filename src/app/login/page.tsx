import { redirect } from "next/navigation";

/** Login removed — open portal goes straight to Main Drive. */
export default function LoginPage() {
  redirect("/");
}
