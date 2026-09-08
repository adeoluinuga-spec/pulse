import ReviewFlow from "./ReviewFlow";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  return <ReviewFlow token={token} />;
}
