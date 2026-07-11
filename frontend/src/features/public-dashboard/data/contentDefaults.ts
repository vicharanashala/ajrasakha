import type { DashboardBlock } from "@/hooks/services/dashboardContentService";

/**
 * Seed content for the editable narrative. Shown on the public dashboard when an admin
 * hasn't saved anything yet, and used as the starting point in the editor ("Load defaults").
 * Answers the 60-second questions: what ACE is, why it matters, how large, coverage,
 * technology, impact, and what's next.
 */
export const defaultBlocks: DashboardBlock[] = [
  {
    id: "what-is-ace",
    heading: "What ACE is",
    body: "ACE — the Agricultural Cognitive Ecosystem — is India's public agricultural intelligence infrastructure. It turns Kisan Call Centre transcripts and expert-validated Q&A into a trusted, multilingual advisory layer for every farmer.",
    figures: [],
    order: 0,
  },
  {
    id: "why-it-matters",
    heading: "Why it matters",
    body: "Farmers need reliable, science-backed answers in their own language, at the moment a decision is made. ACE brings the country's agricultural knowledge together and makes it verifiable, accountable, and openly accessible.",
    figures: [],
    order: 1,
  },
  {
    id: "how-large",
    heading: "How large the initiative is",
    body: "A national effort spanning the full advisory value chain — questions, validated answers, experts and institutions working together.",
    figures: [
      { label: "Questions processed", value: "18.6M" },
      { label: "Validated Q&A pairs", value: "4.12M" },
      { label: "Experts engaged", value: "3,174" },
    ],
    order: 2,
  },
  {
    id: "coverage",
    heading: "How much of India has been covered",
    body: "Advisory reach now extends across states, districts and villages, anchored by KVKs and State Agricultural Universities.",
    figures: [
      { label: "States & UTs", value: "29" },
      { label: "Districts", value: "612" },
      { label: "Villages", value: "8,420" },
    ],
    order: 3,
  },
  {
    id: "technology",
    heading: "What technologies power it",
    body: "A production AI stack — speech-to-text and text-to-speech across languages, OCR, translation, a domain-tuned Agri LLM, a retrieval-augmented knowledge engine, a knowledge graph and image-based pest/disease understanding.",
    figures: [
      { label: "Languages", value: "22" },
      { label: "Dialects", value: "47" },
    ],
    order: 4,
  },
  {
    id: "impact",
    heading: "What impact has already been created",
    body: "Validated advisories are reaching farmers on the ground through outreach programmes, weekly Farmer Friday artefacts, and real-time integrations for weather, market prices and schemes.",
    figures: [
      { label: "KVKs mapped", value: "731" },
      { label: "SAUs collaborating", value: "63" },
      { label: "Markets connected", value: "1,284" },
    ],
    order: 5,
  },
  {
    id: "whats-next",
    heading: "What is coming next",
    body: "A soil-health engine, an AI agronomist, satellite-based crop monitoring, disease-detection from images and season-ahead yield prediction — rolling out in phases.",
    figures: [],
    order: 6,
  },
];
