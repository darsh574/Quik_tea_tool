"use client";

import { createContext, useContext } from "react";
import type { Permissions, UserRole } from "@/lib/auth/permissions";

export interface CurrentUser {
  id: string;
  username: string;
  role: UserRole;
  permissions: Permissions;
}

const Ctx = createContext<CurrentUser | null>(null);

export function UserProvider({
  value,
  children,
}: {
  value: CurrentUser;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCurrentUser(): CurrentUser {
  const v = useContext(Ctx);
  if (!v) {
    // Shouldn't happen — dashboard layout always wraps children in the provider.
    throw new Error("useCurrentUser must be used inside <UserProvider>.");
  }
  return v;
}
