import { createClient } from "@/lib/supabase/server";
import DashboardTabs from "@/components/DashboardTabs";

// The whole dashboard is one page — tabs switch client-side for instant nav.
export default async function DashboardPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const username =
    (user?.user_metadata?.username as string | undefined) ||
    user?.email?.split("@")[0] ||
    "user";

  return <DashboardTabs username={username} />;
}
