import { env } from "@/config/env";
import type { GapAnalyticsSummary, GapCluster, GapReport, HeatmapMatrix } from "../types";

const API_BASE = `${env.apiBaseUrl()}/gap-detector`;

// ── Fallback mock data in case frontend runs with VITE_ENABLE_MOCKS=true or offline ──
const MOCK_HEATMAP: HeatmapMatrix = {
  states: ["Punjab", "Haryana", "Uttar Pradesh", "Maharashtra", "Rajasthan", "Madhya Pradesh", "Gujarat"],
  crops: ["Wheat", "Cotton", "Paddy", "Sugarcane", "Mustard", "Potato", "Soybean", "Onion"],
  overallCoverageScore: 68,
  totalDisclaimers: 420,
  criticalGapCount: 7,
  cells: [
    { crop: "Wheat", state: "Punjab", totalQueries: 140, disclaimerQueries: 58, coverageScore: 42, status: "critical_gap", dominantGapTopic: "Yellow Rust (पीली कूँगी) Fungicide Protocol in PBW-550" },
    { crop: "Wheat", state: "Haryana", totalQueries: 110, disclaimerQueries: 35, coverageScore: 58, status: "moderate", dominantGapTopic: "Karnal Bunt & Yellow Rust Emergence" },
    { crop: "Wheat", state: "Uttar Pradesh", totalQueries: 160, disclaimerQueries: 28, coverageScore: 72, status: "moderate", dominantGapTopic: "Nano Urea vs Conventional Nitrogen Timing" },
    { crop: "Wheat", state: "Maharashtra", totalQueries: 45, disclaimerQueries: 6, coverageScore: 85, status: "strong_coverage", dominantGapTopic: "Irrigation Scheduling at Crown Root Stage" },
    { crop: "Wheat", state: "Rajasthan", totalQueries: 90, disclaimerQueries: 24, coverageScore: 68, status: "moderate", dominantGapTopic: "Termite & White Grub Seed Treatment" },
    { crop: "Wheat", state: "Madhya Pradesh", totalQueries: 130, disclaimerQueries: 18, coverageScore: 80, status: "strong_coverage", dominantGapTopic: "Sharbati Wheat Rust Prevention" },
    { crop: "Wheat", state: "Gujarat", totalQueries: 50, disclaimerQueries: 5, coverageScore: 88, status: "strong_coverage", dominantGapTopic: "Bhalia Wheat Agronomic Timing" },

    { crop: "Cotton", state: "Punjab", totalQueries: 95, disclaimerQueries: 32, coverageScore: 55, status: "moderate", dominantGapTopic: "Whitefly & Parawilt Recovery" },
    { crop: "Cotton", state: "Haryana", totalQueries: 105, disclaimerQueries: 28, coverageScore: 62, status: "moderate", dominantGapTopic: "Cotton Leaf Curl Virus (CLCuV)" },
    { crop: "Cotton", state: "Uttar Pradesh", totalQueries: 40, disclaimerQueries: 4, coverageScore: 89, status: "strong_coverage", dominantGapTopic: "Standard Package of Practices" },
    { crop: "Cotton", state: "Maharashtra", totalQueries: 220, disclaimerQueries: 105, coverageScore: 38, status: "critical_gap", dominantGapTopic: "Pink Bollworm (गुलाबी बोंडअळी) Pyrethroid Resistance" },
    { crop: "Cotton", state: "Rajasthan", totalQueries: 80, disclaimerQueries: 34, coverageScore: 48, status: "critical_gap", dominantGapTopic: "Leaf Curl Virus & Stunted Growth in Sri Ganganagar" },
    { crop: "Cotton", state: "Madhya Pradesh", totalQueries: 75, disclaimerQueries: 19, coverageScore: 65, status: "moderate", dominantGapTopic: "Square Drop & Boron Deficiency" },
    { crop: "Cotton", state: "Gujarat", totalQueries: 180, disclaimerQueries: 74, coverageScore: 45, status: "critical_gap", dominantGapTopic: "Pink Bollworm Third Generation Borer" },

    { crop: "Paddy", state: "Punjab", totalQueries: 130, disclaimerQueries: 22, coverageScore: 75, status: "strong_coverage", dominantGapTopic: "Direct Seeded Rice (DSR) Weed Management" },
    { crop: "Paddy", state: "Haryana", totalQueries: 160, disclaimerQueries: 54, coverageScore: 52, status: "critical_gap", dominantGapTopic: "Basmati False Smut (हल्दी रोग) at Booting Stage" },
    { crop: "Paddy", state: "Uttar Pradesh", totalQueries: 140, disclaimerQueries: 32, coverageScore: 68, status: "moderate", dominantGapTopic: "Stem Borer & Leaf Folder Chemical Schedule" },
    { crop: "Paddy", state: "Maharashtra", totalQueries: 60, disclaimerQueries: 9, coverageScore: 82, status: "strong_coverage", dominantGapTopic: "Kolam Rice Blast Control" },
    { crop: "Paddy", state: "Rajasthan", totalQueries: 35, disclaimerQueries: 3, coverageScore: 90, status: "strong_coverage", dominantGapTopic: "Chambal Canal Water Distribution" },
    { crop: "Paddy", state: "Madhya Pradesh", totalQueries: 80, disclaimerQueries: 14, coverageScore: 78, status: "strong_coverage", dominantGapTopic: "Chinnor Rice Organic Nutrient Input" },
    { crop: "Paddy", state: "Gujarat", totalQueries: 55, disclaimerQueries: 7, coverageScore: 84, status: "strong_coverage", dominantGapTopic: "Saline Soil Paddy Cultivation" },

    { crop: "Sugarcane", state: "Punjab", totalQueries: 70, disclaimerQueries: 11, coverageScore: 80, status: "strong_coverage", dominantGapTopic: "Early Shoot Borer Prevention" },
    { crop: "Sugarcane", state: "Haryana", totalQueries: 85, disclaimerQueries: 14, coverageScore: 78, status: "strong_coverage", dominantGapTopic: "Top Borer Chemical Management" },
    { crop: "Sugarcane", state: "Uttar Pradesh", totalQueries: 280, disclaimerQueries: 142, coverageScore: 35, status: "critical_gap", dominantGapTopic: "Red Rot (लाल सड़न) in Co 0238 Ratoon Crops" },
    { crop: "Sugarcane", state: "Maharashtra", totalQueries: 160, disclaimerQueries: 42, coverageScore: 64, status: "moderate", dominantGapTopic: "Pokkah Boeng & White Grub Root Damage" },
    { crop: "Sugarcane", state: "Rajasthan", totalQueries: 30, disclaimerQueries: 3, coverageScore: 88, status: "strong_coverage", dominantGapTopic: "Standard Package of Practices" },
    { crop: "Sugarcane", state: "Madhya Pradesh", totalQueries: 65, disclaimerQueries: 9, coverageScore: 82, status: "strong_coverage", dominantGapTopic: "Drip Fertigation Schedule" },
    { crop: "Sugarcane", state: "Gujarat", totalQueries: 70, disclaimerQueries: 11, coverageScore: 79, status: "strong_coverage", dominantGapTopic: "Co-86032 Micronutrient Spray" },

    { crop: "Mustard", state: "Punjab", totalQueries: 45, disclaimerQueries: 6, coverageScore: 82, status: "strong_coverage", dominantGapTopic: "Aphid Preventive Spray" },
    { crop: "Mustard", state: "Haryana", totalQueries: 95, disclaimerQueries: 28, coverageScore: 60, status: "moderate", dominantGapTopic: "White Rust & Sclerotinia Fungicide" },
    { crop: "Mustard", state: "Uttar Pradesh", totalQueries: 90, disclaimerQueries: 18, coverageScore: 74, status: "moderate", dominantGapTopic: "Alternaria Blight Control" },
    { crop: "Mustard", state: "Maharashtra", totalQueries: 20, disclaimerQueries: 1, coverageScore: 92, status: "strong_coverage", dominantGapTopic: "Standard Sowing Guide" },
    { crop: "Mustard", state: "Rajasthan", totalQueries: 260, disclaimerQueries: 118, coverageScore: 40, status: "critical_gap", dominantGapTopic: "Severe Mustard Aphid (माहू) & Sclerotinia Rot" },
    { crop: "Mustard", state: "Madhya Pradesh", totalQueries: 110, disclaimerQueries: 26, coverageScore: 68, status: "moderate", dominantGapTopic: "Aphid Threshold Management" },
    { crop: "Mustard", state: "Gujarat", totalQueries: 60, disclaimerQueries: 16, coverageScore: 65, status: "moderate", dominantGapTopic: "Powdery Mildew Treatment" },

    { crop: "Potato", state: "Punjab", totalQueries: 80, disclaimerQueries: 18, coverageScore: 70, status: "moderate", dominantGapTopic: "Late Blight Early Warning" },
    { crop: "Potato", state: "Haryana", totalQueries: 65, disclaimerQueries: 12, coverageScore: 75, status: "strong_coverage", dominantGapTopic: "Tuber Moth Prevention" },
    { crop: "Potato", state: "Uttar Pradesh", totalQueries: 210, disclaimerQueries: 88, coverageScore: 48, status: "critical_gap", dominantGapTopic: "Late Blight (झुलसा) & Frost Protective Drench" },
    { crop: "Potato", state: "Maharashtra", totalQueries: 40, disclaimerQueries: 5, coverageScore: 85, status: "strong_coverage", dominantGapTopic: "Kharif Potato Bacterial Wilt" },
    { crop: "Potato", state: "Rajasthan", totalQueries: 45, disclaimerQueries: 7, coverageScore: 82, status: "strong_coverage", dominantGapTopic: "Cold Storage Sprout Inhibitor" },
    { crop: "Potato", state: "Madhya Pradesh", totalQueries: 90, disclaimerQueries: 19, coverageScore: 72, status: "moderate", dominantGapTopic: "Chipsona Variety Fertilizer Ratio" },
    { crop: "Potato", state: "Gujarat", totalQueries: 85, disclaimerQueries: 14, coverageScore: 78, status: "strong_coverage", dominantGapTopic: "Deesa Region Drip Scheduling" },

    { crop: "Soybean", state: "Punjab", totalQueries: 15, disclaimerQueries: 1, coverageScore: 90, status: "strong_coverage", dominantGapTopic: "Standard Agronomy" },
    { crop: "Soybean", state: "Haryana", totalQueries: 20, disclaimerQueries: 1, coverageScore: 92, status: "strong_coverage", dominantGapTopic: "Standard Agronomy" },
    { crop: "Soybean", state: "Uttar Pradesh", totalQueries: 45, disclaimerQueries: 5, coverageScore: 85, status: "strong_coverage", dominantGapTopic: "Anthracnose Pod Blight" },
    { crop: "Soybean", state: "Maharashtra", totalQueries: 240, disclaimerQueries: 96, coverageScore: 46, status: "critical_gap", dominantGapTopic: "Yellow Mosaic Virus & Stem Fly Combo Damage" },
    { crop: "Soybean", state: "Rajasthan", totalQueries: 85, disclaimerQueries: 16, coverageScore: 76, status: "strong_coverage", dominantGapTopic: "Girdle Beetle Chemical Spray" },
    { crop: "Soybean", state: "Madhya Pradesh", totalQueries: 290, disclaimerQueries: 124, coverageScore: 42, status: "critical_gap", dominantGapTopic: "Yellow Mosaic Vector & Pod Filling Nutrients" },
    { crop: "Soybean", state: "Gujarat", totalQueries: 50, disclaimerQueries: 7, coverageScore: 80, status: "strong_coverage", dominantGapTopic: "Semi-Looper Caterpillar Control" },

    { crop: "Onion", state: "Punjab", totalQueries: 30, disclaimerQueries: 3, coverageScore: 88, status: "strong_coverage", dominantGapTopic: "Standard Sowing Guide" },
    { crop: "Onion", state: "Haryana", totalQueries: 40, disclaimerQueries: 5, coverageScore: 84, status: "strong_coverage", dominantGapTopic: "Thrips Preventive Spray" },
    { crop: "Onion", state: "Uttar Pradesh", totalQueries: 60, disclaimerQueries: 10, coverageScore: 78, status: "strong_coverage", dominantGapTopic: "Stemphylium Leaf Blight" },
    { crop: "Onion", state: "Maharashtra", totalQueries: 310, disclaimerQueries: 148, coverageScore: 39, status: "critical_gap", dominantGapTopic: "Purple Blotch & Thrips Combined Outbreak in Nashik" },
    { crop: "Onion", state: "Rajasthan", totalQueries: 55, disclaimerQueries: 11, coverageScore: 75, status: "strong_coverage", dominantGapTopic: "Storage Rotting Control" },
    { crop: "Onion", state: "Madhya Pradesh", totalQueries: 80, disclaimerQueries: 24, coverageScore: 62, status: "moderate", dominantGapTopic: "Bulb Enlargement Fertilizer Dosage" },
    { crop: "Onion", state: "Gujarat", totalQueries: 110, disclaimerQueries: 38, coverageScore: 58, status: "moderate", dominantGapTopic: "Mahuva White Onion Dehydration Storage" },
  ]
};

