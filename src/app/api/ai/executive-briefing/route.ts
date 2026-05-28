import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function fallbackBriefing(body: Record<string, unknown>) {
  const orgName = typeof body.orgName === "string" ? body.orgName : "Zenith Corp";
  const overallScore = typeof body.overallScore === "number" ? body.overallScore : 76;
  const promotionCount = typeof body.promotionCount === "number" ? body.promotionCount : 0;
  const pipCount = typeof body.pipCount === "number" ? body.pipCount : 0;
  const atRiskGoals = Array.isArray(body.atRiskGoals) ? body.atRiskGoals : [];

  return `Overall Health — ${orgName} is operating at ${overallScore}% overall performance, with a stable core and clear pockets of underperformance that need executive attention. The promotion pipeline has ${promotionCount} ready candidates while ${pipCount} people require structured intervention. Top Risk — ${atRiskGoals.length ? `The biggest concern is slippage on ${String(atRiskGoals[0])}, which needs owner-level recovery before the cycle closes.` : "The biggest concern is maintaining report and goal discipline as the cycle approaches deadline."} Top Strength — Strong performers and high-scoring departments are creating a solid leadership bench for the next review cycle. Recommended Action — Ask each department below the organisation average to submit a two-week recovery plan tied to one measurable OKR movement.`;
}

export async function POST(request: Request) {
  let body: Record<string, unknown> = {};

  try {
    body = await request.json();

    const message = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system:
        "You are Pulse's executive intelligence layer. Write a strategic performance briefing for the CEO and executive team. Structure: (1) Overall Health — 2 sentences on org-wide performance, (2) Top Risk — the single biggest performance concern right now, (3) Top Strength — what's working well, (4) Recommended Action — one specific, actionable recommendation. Professional tone. Concise. No bullet points — flowing sentences. Max 5 sentences total.",
      messages: [
        {
          role: "user",
          content: JSON.stringify(body),
        },
      ],
    });

    const briefing = message.content[0]?.type === "text" ? message.content[0].text : fallbackBriefing(body);
    return NextResponse.json({ briefing });
  } catch (error) {
    console.error("executive-briefing error:", error);
    return NextResponse.json({ briefing: fallbackBriefing(body) });
  }
}
