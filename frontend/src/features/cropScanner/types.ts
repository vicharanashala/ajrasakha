export interface ICropDiagnosis {
  id: string;
  crop: string;
  diseaseName: string;
  hindiName: string;
  pathogen: string;
  confidence: number;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  description: string;
  chemicalControl: {
    medicineName: string;
    dosage: string;
    applicationMethod: string;
    waitingPeriod: string;
  };
  organicControl: {
    remedy: string;
    preparation: string;
  };
  preventiveMeasures: string[];
}
