import type { LearningConfig } from "./learning.ts";

export const learningStarter: {
  title: string;
  summary: string;
  type: "content" | "form" | "roleplay";
  config: LearningConfig;
  released: boolean;
}[] = [
  {
    title: "The difficult conversation",
    summary: "Four steps to a clear and constructive conversation.",
    type: "content",
    released: true,
    config: {
      body: "## Four steps, in order\n\n| Step | What to do |\n| --- | --- |\n| Describe what happened | Describe the specific situation and behaviour. Facts, not labels. |\n| Say the impact | Explain what it affected: the client, team or deadline. |\n| Ask and listen | Ask: What's your side of this? Listen fully before responding. |\n| Agree the next step | Agree one action, one owner and one date to check in. |\n\n## Say this, not that\n\n- Instead of **You're careless**, say **The report came in two days late.**\n- Instead of **You always do this**, say **This is the third time this month.**\n- Instead of **Why didn't you just...**, ask **What got in the way?**",
    },
  },
  {
    title: "Practice scenarios",
    summary: "Scenarios from your training session.",
    type: "content",
    released: false,
    config: {
      body: "Facilitator: replace this draft with the five scenarios used in your training before releasing it.",
    },
  },
  {
    title: "My commitment",
    summary: "Two behaviours to practise over the next four weeks.",
    type: "form",
    released: true,
    config: {
      intro: "What would someone see you doing differently on Monday?",
      fields: [
        {
          key: "commitment_1",
          label: "Commitment 1",
          type: "textarea",
          required: true,
        },
        {
          key: "commitment_2",
          label: "Commitment 2",
          type: "textarea",
          required: true,
        },
        {
          key: "signal",
          label: "I will know it is working when...",
          type: "text",
        },
      ],
      confirmText: "Your commitments are saved.",
    },
  },
  {
    title: "Role-play reflection",
    summary: "What you noticed in your practice rounds.",
    type: "form",
    released: true,
    config: {
      fields: [
        {
          key: "hardest",
          label: "Which step was hardest?",
          type: "choice",
          options: [
            "Describe what happened",
            "Say the impact",
            "Ask and listen",
            "Agree the next step",
          ],
          required: true,
        },
        {
          key: "next_time",
          label: "What will you do differently next time?",
          type: "textarea",
        },
        {
          key: "colleague",
          label: "One thing a colleague did well",
          type: "text",
        },
      ],
    },
  },
  {
    title: "Individual Development Plan",
    summary: "Development goals, actions and support.",
    type: "form",
    released: false,
    config: {
      intro: "Agree your goals with your manager and review them quarterly.",
      rows: 3,
      fields: [
        { key: "develop", label: "What I am developing", type: "text" },
        { key: "success", label: "What good looks like", type: "text" },
        {
          key: "action",
          label: "Training, stretch work, shadowing or coaching",
          type: "textarea",
        },
        { key: "manager", label: "What my manager will do", type: "text" },
        { key: "date", label: "By when", type: "text" },
      ],
      singleFields: [
        { key: "strengths", label: "Strengths to build on", type: "textarea" },
        {
          key: "support",
          label: "Support or resources needed",
          type: "textarea",
        },
      ],
    },
  },
  {
    title: "Difficult conversation practice",
    summary: "Take a role and practise a conversation with your group.",
    type: "roleplay",
    released: false,
    config: {
      scenario:
        "Facilitator: add a scenario from your session, then assign a manager and team member to each group before releasing this activity.",
      roles: ["Manager", "Team member"],
      rounds: 4,
    },
  },
];
