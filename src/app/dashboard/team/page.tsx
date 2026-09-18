"use client";

import { Suspense } from "react";

import TeamWorkspace from "@/components/team/TeamWorkspace";

/** The team workspace. Everything on it comes from /api/team/* and the published org chart. */
export default function DashboardTeamPage() {
  return (
    <Suspense>
      <TeamWorkspace />
    </Suspense>
  );
}
