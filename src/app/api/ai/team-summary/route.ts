import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, extractText } from "@/lib/anthropic";
import { getRouteUser } from "@/lib/apiAuth";

// When the AI is unavailable, say so. A canned paragraph about "strongest
// contributors" describes nobody and reads as if it were about this team.
function fallback() {
  return { summary: "The AI summary is not available right now. Everything it would draw on is shown above." };
}

export async function POST(request: NextRequest) {
  if (!(await getRouteUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: { managerName?: string } = {};
  try {
    body = await request.json();

    const response = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are Pulse's AI analyst. Write a concise, actionable summary of a line manager's team using ONLY the data provided: each person's goals (count, average progress, how many at risk or completed), their last work report, reports awaiting review, and open or overdue tasks. Never invent scores, sentiments, blockers or events that are not in the data. If data is missing (no goals, no reports), say that plainly as something to fix. Max 4 sentences: overall picture, who needs attention and why, what is going well, one recommended action. No preamble.",
      messages: [{ role: "user", content: JSON.stringify(body) }],
    });

    const text = extractText(response);
    return NextResponse.json({ summary: text || fallback().summary });
  } catch (error) {
    console.error("team-summary fallback:", error);
    return NextResponse.json(fallback());
  }
}
