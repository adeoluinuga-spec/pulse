/**
 * The two Bracken baseline surveys, as data.
 *
 * Kept apart from the script that creates them so a test can check the exact
 * wording against the database's rules before it is sent to anyone.
 */
// ── EDIT THIS LIST IF BRACKEN'S DEPARTMENTS DIFFER ───────────────────────────
export const DEPARTMENTS = [
  "Creative",
  "Production",
  "Public Relations",
  "Social Media / Digital",
  "Paid Media",
  "Sales & Business Development",
  "Operations",
  "Finance",
  "Legal",
  "Admin & Facility",
  "Human Resources",
  "E-commerce",
  "Prefer not to say",
];

// Whose workspace the surveys belong to. Yours, not the client's: Bracken is
// not on Pulse, and does not need to be for a baseline.

// Five named points, as specified. The answer is still stored as 1 to 5, so
// averages and comparisons work — but January must use these exact words, or
// the two runs are not measuring the same thing.
const AGREE = {
  lowLabel: "Strongly disagree",
  highLabel: "Strongly agree",
  scaleLabels: ["Strongly disagree", "Disagree", "Neither agree nor disagree", "Agree", "Strongly agree"],
};
const FREQUENCY = {
  lowLabel: "Never",
  highLabel: "Always",
  scaleLabels: ["Never", "Rarely", "Sometimes", "Usually", "Always"],
};

const scale = (section, ends, prompts) => prompts.map((prompt) => ({ type: "scale", prompt, section, required: true, ...ends }));
const comment = (section, prompt) => ({ type: "text", prompt, section, required: false });

export const STAFF = {
  title: "Bracken Media Solutions — Staff Survey (September 2026)",
  intro: [
    "Bracken is beginning a development programme covering every level of the organisation, and we want to know where things genuinely stand before it starts. This takes about five minutes.",
    "",
    "Your answers are anonymous. Responses go to Stuart Davidson, the external consultants running the programme — not to Bracken management. Only grouped results are shared back, and no group of fewer than three people is ever reported separately.",
    "",
    "Please answer honestly; that is the only way this is worth doing. We will run the same survey again in January so we can all see what has changed.",
  ].join("\n"),
  closingNote: "Thank you — your response has been recorded anonymously.",
  minimumGroup: 3,
  groupFields: [
    { label: "Department", options: DEPARTMENTS, required: true },
    { label: "Time at Bracken", options: ["Under 6 months", "6–12 months", "1–2 years", "More than 2 years"], required: true },
    { label: "Do you manage or supervise anyone?", options: ["Yes", "No"], required: true },
  ],
  questions: [
    ...scale("A — Clarity of expectations", AGREE, [
      "I am clear about what is expected of me in my role",
      "I know how my performance is measured",
      "I understand how my work contributes to the company's goals",
      "I know who to go to when a decision needs to be made",
    ]),
    ...scale("B — My line manager", AGREE, [
      "My manager is approachable when I need to raise something",
      "My manager treats people fairly",
      "My manager gives me useful feedback on my work",
      "My manager takes an interest in my development",
      "I have regular one-to-one conversations with my manager",
    ]),
    ...scale("C — Working relationships", AGREE, [
      "Work moves smoothly between my team and other departments",
      "When work moves between departments, it is clear who owns what",
      "People here treat each other with respect",
      "I can raise a concern or disagree at work without worrying about the consequences",
    ]),
    ...scale("D — Direction, tools and engagement", AGREE, [
      "I understand where the company is heading",
      "I have the tools and equipment I need to do my job well",
      "I take part in company initiatives and events when they happen",
      "I would recommend Bracken as a place to work",
    ]),
    comment("In your own words", "What is the one thing that would most help you do your job better? Please avoid naming individuals — it helps keep your answer anonymous."),
    comment("In your own words", "What is working well here that we should keep?"),
  ],
};

export const MANAGERS = {
  title: "Bracken Media Solutions — Manager Self-Assessment (September 2026)",
  intro: [
    "This short self-assessment takes about three minutes. It does two things: it gives us a starting picture of management practice across Bracken, and it gets you thinking about your own before the first session on 2 October.",
    "",
    "Your answers are anonymous. Responses go to Stuart Davidson, the external consultants running the programme — not to Bracken management — and are reported only as a group.",
    "",
    "There are no right answers, and nothing here feeds into your appraisal. An honest low score is more useful to you than a generous one.",
  ].join("\n"),
  closingNote: "Thank you — see you on 2 October.",
  minimumGroup: 3,
  groupFields: [
    { label: "Department", options: DEPARTMENTS, required: true },
    { label: "People reporting to you", options: ["1–2", "3–5", "6–10", "More than 10"], required: true },
  ],
  questions: [
    ...scale("Your management practice", FREQUENCY, [
      "I hold regular one-to-one meetings with each of my direct reports",
      "My team members know exactly what is expected of them",
      "I give feedback as things happen rather than saving it for appraisal",
      "I am confident having a difficult performance conversation",
      "I delegate real ownership, not just tasks",
      "I have a development plan for each person who reports to me",
      "I address friction in my team early rather than waiting",
      "I am clear on what my department is measured on",
      "I have the authority I need to do my job",
      "I am clear on who makes which decisions above me",
    ]),
    comment("In your own words", "What is the hardest part of managing your team right now?"),
  ],
};

