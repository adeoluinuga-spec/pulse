import LearningTrainee from "@/components/learning/LearningTrainee";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <LearningTrainee token={token} />;
}
