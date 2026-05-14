import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardChrome from "@/components/DashboardChrome";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Middleware already gates this, but double-check on the server.
  if (!user) redirect("/login");

  const username =
    (user.user_metadata?.username as string | undefined) ||
    user.email?.split("@")[0] ||
    "user";

  return <DashboardChrome username={username}>{children}</DashboardChrome>;
}
