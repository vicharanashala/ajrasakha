import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  Body,
  QueryParams,
  Authorized,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {injectable} from 'inversify';
import {IsString, IsNotEmpty, IsNumber, Min, Max} from 'class-validator';

class CalculateFertilizerDto {
  @IsString()
  @IsNotEmpty()
  crop!: string;

  @IsNumber()
  @Min(0.1)
  @Max(10000)
  areaInAcres!: number;

  @IsString()
  @IsNotEmpty()
  soilType!: string;

  @IsString()
  state?: string;
}

interface CropNPK {
  name: string;
  npk: {n: number; p: number; k: number};
  category: string;
}

interface SoilType {
  name: string;
  description: string;
  adjustments: {n: number; p: number; k: number};
}

const CROPS: CropNPK[] = [
  {name: 'Rice', npk: {n: 120, p: 60, k: 40}, category: 'Cereal'},
  {name: 'Wheat', npk: {n: 100, p: 50, k: 30}, category: 'Cereal'},
  {name: 'Maize', npk: {n: 150, p: 70, k: 50}, category: 'Cereal'},
  {name: 'Cotton', npk: {n: 100, p: 50, k: 50}, category: 'Cash Crop'},
  {name: 'Soybean', npk: {n: 30, p: 60, k: 30}, category: 'Pulse'},
  {name: 'Groundnut', npk: {n: 25, p: 50, k: 50}, category: 'Oilseed'},
  {name: 'Sugarcane', npk: {n: 300, p: 80, k: 100}, category: 'Sugar Crop'},
  {name: 'Banana', npk: {n: 180, p: 60, k: 150}, category: 'Fruit'},
  {name: 'Mango', npk: {n: 60, p: 30, k: 60}, category: 'Fruit'},
  {name: 'Potato', npk: {n: 180, p: 80, k: 120}, category: 'Vegetable'},
  {name: 'Onion', npk: {n: 80, p: 40, k: 40}, category: 'Vegetable'},
  {name: 'Tomato', npk: {n: 120, p: 60, k: 80}, category: 'Vegetable'},
];

const SOIL_TYPES: SoilType[] = [
  {
    name: 'Alluvial',
    description: 'Fertile soil found in river basins. Balanced nutrient retention.',
    adjustments: {n: 1.0, p: 1.0, k: 1.0},
  },
  {
    name: 'Black (Regur)',
    description: 'Rich in clay and calcium. Excellent moisture retention but low potassium.',
    adjustments: {n: 0.9, p: 0.85, k: 0.75},
  },
  {
    name: 'Red',
    description: 'Iron-rich, acidic soil with low phosphorus and organic matter.',
    adjustments: {n: 0.95, p: 1.2, k: 0.9},
  },
  {
    name: 'Laterite',
    description: 'Weathered tropical soil, acidic with low nutrient-holding capacity.',
    adjustments: {n: 1.1, p: 1.15, k: 1.1},
  },
  {
    name: 'Sandy',
    description: 'Well-drained but low nutrient retention. Frequent light applications recommended.',
    adjustments: {n: 1.05, p: 1.1, k: 1.1},
  },
];

const FERTILIZER_PRICES = {
  urea: {price: 266, bagWeight: 45, nContent: 0.46},
  dap: {price: 1350, bagWeight: 50, pContent: 0.18, nContent: 0.46},
  mop: {price: 350, bagWeight: 50, kContent: 0.6},
};

