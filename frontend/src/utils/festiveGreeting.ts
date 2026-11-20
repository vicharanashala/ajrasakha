// Agriculture-themed Diwali wishes. One is picked per user per day.
export const DIWALI_WISHES: readonly string[] = [
  "May this Diwali light up every field you help nurture, and may the harvest of your hard work be as abundant as the lamps that glow tonight.",
  "Just as a single diya chases away the dark, every answer you give lights the way for a farmer. Wishing you a joyous and prosperous Diwali.",
  "May your home be filled with the warmth of lamps and the richness of a golden harvest. Thank you for standing beside India's farmers.",
  "Like seeds sown with care, your guidance grows into healthier crops and brighter livelihoods. May this festival return that joy to you many times over.",
  "As rabi sowing begins under the festive lights, we are grateful for the knowledge you share with every farming family. Happy Diwali.",
  "May the light of Diwali bring good rains, rich soil and bountiful harvests to every farmer, and lasting happiness to you and your family.",
  "Every query you resolve is a lamp lit in a farmer's home. Thank you for spreading light all year round. Wishing you a bright Diwali.",
  "May Goddess Lakshmi bless you with good health, fields full of opportunity and a season of plenty. Happy Diwali from all of us at the Review System Team.",
];

// Returns a greeting that matches the user's local time of day.
export function getTimeOfDayGreeting(now: Date): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

// Picks a stable index from a seed so each user sees one wish per day.
export function pickWishIndex(seed: string, count: number): number {
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return count > 0 ? hash % count : 0;
}
