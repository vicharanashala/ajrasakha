export interface PlantKnowledge {
  benefits: string[];
  commonProblems: Array<{
    name: string;
    symptoms: string;
    treatment: string;
  }>;
  recommendations: string[];
}

const KNOWLEDGE: Record<string, PlantKnowledge> = {
  'Solanum tuberosum': {
    benefits: [
      'Provides carbohydrates that can support daily energy needs.',
      'Contains potassium and other micronutrients.',
      'Its skin can contribute additional fibre when properly prepared.',
    ],
    commonProblems: [
      {
        name: 'Late blight',
        symptoms: 'Dark, water-soaked lesions on leaves or stems; rapid browning under humid conditions.',
        treatment: 'Remove severely affected plant material and avoid overhead irrigation. Use locally approved fungicide guidance when disease is confirmed.',
      },
      {
        name: 'Early blight',
        symptoms: 'Brown leaf spots that may develop concentric rings, often starting on older leaves.',
        treatment: 'Remove heavily affected leaves, improve airflow, avoid prolonged leaf wetness, and follow locally approved disease-control guidance.',
      },
    ],
    recommendations: [
      'Keep foliage dry where practical and provide good airflow.',
      'Remove severely diseased plant material from the growing area.',
      'For suspected disease, confirm the diagnosis before applying crop-protection products.',
    ],
  },

  'Solanum lycopersicum': {
    benefits: [
      'Provides vitamin C and other antioxidants.',
      'Contains lycopene, a naturally occurring carotenoid.',
      'Can contribute useful vitamins and minerals to the diet.',
    ],
    commonProblems: [
      {
        name: 'Early blight',
        symptoms: 'Dark spots with concentric-ring patterns, commonly appearing on older leaves first.',
        treatment: 'Remove severely affected foliage, improve airflow, keep leaves dry, and follow locally approved disease-control guidance.',
      },
      {
        name: 'Bacterial spot',
        symptoms: 'Small dark lesions on leaves and fruit, sometimes surrounded by yellowing.',
        treatment: 'Avoid working with wet plants, remove heavily affected material, and use locally recommended management practices.',
      },
    ],
    recommendations: [
      'Water near the soil rather than wetting the foliage.',
      'Provide enough spacing for airflow around the plants.',
      'Inspect new growth regularly for spreading lesions or discoloration.',
    ],
  },

  'Oryza sativa': {
    benefits: [
      'Provides carbohydrates that are an important source of dietary energy.',
      'Can contribute small amounts of protein and micronutrients depending on variety and processing.',
    ],
    commonProblems: [
      {
        name: 'Rice blast',
        symptoms: 'Spindle-shaped lesions on leaves and other plant parts that can expand under favourable conditions.',
        treatment: 'Use balanced crop nutrition, avoid excessive nitrogen, and follow locally approved blast-management recommendations.',
      },
    ],
    recommendations: [
      'Monitor leaves regularly during humid periods.',
      'Avoid excessive nitrogen application.',
      'Use locally recommended varieties and disease-management practices.',
    ],
  },

  'Triticum aestivum': {
    benefits: [
      'Provides carbohydrates and plant protein.',
      'Whole-grain forms can provide more fibre and micronutrients.',
    ],
    commonProblems: [
      {
        name: 'Wheat rust',
        symptoms: 'Rust-coloured powdery pustules appearing on leaves or stems.',
        treatment: 'Monitor fields early, remove volunteer hosts where appropriate, and follow locally recommended rust-management practices.',
      },
    ],
    recommendations: [
      'Scout the crop regularly for changing leaf symptoms.',
      'Use locally recommended resistant varieties where available.',
      'Avoid unnecessary pesticide application without confirming the problem.',
    ],
  },

  'Zea mays': {
    benefits: [
      'Provides carbohydrates and energy.',
      'Can contribute fibre, vitamins, and minerals depending on variety and preparation.',
    ],
    commonProblems: [
      {
        name: 'Northern corn leaf blight',
        symptoms: 'Long grey-green to brown lesions that can enlarge across leaves.',
        treatment: 'Improve crop hygiene, monitor disease spread, and follow locally approved management recommendations when confirmed.',
      },
    ],
    recommendations: [
      'Inspect lower leaves early and continue scouting as the crop develops.',
      'Maintain field hygiene and manage crop residue according to local practice.',
      'Confirm disease before applying crop-protection products.',
    ],
  },

  'Abelmoschus esculentus': {
    benefits: [
      'Provides fibre and several vitamins and minerals.',
      'Contains mucilage, a naturally occurring soluble fibre.',
    ],
    commonProblems: [
      {
        name: 'Yellow vein mosaic',
        symptoms: 'Yellowing along leaf veins with a progressively mottled appearance.',
        treatment: 'Remove severely affected plants where locally recommended and manage insect vectors using approved practices.',
      },
    ],
    recommendations: [
      'Check young leaves frequently for unusual yellowing patterns.',
      'Monitor for insect vectors around new growth.',
      'Keep the field clean and remove severely affected material responsibly.',
    ],
  },

  'Capsicum annuum': {
    benefits: [
      'Can provide vitamin C and other antioxidants.',
      'Colourful varieties contain useful carotenoids and other plant compounds.',
    ],
    commonProblems: [
      {
        name: 'Bacterial spot',
        symptoms: 'Small dark lesions on leaves and fruit that can spread during wet conditions.',
        treatment: 'Avoid handling wet plants, reduce leaf wetness, remove severely affected material, and follow local management guidance.',
      },
    ],
    recommendations: [
      'Avoid unnecessary overhead irrigation.',
      'Inspect leaves and fruit for spreading spots.',
      'Use clean planting material and good field hygiene.',
    ],
  },

  'Solanum melongena': {
    benefits: [
      'Provides fibre and several vitamins and minerals.',
      'Contains anthocyanins and other antioxidant plant compounds, especially in darker-skinned varieties.',
    ],
    commonProblems: [
      {
        name: 'Bacterial wilt',
        symptoms: 'Sudden wilting despite adequate soil moisture, often progressing rapidly.',
        treatment: 'Remove affected plants and follow locally recommended soil, sanitation, and rotation practices.',
      },
    ],
    recommendations: [
      'Remove severely affected plants promptly.',
      'Avoid moving contaminated soil or tools between planting areas.',
      'Use healthy planting material and appropriate crop rotation practices.',
    ],
  },
};

function normalizeScientificName(name: string): string {
  return name
    .trim()
    .replace(/\s+L\.$/, '')
    .replace(/\s+Linn\.$/, '');
}

export class PlantKnowledgeService {
  getKnowledge(scientificName: string): PlantKnowledge | null {
    return KNOWLEDGE[normalizeScientificName(scientificName)] ?? null;
  }
}
