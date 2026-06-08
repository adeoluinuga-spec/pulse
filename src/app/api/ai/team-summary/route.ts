import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, extractText } from "@/lib/anthropic";

function fallback(managerName?: string) {
  return {
    summary: `${managerName ?? "Your team"} is broadly stable, with the strongest contributors creating momentum on priority goals. Give immediate attention to overdue reports and any teammate with repeated blocker language, then schedule one focused support check-in this week. Recognise the highest performer publicly and ask them to share one practical habit with the group.`,
  };
}

export async function POST(request: NextRequest) {
  let body: { managerName?: string } = {};
  try {
    body = await request.json();

    const response = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are Pulse's AI analyst. Generate a concise, actionable team performance summary for a line manager. Be direct. Max 4 sentences. Cover: overall team health, who needs attention and why, who is excelling, and one recommended action. No preamble.",
      messages: [{ role: "user", content: JSON.stringify(body) }],
    });

    const text = extractText(response);
    return NextResponse.json({ summary: text || fallback(body.managerName).summary });
  } catch (error) {
    console.error("team-summary fallback:", error);
    return NextResponse.json(fallback(body.managerName));
  }
}
