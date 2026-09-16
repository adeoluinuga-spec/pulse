import RunView from "@/components/payroll/RunView";

export const dynamic = "force-dynamic";

export default async function PayrollRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <RunView runId={runId} />;
}
