import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, extractText } from "@/lib/anthropic";
import { getRouteUser } from "@/lib/apiAuth";

// When the AI is unavailable, say so. The old fallback described "a strong
// position" and a projected score for whoever asked, with no data behind it.
function fallback() {
  return { insight: "The coach is not available right now. Your goals, KPIs and reports are unchanged — try again shortly." };
}

export async function POST(request: NextRequest) {
  if (!(await getRouteUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: {
    employee?: { name?: string; performanceScore?: number; cadre?: string };
    cadre?: string;
  } = {};
  try {
    body = await request.json();
    const cadre = body.cadre ?? body.employee?.cadre ?? "mid";

    const response = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system: `You are Pulse's AI performance coach. Analyze this employee's performance data and write a personal coaching insight. Structure your response with four sections: (1) Where You Stand — 2-3 sentences on current position, (2) Top 2 Priorities — the two most impactful actions right now, (3) Trajectory — where the goals and KPIs are heading, in words, (4) Watch Out — one risk flag if relevant. Use ONLY the goals, KPIs and reports provided; never invent scores, percentages or events. If something is missing (no goals, no recent reports), say so plainly. Tone: warm, direct, coach not judge. Specific to the data, not generic. Cadre context: ${cadre} [entry=foundational/mid=delivery/senior=strategic/executive=org-level]. Return plain text with section headers.`,
      messages: [{ role: "user", content: JSON.stringify(body) }],
    });

    const text = extractText(response);
    return NextResponse.json({
      insight: text || fallback().insight,
    });
  } catch (error) {
    console.error("coaching-insight fallback:", error);
    return NextResponse.json(fallback());
  }
}
