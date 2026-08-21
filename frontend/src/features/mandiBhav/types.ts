export interface IMandiPrice {
  id: string;
  crop: string;
  hindiName: string;
  mandi: string;
  district: string;
  state: string;
  modalPrice: number; // ₹ per quintal
  minPrice: number;
  maxPrice: number;
  mspPrice?: number;
  trend: 'UP' | 'DOWN' | 'STABLE';
  changeAmount: number;
  arrivalTons: number;
  aiRecommendation: 'SELL_NOW' | 'HOLD' | 'WATCH';
  recommendationReason: string;
  updatedAt: string;
}
