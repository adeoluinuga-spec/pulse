import PersonPay from "@/components/payroll/PersonPay";

export const dynamic = "force-dynamic";

export default async function PersonPayPage({ params }: { params: Promise<{ employeeId: string }> }) {
  const { employeeId } = await params;
  return <PersonPay employeeId={employeeId} />;
}
