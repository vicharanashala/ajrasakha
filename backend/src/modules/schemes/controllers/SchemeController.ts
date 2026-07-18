import 'reflect-metadata';
import {
  JsonController,
  Get,
  HttpCode,
  QueryParams,
  Params,
  NotFoundError,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {injectable} from 'inversify';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import {Type} from 'class-transformer';

// ── Validator Classes ──

class GetAllSchemesQuery {
  @IsOptional()
  @Type(() => String)
  category?: string;

  @IsOptional()
  @Type(() => String)
  state?: string;

  @IsOptional()
  @Type(() => String)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

class SchemeIdParam {
  @IsString()
  @IsNotEmpty()
  schemeId: string;
}

// ── Interfaces ──

interface IScheme {
  id: string;
  name: string;
  description: string;
  eligibility: string;
  benefits: string;
  category: string;
  states: string[];
  applicationProcess: string;
  deadline: string;
  websiteUrl: string;
  contactInfo: string;
}

// ── Static Data ──

const SCHEMES: IScheme[] = [
  {
    id: 'pm-kisan',
    name: 'Pradhan Mantri Kisan Samman Nidhi (PM-KISAN)',
    description: 'Income support of ₹6,000 per year to small and marginal farmer families, paid in three equal instalments of ₹2,000.',
    eligibility: 'All farmer families with cultivable land holding subject to certain exclusions. Institutional landholders, former and current constitutional post holders, government employees, and income taxpayers are excluded.',
    benefits: 'Direct income support of ₹6,000 per year (₹2,000 per instalment × 3 instalments) transferred directly to farmers\' bank accounts.',
    category: 'Subsidy',
    states: ['All India'],
    applicationProcess: 'Register online at pmkisan.gov.in or visit the nearest Common Service Centre (CSC). Aadhaar number, bank account details, and land records are required.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://pmkisan.gov.in',
    contactInfo: 'PM-KISAN Helpline: 1800-180-1551',
  },
  {
    id: 'pm-fasal-bima',
    name: 'Pradhan Mantri Fasal Bima Yojana (PMFBY)',
    description: 'Crop insurance scheme providing comprehensive insurance cover to protect farmers against crop loss due to natural calamities, pests, and diseases.',
    eligibility: 'All farmers including sharecroppers and tenant farmers growing notified crops in notified areas. Premium is subsidized by the government.',
    benefits: 'Coverage for loss of crop due to natural calamities, pests, and diseases. Low premium rates: Kharif 2%, Rabi 1.5%, and commercial/horticultural crops 5% of sum insured.',
    category: 'Insurance',
    states: ['All India'],
    applicationProcess: 'Apply through banks, CSCs, or insurance companies.也可以通过 the PMFBY portal or mobile app. Land records and sowing certificate required.',
    deadline: 'Varies by crop season (Kharif: July 31, Rabi: December 31)',
    websiteUrl: 'https://pmfby.gov.in',
    contactInfo: 'PMFBY Helpline: 1800-180-1551',
  },
  {
    id: 'pm-mudra',
    name: 'Pradhan Mantri MUDRA Yojana (PMMY)',
    description: 'Provides loans up to ₹10 lakh to non-corporate, non-farm small/micro enterprises for income-generating activities.',
    eligibility: 'Any Indian citizen who has a business plan for a non-farm, income-generating activity in the manufacturing, trading, or services sector. No collateral required.',
    benefits: 'Loans up to ₹10 lakh without collateral. Three categories: Shishu (up to ₹50,000), Kishore (₹50,001 to ₹5 lakh), and Tarun (₹5,00,001 to ₹10 lakh).',
    category: 'Credit',
    states: ['All India'],
    applicationProcess: 'Apply at any MUDRA lending institution (banks, NBFCs, MFIs). Submit business plan, identity proof, address proof, and photographs.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://www.mudra.org.in',
    contactInfo: 'MUDRA Helpline: 1800-180-1551',
  },
  {
    id: 'e-nam',
    name: 'Electronic National Agriculture Market (e-NAM)',
    description: 'Pan-India electronic trading portal linking existing APMC mandis to create a unified national market for agricultural commodities.',
    eligibility: 'All farmers registered with APMC mandis. Traders and commission agents licensed by APMC can also participate.',
    benefits: 'Better price discovery through competitive bidding, transparent auction, and wider market access. Eliminates middlemen and ensures direct farmer-to-trader transactions.',
    category: 'Marketing',
    states: ['Maharashtra', 'Karnataka', 'Andhra Pradesh', 'Madhya Pradesh', 'Rajasthan', 'All India'],
    applicationProcess: 'Register at the local APMC mandi. Farmers need Aadhaar, bank account, land records, and mobile number for e-NAM registration.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://enam.gov.in',
    contactInfo: 'e-NAM Helpdesk: 1800-180-1551',
  },
  {
    id: 'pm-krishi-sinchayee',
    name: 'Pradhan Mantri Krishi Sinchayee Yojana (PMKSY)',
    description: 'Ensures water to every field (Har Khet Ko Pani) through micro-irrigation, watershed development, and water management projects.',
    eligibility: 'All farmers including small, marginal, and rain-fed farmers. Priority to water-scarce areas and regions with low groundwater levels.',
    benefits: 'Subsidy on drip and sprinkler irrigation systems (up to 55% for small farmers, 45% for others). Micro-irrigation promotes water-use efficiency and reduces water wastage.',
    category: 'Irrigation',
    states: ['All India'],
    applicationProcess: 'Apply through the state agriculture department or online portal. Land records, Aadhaar, bank account, and water source details required.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://pmksy.gov.in',
    contactInfo: 'PMKSY Helpline: 1800-180-1551',
  },
  {
    id: 'paramparagat-krishi',
    name: 'Paramparagat Krishi Vikas Yojana (PKVY)',
    description: 'Promotes organic farming through a cluster approach, providing financial assistance to farmers for organic certification and marketing.',
    eligibility: 'All farmers who wish to adopt organic farming. Minimum 50 farmers in a cluster covering 50 acres. Certification cost shared between farmer and government.',
    benefits: 'Financial assistance of ₹50,000 per hectare over 3 years for organic farming practices. Includes ₹31,000 for organic inputs and ₹19,000 for certification and marketing.',
    category: 'Organic Farming',
    states: ['All India'],
    applicationProcess: 'Apply through the district agriculture office or online at the PKVY portal. Form a cluster with nearby farmers and submit land records.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://organicfarm.nic.in',
    contactInfo: 'PKVY Helpline: 1800-180-1551',
  },
  {
    id: 'pm-kusum',
    name: 'Pradhan Mantri Kisan Urja Suraksha evam Utthaan Mahabhiyan (PM-KUSUM)',
    description: 'Provides energy security to farmers by enabling solar energy generation on their farms and selling surplus power to the grid.',
    eligibility: 'Individual farmers, Farmer Producer Organizations (FPOs), and cooperatives. Available for existing and new tube wells, pumps, and agricultural pumps.',
    benefits: 'Subsidy of up to 60% for solar pumps (3 hp to 7.5 hp). Farmers can earn by selling surplus solar power to the grid at feed-in tariff rates.',
    category: 'Subsidy',
    states: ['All India'],
    applicationProcess: 'Apply through state nodal agencies or the PM-KUSUM portal. Aadhaar, bank account, land records, and electricity connection details required.',
    deadline: 'Varies by state notification',
    websiteUrl: 'https://mnre.gov.in/solar/schemes',
    contactInfo: 'PM-KUSUM Helpdesk: 011-24360707',
  },
  {
    id: 'sub-mission-agri',
    name: 'Sub-Mission on Agricultural Mechanization (SMAM)',
    description: 'Promotes farm mechanization by providing subsidies on purchase of agricultural machinery and equipment to make farming more efficient.',
    eligibility: 'Individual farmers, farmer groups, cooperatives, and Farm Machinery Training and Testing Institutes. Priority to SC/ST and small/marginal farmers.',
    benefits: 'Subsidy of 40-50% on purchase of tractors, power tillers, and various farm machinery. Higher subsidy rates for SC/ST and small farmers.',
    category: 'Subsidy',
    states: ['All India'],
    applicationProcess: 'Apply online at the SMAM portal or through the district agriculture office. Aadhaar, bank account, land records, and category certificate (if applicable).',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://agrimachinery.nic.in',
    contactInfo: 'SMAM Helpline: 011-26122034',
  },
  {
    id: 'national-agricultural-market',
    name: 'Rashtriya Krishi Vikas Yojana (RKVY)',
    description: 'Incentivizes states to increase public investment in agriculture and allied sectors to achieve 4% growth rate in agriculture.',
    eligibility: 'State governments, agricultural universities, ICAR institutions, and registered farmers\' organizations. Projects approved by state-level sanctioning committees.',
    benefits: 'Funds allocation to states based on their agricultural growth performance. Supports infrastructure development, post-harvest management, and market linkage projects.',
    category: 'Marketing',
    states: ['All India'],
    applicationProcess: 'State governments submit project proposals to the Department of Agriculture. Individual farmers benefit indirectly through state-implemented projects.',
    deadline: 'As per state-level project approval cycles',
    websiteUrl: 'https://rkvy.nic.in',
    contactInfo: 'RKVY Division: 011-23382096',
  },
  {
    id: 'pm-pranam',
    name: 'PM Programme for Restoration, Awareness, Nourishment and Amelioration of Mother Earth (PM-PRANAM)',
    description: 'Promotes balanced use of chemical fertilizers and reduces dependency on chemical fertilizers by encouraging organic and natural farming.',
    eligibility: 'All farmers in districts with high chemical fertilizer consumption. Farmer groups, FPOs, and cooperatives involved in natural farming.',
    benefits: 'Incentive to states for reducing chemical fertilizer usage. Subsidies for bio-fertilizers, organic manure, and natural farming inputs. Saves input costs and improves soil health.',
    category: 'Organic Farming',
    states: ['Maharashtra', 'Uttar Pradesh', 'Punjab', 'Haryana', 'Andhra Pradesh', 'All India'],
    applicationProcess: 'Apply through the district agriculture office. Aadhaar, land records, and details of current fertilizer usage required.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://agricoop.nic.in',
    contactInfo: 'Fertilizer Division: 011-23389482',
  },
  {
    id: 'weather-insurance',
    name: 'Weather Based Crop Insurance Scheme (WBCIS)',
    description: 'Provides insurance protection to farmers against adverse weather conditions like deficit rainfall, hailstorm, frost, and prolonged dry spell.',
    eligibility: 'All farmers growing notified crops in notified areas. Coverage extends to weather-triggered events rather than individual crop losses.',
    benefits: 'Quick claim settlement based on weather data from automatic weather stations. Lower premium rates compared to traditional crop insurance. Faster and more transparent.',
    category: 'Insurance',
    states: ['Maharashtra', 'Rajasthan', 'Karnataka', 'Tamil Nadu', 'Gujarat', 'All India'],
    applicationProcess: 'Apply through banks, insurance companies, or the WBCIS portal. Land records, Aadhaar, bank account, and crop details required.',
    deadline: 'Varies by crop season (Kharif: July 31, Rabi: December 31)',
    websiteUrl: 'https://wbcis.agriinsure.com',
    contactInfo: 'WBCIS Helpline: 1800-180-1551',
  },
  {
    id: 'soil-health-card',
    name: 'Soil Health Card Scheme',
    description: 'Provides soil health cards to farmers with crop-wise nutrient recommendations, improving soil health and reducing excess fertilizer use.',
    eligibility: 'All farmers across India. The scheme operates through a network of soil testing laboratories and mobile soil testing units.',
    benefits: 'Free soil testing and personalized nutrient recommendations for each farmer. Helps optimize fertilizer use, reduce costs, and increase crop productivity.',
    category: 'Subsidy',
    states: ['All India'],
    applicationProcess: 'Visit the nearest soil testing laboratory or mobile soil testing unit. Provide soil sample and Aadhaar number. Card is issued free of cost.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://soilhealth.dac.gov.in',
    contactInfo: 'Soil Health Helpline: 011-23382215',
  },
  {
    id: 'interest-subvention',
    name: 'Interest Subvention Scheme for Agriculture',
    description: 'Provides short-term crop loans at subsidized interest rates to farmers, reducing their financial burden and encouraging formal credit adoption.',
    eligibility: 'All farmers who take short-term crop loans from scheduled commercial banks, cooperative banks, or RRBs up to ₹3 lakh per farmer.',
    benefits: 'Interest subvention of 2% on short-term crop loans, making the effective interest rate 4% per annum. Additional 3% subvention for prompt repayment, bringing rate down to 4%.',
    category: 'Credit',
    states: ['All India'],
    applicationProcess: 'Apply for crop loan at any participating bank. Submit Aadhaar, land records, and crop plan. Subvention is automatically applied by the bank.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://agricoop.nic.in/schemes/interest-subvention',
    contactInfo: 'NABARD Helpline: 022-26539895',
  },
  {
    id: 'maharashtra-e-nam',
    name: 'Maharashtra State Agriculture Marketing Board Scheme',
    description: 'Provides financial assistance for construction of new market yards, modernization of existing markets, and market infrastructure development in Maharashtra.',
    eligibility: 'Registered APMC mandis, market committees, and farmers\' cooperatives in Maharashtra. Individual farmers benefit through improved market facilities.',
    benefits: 'Grant-in-aid for market yard construction, electronic weighing systems, online trading platforms, and cold storage facilities. Improves post-harvest infrastructure.',
    category: 'Marketing',
    states: ['Maharashtra'],
    applicationProcess: 'Market committees submit proposals to the Maharashtra State Agriculture Marketing Board. Funds released based on project approval.',
    deadline: 'As per board notification cycles',
    websiteUrl: 'https://msamb.maharashtra.gov.in',
    contactInfo: 'MSAMB Office: 022-22026211',
  },
  {
    id: 'krishi-mahamandal',
    name: 'Krishi Mahamandal (Agricultural Technology Management Agency)',
    description: 'Transfers agricultural technology from labs to land by establishing farmer-centric extension networks across India.',
    eligibility: 'All farmers, with priority to small and marginal farmers. Extension workers and agriculture graduates involved in technology dissemination.',
    benefits: 'Technology demonstrations, farmer training programs, and exposure visits. Access to latest agricultural research and improved farming practices.',
    category: 'Crop Loss',
    states: ['All India'],
    applicationProcess: 'Participate through district ATMA offices. Farmers can register for training programs and technology demonstrations.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://atma-agri.nic.in',
    contactInfo: 'ATMA Division: 011-23382024',
  },
  {
    id: 'national-mission-horticulture',
    name: 'National Mission on Horticulture (NMH)',
    description: 'Promotes holistic growth of the horticulture sector including fruits, vegetables, medicinal plants, and spices through area-based regionally differentiated strategies.',
    eligibility: 'All farmers including individual growers, FPOs, cooperatives, and state horticulture missions. Priority to NE states and Himalayan regions.',
    benefits: 'Financial assistance for area expansion, protected cultivation, post-harvest management, cold chain infrastructure, and market development.',
    category: 'Subsidy',
    states: ['All India'],
    applicationProcess: 'Apply through the state horticulture mission or district horticulture office. Aadhaar, land records, and project proposal required.',
    deadline: 'As per state mission guidelines',
    websiteUrl: 'https://nhb.gov.in',
    contactInfo: 'NMH Division: 011-26150167',
  },
  {
    id: 'zero-budget-natural-farming',
    name: 'Zero Budget Natural Farming (ZBNF) - BPKP',
    description: 'Promotes natural farming with zero budget, reducing farming costs by eliminating chemical inputs and using locally available biological resources.',
    eligibility: 'All farmers willing to adopt natural farming practices. Focus on areas with high debt burden and input costs. Cluster approach with minimum 50 farmers.',
    benefits: 'Complete elimination of chemical input costs. Farmers learn to prepare bio-inputs from cow dung, cow urine, jaggery, gram flour, and local soil. Improves soil health and farmer profitability.',
    category: 'Organic Farming',
    states: ['Andhra Pradesh', 'Himachal Pradesh', 'Gujarat', 'Kerala', 'Karnataka'],
    applicationProcess: 'Register through the state natural farming mission. Participate in cluster-level training programs conducted by village resource persons.',
    deadline: 'Open throughout the year',
    websiteUrl: 'https://bkp.andhra.gov.in',
    contactInfo: 'ZBNF State Coordinator: Contact district agriculture office',
  },
];

// ── Controller ──

@OpenAPI({
  tags: ['government-schemes'],
  description: 'Operations for browsing and searching government agricultural schemes',
})
@injectable()
@JsonController('/schemes')
export class SchemeController {
  @OpenAPI({
    summary: 'Get all schemes with optional filtering and pagination',
    description: 'Retrieves a paginated list of government agricultural schemes with optional filtering by category, state, and search text.',
  })
  @Get('/')
  @HttpCode(200)
  async getAllSchemes(
    @QueryParams() query: GetAllSchemesQuery,
  ): Promise<{schemes: IScheme[]; totalCount: number; totalPages: number}> {
    let filtered = [...SCHEMES];

    if (query.category) {
      filtered = filtered.filter(
        (s) => s.category.toLowerCase() === query.category!.toLowerCase(),
      );
    }

    if (query.state) {
      filtered = filtered.filter((s) =>
        s.states.some(
          (st) =>
            st.toLowerCase().includes(query.state!.toLowerCase()) ||
            st.toLowerCase() === 'all india',
        ),
      );
    }

    if (query.search) {
      const searchLower = query.search.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.name.toLowerCase().includes(searchLower) ||
          s.description.toLowerCase().includes(searchLower) ||
          s.benefits.toLowerCase().includes(searchLower) ||
          s.category.toLowerCase().includes(searchLower),
      );
    }

    const page = query.page || 1;
    const limit = query.limit || 12;
    const totalCount = filtered.length;
    const totalPages = Math.ceil(totalCount / limit);
    const start = (page - 1) * limit;
    const schemes = filtered.slice(start, start + limit);

    return {schemes, totalCount, totalPages};
  }

  @OpenAPI({
    summary: 'Get all unique scheme categories',
    description: 'Returns a list of distinct categories across all schemes.',
  })
  @Get('/categories')
  @HttpCode(200)
  async getCategories(): Promise<string[]> {
    const categories = [...new Set(SCHEMES.map((s) => s.category))];
    return categories.sort();
  }

  @OpenAPI({
    summary: 'Get all unique states covered by schemes',
    description: 'Returns a list of distinct states across all schemes.',
  })
  @Get('/states')
  @HttpCode(200)
  async getStates(): Promise<string[]> {
    const allStates = SCHEMES.flatMap((s) => s.states);
    const unique = [...new Set(allStates)].filter((s) => s !== 'All India');
    return [...unique.sort(), 'All India'];
  }

  @OpenAPI({
    summary: 'Get a scheme by ID',
    description: 'Retrieves detailed information about a specific government scheme.',
  })
  @Get('/:schemeId')
  @HttpCode(200)
  async getSchemeById(
    @Params() params: SchemeIdParam,
  ): Promise<{success: boolean; data: IScheme}> {
    const scheme = SCHEMES.find((s) => s.id === params.schemeId);
    if (!scheme) {
      throw new NotFoundError(`Scheme with id "${params.schemeId}" not found`);
    }
    return {success: true, data: scheme};
  }
}