@OpenAPI({
  tags: ['fertilizer'],
  description: 'Fertilizer calculator for Indian crops',
})
@injectable()
@JsonController('/fertilizer')
export class FertilizerController {
  @OpenAPI({
    summary: 'Calculate fertilizer requirements for a crop',
    description:
      'Calculates NPK requirements, bag quantities, and cost estimates based on crop, area, and soil type.',
  })
  @Post('/calculate')
  @HttpCode(200)
  async calculateFertilizer(@Body() body: CalculateFertilizerDto) {
    const {crop, areaInAcres, soilType, state} = body;

    const cropData = CROPS.find(
      c => c.name.toLowerCase() === crop.toLowerCase(),
    );
    if (!cropData) {
      throw new Error(
        `Crop "${crop}" not supported. Available: ${CROPS.map(c => c.name).join(', ')}`,
      );
    }

    const soilData = SOIL_TYPES.find(
      s => s.name.toLowerCase() === soilType.toLowerCase(),
    );
    if (!soilData) {
      throw new Error(
        `Soil type "${soilType}" not supported. Available: ${SOIL_TYPES.map(s => s.name).join(', ')}`,
      );
    }

    const adjustedN =
      cropData.npk.n * soilData.adjustments.n * areaInAcres;
    const adjustedP =
      cropData.npk.p * soilData.adjustments.p * areaInAcres;
    const adjustedK =
      cropData.npk.k * soilData.adjustments.k * areaInAcres;

    const {urea, dap, mop} = FERTILIZER_PRICES;

    const dapContribN = adjustedP * (dap.nContent / dap.pContent);
    const remainingN = Math.max(0, adjustedN - dapContribN);

    const ureaBags =
      Math.ceil(remainingN / (urea.bagWeight * urea.nContent)) || 0;
    const dapBags =
      Math.ceil(adjustedP / (dap.bagWeight * dap.pContent)) || 0;
    const mopBags =
      Math.ceil(adjustedK / (mop.bagWeight * mop.kContent)) || 0;

    const ureaCost = ureaBags * urea.price;
    const dapCost = dapBags * dap.price;
    const mopCost = mopBags * mop.price;

    const totalCost = ureaCost + dapCost + mopCost;

    const applicationTips: string[] = [
      `Apply ${dapBags > 0 ? 'DAP' : 'Urea'} as basal dose at the time of sowing/planting.`,
      `Split ${cropData.npk.n > 100 ? 'nitrogen' : 'the fertilizer'} into 2-3 doses for better absorption.`,
      `Apply potassium during early growth and flowering stages.`,
      `Incorporate fertilizers into the top 10-15 cm of soil for best results.`,
    ];

    if (soilType.toLowerCase() === 'sandy') {
      applicationTips.push(
        'Sandy soil has low nutrient retention. Use smaller, more frequent doses.',
      );
    }
    if (soilType.toLowerCase() === 'black (regur)') {
      applicationTips.push(
        'Black soil retains moisture well. Avoid over-irrigation after fertilizer application.',
      );
    }
    if (cropData.npk.n > 150) {
      applicationTips.push(
        'This is a high-nitrogen crop. Consider green manuring to supplement synthetic fertilizers.',
      );
    }
    if (state) {
      applicationTips.push(
        `Adjust recommendations based on local ${state} agricultural extension guidelines.`,
      );
    }

    return {
      crop: cropData.name,
      areaInAcres,
      soilType: soilData.name,
      state: state || 'Not specified',
      recommendations: {
        nitrogen: {
          required: Math.round(adjustedN * 100) / 100,
          fertilizer: 'Urea',
          bags: ureaBags,
          cost: ureaCost,
        },
        phosphorus: {
          required: Math.round(adjustedP * 100) / 100,
          fertilizer: 'DAP',
          bags: dapBags,
          cost: dapCost,
        },
        potassium: {
          required: Math.round(adjustedK * 100) / 100,
          fertilizer: 'MOP',
          bags: mopBags,
          cost: mopCost,
        },
      },
      totalCost,
      applicationTips,
    };
  }

  @OpenAPI({
    summary: 'Get list of supported crops',
    description: 'Returns all supported crops with their base NPK requirements per acre.',
  })
  @Get('/crops')
  @HttpCode(200)
  async getCrops() {
    return CROPS;
  }

  @OpenAPI({
    summary: 'Get soil types with descriptions',
    description: 'Returns all supported soil types with nutrient adjustment ratios.',
  })
  @Get('/soil-types')
  @HttpCode(200)
  async getSoilTypes() {
    return SOIL_TYPES;
  }
}