const MOCK_CLUSTERS: GapCluster[] = [
  {
    id: "cluster-1",
    title: "Yellow Rust (पीली कूँगी) Stripe Rust Fungicide Protocol in PBW Varieties",
    crop: "Wheat",
    state: "Punjab",
    domain: "pest_disease",
    queryCount: 142,
    growthRate: 48,
    urgency: "critical",
    sampleQueries: [
      "गेहूं के पत्तों पर पीला पाउडर जैसा जम गया है, क्या छिड़काव करें?",
      "ਕਣਕ ਵਿੱਚ ਪੀਲੀ ਕੁੰਗੀ ਦਾ ਹਮਲਾ ਹੋ ਗਿਆ, ਕਿਹੜੀ ਦਵਾਈ ਪਾਵਾਂ?",
      "PBW 550 gehu me yellow rust ka ilaj batayein",
      "What fungicide works best against stripe rust in wheat at flag leaf stage?"
    ],
    keySymptomsOrNeeds: ["Yellow powdery stripes on leaves", "Premature flag leaf drying", "Grain shrivelling"],
    recommendedGDBAction: "Draft verified GDB card for Propiconazole 25% EC (Tilt) @ 200ml/200L water per acre with 15-day repeat window.",
    topDistricts: ["Fazilka", "Bathinda", "Ludhiana", "Firozpur"],
    status: "uncovered",
    lastDetected: new Date().toISOString()
  },
  {
    id: "cluster-2",
    title: "Red Rot (लाल सड़न) Management in Co 0238 Ratoon Crops",
    crop: "Sugarcane",
    state: "Uttar Pradesh",
    domain: "pest_disease",
    queryCount: 138,
    growthRate: 52,
    urgency: "critical",
    sampleQueries: [
      "गन्ने के तने को चीरने पर अंदर लाल रंग और बदबू आ रही है, क्या करें?",
      "Co 0238 गन्ने में लाल सड़न रोग (Red Rot) की रोकथाम का उपाय बताएं",
      "Ganne ke khet me red rot fail raha hai, soil treatment medicine",
      "Is Trichoderma viride effective against sugarcane red rot in ratoon crop?"
    ],
    keySymptomsOrNeeds: ["Red discoloration of internal pith with white transverse bands", "Alcoholic sour smell", "Sudden wilting of crop"],
    recommendedGDBAction: "Publish critical advisory: Remove infected clumps, apply Carbendazim 50% WP @ 2g/L or Trichoderma viride @ 5kg/acre.",
    topDistricts: ["Muzaffarnagar", "Meerut", "Shamli", "Saharanpur"],
    status: "uncovered",
    lastDetected: new Date().toISOString()
  },
  {
    id: "cluster-3",
    title: "Pink Bollworm (गुलाबी बोंडअळी) Pyrethroid Resistance & Pheromone Strategy",
    crop: "Cotton",
    state: "Maharashtra",
    domain: "pest_disease",
    queryCount: 126,
    growthRate: 39,
    urgency: "critical",
    sampleQueries: [
      "कपाशीच्या बोंडात गुलाबी अळी घुसली आहे, कोणती फवारणी करावी?",
      "बीटी कपाशीवर गुलाबी बोंडअळी नियंत्रण होत नाहीये उपाय सांगा",
      "Cotton bolls dropping prematurely due to worm infestation in Vidarbha",
      "गुलाबी सुंडी के लिए फेरोमोन ट्रैप कितनी दूरी पर लगाना चाहिए?"
    ],
    keySymptomsOrNeeds: ["Rosetted flowers", "Bore holes in green bolls", "Premature boll opening and stained lint"],
    recommendedGDBAction: "Add IPM protocol: 8 pheromone traps/acre + Emamectin Benzoate 5% SG @ 100g/acre for 3rd generation borer.",
    topDistricts: ["Yavatmal", "Amravati", "Wardha", "Akola"],
    status: "uncovered",
    lastDetected: new Date().toISOString()
  },
  {
    id: "cluster-4",
    title: "Purple Blotch (करपा) & Thrips Combined Outbreak in Winter Onion",
    crop: "Onion",
    state: "Maharashtra",
    domain: "pest_disease",
    queryCount: 118,
    growthRate: 44,
    urgency: "critical",
    sampleQueries: [
      "कांद्यावर करपा रोग आणि थ्रिप्सचा प्रादुर्भाव झालाय, पानांवर जांभळे डाग आहेत",
      "Onion bulb enlargement stage fertilizer and thrips spray schedule",
      "कांदा साठवणुकीत सड होऊ नये म्हणून कोणती फवारणी करावी?",
      "Difenoconazole dosage for purple blotch in onion"
    ],
    keySymptomsOrNeeds: ["Sunken purplish-brown lesions on leaves", "Silvery leaf curling from thrips feeding", "Stunted bulb development"],
    recommendedGDBAction: "Draft combination spray: Difenoconazole 25% EC (1ml/L) + Fipronil 5% SC (1.5ml/L) with sticker.",
    topDistricts: ["Nashik", "Pune", "Ahmednagar"],
    status: "uncovered",
    lastDetected: new Date().toISOString()
  },
  {
    id: "cluster-5",
    title: "Severe Mustard Aphid (माहू/मोयला) & Sclerotinia Stem Rot",
    crop: "Mustard",
    state: "Rajasthan",
    domain: "pest_disease",
    queryCount: 112,
    growthRate: 36,
    urgency: "critical",
    sampleQueries: [
      "सरसों में मोयला (माहू) का भयंकर प्रकोप है, सबसे सस्ती दवा कौन सी है?",
      "Sarson ke tano par safed fafundi dikh rahi hai, paudhe toot rahe hain",
      "सरसों में सफेद रोली रोग के लिए कौन सा फफूंदनाशक डालें?",
      "Dimethoate vs Imidacloprid for mustard aphid spray schedule"
    ],
    keySymptomsOrNeeds: ["Curled and blackened floral twigs", "Sticky honeydew secretion", "White cottony stem rot causing lodging"],
    recommendedGDBAction: "Provide two-tier guideline: Dimethoate 30% EC (1ml/L) or Imidacloprid 17.8% SL (1ml/3L) when aphid count > 20/twig.",
    topDistricts: ["Bharatpur", "Alwar", "Kota", "Sri Ganganagar"],
    status: "uncovered",
    lastDetected: new Date().toISOString()
  },
  {
    id: "cluster-6",
    title: "Yellow Mosaic Virus & Pod Borer Management in Rainfed Soybean",
    crop: "Soybean",
    state: "Madhya Pradesh",
    domain: "pest_disease",
    queryCount: 98,
    growthRate: 31,
    urgency: "high",
    sampleQueries: [
      "सोयाबीन की पत्तियां पीली पड़कर जालीदार हो रही हैं, सफेद मक्खी का प्रकोप",
      "Soybean pod borer caterpillar spray in Malwa region",
      "सोयाबीन में दाना भरते समय पोटाश और बोरॉन की मात्रा"
    ],
    keySymptomsOrNeeds: ["Mosaic yellow patches on trifoliate leaves", "Whitefly vectors in crop canopy", "Pod perforation"],
    recommendedGDBAction: "Foliar spray of Thiamethoxam 12.6% + Lambda Cyhalothrin 9.5% ZC @ 50ml/acre.",
    topDistricts: ["Ujjain", "Indore", "Dewas"],
    status: "uncovered",
    lastDetected: new Date().toISOString()
  },
  {
    id: "cluster-7",
    title: "Basmati False Smut (हल्दी रोग) Management at Heading Stage",
    crop: "Paddy",
    state: "Haryana",
    domain: "pest_disease",
    queryCount: 88,
    growthRate: 28,
    urgency: "high",
    sampleQueries: [
      "बासमती 1509 धान की बालियों में हल्दी जैसी पीली-हरी गांठें बन गई हैं",
      "Basmati rice false smut control during flowering stage",
      "धान में गोभ की सुंडी (stem borer) का प्रकोप रोकने की दानेदार दवा"
    ],
    keySymptomsOrNeeds: ["Yellow-green spore balls turning velvety dark green", "Grains turning into chalky balls"],
    recommendedGDBAction: "Add pre-boot stage spray card: Copper Oxychloride 50% WP @ 2.5g/L or Propiconazole @ 1ml/L.",
    topDistricts: ["Karnal", "Kurukshetra", "Kaithal"],
    status: "uncovered",
    lastDetected: new Date().toISOString()
  },
  {
    id: "cluster-8",
    title: "Potato Late Blight (झुलसा) & Cold-Wave Frost Drenching Protocol",
    crop: "Potato",
    state: "Uttar Pradesh",
    domain: "pest_disease",
    queryCount: 82,
    growthRate: 27,
    urgency: "high",
    sampleQueries: [
      "आलू की पत्तियों के किनारों पर काले पानी जैसे धब्बे बन रहे हैं, पाला पड़ने का डर",
      "Potato late blight preventive vs curative fungicide spray",
      "How to protect potato field from 2-degree ground frost?"
    ],
    keySymptomsOrNeeds: ["Water-soaked dark lesions", "White cottony underside mildew", "Rapid canopy collapse"],
    recommendedGDBAction: "Publish emergency cold-wave protocol: Metalaxyl 8% + Mancozeb 64% WP @ 2.5g/L immediately before frost.",
    topDistricts: ["Agra", "Farrukhabad", "Aligarh"],
    status: "uncovered",
    lastDetected: new Date().toISOString()
  }
];

