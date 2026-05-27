import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

const client = new Anthropic();

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : text.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are Pulse's appraisal AI. Based on the performance data provided, generate an appraisal recommendation. Choose one: promote, good_standing, pip, exit_risk. Return ONLY a JSON object with: recommendation (string), confidence (number 0-100), evidence (array of strings, max 4), note (one sentence explanation). No preamble, no markdown.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(body),
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "{}";
    const data = JSON.parse(extractJSON(text));
    return NextResponse.json(data);
  } catch (error) {
    console.error("appraisal-recommendation error:", error);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
