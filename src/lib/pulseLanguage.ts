const lines = [
  "Consistency compounds faster than intensity.",
  "Execution is strategy revealed.",
  "Small wins build unstoppable momentum.",
  "Strong alignment creates calm velocity.",
  "Progress feels quiet before it becomes obvious.",
  "The best work systems reduce friction, not humanity.",
  "Trajectory improves when attention is clear.",
];

export function dailyPulseLine(date = new Date()) {
  const day = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return lines[Math.abs(day) % lines.length];
}

export function momentumLanguage(score: number) {
  if (score >= 85) return "High Execution Velocity";
  if (score >= 70) return "Momentum Rising";
  if (score >= 55) return "Stable";
  if (score >= 40) return "Needs Attention";
  return "Strategic Risk";
}
