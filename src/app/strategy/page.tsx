import StrategyWorkspace from "@/components/planning/StrategyWorkspace";

// Matches /goals and /kpis. The workspace fetches the cascade on mount, so a
// prerendered shell is harmless — but a planning page that is sometimes static
// and sometimes not is a difference nobody should have to remember.
export const dynamic = "force-dynamic";

export default function StrategyPage() {
  return <StrategyWorkspace />;
}
