import { NextRequest, NextResponse } from "next/server";
import { getDeepSeekClient } from "@/lib/deepseek";

function fallback(level = "mixed") {
  if (level === "positive") {
    return {
      message:
        "It sounds like you are in a good rhythm this week. Keep protecting the habits that are working, and give yourself space to recover between focused pushes.",
      actions: ["Block one recovery window this week", "Share one win with your manager"],
    };
  }
  if (level === "negative") {
    return {
      message:
        "This sounds like a heavier week than usual, and it makes sense to want more support. Consider choosing one immediate pressure point to discuss with someone you trust today.",
      actions: [
        "Book a confidential EAP session",
        "Ask your manager to reprioritise one task",
        "Take a short reset break today",
      ],
    };
  }
  return {
    message:
      "There are some good signals here, and also a few signs that the workload may need attention. A small adjustment now could help the week feel more manageable.",
    actions: ["Clarify this week's top two priorities", "Schedule a quick support check-in"],
  };
}

export async function POST(request: NextRequest) {
  let body: { escalationLevel?: string } = {};
  try {
    body = await request.json();

    const response = await getDeepSeekClient().chat.completions.create({
      model: "deepseek-chat",
      max_tokens: 1000,
      messages: [
        {
          role: "system",
          content:
            "You are Pulse's wellbeing support layer. An employee has just completed a wellbeing check-in. Respond with warmth and care. If responses are positive, affirm and encourage. If mixed or negative, acknowledge without alarming, and gently point toward support. NEVER use words like flagged, reported, escalated, or monitored. Maximum 3 sentences. Then suggest 2 relevant support actions.",
        },
        { role: "user", content: JSON.stringify(body) },
      ],
    });

    const text = response.choices[0].message.content ?? "";
    const fb = fallback(body.escalationLevel);
    return NextResponse.json({ message: text || fb.message, actions: fb.actions });
  } catch (error) {
    console.error("wellbeing-response fallback:", error);
    return NextResponse.json(fallback(body.escalationLevel));
  }
}
