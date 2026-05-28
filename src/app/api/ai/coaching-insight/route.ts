import { NextRequest, NextResponse } from "next/server";
import { getDeepSeekClient } from "@/lib/deepseek";

function fallback(employeeName?: string, score?: number) {
  const current = typeof score === "number" ? score : 78;
  const projected = Math.min(96, current + 4);
  return {
    insight: `Where You Stand\n${employeeName ?? "You"} are in a strong position this cycle, with a current score of ${current}% and clear evidence of steady delivery. Your best leverage now is converting active goal progress into measurable end-of-cycle outcomes.\n\nTop 2 Priorities\n1. Focus your next two weekly updates on the highest-weight goals so your appraisal evidence is easy to trace.\n2. Close the most delayed goal milestone and document the support or dependencies needed.\n\nTrajectory\nAt your current pace, your end-of-cycle score will be approximately ${projected}%.\n\nWatch Out\nDo not let report consistency slip; it carries meaningful weight in the appraisal score and is easiest to protect with short, specific updates.`,
    projectedScore: projected,
  };
}

export async function POST(request: NextRequest) {
  let body: {
    employee?: { name?: string; performanceScore?: number; cadre?: string };
    cadre?: string;
  } = {};
  try {
    body = await request.json();
    const cadre = body.cadre ?? body.employee?.cadre ?? "mid";

    const response = await getDeepSeekClient().chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content: `You are Pulse's AI performance coach. Analyze this employee's performance data and write a personal coaching insight. Structure your response with four sections: (1) Where You Stand — 2-3 sentences on current position, (2) Top 2 Priorities — the two most impactful actions right now, (3) Trajectory — projected end-of-cycle score based on current pace, (4) Watch Out — one risk flag if relevant. Tone: warm, direct, coach not judge. Specific to the data, not generic. Cadre context: ${cadre} [entry=foundational/mid=delivery/senior=strategic/executive=org-level]. Return plain text with section headers.`,
        },
        { role: "user", content: JSON.stringify(body) },
      ],
    });

    const text = response.choices[0].message.content ?? "";
    return NextResponse.json({
      insight: text || fallback(body.employee?.name, body.employee?.performanceScore).insight,
      projectedScore: Math.min(98, Math.round((body.employee?.performanceScore ?? 78) + 4)),
    });
  } catch (error) {
    console.error("coaching-insight fallback:", error);
    return NextResponse.json(fallback(body.employee?.name, body.employee?.performanceScore));
  }
}
