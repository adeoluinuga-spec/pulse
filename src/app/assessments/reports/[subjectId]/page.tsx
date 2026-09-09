import ReportView from "./ReportView";

export const dynamic = "force-dynamic";

export default async function ReportViewPage({
  params,
}: {
  params: Promise<{ subjectId: string }>;
}) {
  const { subjectId } = await params;
  return <ReportView subjectId={subjectId} />;
}
