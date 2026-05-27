import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are Pulse's AI analyst. Generate a concise team performance summary for a line manager. Be direct and actionable. Max 4 sentences. Focus on what needs attention and what's going well. No preamble.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(body),
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ summary: text });
  } catch (error) {
    console.error("team-summary error:", error);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