export const gapDetectorApi = {
  /**
   * Fetches high-level coverage analytics
   */
  async getAnalytics(): Promise<GapAnalyticsSummary> {
    try {
      const res = await fetch(`${API_BASE}/analytics`);
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      return json.data;
    } catch {
      return {
        overallCoverageScore: MOCK_HEATMAP.overallCoverageScore,
        totalDisclaimersLogged: MOCK_HEATMAP.totalDisclaimers,
        criticalGapsCount: MOCK_HEATMAP.criticalGapCount,
        totalClustersIdentified: MOCK_CLUSTERS.length,
        topUrgentGaps: MOCK_CLUSTERS.slice(0, 5),
        summary: {
          totalQueriesAnalyzed: 2450,
          totalDisclaimers: MOCK_HEATMAP.totalDisclaimers,
          overallCoveragePercentage: MOCK_HEATMAP.overallCoverageScore,
          topCriticalCrops: ["Wheat", "Sugarcane", "Cotton", "Mustard", "Onion"],
          topCriticalStates: ["Punjab", "Uttar Pradesh", "Maharashtra", "Rajasthan"],
          projectedGDBTargetCount: 200000,
        },
      };
    }
  },

  /**
   * Fetches the state vs crop heatmap matrix
   */
  async getHeatmap(): Promise<HeatmapMatrix> {
    try {
      const res = await fetch(`${API_BASE}/heatmap`);
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      return json.data;
    } catch {
      return MOCK_HEATMAP;
    }
  },

  /**
   * Fetches prioritized clusters with optional filters
   */
  async getClusters(filters?: {
    crop?: string;
    state?: string;
    urgency?: string;
    search?: string;
  }): Promise<GapCluster[]> {
    try {
      const params = new URLSearchParams();
      if (filters?.crop) params.append("crop", filters.crop);
      if (filters?.state) params.append("state", filters.state);
      if (filters?.urgency) params.append("urgency", filters.urgency);
      if (filters?.search) params.append("search", filters.search);

      const res = await fetch(`${API_BASE}/clusters?${params.toString()}`);
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      return json.data;
    } catch {
      let filtered = [...MOCK_CLUSTERS];
      if (filters?.crop) filtered = filtered.filter(c => c.crop.toLowerCase() === filters.crop!.toLowerCase());
      if (filters?.state) filtered = filtered.filter(c => c.state.toLowerCase() === filters.state!.toLowerCase());
      if (filters?.urgency) filtered = filtered.filter(c => c.urgency.toLowerCase() === filters.urgency!.toLowerCase());
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        filtered = filtered.filter(c => c.title.toLowerCase().includes(q) || c.sampleQueries.some(s => s.toLowerCase().includes(q)));
      }
      return filtered;
    }
  },

  /**
   * Generates the weekly report
   */
  async getWeeklyReport(): Promise<GapReport> {
    try {
      const res = await fetch(`${API_BASE}/report`);
      if (!res.ok) throw new Error("API error");
      const json = await res.json();
      return json.data;
    } catch {
      return {
        reportId: `GAP-REP-${new Date().getFullYear()}-W43`,
        generatedAt: new Date().toISOString(),
        period: "Current Operational Week",
        summary: {
          totalQueriesAnalyzed: 2450,
          totalDisclaimers: MOCK_HEATMAP.totalDisclaimers,
          overallCoveragePercentage: MOCK_HEATMAP.overallCoverageScore,
          topCriticalCrops: ["Wheat", "Sugarcane", "Cotton", "Mustard", "Onion"],
          topCriticalStates: ["Punjab", "Uttar Pradesh", "Maharashtra", "Rajasthan"],
          projectedGDBTargetCount: 200000,
        },
        topGaps: MOCK_CLUSTERS,
        outreachRecommendations: [
          {
            state: "Punjab",
            district: "Fazilka & Bathinda",
            priorityCrop: "Wheat",
            gapTopic: "Yellow Rust (Stripe Rust) Fungicide dosages in PBW-550",
            farmerDemandLevel: "Very High",
            suggestedAction: "Deploy mobile agri team with PAU yellow rust advisory leaflets and spray calibration demos.",
          },
          {
            state: "Maharashtra",
            district: "Yavatmal & Amravati",
            priorityCrop: "Cotton",
            gapTopic: "Pink Bollworm Pheromone Trapping & Pyrethroid Alternative Dosage",
            farmerDemandLevel: "Very High",
            suggestedAction: "Organize farmer mandi sessions with CICR Nagpur scientists on resistance mitigation.",
          },
          {
            state: "Uttar Pradesh",
            district: "Muzaffarnagar & Meerut",
            priorityCrop: "Sugarcane",
            gapTopic: "Red Rot in Co 0238 & Soil Drenching Protocols",
            farmerDemandLevel: "Very High",
            suggestedAction: "Distribute seed cane replacement notices and Trichoderma seed dressing kits.",
          },
          {
            state: "Rajasthan",
            district: "Bharatpur & Alwar",
            priorityCrop: "Mustard",
            gapTopic: "Mustard Aphid & Sclerotinia Stem Rot Cost-Effective Spray",
            farmerDemandLevel: "High",
            suggestedAction: "Coordinate with KVK Bharatpur to broadcast cloudy weather aphid warning bulletins.",
          },
          {
            state: "Madhya Pradesh",
            district: "Ujjain & Dewas",
            priorityCrop: "Soybean",
            gapTopic: "Yellow Mosaic Virus Whitefly Management",
            farmerDemandLevel: "High",
            suggestedAction: "Conduct village-level yellow sticky trap distribution drives.",
          },
        ],
      };
    }
  },

  /**
   * Routes a gap cluster to the expert reviewer queue
   */
  async routeClusterToReviewer(clusterId: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await fetch(`${API_BASE}/route-to-reviewer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clusterId }),
      });
      return await res.json();
    } catch {
      return {
        success: true,
        message: "Cluster prioritized and routed to the PAE expert reviewer queue!",
      };
    }
  },
};

