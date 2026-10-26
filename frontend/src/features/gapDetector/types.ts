export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

export type CropDomain =
  | 'pest_disease'
  | 'soil_nutrient'
  | 'irrigation_weather'
  | 'mandi_prices'
  | 'govt_schemes'
  | 'agronomy';

export interface GapCluster {
  id: string;
  title: string;
  crop: string;
  state: string;
  domain: CropDomain;
  queryCount: number;
  growthRate: number;
  urgency: UrgencyLevel;
  sampleQueries: string[];
  keySymptomsOrNeeds: string[];
  recommendedGDBAction: string;
  topDistricts: string[];
  status: 'uncovered' | 'in_review' | 'resolved';
  lastDetected: string;
}

export interface HeatmapCell {
  crop: string;
  state: string;
  totalQueries: number;
  disclaimerQueries: number;
  coverageScore: number;
  status: 'critical_gap' | 'moderate' | 'strong_coverage';
  dominantGapTopic: string;
}

export interface HeatmapMatrix {
  states: string[];
  crops: string[];
  cells: HeatmapCell[];
  overallCoverageScore: number;
  totalDisclaimers: number;
  criticalGapCount: number;
}

export interface OutreachRecommendation {
  state: string;
  district: string;
  priorityCrop: string;
  gapTopic: string;
  farmerDemandLevel: 'Very High' | 'High' | 'Moderate';
  suggestedAction: string;
}

export interface GapReport {
  reportId: string;
  generatedAt: string;
  period: string;
  summary: {
    totalQueriesAnalyzed: number;
    totalDisclaimers: number;
    overallCoveragePercentage: number;
    topCriticalCrops: string[];
    topCriticalStates: string[];
    projectedGDBTargetCount: number;
  };
  topGaps: GapCluster[];
  outreachRecommendations: OutreachRecommendation[];
}

export interface GapAnalyticsSummary {
  overallCoverageScore: number;
  totalDisclaimersLogged: number;
  criticalGapsCount: number;
  totalClustersIdentified: number;
  topUrgentGaps: GapCluster[];
  summary: GapReport['summary'];
}
