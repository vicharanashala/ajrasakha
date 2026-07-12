import { JsonController, Post, Body } from 'routing-controllers';
import { readFileSync } from 'fs';
import { join } from 'path';

// Load static data from JSON file
let SOIL_DATA: any;
try {
  const dataPath = join(process.cwd(), 'build', 'modules', 'soilHealth', 'soilData.json');
  SOIL_DATA = JSON.parse(readFileSync(dataPath, 'utf-8'));
} catch {
  SOIL_DATA = { states: {}, districts: {}, crops: {} };
}

// Simple fertilizer recommendation logic based on Indian agricultural guidelines
function getRecommendations(n: number, p: number, k: number, oc: number, crop?: string) {
  const recommendations: any[] = [];
  
  // Determine NPK status
  const nStatus = n < 280 ? 'low' : n < 560 ? 'medium' : 'high';
  const pStatus = p < 10 ? 'low' : p < 25 ? 'medium' : 'high';
  const kStatus = k < 108 ? 'low' : k < 280 ? 'medium' : 'high';
  
  // Calculate fertilizer doses (kg/ha) based on Indian Agricultural Research Institute guidelines
  let urea = 0, dap = 0, mop = 0;
  
  // Nitrogen recommendation
  if (nStatus === 'low') urea = 130;
  else if (nStatus === 'medium') urea = 65;
  
  // Phosphorus recommendation
  if (pStatus === 'low') dap = 100;
  else if (pStatus === 'medium') dap = 50;
  
  // Potassium recommendation
  if (kStatus === 'low') mop = 80;
  else if (kStatus === 'medium') mop = 40;
  
  // Adjust for organic carbon
  if (oc < 0.5) {
    urea = Math.round(urea * 1.2);
    dap = Math.round(dap * 1.1);
  }
  
  // Build primary recommendation
  const primaryFertilizers: any[] = [];
  const explanations: string[] = [];
  
  if (urea > 0) {
    primaryFertilizers.push({ name: 'Urea (46-0-0)', dosage: String(urea), unit: 'kg/ha' });
    if (nStatus === 'low') explanations.push('Nitrogen is low, so additional Urea is recommended.');
    else if (nStatus === 'medium') explanations.push('Nitrogen is moderate, so a balanced amount of Urea is suggested.');
  }
  
  if (dap > 0) {
    primaryFertilizers.push({ name: 'DAP (18-46-0)', dosage: String(dap), unit: 'kg/ha' });
    if (pStatus === 'low') explanations.push('Phosphorus is low, so DAP application is necessary.');
    else if (pStatus === 'medium') explanations.push('Phosphorus is adequate, so only a moderate amount of DAP is needed.');
  }
  
  if (mop > 0) {
    primaryFertilizers.push({ name: 'MOP (0-0-60)', dosage: String(mop), unit: 'kg/ha' });
    if (kStatus === 'low') explanations.push('Potassium is significantly deficient, so MOP is suggested.');
    else if (kStatus === 'medium') explanations.push('Potassium is slightly deficient, so MOP is recommended.');
  }
  
  if (oc < 0.5) {
    primaryFertilizers.push({ name: 'FYM (Farm Yard Manure)', dosage: '2500', unit: 'kg/ha' });
    explanations.push('Apply FYM to improve soil organic matter.');
  }
  
  // Alternative: NPK complex
  const altFertilizers: any[] = [];
  if (nStatus !== 'high' || pStatus !== 'high' || kStatus !== 'high') {
    altFertilizers.push({ name: 'NPK 10-26-26', dosage: '250', unit: 'kg/ha' });
    if (nStatus === 'low') altFertilizers.push({ name: 'Urea (Top Dress)', dosage: '65', unit: 'kg/ha' });
  }
  
  recommendations.push({
    crop: crop || 'General Recommendation',
    soilStatus: { nitrogen: nStatus, phosphorus: pStatus, potassium: kStatus, organicCarbon: oc < 0.5 ? 'low' : 'adequate' },
    primary: { fertilizers: primaryFertilizers },
    alternative: altFertilizers.length ? { fertilizers: altFertilizers } : undefined,
    explanations,
    notes: [
      'Based on Indian Agricultural Research Institute (IARI) guidelines',
      'Adjust doses based on local soil conditions and crop variety',
      'Apply fertilizers in split doses for better efficiency',
      'Consider soil test based fertilizer recommendation (STBFR) for precision',
    ]
  });
  
  return recommendations;
}

@JsonController('/soil-health')
export class SoilHealthController {
  @Post('/states')
  async getStates() {
    const states = Object.entries(SOIL_DATA.states).map(([name, _id]) => ({
      _id: _id as string,
      name
    }));
    return { success: true, states };
  }

  @Post('/districts')
  async getDistricts(@Body() body: { stateId: string }) {
    const districtsByState = SOIL_DATA.districts[body.stateId] || {};
    const districts = Object.entries(districtsByState).map(([name, _id]) => ({
      _id: _id as string,
      name
    }));
    return { success: true, districts };
  }

  @Post('/crops')
  async getCrops(@Body() body: { stateId: string }) {
    const cropsByState = SOIL_DATA.crops[body.stateId] || {};
    const crops = Object.entries(cropsByState).map(([name, id]) => ({
      _id: id as string,
      name,
      id: id as string
    }));
    return { success: true, crops };
  }

  @Post('/recommendations')
  async getRecommendations(@Body() body: {
    state: string;
    n: number;
    p: number;
    k: number;
    oc: number;
    district?: string;
    crops?: string[];
  }) {
    try {
      const cropName = body.crops?.[0] || 'General';
      const recommendations = getRecommendations(body.n, body.p, body.k, body.oc, cropName);
      return { success: true, recommendations };
    } catch (error: any) {
      return { success: false, error: error.message, recommendations: [] };
    }
  }
}
