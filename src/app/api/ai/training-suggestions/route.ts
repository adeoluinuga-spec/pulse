import { NextRequest, NextResponse } from "next/server";
import { getAnthropicClient, extractText } from "@/lib/anthropic";
import { getRouteUser } from "@/lib/apiAuth";

const fallback = [
  {
    title: "Goal Delivery Essentials",
    provider: "LinkedIn Learning",
    reason: "Strengthens execution habits tied to current goal progress and appraisal evidence.",
    duration: "4 weeks",
    level: "Intermediate",
    url: "https://www.linkedin.com/learning/",
  },
  {
    title: "Data-Driven Performance Management",
    provider: "Coursera",
    reason: "Helps connect KPIs, report updates, and measurable business outcomes.",
    duration: "6 weeks",
    level: "Intermediate",
    url: "https://coursera.org",
  },
  {
    title: "Strategic Communication at Work",
    provider: "edX",
    reason: "Improves stakeholder updates and manager-ready progress narratives.",
    duration: "3 weeks",
    level: "Beginner",
    url: "https://www.edx.org",
  },
];

function extractJSON(text: string) {
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
        "You are Pulse's learning advisor. Based on the employee's performance gaps and next cadre requirements, suggest 3 specific courses or certifications. Return ONLY a JSON array with objects: { title, provider, reason, duration, level, url }. No preamble, no markdown.",
      messages: [{ role: "user", content: JSON.stringify(body) }],
    });

    const text = extractText(response);
    const parsed = JSON.parse(extractJSON(text));
    return NextResponse.json(Array.isArray(parsed) ? parsed : fallback);
  } catch (error) {
    console.error("training-suggestions fallback:", error);
    return NextResponse.json(fallback);
  }
}
