import LearningWorkspace from "@/components/learning/LearningWorkspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LearningWorkspace id={id} />;
}
