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
        "You are Pulse's executive intelligence layer. Write a concise strategic briefing for the CEO/executive team. Max 5 sentences. Cover: overall org health, top risk, top strength, one recommended action. Professional tone.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(body),
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "";
    return NextResponse.json({ briefing: text });
  } catch (error) {
    console.error("executive-briefing error:", error);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
