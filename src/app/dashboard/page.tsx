import { redirect } from "next/navigation";

// The dashboard opens on the Routing tab — the first step of the flow.
export default function DashboardIndex() {
  redirect("/dashboard/routing");
}
