import { redirect } from "next/navigation";
import { isStaff } from "@/lib/auth/roles";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  redirect(isStaff(session) ? "/admin" : "/portal");
}
