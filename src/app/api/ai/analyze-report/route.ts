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
    const { accomplishments, blockers, mood, goalProgress } = body;

    const message = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are Pulse's performance AI. Analyze this employee report and extract: (1) key accomplishments as a bullet list, (2) blockers mentioned, (3) which goals were referenced, (4) a sentiment signal (positive/neutral/concerning), (5) any collaboration mentions. Return ONLY a JSON object with keys: accomplishments (array), blockers (array), goalsReferenced (array), sentiment (string), collaborationMentions (array). No preamble, no markdown.",
      messages: [
        {
          role: "user",
          content: `Accomplishments: ${accomplishments || "None"}\nBlockers: ${blockers || "None"}\nMood: ${mood || "unspecified"}\nGoal updates: ${JSON.stringify(goalProgress || [])}`,
        },
      ],
    });

    const text =
      message.content[0].type === "text" ? message.content[0].text : "{}";
    const data = JSON.parse(extractJSON(text));
    return NextResponse.json(data);
  } catch (error) {
    console.error("analyze-report error:", error);
    return NextResponse.json({ error: "AI analysis failed" }, { status: 500 });
  }
}
