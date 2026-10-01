import LearningTrainee from "@/components/learning/LearningTrainee";
export const dynamic = "force-dynamic";
export default async function Page({
  params,
}: {
  params: Promise<{ token: string; activityId: string }>;
}) {
  const { token, activityId } = await params;
  return <LearningTrainee token={token} activityId={activityId} />;
}
