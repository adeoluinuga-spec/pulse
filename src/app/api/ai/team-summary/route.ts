import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const model = "claude-sonnet-4-20250514";

function fallback(managerName?: string) {
  return {
    summary:
      `${managerName ?? "Your team"} is broadly stable, with the strongest contributors creating momentum on priority goals. Give immediate attention to overdue reports and any teammate with repeated blocker language, then schedule one focused support check-in this week. Recognise the highest performer publicly and ask them to share one practical habit with the group.`,
  };
}

export async function POST(request: NextRequest) {
  let body: { managerName?: string } = {};
  try {
    body = await request.json();
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const message = await client.messages.create({
      model,
      max_tokens: 1000,
      system:
        "You are Pulse's AI analyst. Generate a concise, actionable team performance summary for a line manager. Be direct. Max 4 sentences. Cover: overall team health, who needs attention and why, who is excelling, and one recommended action. No preamble.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(body),
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ summary: text || fallback(body.managerName).summary });
  } catch (error) {
    console.error("team-summary fallback:", error);
    return NextResponse.json(fallback(body.managerName));
  }
}
