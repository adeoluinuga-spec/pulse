import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, extractText } from "@/lib/anthropic";

const fallback = {
  accomplishments: ["Report received and saved for manager review."],
  blockers: [],
  goalsReferenced: [],
  sentiment: "neutral",
  collaborationMentions: [],
};

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : text.trim();
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { accomplishments, blockers, mood, goalProgress } = body;

    const response = await getAnthropicClient().messages.create({
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

    const text = extractText(response);
    const data = JSON.parse(extractJSON(text));
    return NextResponse.json(data);
  } catch (error) {
    console.error("analyze-report fallback:", error);
    return NextResponse.json(fallback);
  }
}
