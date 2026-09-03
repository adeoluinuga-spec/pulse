import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, extractText } from "@/lib/anthropic";
import { getRouteUser } from "@/lib/apiAuth";

const fallback = {
  recommendation: "good_standing",
  confidence: 72,
  evidence: [
    "Performance data is sufficient for continued standing.",
    "Goal and report signals should be reviewed by a manager before final action.",
  ],
  note: "AI recommendation unavailable, so Pulse returned a conservative advisory fallback.",
};

function extractJSON(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return match ? match[1] : text.trim();
}

export async function POST(request: NextRequest) {
  if (!(await getRouteUser())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await request.json();

    const response = await getAnthropicClient().messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      system:
        "You are Pulse's appraisal AI. Based on the performance data provided, generate an appraisal recommendation. Choose one: promote, good_standing, pip, exit_risk. Return ONLY a JSON object with: recommendation (string), confidence (number 0-100), evidence (array of strings, max 4), note (one sentence explanation). No preamble, no markdown.",
      messages: [{ role: "user", content: JSON.stringify(body) }],
    });

    const text = extractText(response);
    const data = JSON.parse(extractJSON(text));
    return NextResponse.json(data);
  } catch (error) {
    console.error("appraisal-recommendation fallback:", error);
    return NextResponse.json(fallback);
  }
}
