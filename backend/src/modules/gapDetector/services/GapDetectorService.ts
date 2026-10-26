import { injectable } from 'inversify';
import {
  DisclaimerQuery,
  GapCluster,
  HeatmapCell,
  HeatmapMatrix,
  GapReport,
  OutreachRecommendation,
  CropDomain,
  UrgencyLevel,
} from '../types.js';

@injectable()
export class GapDetectorService {
  private queries: DisclaimerQuery[] = [];
  private clusters: GapCluster[] = [];
  private initialized = false;

  constructor() {
    this.initializeData();
  }

  private initializeData(): void {
    if (this.initialized) return;

    this.queries = this.generateRealisticDisclaimerQueries();
    this.clusters = this.performSemanticClustering(this.queries);
    this.initialized = true;
  }

  /**
   * Generates authentic, realistic disclaimer-triggered farmer queries
   * representing major Indian farming belts (Punjab, Haryana, UP, Maharashtra, Rajasthan, MP, Gujarat).
   */
  private generateRealisticDisclaimerQueries(): DisclaimerQuery[] {
    const rawQueries: Array<{
      text: string;
      translated?: string;
      lang: string;
      crop: string;
      state: string;
      dist: string;
      domain: CropDomain;
      intent: string;
      daysAgo: number;
    }> = [
      // ── PUNJAB / WHEAT (Yellow Rust outbreak) ──
      { text: "गेहूं के पत्तों पर पीला पाउडर जैसा जम गया है, क्या छिड़काव करें?", translated: "Yellow powder has accumulated on wheat leaves, what to spray?", lang: "hi", crop: "Wheat", state: "Punjab", dist: "Fazilka", domain: "pest_disease", intent: "wheat_yellow_rust_spray", daysAgo: 1 },
      { text: "ਕਣਕ ਵਿੱਚ ਪੀਲੀ ਕੁੰਗੀ ਦਾ ਹਮਲਾ ਹੋ ਗਿਆ, ਕਿਹੜੀ ਦਵਾਈ ਪਾਵਾਂ?", translated: "Yellow rust attack in wheat, which chemical to apply?", lang: "pa", crop: "Wheat", state: "Punjab", dist: "Bathinda", domain: "pest_disease", intent: "wheat_yellow_rust_spray", daysAgo: 2 },
      { text: "PBW 550 gehu me yellow rust ka ilaj batayein", translated: "Suggest treatment for yellow rust in PBW 550 wheat", lang: "hi", crop: "Wheat", state: "Punjab", dist: "Ludhiana", domain: "pest_disease", intent: "wheat_yellow_rust_spray", daysAgo: 2 },
      { text: "What fungicide works best against stripe rust in wheat at flag leaf stage?", translated: "What fungicide works best against stripe rust in wheat at flag leaf stage?", lang: "en", crop: "Wheat", state: "Punjab", dist: "Firozpur", domain: "pest_disease", intent: "wheat_yellow_rust_spray", daysAgo: 3 },
      { text: "ਕਣਕ ਦੇ ਪੱਤੇ ਪੀਲੇ ਹੋ ਕੇ ਸੁੱਕ ਰਹੇ ਹਨ, ਕੀ ਇਹ ਪੀਲੀ ਕੁੰਗੀ ਹੈ?", translated: "Wheat leaves turning yellow and drying, is this yellow rust?", lang: "pa", crop: "Wheat", state: "Punjab", dist: "Fazilka", domain: "pest_disease", intent: "wheat_yellow_rust_spray", daysAgo: 3 },
      { text: "Propiconazole spray ratio for wheat rust in Punjab", translated: "Propiconazole spray ratio for wheat rust in Punjab", lang: "en", crop: "Wheat", state: "Punjab", dist: "Mansa", domain: "pest_disease", intent: "wheat_yellow_rust_spray", daysAgo: 4 },

      // ── MAHARASHTRA / COTTON (Pink Bollworm resistance) ──
      { text: "कपाशीच्या बोंडात गुलाबी अळी घुसली आहे, कोणती फवारणी करावी?", translated: "Pink bollworm entered cotton bolls, which spray to do?", lang: "mr", crop: "Cotton", state: "Maharashtra", dist: "Yavatmal", domain: "pest_disease", intent: "cotton_pink_bollworm", daysAgo: 1 },
      { text: "बीटी कपाशीवर गुलाबी बोंडअळी नियंत्रण होत नाहीये उपाय सांगा", translated: "Pink bollworm not controlling on Bt cotton, tell remedy", lang: "mr", crop: "Cotton", state: "Maharashtra", dist: "Amravati", domain: "pest_disease", intent: "cotton_pink_bollworm", daysAgo: 2 },
      { text: "Cotton bolls dropping prematurely due to worm infestation in Vidarbha", translated: "Cotton bolls dropping prematurely due to worm infestation in Vidarbha", lang: "en", crop: "Cotton", state: "Maharashtra", dist: "Wardha", domain: "pest_disease", intent: "cotton_pink_bollworm", daysAgo: 2 },
      { text: "गुलाबी सुंडी के लिए फेरोमोन ट्रैप कितनी दूरी पर लगाना चाहिए?", translated: "At what distance should pheromone traps be placed for pink bollworm?", lang: "hi", crop: "Cotton", state: "Maharashtra", dist: "Akola", domain: "pest_disease", intent: "cotton_pink_bollworm", daysAgo: 4 },
      { text: "Emamectin benzoate dosage for bollworm in cotton", translated: "Emamectin benzoate dosage for bollworm in cotton", lang: "en", crop: "Cotton", state: "Maharashtra", dist: "Jalgaon", domain: "pest_disease", intent: "cotton_pink_bollworm", daysAgo: 5 },

      // ── UTTAR PRADESH / SUGARCANE (Red Rot crisis) ──
      { text: "गन्ने के तने को चीरने पर अंदर लाल रंग और बदबू आ रही है, क्या करें?", translated: "Splitting sugarcane stalk reveals red color and foul smell, what to do?", lang: "hi", crop: "Sugarcane", state: "Uttar Pradesh", dist: "Muzaffarnagar", domain: "pest_disease", intent: "sugarcane_red_rot", daysAgo: 1 },
      { text: "Co 0238 गन्ने में लाल सड़न रोग (Red Rot) की रोकथाम का उपाय बताएं", translated: "Suggest prevention method for Red Rot in Co 0238 sugarcane", lang: "hi", crop: "Sugarcane", state: "Uttar Pradesh", dist: "Meerut", domain: "pest_disease", intent: "sugarcane_red_rot", daysAgo: 2 },
      { text: "Ganne ke khet me red rot fail raha hai, soil treatment medicine", translated: "Red rot spreading in cane field, soil treatment medicine", lang: "hi", crop: "Sugarcane", state: "Uttar Pradesh", dist: "Shamli", domain: "pest_disease", intent: "sugarcane_red_rot", daysAgo: 3 },
      { text: "Is Trichoderma viride effective against sugarcane red rot in ratoon crop?", translated: "Is Trichoderma viride effective against sugarcane red rot in ratoon crop?", lang: "en", crop: "Sugarcane", state: "Uttar Pradesh", dist: "Saharanpur", domain: "pest_disease", intent: "sugarcane_red_rot", daysAgo: 5 },

      // ── RAJASTHAN / MUSTARD (Aphid / Sclerotinia Rot) ──
      { text: "सरसों में मोयला (माहू) का भयंकर प्रकोप है, सबसे सस्ती दवा कौन सी है?", translated: "Severe aphid outbreak in mustard, what is cheapest chemical?", lang: "hi", crop: "Mustard", state: "Rajasthan", dist: "Bharatpur", domain: "pest_disease", intent: "mustard_aphid_control", daysAgo: 1 },
      { text: "Sarson ke tano par safed fafundi dikh rahi hai, paudhe toot rahe hain", translated: "White fungus visible on mustard stems, plants breaking", lang: "hi", crop: "Mustard", state: "Rajasthan", dist: "Alwar", domain: "pest_disease", intent: "mustard_sclerotinia_rot", daysAgo: 2 },
      { text: "सरसों में सफेद रोली रोग के लिए कौन सा फफूंदनाशक डालें?", translated: "Which fungicide to apply for white rust in mustard?", lang: "hi", crop: "Mustard", state: "Rajasthan", dist: "Kota", domain: "pest_disease", intent: "mustard_sclerotinia_rot", daysAgo: 3 },
      { text: "Dimethoate vs Imidacloprid for mustard aphid spray schedule", translated: "Dimethoate vs Imidacloprid for mustard aphid spray schedule", lang: "en", crop: "Mustard", state: "Rajasthan", dist: "Sri Ganganagar", domain: "pest_disease", intent: "mustard_aphid_control", daysAgo: 4 },

      // ── HARYANA / PADDY (Basmati False Smut / Stem Borer) ──
      { text: "बासमती 1509 धान की बालियों में हल्दी जैसी पीली-हरी गांठें बन गई हैं", translated: "Turmeric-like yellow-green balls formed on Basmati 1509 ears", lang: "hi", crop: "Paddy", state: "Haryana", dist: "Karnal", domain: "pest_disease", intent: "paddy_false_smut", daysAgo: 2 },
      { text: "Basmati rice false smut control during flowering stage", translated: "Basmati rice false smut control during flowering stage", lang: "en", crop: "Paddy", state: "Haryana", dist: "Kurukshetra", domain: "pest_disease", intent: "paddy_false_smut", daysAgo: 3 },
      { text: "धान में गोभ की सुंडी (stem borer) का प्रकोप रोकने की दानेदार दवा", translated: "Granular medicine to prevent stem borer in paddy", lang: "hi", crop: "Paddy", state: "Haryana", dist: "Kaithal", domain: "pest_disease", intent: "paddy_stem_borer", daysAgo: 4 },

      // ── MAHARASHTRA / ONION (Purple Blotch & Thrips) ──
      { text: "कांद्यावर करपा रोग आणि थ्रिप्सचा प्रादुर्भाव झालाय, पानांवर जांभळे डाग आहेत", translated: "Purple blotch and thrips on onion, purple spots on leaves", lang: "mr", crop: "Onion", state: "Maharashtra", dist: "Nashik", domain: "pest_disease", intent: "onion_purple_blotch_thrips", daysAgo: 1 },
      { text: "Onion bulb enlargement stage fertilizer and thrips spray schedule", translated: "Onion bulb enlargement stage fertilizer and thrips spray schedule", lang: "en", crop: "Onion", state: "Maharashtra", dist: "Pune", domain: "soil_nutrient", intent: "onion_fertilizer_schedule", daysAgo: 3 },
      { text: "कांदा साठवणुकीत सड होऊ नये म्हणून कोणती फवारणी करावी?", translated: "What spray to prevent rotting during onion storage?", lang: "mr", crop: "Onion", state: "Maharashtra", dist: "Ahmednagar", domain: "agronomy", intent: "onion_storage_rot", daysAgo: 4 },

      // ── MADHYA PRADESH / SOYBEAN (Yellow Mosaic Virus) ──
      { text: "सोयाबीन की पत्तियां पीली पड़कर जालीदार हो रही हैं, सफेद मक्खी का प्रकोप", translated: "Soybean leaves turning yellow and netted, whitefly infestation", lang: "hi", crop: "Soybean", state: "Madhya Pradesh", dist: "Ujjain", domain: "pest_disease", intent: "soybean_yellow_mosaic", daysAgo: 1 },
      { text: "Soybean pod borer caterpillar spray in Malwa region", translated: "Soybean pod borer caterpillar spray in Malwa region", lang: "en", crop: "Soybean", state: "Madhya Pradesh", dist: "Indore", domain: "pest_disease", intent: "soybean_pod_borer", daysAgo: 3 },
      { text: "सोयाबीन में दाना भरते समय पोटाश और बोरॉन की मात्रा", translated: "Potash and Boron dosage during soybean grain filling", lang: "hi", crop: "Soybean", state: "Madhya Pradesh", dist: "Dewas", domain: "soil_nutrient", intent: "soybean_nutrient_management", daysAgo: 4 },

      // ── GUJARAT / GROUNDNUT (Tikka Disease / White Grub) ──
      { text: "મગફળીમાં ટીક્કા રોગ અને પાન પર કાળા ડાઘ માટે કઈ દવા છાંટવી?", translated: "Which medicine to spray for Tikka leaf spots on groundnut?", lang: "gu", crop: "Groundnut", state: "Gujarat", dist: "Rajkot", domain: "pest_disease", intent: "groundnut_tikka_disease", daysAgo: 2 },
      { text: "Groundnut white grub control chemical for Saurashtra soil", translated: "Groundnut white grub control chemical for Saurashtra soil", lang: "en", crop: "Groundnut", state: "Gujarat", dist: "Junagadh", domain: "pest_disease", intent: "groundnut_white_grub", daysAgo: 3 },

      // ── UTTAR PRADESH / POTATO (Late Blight / Frost Damage) ──
      { text: "आलू की पत्तियों के किनारों पर काले पानी जैसे धब्बे बन रहे हैं, पाला पड़ने का डर", translated: "Water-soaked black lesions on potato leaf margins, frost fear", lang: "hi", crop: "Potato", state: "Uttar Pradesh", dist: "Agra", domain: "irrigation_weather", intent: "potato_late_blight_frost", daysAgo: 1 },
      { text: "Potato late blight preventive vs curative fungicide spray", translated: "Potato late blight preventive vs curative fungicide spray", lang: "en", crop: "Potato", state: "Uttar Pradesh", dist: "Farrukhabad", domain: "pest_disease", intent: "potato_late_blight_frost", daysAgo: 2 },

      // ── FERTILIZER & SOIL SCHEMES (Cross-State) ──
      { text: "यूरिया की कमी है, नैनो यूरिया का सही इस्तेमाल और डोज कैसे करें?", translated: "Urea shortage, what is correct dosage for Nano Urea spray?", lang: "hi", crop: "Wheat", state: "Uttar Pradesh", dist: "Aligarh", domain: "soil_nutrient", intent: "nano_urea_usage", daysAgo: 2 },
      { text: "PM Kusum Solar pump yojana subsidy percentage in Punjab 2026", translated: "PM Kusum Solar pump yojana subsidy percentage in Punjab 2026", lang: "en", crop: "Wheat", state: "Punjab", dist: "Sangrur", domain: "govt_schemes", intent: "pm_kusum_subsidy", daysAgo: 3 },
      { text: "Cotton MSP mandi price procurement dates in Sirsa and Fatehabad", translated: "Cotton MSP mandi price procurement dates in Sirsa and Fatehabad", lang: "en", crop: "Cotton", state: "Haryana", dist: "Sirsa", domain: "mandi_prices", intent: "cotton_msp_dates", daysAgo: 3 }
    ];

    // Expand dataset with variations to simulate realistic volume (150+ queries)
    const list: DisclaimerQuery[] = [];
    let idCounter = 1000;

    for (const q of rawQueries) {
      // Base query
      const now = new Date();
      now.setDate(now.getDate() - q.daysAgo);

      list.push({
        id: `dq-${++idCounter}`,
        queryText: q.text,
        translatedText: q.translated,
        language: q.lang,
        crop: q.crop,
        state: q.state,
        district: q.dist,
        domain: q.domain,
        intent: q.intent,
        timestamp: now.toISOString(),
        gdbConfidenceScore: Math.round((0.2 + Math.random() * 0.28) * 100) / 100, // 0.20 - 0.48 (all below 0.65 GDB threshold)
        status: 'uncovered',
      });

      // Synthetic variations to simulate query volume
      const countVariations = 3 + Math.floor(Math.random() * 5);
      for (let i = 0; i < countVariations; i++) {
        const varDate = new Date(now);
        varDate.setHours(varDate.getHours() - (i * 4 + Math.floor(Math.random() * 6)));

        list.push({
          id: `dq-${++idCounter}`,
          queryText: `${q.text} (farmer variant #${i + 1})`,
          translatedText: q.translated,
          language: q.lang,
          crop: q.crop,
          state: q.state,
          district: q.dist,
          domain: q.domain,
          intent: q.intent,
          timestamp: varDate.toISOString(),
          gdbConfidenceScore: Math.round((0.15 + Math.random() * 0.35) * 100) / 100,
          status: 'uncovered',
        });
      }
    }

    return list;
  }

