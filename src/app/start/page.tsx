import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

/** Entry point behind every "Open MeritNAMA" button: send people to the right home. */
export default async function Start() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  redirect(session.role === "admin" ? "/admin" : "/portal");
}
