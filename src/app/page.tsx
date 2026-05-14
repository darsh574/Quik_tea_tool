import { redirect } from "next/navigation";

// Root just bounces to the dashboard. Middleware enforces auth and will
// redirect to /login if there is no active Supabase session.
export default function Home() {
  redirect("/dashboard");
}