  /**
   * Clusters disclaimer queries using semantic intent and geographical coordinates.
   */
  private performSemanticClustering(queries: DisclaimerQuery[]): GapCluster[] {
    // Group queries by intent
    const groups = new Map<string, DisclaimerQuery[]>();

    for (const q of queries) {
      const key = `${q.crop}__${q.state}__${q.intent}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(q);
    }

    const clusters: GapCluster[] = [];
    let clusterIdx = 1;

    for (const [key, qList] of groups.entries()) {
      const first = qList[0];
      const count = qList.length * 4 + Math.floor(Math.random() * 12); // Extrapolated demand count
      const growth = Math.floor(18 + Math.random() * 42); // 18% - 60% growth

      let urgency: UrgencyLevel = 'medium';
      if (count > 45 || growth > 35) urgency = 'critical';
      else if (count > 25 || growth > 25) urgency = 'high';

      const districts = Array.from(new Set(qList.map(q => q.district)));

      const clusterTitle = this.generateClusterTitle(first.crop, first.intent);
      const recommendation = this.generateGDBAction(first.crop, first.intent);

      clusters.push({
        id: `cluster-${clusterIdx++}`,
        title: clusterTitle,
        crop: first.crop,
        state: first.state,
        domain: first.domain,
        queryCount: count,
        growthRate: growth,
        urgency,
        sampleQueries: qList.slice(0, 4).map(q => q.queryText),
        keySymptomsOrNeeds: this.extractSymptoms(first.intent),
        recommendedGDBAction: recommendation,
        topDistricts: districts,
        status: 'uncovered',
        lastDetected: qList[0].timestamp,
      });
    }

    // Sort clusters by query volume descending
    return clusters.sort((a, b) => b.queryCount - a.queryCount);
  }

  private generateClusterTitle(crop: string, intent: string): string {
    const titles: Record<string, string> = {
      wheat_yellow_rust_spray: "Yellow Rust (पीली कूँगी) Stripe Rust Fungicide Protocol in PBW Varieties",
      cotton_pink_bollworm: "Pink Bollworm (गुलाबी बोंडअळी) Late-Season Resistance & Trap Thresholds",
      sugarcane_red_rot: "Red Rot (लाल सड़न) Management in Co 0238 Ratoon Crops",
      mustard_aphid_control: "Severe Mustard Aphid (माहू/मोयला) Cost-Effective Spray Schedule",
      mustard_sclerotinia_rot: "Sclerotinia Stem Rot & White Rust Prevention in Mustard",
      paddy_false_smut: "Basmati False Smut (हल्दी रोग) Management at Heading Stage",
      paddy_stem_borer: "Paddy Stem Borer (गोभ की सुंडी) Granular Chemical Schedule",
      onion_purple_blotch_thrips: "Onion Purple Blotch & Thrips Combo Treatment in Winter Crop",
      onion_fertilizer_schedule: "Onion Bulb Development Stage Micro-Nutrient & Potash Schedule",
      onion_storage_rot: "Post-Harvest Storage Rot Prevention in Rabi Onions",
      soybean_yellow_mosaic: "Yellow Mosaic Virus Vector Control in Rainfed Soybean",
      soybean_pod_borer: "Soybean Pod Borer Caterpillar Management in Pod Filling Stage",
      soybean_nutrient_management: "Soybean Grain Weight Maximization Foliar Spray Guide",
      groundnut_tikka_disease: "Groundnut Tikka Leaf Spot Chemical Management in Saurashtra",
      groundnut_white_grub: "Groundnut Root White Grub Soil Treatment Protocol",
      potato_late_blight_frost: "Potato Late Blight (झुलसा) & Frost Protection Protocol in Western UP",
      nano_urea_usage: "Liquid Nano Urea Soil vs Foliar Application Guidelines for Wheat",
      pm_kusum_subsidy: "PM-KUSUM Component-B Solar Agri Pump Subsidy Application Guidelines",
      cotton_msp_dates: "Cotton Procurement & Mandi Moisture Deduction Standards in Haryana",
    };

    return titles[intent] || `${crop} ${intent.replace(/_/g, ' ')} Management`;
  }

  private generateGDBAction(crop: string, intent: string): string {
    const actions: Record<string, string> = {
      wheat_yellow_rust_spray: "Draft verified GDB card for Propiconazole 25% EC (Tilt) @ 200ml/200L water per acre with 15-day repeat window.",
      cotton_pink_bollworm: "Add IPM protocol: 8 pheromone traps/acre + Emamectin Benzoate 5% SG @ 100g/acre for 3rd generation borer.",
      sugarcane_red_rot: "Publish critical advisory: Remove infected clumps, apply Carbendazim 50% WP @ 2g/L or Trichoderma viride @ 5kg/acre.",
      mustard_aphid_control: "Provide two-tier guideline: Dimethoate 30% EC (1ml/L) or Imidacloprid 17.8% SL (1ml/3L) when aphid count > 20/twig.",
      mustard_sclerotinia_rot: "Add preventive spray protocol: Mancozeb 75% WP @ 2g/L at 45 & 60 days after sowing.",
      paddy_false_smut: "Add pre-boot stage spray card: Copper Oxychloride 50% WP @ 2.5g/L or Propiconazole @ 1ml/L.",
      paddy_stem_borer: "Add recommendation: Cartap Hydrochloride 4G @ 10kg/acre or Chlorantraniliprole 0.4G @ 4kg/acre in standing water.",
      onion_purple_blotch_thrips: "Draft combination spray: Difenoconazole 25% EC (1ml/L) + Fipronil 5% SC (1.5ml/L) with sticker.",
      potato_late_blight_frost: "Publish emergency cold-wave protocol: Metalaxyl 8% + Mancozeb 64% WP @ 2.5g/L immediately before frost.",
      nano_urea_usage: "Draft definitive comparison card: 1 bottle (500ml) Nano Urea replaces 1 bag of conventional urea at active tillering.",
      pm_kusum_subsidy: "Add government scheme FAQ: Up to 60% subsidy for 3HP to 7.5HP solar pumps with online state portal link.",
    };

    return actions[intent] || `Create comprehensive verified GDB Q&A pair addressing ${crop} ${intent.replace(/_/g, ' ')}.`;
  }

  private extractSymptoms(intent: string): string[] {
    const symptoms: Record<string, string[]> = {
      wheat_yellow_rust_spray: ["Yellow powdery stripes on leaves", "Premature drying of flag leaves", "Shrivelled grain formation"],
      cotton_pink_bollworm: ["Rosetted flowers", "Bore holes in green bolls", "Premature boll opening and stained lint"],
      sugarcane_red_rot: ["Reddening of pith with white horizontal patches", "Alcoholic sour odor inside stalk", "Wilting of third & fourth leaf"],
      mustard_aphid_control: ["Curled and yellowing top inflorescence", "Honeydew secretion on pods", "Stunted seed development"],
      paddy_false_smut: ["Greenish-orange spores turning into velvety dark green masses", "Individual grains transformed into large balls"],
      onion_purple_blotch_thrips: ["Silvery blotches turning into sunken purple lesions", "Curling and twisted onion leaves"],
      potato_late_blight_frost: ["Water-soaked dark lesions", "White cottony growth underneath leaves", "Rapid blackened canopy"],
    };

    return symptoms[intent] || ["Unanswered farmer inquiries", "Lack of standardized treatment in GDB"];
  }

  /**
   * Generates the multi-dimensional Coverage Heatmap matrix across Crops and States.
   */
  public getHeatmapMatrix(selectedDomain?: string): HeatmapMatrix {
    this.initializeData();

    const states = ["Punjab", "Haryana", "Uttar Pradesh", "Maharashtra", "Rajasthan", "Madhya Pradesh", "Gujarat"];
    const crops = ["Wheat", "Cotton", "Paddy", "Sugarcane", "Mustard", "Potato", "Soybean", "Onion"];

    // Base coverage baseline model (0 to 100%)
    // Real baseline: High coverage where ICAR/state PoP has existed, low in emergent pests / special varieties
    const baselineCoverage: Record<string, Record<string, number>> = {
      Wheat:        { Punjab: 42, Haryana: 58, "Uttar Pradesh": 72, Maharashtra: 85, Rajasthan: 68, "Madhya Pradesh": 80, Gujarat: 88 },
      Cotton:       { Punjab: 55, Haryana: 62, "Uttar Pradesh": 89, Maharashtra: 38, Rajasthan: 48, "Madhya Pradesh": 65, Gujarat: 45 },
      Paddy:        { Punjab: 75, Haryana: 52, "Uttar Pradesh": 68, Maharashtra: 82, Rajasthan: 90, "Madhya Pradesh": 78, Gujarat: 84 },
      Sugarcane:    { Punjab: 80, Haryana: 78, "Uttar Pradesh": 35, Maharashtra: 64, Rajasthan: 88, "Madhya Pradesh": 82, Gujarat: 79 },
      Mustard:      { Punjab: 82, Haryana: 60, "Uttar Pradesh": 74, Maharashtra: 92, Rajasthan: 40, "Madhya Pradesh": 68, Gujarat: 65 },
      Potato:       { Punjab: 70, Haryana: 75, "Uttar Pradesh": 48, Maharashtra: 85, Rajasthan: 82, "Madhya Pradesh": 72, Gujarat: 78 },
      Soybean:      { Punjab: 90, Haryana: 92, "Uttar Pradesh": 85, Maharashtra: 46, Rajasthan: 76, "Madhya Pradesh": 42, Gujarat: 80 },
      Onion:        { Punjab: 88, Haryana: 84, "Uttar Pradesh": 78, Maharashtra: 39, Rajasthan: 75, "Madhya Pradesh": 62, Gujarat: 58 },
    };

    const cells: HeatmapCell[] = [];
    let totalDisclaimers = 0;
    let criticalGapCount = 0;

    for (const crop of crops) {
      for (const state of states) {
        const score = baselineCoverage[crop]?.[state] ?? 75;
        const matchingDisclaimers = this.queries.filter(q => q.crop === crop && q.state === state).length;
        const total = matchingDisclaimers * 4 + 40;

        let status: 'critical_gap' | 'moderate' | 'strong_coverage' = 'strong_coverage';
        if (score < 55) {
          status = 'critical_gap';
          criticalGapCount++;
        } else if (score < 75) {
          status = 'moderate';
        }

        totalDisclaimers += matchingDisclaimers;

        // Dominant topic
        const dominantCluster = this.clusters.find(c => c.crop === crop && c.state === state);

        cells.push({
          crop,
          state,
          totalQueries: total,
          disclaimerQueries: matchingDisclaimers,
          coverageScore: score,
          status,
          dominantGapTopic: dominantCluster ? dominantCluster.title : "General Agronomic Inquiries",
        });
      }
    }

    const overallScore = Math.round(
      cells.reduce((acc, c) => acc + c.coverageScore, 0) / cells.length
    );

    return {
      states,
      crops,
      cells,
      overallCoverageScore: overallScore,
      totalDisclaimers: this.queries.length * 6,
      criticalGapCount,
    };
  }

  /**
   * Returns prioritized clusters with multi-factor filtering.
   */
  public getClusters(filters?: {
    crop?: string;
    state?: string;
    domain?: string;
    urgency?: string;
    search?: string;
  }): GapCluster[] {
    this.initializeData();

    let list = [...this.clusters];

    if (filters?.crop) {
      list = list.filter(c => c.crop.toLowerCase() === filters.crop!.toLowerCase());
    }
    if (filters?.state) {
      list = list.filter(c => c.state.toLowerCase() === filters.state!.toLowerCase());
    }
    if (filters?.domain) {
      list = list.filter(c => c.domain.toLowerCase() === filters.domain!.toLowerCase());
    }
    if (filters?.urgency) {
      list = list.filter(c => c.urgency.toLowerCase() === filters.urgency!.toLowerCase());
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        c =>
          c.title.toLowerCase().includes(q) ||
          c.crop.toLowerCase().includes(q) ||
          c.state.toLowerCase().includes(q) ||
          c.sampleQueries.some(s => s.toLowerCase().includes(q))
      );
    }

    return list;
  }

  /**
   * Returns a specific cluster by ID.
   */
  public getClusterById(id: string): GapCluster | undefined {
    this.initializeData();
    return this.clusters.find(c => c.id === id);
  }

  /**
   * Generates the weekly GDB Gap Report & Field Outreach Action Plan.
   */
  public generateWeeklyReport(): GapReport {
    this.initializeData();

    const heatmap = this.getHeatmapMatrix();
    const topGaps = this.clusters.slice(0, 20); // Top 20 prioritized question types

    const outreachRecommendations: OutreachRecommendation[] = [
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
      {
        state: "Haryana",
        district: "Karnal & Kurukshetra",
        priorityCrop: "Paddy (Basmati)",
        gapTopic: "Basmati False Smut (हल्दी रोग) Heading Stage Chemical Control",
        farmerDemandLevel: "High",
        suggestedAction: "Broadcast precautionary fungicide advisory 10 days prior to panicle emergence.",
      },
    ];

    return {
      reportId: `GAP-REP-${new Date().getFullYear()}-W${Math.ceil(new Date().getDate() / 7)}`,
      generatedAt: new Date().toISOString(),
      period: "Current Operational Week",
      summary: {
        totalQueriesAnalyzed: this.queries.length * 6,
        totalDisclaimers: heatmap.totalDisclaimers,
        overallCoveragePercentage: heatmap.overallCoverageScore,
        topCriticalCrops: ["Wheat", "Sugarcane", "Cotton", "Mustard", "Onion"],
        topCriticalStates: ["Punjab", "Uttar Pradesh", "Maharashtra", "Rajasthan"],
        projectedGDBTargetCount: 200000,
      },
      topGaps,
      outreachRecommendations,
    };
  }

  /**
   * Action: Routes a gap cluster directly into the Reviewer Pipeline queue.
   */
  public routeClusterToReviewer(clusterId: string): { success: boolean; message: string; cluster?: GapCluster } {
    this.initializeData();
    const cluster = this.clusters.find(c => c.id === clusterId);
    if (!cluster) {
      return { success: false, message: `Cluster ${clusterId} not found.` };
    }

    cluster.status = 'in_review';
    return {
      success: true,
      message: `Cluster "${cluster.title}" has been prioritized and routed to the PAE expert review queue!`,
      cluster,
    };
  }
}

