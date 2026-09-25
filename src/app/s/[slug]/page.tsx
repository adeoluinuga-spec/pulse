import type { Metadata } from "next";

import SurveyForm from "./SurveyForm";

/** The public survey link. No sign-in, and nothing about the respondent is recorded. */

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Staff survey",
  // A survey link should not turn up in search results or a link preview.
  robots: { index: false, follow: false },
};

export default async function PublicSurveyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <SurveyForm slug={slug} />;
}
