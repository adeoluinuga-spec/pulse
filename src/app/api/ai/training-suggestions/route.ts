import OpenAI from "openai";
import { NextRequest, NextResponse } from "next/server";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

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
  try {
    const body = await request.json();

    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content:
            "You are Pulse's learning advisor. Based on the employee's performance gaps and next cadre requirements, suggest 3 specific courses or certifications. Return ONLY a JSON array with objects: { title, provider, reason, duration, level, url }. No preamble, no markdown.",
        },
        { role: "user", content: JSON.stringify(body) },
      ],
    });

    const text = response.choices[0].message.content ?? "[]";
    const parsed = JSON.parse(extractJSON(text));
    return NextResponse.json(Array.isArray(parsed) ? parsed : fallback);
  } catch (error) {
    console.error("training-suggestions fallback:", error);
    return NextResponse.json(fallback);
  }
}
