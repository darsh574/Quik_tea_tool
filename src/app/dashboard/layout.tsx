import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DashboardChrome from "@/components/DashboardChrome";
import { UserProvider, type CurrentUser } from "@/components/UserContext";
import { readPermissions, readRole } from "@/lib/auth/permissions";

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

  const role = readRole(user.user_metadata?.role);
  const permissions = readPermissions(role, user.user_metadata?.permissions);

  const currentUser: CurrentUser = {
    id: user.id,
    username,
    role,
    permissions,
  };

  return (
    <UserProvider value={currentUser}>
      <DashboardChrome username={username}>{children}</DashboardChrome>
    </UserProvider>
  );
}
