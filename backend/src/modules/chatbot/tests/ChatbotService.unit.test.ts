import 'reflect-metadata';

import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  BadRequestError,
  InternalServerError,
  NotFoundError,
} from 'routing-controllers';
vi.mock('#root/utils/mailer.js', () => ({
  sendEmailNotification: vi.fn(),
}));

import {sendEmailNotification} from '#root/utils/mailer.js';
import {ChatbotService} from '../services/ChatbotService.js';
import * as WebhookUtils from '#root/modules/answer/utils/triggerWebhook.js';
import {appConfig} from '#root/config/app.js';

vi.mock('#root/modules/answer/utils/triggerWebhook.js', () => ({
  triggerWebhook: vi.fn(),
}));

// ==========================================================
// Service
// ==========================================================

describe('ChatbotService', () => {
  // ==========================================================
  // Repository Mocks
  // ==========================================================

  const mockChatbotRepository = {
    getKpiSummary: vi.fn(),
    getDailyActiveUsers: vi.fn(),
    getChannelSplit: vi.fn(),
    getVoiceAccuracyByLanguage: vi.fn(),
    getGeoDistribution: vi.fn(),
    getQueryCategories: vi.fn(),
    getQueryCategoryQuestions: vi.fn(),
    getWeatherConcernAnalytics: vi.fn(),
    getWeatherConcernQueries: vi.fn(),
    getFarmerHeatMapAnalytics: vi.fn(),
    getDistrictAnalyticsByState: vi.fn(),
    getQuestionFromDistrict: vi.fn(),
    getTopCrops: vi.fn(),
    getWeeklyAvgSessionDuration: vi.fn(),
    getDailyAnalytics: vi.fn(),
    getTodayQueryCount: vi.fn(),
    getDailyUserTrend: vi.fn(),
    getWeeklyAnalytics: vi.fn(),
    getMonthlyAnalytics: vi.fn(),
    getAvgSessionDurationV2: vi.fn(),
    getWeeklyAvgSessionDurationV2: vi.fn(),
    getUserDetails: vi.fn(),
    getUsersMessages: vi.fn(),
    getUserConversationIds: vi.fn(),
    getAllUserMessageIds: vi.fn(),
    getUserQuestionsData: vi.fn(),
    getUserData: vi.fn(),
    generateChatBotData: vi.fn(),
    getIdsCreated: vi.fn(),
    getInstalls: vi.fn(),
    getActiveUsers: vi.fn(),
    getDuplicateQuestions: vi.fn(),
    getDomainSpikes: vi.fn(),
    getDailyQuestionTrends: vi.fn(),
    getTopFaqs: vi.fn(),
    getUserById: vi.fn(),
    deleteUser: vi.fn(),
    updateUser: vi.fn(),
    changeUserPassword: vi.fn(),
    addUser: vi.fn(),
    getRetentionMetrics: vi.fn(),
    getClosedVsTotalQuestions: vi.fn(),
    getNotifiedVsClosed: vi.fn(),
    getClosedInLastTwoHours: vi.fn(),
    getCarryForwardQuestions: vi.fn(),
    getMonthlyChurnRate: vi.fn(),
    getActiveUsersTrend: vi.fn(),
    getTopQuestionsFromCollection: vi.fn(),
    getRepeatQueryCount: vi.fn(),
    getUserDemographics: vi.fn(),
    getPlatformInstalls: vi.fn(),
    getKccAndAgriAppStats: vi.fn(),
    getFeedbackData: vi.fn(),
    findUnverifiedUsers: vi.fn(),
    verifyUser: vi.fn(),
    getResponseAdherenceTable: vi.fn(),
    getQuestionsByCrop: vi.fn(),
    getQuestionsByStatus: vi.fn(),
    getQuestionsClosedWithinTwoHours: vi.fn(),
    getQuestionsByNotificationStatus: vi.fn(),
    getQueriesByPeriod: vi.fn(),
    getAllStatesQuestionsAndUsersData: vi.fn(),
    getUserProfile: vi.fn(),
    assignUsers: vi.fn(),
    getQuestionLifecycle: vi.fn(),
    getVillageUserCounts: vi.fn(),
    unAssignUsers: vi.fn(),
  };

  const mockMongoDatabase = {};

  const mockWhatsappService = {
    getAllUsers: vi.fn(),
  };

  const mockLgdService = {
    getDistricts: vi.fn(),
    getStates: vi.fn(),
    generateChatBotData: vi.fn(),
  };
  // ==========================================================
  // Service
  // ==========================================================

  let service: ChatbotService;

  beforeEach(() => {
    vi.clearAllMocks();

    service = new ChatbotService(
      mockChatbotRepository as any,
      mockMongoDatabase as any,
      mockWhatsappService as any,

      mockLgdService as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  });

  // ==========================================================
  // getKpiSummary
  // ==========================================================

  describe('getKpiSummary', () => {
    it('returns KPI summary from repository', async () => {
      const response = {
        totalUsers: 100,
        totalQuestions: 200,
      };

      mockChatbotRepository.getKpiSummary.mockResolvedValue(response);

      const result = await service.getKpiSummary();

      expect(mockChatbotRepository.getKpiSummary).toHaveBeenCalledWith(
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = {
        totalUsers: 50,
      };

      mockChatbotRepository.getKpiSummary.mockResolvedValue(response);

      await service.getKpiSummary('whatsapp', 'farmer');

      expect(mockChatbotRepository.getKpiSummary).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getKpiSummary.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getKpiSummary()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getKpiSummary()).rejects.toThrow(
        'Failed to fetch KPI summary',
      );
    });
  });
  // ==========================================================
  // getDailyActiveUsers
  // ==========================================================

  describe('getDailyActiveUsers', () => {
    it('returns daily active users from repository', async () => {
      const response = [
        {
          date: '2025-01-01',
          count: 15,
        },
        {
          date: '2025-01-02',
          count: 22,
        },
      ];

      mockChatbotRepository.getDailyActiveUsers.mockResolvedValue(response);

      const result = await service.getDailyActiveUsers();

      expect(mockChatbotRepository.getDailyActiveUsers).toHaveBeenCalledWith(
        30,
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual(response);
    });

    it('passes custom days, source and userType', async () => {
      const response = [
        {
          date: '2025-02-01',
          count: 10,
        },
      ];

      mockChatbotRepository.getDailyActiveUsers.mockResolvedValue(response);

      await service.getDailyActiveUsers(7, 'whatsapp', 'farmer');

      expect(mockChatbotRepository.getDailyActiveUsers).toHaveBeenCalledWith(
        7,
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getDailyActiveUsers.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getDailyActiveUsers()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getDailyActiveUsers()).rejects.toThrow(
        'Failed to fetch daily active users',
      );
    });
  });
  // ==========================================================
  // getChannelSplit
  // ==========================================================

  describe('getChannelSplit', () => {
    it('returns channel split from repository', async () => {
      const response = [
        {
          channel: 'whatsapp',
          count: 120,
        },
        {
          channel: 'ivr',
          count: 80,
        },
      ];

      mockChatbotRepository.getChannelSplit.mockResolvedValue(response);

      const result = await service.getChannelSplit();

      expect(mockChatbotRepository.getChannelSplit).toHaveBeenCalledWith(
        'annam',
      );

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = [
        {
          channel: 'whatsapp',
          count: 25,
        },
      ];

      mockChatbotRepository.getChannelSplit.mockResolvedValue(response);

      await service.getChannelSplit('whatsapp');

      expect(mockChatbotRepository.getChannelSplit).toHaveBeenCalledWith(
        'whatsapp',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getChannelSplit.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getChannelSplit()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getChannelSplit()).rejects.toThrow(
        'Failed to fetch channel split',
      );
    });
  });
  // ==========================================================
  // getVoiceAccuracyByLanguage
  // ==========================================================

  describe('getVoiceAccuracyByLanguage', () => {
    it('returns voice accuracy data from repository', async () => {
      const response = [
        {
          language: 'Hindi',
          accuracy: 94,
        },
        {
          language: 'Punjabi',
          accuracy: 91,
        },
      ];

      mockChatbotRepository.getVoiceAccuracyByLanguage.mockResolvedValue(
        response,
      );

      const result = await service.getVoiceAccuracyByLanguage();

      expect(
        mockChatbotRepository.getVoiceAccuracyByLanguage,
      ).toHaveBeenCalledWith('annam');

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = [
        {
          language: 'Hindi',
          accuracy: 96,
        },
      ];

      mockChatbotRepository.getVoiceAccuracyByLanguage.mockResolvedValue(
        response,
      );

      await service.getVoiceAccuracyByLanguage('whatsapp');

      expect(
        mockChatbotRepository.getVoiceAccuracyByLanguage,
      ).toHaveBeenCalledWith('whatsapp');
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getVoiceAccuracyByLanguage.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getVoiceAccuracyByLanguage()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getVoiceAccuracyByLanguage()).rejects.toThrow(
        'Failed to fetch voice accuracy',
      );
    });
  });
  // ==========================================================
  // getGeoDistribution
  // ==========================================================

  describe('getGeoDistribution', () => {
    it('returns geo distribution from repository', async () => {
      const response = [
        {
          state: 'Punjab',
          count: 120,
        },
        {
          state: 'Haryana',
          count: 80,
        },
      ];

      mockChatbotRepository.getGeoDistribution.mockResolvedValue(response);

      const result = await service.getGeoDistribution();

      expect(mockChatbotRepository.getGeoDistribution).toHaveBeenCalledWith(
        'annam',
      );

      expect(result).toEqual(response);
    });

    it('passes custom source', async () => {
      const response = [
        {
          state: 'Maharashtra',
          count: 45,
        },
      ];

      mockChatbotRepository.getGeoDistribution.mockResolvedValue(response);

      await service.getGeoDistribution('whatsapp');

      expect(mockChatbotRepository.getGeoDistribution).toHaveBeenCalledWith(
        'whatsapp',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getGeoDistribution.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getGeoDistribution()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getGeoDistribution()).rejects.toThrow(
        'Failed to fetch geo distribution',
      );
    });
  });
  // ==========================================================
  // getQueryCategories
  // ==========================================================

  describe('getQueryCategories', () => {
    it('returns query categories from repository', async () => {
      const response = [
        {
          category: 'Weather',
          count: 120,
        },
        {
          category: 'Crop',
          count: 75,
        },
      ];

      mockChatbotRepository.getQueryCategories.mockResolvedValue(response);

      const result = await service.getQueryCategories();

      expect(mockChatbotRepository.getQueryCategories).toHaveBeenCalledWith(
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = [
        {
          category: 'Market',
          count: 15,
        },
      ];

      mockChatbotRepository.getQueryCategories.mockResolvedValue(response);

      await service.getQueryCategories('whatsapp', 'farmer');

      expect(mockChatbotRepository.getQueryCategories).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getQueryCategories.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getQueryCategories()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getQueryCategories()).rejects.toThrow(
        'Failed to fetch query categories',
      );
    });
  });
  // ==========================================================
  // getQueryCategoryQuestions
  // ==========================================================

  describe('getQueryCategoryQuestions', () => {
    it('returns questions for the given category', async () => {
      const response = [
        {
          question: 'Will it rain tomorrow?',
          category: 'Weather',
        },
        {
          question: 'When should I irrigate wheat?',
          category: 'Weather',
        },
      ];

      mockChatbotRepository.getQueryCategoryQuestions.mockResolvedValue(
        response,
      );

      const result = await service.getQueryCategoryQuestions('Weather');

      expect(
        mockChatbotRepository.getQueryCategoryQuestions,
      ).toHaveBeenCalledWith(
        'Weather',
        'all',
        1,
        10,
        'annam',
        undefined,
        'all',
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = [
        {
          question: 'Market price today?',
          category: 'Market',
        },
      ];

      mockChatbotRepository.getQueryCategoryQuestions.mockResolvedValue(
        response,
      );

      await service.getQueryCategoryQuestions(
        'Market',
        'duplicate', // or 'all'
        2,
        20,
        'whatsapp',
        'farmer',
        'rice',
      );

      expect(
        mockChatbotRepository.getQueryCategoryQuestions,
      ).toHaveBeenCalledWith(
        'Market',
        'duplicate',
        2,
        20,
        'whatsapp',
        undefined,
        'farmer',
        'rice',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getQueryCategoryQuestions.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getQueryCategoryQuestions('Weather'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.getQueryCategoryQuestions('Weather'),
      ).rejects.toThrow('Failed to fetch query category questions');
    });
  });
  // ==========================================================
  // getWeatherConcernAnalytics
  // ==========================================================

  describe('getWeatherConcernAnalytics', () => {
    it('returns weather concern analytics from repository', async () => {
      const response = [
        {
          concern: 'Rain',
          count: 42,
        },
        {
          concern: 'Temperature',
          count: 18,
        },
      ];

      mockChatbotRepository.getWeatherConcernAnalytics.mockResolvedValue(
        response,
      );

      const result = await service.getWeatherConcernAnalytics();

      expect(
        mockChatbotRepository.getWeatherConcernAnalytics,
      ).toHaveBeenCalledWith({}, 'annam', undefined, 'all');

      expect(result).toEqual(response);
    });

    it('passes custom source', async () => {
      const response = [
        {
          concern: 'Humidity',
          count: 12,
        },
      ];

      mockChatbotRepository.getWeatherConcernAnalytics.mockResolvedValue(
        response,
      );

      await service.getWeatherConcernAnalytics({}, 'whatsapp', 'all');

      expect(
        mockChatbotRepository.getWeatherConcernAnalytics,
      ).toHaveBeenCalledWith({}, 'whatsapp', undefined, 'all');
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getWeatherConcernAnalytics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getWeatherConcernAnalytics()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getWeatherConcernAnalytics()).rejects.toThrow(
        'Failed to fetch weather concern analytics',
      );
    });
  });

  // ==========================================================
  // getWeatherConcernQueries
  // ==========================================================

  describe('getWeatherConcernQueries', () => {
    it('returns weather concern queries from repository', async () => {
      const filters = {};

      const response = {
        items: [
          {
            question: 'Will it rain tomorrow?',
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      };

      mockChatbotRepository.getWeatherConcernQueries.mockResolvedValue(
        response,
      );

      const result = await service.getWeatherConcernQueries(
        filters,
        'Rain',
        1,
        10,
        'annam',
      );

      expect(
        mockChatbotRepository.getWeatherConcernQueries,
      ).toHaveBeenCalledWith(
        filters,
        'Rain',
        1,
        10,
        'annam',
        undefined,
        'all',
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes custom parameters', async () => {
      const filters = {
        state: 'Punjab',
      };

      const response = {
        items: [],
        total: 0,
        page: 2,
        totalPages: 0,
      };

      mockChatbotRepository.getWeatherConcernQueries.mockResolvedValue(
        response,
      );

      await service.getWeatherConcernQueries(
        filters,
        'Rain',
        2,
        20,
        'annam',
        'farmer',
        'wheat',
      );

      expect(
        mockChatbotRepository.getWeatherConcernQueries,
      ).toHaveBeenCalledWith(
        filters,
        'Rain',
        2,
        20,
        'annam',
        undefined,
        'farmer',
        'wheat',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getWeatherConcernQueries.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getWeatherConcernQueries({}, 'Rain', 1, 10, 'annam'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.getWeatherConcernQueries({}, 'Rain', 1, 10, 'annam'),
      ).rejects.toThrow('Failed to fetch weather concern analytics');
    });
  });
  // ==========================================================
  // getFarmerHeatMapAnalytics
  // ==========================================================

  describe('getFarmerHeatMapAnalytics', () => {
    it('returns farmer heat map analytics from repository', async () => {
      const filters = {
        state: 'Punjab',
      };

      const response = {
        totalFarmers: 120,
        heatMap: [],
      };

      mockChatbotRepository.getFarmerHeatMapAnalytics.mockResolvedValue(
        response,
      );

      const result = await service.getFarmerHeatMapAnalytics(filters);

      expect(
        mockChatbotRepository.getFarmerHeatMapAnalytics,
      ).toHaveBeenCalledWith(filters);

      expect(result).toEqual(response);
    });

    it('uses empty filters by default', async () => {
      const response = {
        totalFarmers: 50,
        heatMap: [],
      };

      mockChatbotRepository.getFarmerHeatMapAnalytics.mockResolvedValue(
        response,
      );

      await service.getFarmerHeatMapAnalytics();

      expect(
        mockChatbotRepository.getFarmerHeatMapAnalytics,
      ).toHaveBeenCalledWith({});
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getFarmerHeatMapAnalytics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getFarmerHeatMapAnalytics()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getFarmerHeatMapAnalytics()).rejects.toThrow(
        'Failed to fetch farmer heat map analytics',
      );
    });
  });
  // ==========================================================
  // getDistrictAnalyticsByState
  // ==========================================================

  describe('getDistrictAnalyticsByState', () => {
    it('returns district analytics', async () => {
      const districts = [
        {id: 1, name: 'Bathinda'},
        {id: 2, name: 'Mansa'},
      ];

      const response = [
        {
          district: 'Bathinda',
          count: 25,
        },
      ];

      mockLgdService.getDistricts.mockResolvedValue(districts);

      mockChatbotRepository.getDistrictAnalyticsByState.mockResolvedValue(
        response,
      );

      const result = await service.getDistrictAnalyticsByState('Punjab', '3');

      expect(mockLgdService.getDistricts).toHaveBeenCalledWith(3);

      expect(
        mockChatbotRepository.getDistrictAnalyticsByState,
      ).toHaveBeenCalledWith('Punjab', districts, 'annam', undefined, 'all');

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const districts = [{id: 1, name: 'Bathinda'}];

      mockLgdService.getDistricts.mockResolvedValue(districts);

      mockChatbotRepository.getDistrictAnalyticsByState.mockResolvedValue([]);

      await service.getDistrictAnalyticsByState(
        'Punjab',
        '3',
        'whatsapp',
        'farmer',
      );

      expect(
        mockChatbotRepository.getDistrictAnalyticsByState,
      ).toHaveBeenCalledWith(
        'Punjab',
        districts,
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when lgdService fails', async () => {
      mockLgdService.getDistricts.mockRejectedValue(new Error('LGD failed'));

      await expect(
        service.getDistrictAnalyticsByState('Punjab', '3'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.getDistrictAnalyticsByState('Punjab', '3'),
      ).rejects.toThrow('Failed to fetch district analytics');
    });

    it('throws InternalServerError when repository fails', async () => {
      mockLgdService.getDistricts.mockResolvedValue([]);

      mockChatbotRepository.getDistrictAnalyticsByState.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getDistrictAnalyticsByState('Punjab', '3'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.getDistrictAnalyticsByState('Punjab', '3'),
      ).rejects.toThrow('Failed to fetch district analytics');
    });
  });
  // ==========================================================
  // getQuestionFromDistrict
  // ==========================================================

  describe('getQuestionFromDistrict', () => {
    it('returns district questions from repository', async () => {
      const response = {
        items: [
          {
            question: 'What is the wheat MSP?',
            district: 'Bathinda',
          },
        ],
        total: 1,
        page: 1,
        totalPages: 1,
      };

      mockChatbotRepository.getQuestionFromDistrict.mockResolvedValue(response);

      const result = await service.getQuestionFromDistrict(
        'Bathinda',
        'Punjab',
      );

      expect(
        mockChatbotRepository.getQuestionFromDistrict,
      ).toHaveBeenCalledWith(
        'Bathinda',
        'Punjab',
        'all',
        1,
        10,
        'annam',
        undefined,
        'all',
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes custom parameters', async () => {
      const response = {
        items: [],
        total: 0,
        page: 2,
        totalPages: 0,
      };

      mockChatbotRepository.getQuestionFromDistrict.mockResolvedValue(response);

      await service.getQuestionFromDistrict(
        'Bathinda',
        'Punjab',
        'duplicate',
        2,
        20,
        'whatsapp',
        'farmer',
        'wheat',
      );

      expect(
        mockChatbotRepository.getQuestionFromDistrict,
      ).toHaveBeenCalledWith(
        'Bathinda',
        'Punjab',
        'duplicate',
        2,
        20,
        'whatsapp',
        undefined,
        'farmer',
        'wheat',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getQuestionFromDistrict.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getQuestionFromDistrict('Bathinda', 'Punjab'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.getQuestionFromDistrict('Bathinda', 'Punjab'),
      ).rejects.toThrow('Failed to fetch district questions');
    });
  });
  // ==========================================================
  // getTopCrops
  // ==========================================================

  describe('getTopCrops', () => {
    it('returns top crops from repository', async () => {
      const response = [
        {
          crop: 'Wheat',
          count: 120,
        },
        {
          crop: 'Rice',
          count: 95,
        },
      ];

      mockChatbotRepository.getTopCrops.mockResolvedValue(response);

      const result = await service.getTopCrops();

      expect(mockChatbotRepository.getTopCrops).toHaveBeenCalledWith(
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = [
        {
          crop: 'Cotton',
          count: 42,
        },
      ];

      mockChatbotRepository.getTopCrops.mockResolvedValue(response);

      await service.getTopCrops('whatsapp', 'farmer');

      expect(mockChatbotRepository.getTopCrops).toHaveBeenCalledWith(
        'whatsapp',
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getTopCrops.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getTopCrops()).rejects.toThrow(InternalServerError);

      await expect(service.getTopCrops()).rejects.toThrow(
        'Failed to fetch top crops',
      );
    });
  });
  // ==========================================================
  // getWeeklyAvgSessionDuration
  // ==========================================================

  describe('getWeeklyAvgSessionDuration', () => {
    it('returns weekly average session duration from repository', async () => {
      const response = [
        {
          week: '2025-W01',
          avgDuration: 245,
        },
        {
          week: '2025-W02',
          avgDuration: 261,
        },
      ];

      mockChatbotRepository.getWeeklyAvgSessionDuration.mockResolvedValue(
        response,
      );

      const result = await service.getWeeklyAvgSessionDuration();

      expect(
        mockChatbotRepository.getWeeklyAvgSessionDuration,
      ).toHaveBeenCalledWith(52, 'annam');

      expect(result).toEqual(response);
    });

    it('passes custom weeks and source', async () => {
      const response = [
        {
          week: '2025-W10',
          avgDuration: 180,
        },
      ];

      mockChatbotRepository.getWeeklyAvgSessionDuration.mockResolvedValue(
        response,
      );

      await service.getWeeklyAvgSessionDuration(12, 'whatsapp');

      expect(
        mockChatbotRepository.getWeeklyAvgSessionDuration,
      ).toHaveBeenCalledWith(12, 'whatsapp');
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getWeeklyAvgSessionDuration.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getWeeklyAvgSessionDuration()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getWeeklyAvgSessionDuration()).rejects.toThrow(
        'Failed to fetch weekly session duration',
      );
    });
  });
  // ==========================================================
  // getDailyAnalytics
  // ==========================================================

  describe('getDailyAnalytics', () => {
    it('returns daily analytics from repository', async () => {
      const response = [
        {
          date: '2025-01-01',
          users: 120,
          questions: 340,
        },
        {
          date: '2025-01-02',
          users: 145,
          questions: 381,
        },
      ];

      mockChatbotRepository.getDailyAnalytics.mockResolvedValue(response);

      const result = await service.getDailyAnalytics();

      expect(mockChatbotRepository.getDailyAnalytics).toHaveBeenCalledWith(
        undefined,
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual(response);
    });

    it('passes custom month, source and userType', async () => {
      const response = [
        {
          date: '2025-03-15',
          users: 98,
          questions: 210,
        },
      ];

      mockChatbotRepository.getDailyAnalytics.mockResolvedValue(response);

      await service.getDailyAnalytics('2025-03', 'whatsapp', 'farmer');

      expect(mockChatbotRepository.getDailyAnalytics).toHaveBeenCalledWith(
        '2025-03',
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getDailyAnalytics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getDailyAnalytics()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getDailyAnalytics()).rejects.toThrow(
        'Failed to fetch daily analytics',
      );
    });
  });
  // ==========================================================
  // getTodayQueryCount
  // ==========================================================

  describe('getTodayQueryCount', () => {
    it('returns today query count from repository', async () => {
      const response = {
        totalQueries: 245,
      };

      mockChatbotRepository.getTodayQueryCount.mockResolvedValue(response);

      const result = await service.getTodayQueryCount();

      expect(mockChatbotRepository.getTodayQueryCount).toHaveBeenCalledWith(
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = {
        totalQueries: 57,
      };

      mockChatbotRepository.getTodayQueryCount.mockResolvedValue(response);

      await service.getTodayQueryCount('whatsapp', 'farmer');

      expect(mockChatbotRepository.getTodayQueryCount).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getTodayQueryCount.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getTodayQueryCount()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getTodayQueryCount()).rejects.toThrow(
        'Failed to fetch today query count',
      );
    });
  });
  // ==========================================================
  // getDailyUserTrend
  // ==========================================================

  describe('getDailyUserTrend', () => {
    it('returns daily user trend from repository', async () => {
      const response = [
        {
          date: '2025-01-01',
          users: 120,
        },
        {
          date: '2025-01-02',
          users: 145,
        },
      ];

      mockChatbotRepository.getDailyUserTrend.mockResolvedValue(response);

      const result = await service.getDailyUserTrend();

      expect(mockChatbotRepository.getDailyUserTrend).toHaveBeenCalledWith(
        30,
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual(response);
    });

    it('passes custom days, source and userType', async () => {
      const response = [
        {
          date: '2025-02-01',
          users: 75,
        },
      ];

      mockChatbotRepository.getDailyUserTrend.mockResolvedValue(response);

      await service.getDailyUserTrend(7, 'whatsapp', 'farmer');

      expect(mockChatbotRepository.getDailyUserTrend).toHaveBeenCalledWith(
        7,
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getDailyUserTrend.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getDailyUserTrend()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getDailyUserTrend()).rejects.toThrow(
        'Failed to fetch daily user trend',
      );
    });
  });
  // ==========================================================
  // getWeeklyAnalytics
  // ==========================================================

  describe('getWeeklyAnalytics', () => {
    it('returns weekly analytics from repository', async () => {
      const response = [
        {
          week: '2025-W01',
          users: 120,
          questions: 340,
        },
        {
          week: '2025-W02',
          users: 145,
          questions: 381,
        },
      ];

      mockChatbotRepository.getWeeklyAnalytics.mockResolvedValue(response);

      const result = await service.getWeeklyAnalytics();

      expect(mockChatbotRepository.getWeeklyAnalytics).toHaveBeenCalledWith(
        undefined,
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual(response);
    });

    it('passes custom month, source and userType', async () => {
      const response = [
        {
          week: '2025-W10',
          users: 98,
          questions: 210,
        },
      ];

      mockChatbotRepository.getWeeklyAnalytics.mockResolvedValue(response);

      await service.getWeeklyAnalytics('2025-03', 'whatsapp', 'farmer');

      expect(mockChatbotRepository.getWeeklyAnalytics).toHaveBeenCalledWith(
        '2025-03',
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getWeeklyAnalytics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getWeeklyAnalytics()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getWeeklyAnalytics()).rejects.toThrow(
        'Failed to fetch weekly analytics',
      );
    });
  });
  // ==========================================================
  // getMonthlyAnalytics
  // ==========================================================

  describe('getMonthlyAnalytics', () => {
    it('returns monthly analytics from repository', async () => {
      const response = [
        {
          month: '2025-01',
          users: 4200,
          questions: 10800,
        },
        {
          month: '2025-02',
          users: 4510,
          questions: 11230,
        },
      ];

      mockChatbotRepository.getMonthlyAnalytics.mockResolvedValue(response);

      const result = await service.getMonthlyAnalytics();

      expect(mockChatbotRepository.getMonthlyAnalytics).toHaveBeenCalledWith(
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = [
        {
          month: '2025-03',
          users: 980,
          questions: 2150,
        },
      ];

      mockChatbotRepository.getMonthlyAnalytics.mockResolvedValue(response);

      await service.getMonthlyAnalytics('whatsapp', 'farmer');

      expect(mockChatbotRepository.getMonthlyAnalytics).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getMonthlyAnalytics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getMonthlyAnalytics()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getMonthlyAnalytics()).rejects.toThrow(
        'Failed to fetch monthly analytics',
      );
    });
  });
  // ==========================================================
  // getQueryAnalytics
  // ==========================================================

  describe('getQueryAnalytics', () => {
    it('returns paginated daily analytics', async () => {
      const rows = [
        {date: '2025-01-01'},
        {date: '2025-01-02'},
        {date: '2025-01-03'},
      ];

      mockChatbotRepository.getDailyAnalytics.mockResolvedValue(rows);

      const result = await service.getQueryAnalytics('daily', {});

      expect(mockChatbotRepository.getDailyAnalytics).toHaveBeenCalledWith(
        undefined,
        'annam',
        undefined,
        'all',
      );

      expect(result).toEqual({
        data: rows,
        page: 1,
        limit: 10,
        total: 3,
        totalPages: 1,
      });
    });

    it('returns paginated weekly analytics', async () => {
      const rows = [{week: 'W1'}, {week: 'W2'}];

      mockChatbotRepository.getWeeklyAnalytics.mockResolvedValue(rows);

      const result = await service.getQueryAnalytics('weekly', {
        month: '2025-01',
        source: 'whatsapp',
        userType: 'farmer',
      });

      expect(mockChatbotRepository.getWeeklyAnalytics).toHaveBeenCalledWith(
        '2025-01',
        'whatsapp',
        undefined,
        'farmer',
      );

      expect(result).toEqual({
        data: rows,
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('returns paginated monthly analytics', async () => {
      const rows = [{month: 'Jan'}, {month: 'Feb'}];

      mockChatbotRepository.getMonthlyAnalytics.mockResolvedValue(rows);

      const result = await service.getQueryAnalytics('monthly', {
        year: 2025,
      });

      expect(mockChatbotRepository.getMonthlyAnalytics).toHaveBeenCalledWith(
        'annam',
        undefined,
        'all',
        2025,
      );

      expect(result).toEqual({
        data: rows,
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
    });

    it('paginates results correctly', async () => {
      const rows = Array.from({length: 25}, (_, i) => ({
        id: i + 1,
      }));

      mockChatbotRepository.getDailyAnalytics.mockResolvedValue(rows);

      const result = await service.getQueryAnalytics('daily', {
        page: 2,
        limit: 10,
      });

      expect(result).toEqual({
        data: rows.slice(10, 20),
        page: 2,
        limit: 10,
        total: 25,
        totalPages: 3,
      });
    });

    it('normalizes invalid page and limit', async () => {
      const rows = [{id: 1}];

      mockChatbotRepository.getDailyAnalytics.mockResolvedValue(rows);

      const result = await service.getQueryAnalytics('daily', {
        page: 0,
        limit: -5,
      });

      expect(result).toEqual({
        data: rows,
        page: 1,
        limit: 1,
        total: 1,
        totalPages: 1,
      });
    });

    it('throws InternalServerError when daily repository fails', async () => {
      mockChatbotRepository.getDailyAnalytics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getQueryAnalytics('daily', {})).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getQueryAnalytics('daily', {})).rejects.toThrow(
        'Failed to fetch query analytics',
      );
    });
  });
  // ==========================================================
  // getUserDetails
  // ==========================================================

  describe('getUserDetails', () => {
    it('returns paginated user details with default parameters', async () => {
      const response = {
        users: [{_id: '1', name: 'John'}],
        total: 1,
        page: 1,
        limit: 10,
      };

      mockChatbotRepository.getUserDetails.mockResolvedValue(response);

      const result = await service.getUserDetails();

      expect(mockChatbotRepository.getUserDetails).toHaveBeenCalledWith(
        undefined,
        undefined,
        1,
        10,
        '',
        'annam',
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'all',
        false,
        undefined,
        'all',
        '',
        'totalQuestions',
        'desc',
        false,
        false,
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes all custom parameters correctly', async () => {
      const response = {
        users: [],
        total: 0,
        page: 2,
        limit: 20,
      };

      mockChatbotRepository.getUserDetails.mockResolvedValue(response);

      await service.getUserDetails(
        '2025-01-01',
        '2025-01-31',
        2,
        20,
        'john',
        'whatsapp',
        'Wheat',
        'Rice',
        'Corn',
        'Village A',
        'Punjab',
        'Bathinda',
        'Rampura',
        'completed',
        true,
        true,
        'farmer',
        'admin',
        'name',
        'asc',
        true,
        'phone',
        true,
      );

      expect(mockChatbotRepository.getUserDetails).toHaveBeenCalledWith(
        new Date('2025-01-01'),
        new Date('2025-01-31'),
        2,
        20,
        'john',
        'whatsapp',
        'Wheat',
        'Rice',
        'Corn',
        'Village A',
        'Punjab',
        'Bathinda',
        'Rampura',
        'completed',
        true,
        undefined,
        'farmer',
        'admin',
        'name',
        'asc',
        true,
        true,
        'phone',
        true,
      );
    });

    it('converts date strings into Date objects', async () => {
      mockChatbotRepository.getUserDetails.mockResolvedValue({
        users: [],
        total: 0,
      });

      await service.getUserDetails('2025-06-01', '2025-06-30');

      const args = mockChatbotRepository.getUserDetails.mock.calls[0];

      expect(args[0]).toBeInstanceOf(Date);
      expect(args[1]).toBeInstanceOf(Date);
      expect(args[0].toISOString()).toContain('2025-06-01');
      expect(args[1].toISOString()).toContain('2025-06-30');
    });

    it('passes undefined dates when no dates are provided', async () => {
      mockChatbotRepository.getUserDetails.mockResolvedValue({
        users: [],
        total: 0,
      });

      await service.getUserDetails();

      const args = mockChatbotRepository.getUserDetails.mock.calls[0];

      expect(args[0]).toBeUndefined();
      expect(args[1]).toBeUndefined();
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getUserDetails.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getUserDetails()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getUserDetails()).rejects.toThrow(
        'Failed to fetch user details',
      );
    });
  });
  // ==========================================================
  // getUserQuestionsData
  // ==========================================================

  describe('getUserQuestionsData', () => {
    it('returns questions and messages when user has linked questions', async () => {
      const user = {
        userId: 'user-1',
      };

      const messages = {
        total: 2,
        items: [{message: 'Hello'}],
      };

      const questions = {
        total: 1,
        items: [{question: 'How to grow wheat?'}],
      };

      mockChatbotRepository.getUserData.mockResolvedValue(user);
      mockChatbotRepository.getUsersMessages.mockResolvedValue(messages);
      mockChatbotRepository.getUserConversationIds.mockResolvedValue([
        'thread-1',
      ]);
      mockChatbotRepository.getAllUserMessageIds.mockResolvedValue([
        'msg-1',
        'msg-2',
      ]);
      mockChatbotRepository.getUserQuestionsData.mockResolvedValue(questions);

      const result = await service.getUserQuestionsData('user@test.com');

      expect(mockChatbotRepository.getUserData).toHaveBeenCalledWith(
        'user@test.com',
        'annam',
      );

      expect(mockChatbotRepository.getUsersMessages).toHaveBeenCalledWith(
        'user@test.com',
        'annam',
        undefined,
        'all',
        1,
        10,
      );

      expect(mockChatbotRepository.getUserConversationIds).toHaveBeenCalledWith(
        'user-1',
        'annam',
      );

      expect(mockChatbotRepository.getAllUserMessageIds).toHaveBeenCalledWith(
        'user@test.com',
        'annam',
      );

      expect(mockChatbotRepository.getUserQuestionsData).toHaveBeenCalledWith(
        {
          threadIds: ['thread-1'],
          messageIds: ['msg-1', 'msg-2'],
          userId: 'user-1',
        },
        'annam',
        'all',
        1,
        10,
      );

      expect(result).toEqual({
        questions,
        messages,
      });
    });

    it('returns empty questions when user does not exist', async () => {
      const messages = {
        total: 5,
        items: [],
      };

      mockChatbotRepository.getUserData.mockResolvedValue(null);
      mockChatbotRepository.getUsersMessages.mockResolvedValue(messages);

      const result = await service.getUserQuestionsData('missing@test.com');

      expect(result).toEqual({
        questions: {
          total: 0,
          totalPages: 0,
          currentPage: 1,
          limit: 10,
          items: [],
        },
        messages,
      });

      expect(
        mockChatbotRepository.getUserConversationIds,
      ).not.toHaveBeenCalled();

      expect(mockChatbotRepository.getAllUserMessageIds).not.toHaveBeenCalled();

      expect(mockChatbotRepository.getUserQuestionsData).not.toHaveBeenCalled();
    });

    it('returns empty questions when user has no linked messages', async () => {
      mockChatbotRepository.getUserData.mockResolvedValue({
        userId: 'user-1',
      });

      mockChatbotRepository.getUsersMessages.mockResolvedValue({
        total: 1,
        items: [],
      });

      mockChatbotRepository.getUserConversationIds.mockResolvedValue([
        'thread-1',
      ]);

      mockChatbotRepository.getAllUserMessageIds.mockResolvedValue([]);

      const result = await service.getUserQuestionsData('user@test.com');

      expect(result.questions).toEqual({
        total: 0,
        totalPages: 0,
        currentPage: 1,
        limit: 10,
        items: [],
      });

      expect(mockChatbotRepository.getUserQuestionsData).not.toHaveBeenCalled();
    });

    it('passes custom source, userType, page and limit', async () => {
      mockChatbotRepository.getUserData.mockResolvedValue({
        userId: 'user-1',
      });

      mockChatbotRepository.getUsersMessages.mockResolvedValue({
        total: 0,
        items: [],
      });

      mockChatbotRepository.getUserConversationIds.mockResolvedValue([
        'thread-1',
      ]);

      mockChatbotRepository.getAllUserMessageIds.mockResolvedValue(['msg-1']);

      mockChatbotRepository.getUserQuestionsData.mockResolvedValue({
        total: 0,
        items: [],
      });

      await service.getUserQuestionsData(
        'user@test.com',
        'whatsapp',
        'farmer',
        2,
        25,
      );

      expect(mockChatbotRepository.getUsersMessages).toHaveBeenCalledWith(
        'user@test.com',
        'whatsapp',
        undefined,
        'farmer',
        2,
        25,
      );

      expect(mockChatbotRepository.getUserQuestionsData).toHaveBeenCalledWith(
        {
          threadIds: ['thread-1'],
          messageIds: ['msg-1'],
          userId: 'user-1',
        },
        'whatsapp',
        'farmer',
        2,
        25,
      );
    });

    it('propagates repository errors', async () => {
      mockChatbotRepository.getUserData.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getUserQuestionsData('user@test.com'),
      ).rejects.toThrow('Database error');
    });
  });
  // ==========================================================
  // getAvgSessionDurationV2
  // ==========================================================

  describe('getAvgSessionDurationV2', () => {
    it('returns average session duration v2 from repository', async () => {
      const response = {
        averageSessionDuration: 18.4,
      };

      mockChatbotRepository.getAvgSessionDurationV2.mockResolvedValue(response);

      const result = await service.getAvgSessionDurationV2();

      expect(
        mockChatbotRepository.getAvgSessionDurationV2,
      ).toHaveBeenCalledWith('annam', undefined, 'all');

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      const response = {
        averageSessionDuration: 25.1,
      };

      mockChatbotRepository.getAvgSessionDurationV2.mockResolvedValue(response);

      await service.getAvgSessionDurationV2('whatsapp', 'farmer');

      expect(
        mockChatbotRepository.getAvgSessionDurationV2,
      ).toHaveBeenCalledWith('whatsapp', undefined, 'farmer');
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getAvgSessionDurationV2.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getAvgSessionDurationV2()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getAvgSessionDurationV2()).rejects.toThrow(
        'Failed to fetch avg session duration v2',
      );
    });
  }); // ==========================================================
  // getWeeklyAvgSessionDurationV2
  // ==========================================================

  describe('getWeeklyAvgSessionDurationV2', () => {
    it('returns weekly average session duration v2 from repository', async () => {
      const response = [
        {
          week: '2025-W01',
          averageSessionDuration: 18.2,
        },
        {
          week: '2025-W02',
          averageSessionDuration: 21.5,
        },
      ];

      mockChatbotRepository.getWeeklyAvgSessionDurationV2.mockResolvedValue(
        response,
      );

      const result = await service.getWeeklyAvgSessionDurationV2();

      expect(
        mockChatbotRepository.getWeeklyAvgSessionDurationV2,
      ).toHaveBeenCalledWith(52, 'annam', undefined, 'all');

      expect(result).toEqual(response);
    });

    it('passes custom weeks, source and userType', async () => {
      const response = [
        {
          week: '2025-W10',
          averageSessionDuration: 24.3,
        },
      ];

      mockChatbotRepository.getWeeklyAvgSessionDurationV2.mockResolvedValue(
        response,
      );

      await service.getWeeklyAvgSessionDurationV2(12, 'whatsapp', 'farmer');

      expect(
        mockChatbotRepository.getWeeklyAvgSessionDurationV2,
      ).toHaveBeenCalledWith(12, 'whatsapp', undefined, 'farmer');
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getWeeklyAvgSessionDurationV2.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getWeeklyAvgSessionDurationV2()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getWeeklyAvgSessionDurationV2()).rejects.toThrow(
        'Failed to fetch weekly avg session duration v2',
      );
    });
  });
  describe('getWeeklyAvgSessionDurationV2', () => {
    it('returns excel buffer when report data exists', async () => {
      const states = [
        {
          stateNameEnglish: 'Punjab',
          stateCode: 3,
        },
      ];

      const districts = [{districtNameEnglish: 'Bathinda'}];

      mockLgdService.getStates.mockResolvedValue([
        {
          stateNameEnglish: 'Punjab',
          stateCode: 3,
        },
      ]);

      mockLgdService.getDistricts.mockResolvedValue([
        {
          districtNameEnglish: 'Bathinda',
        },
      ]);

      mockChatbotRepository.generateChatBotData.mockResolvedValue({
        totalDownloads: 10,
        averageSession: 20,
        dau: 5,
        feedback: 3,
        positiveFeedBackCount: 2,
        negativeFeedBackCount: 1,
        feedbackAccpetancePct: 66,
        monthlyQueries: [],
        weeklyQueries: [],
        dailyQueries: [],
        genderSplit: [],
        farmingExperience: [],
        ageGroup: [],
        queryCatagoryData: [],
        topCrops: {topCrops: []},
        topTenFaqs: [],
        districtAnalytics: [],
        positiveFeedback: [],
        negativeFeedback: [],
      });

      const result = await service.generateChatbotAnalyticsExcelReport(
        new Date(),
        new Date(),
        'Punjab',
      );

      expect(mockLgdService.getStates).toHaveBeenCalled();
      expect(mockLgdService.getDistricts).toHaveBeenCalledWith(3);
      expect(mockChatbotRepository.generateChatBotData).toHaveBeenCalled();
      expect(result).toBeDefined();

      const buffer = result as ArrayBuffer;

      expect(buffer.byteLength).toBeGreaterThan(0);
    });
    it('returns null when report data is not found', async () => {
      mockLgdService.getStates.mockResolvedValue([
        {
          stateNameEnglish: 'Punjab',
          stateCode: 3,
        },
      ]);

      mockLgdService.getDistricts.mockResolvedValue([]);

      mockChatbotRepository.generateChatBotData.mockResolvedValue(null);

      const result = await service.generateChatbotAnalyticsExcelReport(
        new Date(),
        new Date(),
        'Punjab',
      );

      expect(result).toBeNull();
    });
    it('passes correct parameters to repository', async () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      mockLgdService.getStates.mockResolvedValue([
        {
          stateNameEnglish: 'Punjab',
          stateCode: 3,
        },
      ]);

      const districts = [{districtNameEnglish: 'Bathinda'}];

      mockLgdService.getDistricts.mockResolvedValue(districts);

      mockChatbotRepository.generateChatBotData.mockResolvedValue({
        monthlyQueries: [],
        weeklyQueries: [],
        dailyQueries: [],
        genderSplit: [],
        farmingExperience: [],
        ageGroup: [],
        queryCatagoryData: [],
        topCrops: {topCrops: []},
        topTenFaqs: [],
        districtAnalytics: [],
        positiveFeedback: [],
        negativeFeedback: [],
      });

      await service.generateChatbotAnalyticsExcelReport(
        start,
        end,
        'Punjab',
        'whatsapp',
        'farmer',
      );

      expect(mockChatbotRepository.generateChatBotData).toHaveBeenCalledWith(
        start,
        end,
        30,
        'farmer',
        undefined,
        districts,
        'Punjab',
        'whatsapp',
      );
    });
    it('throws InternalServerError when getStates fails', async () => {
      mockLgdService.getStates.mockRejectedValue(new Error('LGD failed'));

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          new Date(),
          new Date(),
          'Punjab',
        ),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          new Date(),
          new Date(),
          'Punjab',
        ),
      ).rejects.toThrow('Failed to generate chatbot analytics Excel report');
    });
    it('throws InternalServerError when getDistricts fails', async () => {
      mockLgdService.getStates.mockResolvedValue([
        {
          stateNameEnglish: 'Punjab',
          stateCode: 3,
        },
      ]);

      mockLgdService.getDistricts.mockRejectedValue(
        new Error('District failed'),
      );

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          new Date(),
          new Date(),
          'Punjab',
        ),
      ).rejects.toThrow(InternalServerError);
    });
    it('throws InternalServerError when repository fails', async () => {
      mockLgdService.getStates.mockResolvedValue([
        {
          stateNameEnglish: 'Punjab',
          stateCode: 3,
        },
      ]);

      mockLgdService.getDistricts.mockResolvedValue([]);

      mockChatbotRepository.generateChatBotData.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          new Date(),
          new Date(),
          'Punjab',
        ),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          new Date(),
          new Date(),
          'Punjab',
        ),
      ).rejects.toThrow('Failed to generate chatbot analytics Excel report');
    });
  });
  describe('generateChatbotAnalyticsExcelReport', () => {
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-31');

    const reportData = {
      totalDownloads: 10,
      averageSession: 20,
      dau: 5,
      feedback: 3,
      positiveFeedBackCount: 2,
      negativeFeedBackCount: 1,
      feedbackAccpetancePct: 66,

      monthlyQueries: [],
      weeklyQueries: [],
      dailyQueries: [],

      genderSplit: [],
      farmingExperience: [],
      ageGroup: [],

      queryCatagoryData: [],

      topCrops: {
        topCrops: [],
      },

      topTenFaqs: [],
      districtAnalytics: [],

      positiveFeedback: [],
      negativeFeedback: [],
    };

    beforeEach(() => {
      mockLgdService.getStates.mockResolvedValue([
        {
          stateNameEnglish: 'Punjab',
          stateCode: 3,
        },
      ]);

      mockLgdService.getDistricts.mockResolvedValue([
        {
          districtNameEnglish: 'Bathinda',
        },
      ]);
    });

    it('returns excel buffer when report data exists', async () => {
      mockChatbotRepository.generateChatBotData.mockResolvedValue(reportData);

      const result = await service.generateChatbotAnalyticsExcelReport(
        startDate,
        endDate,
        'Punjab',
      );

      expect(mockLgdService.getStates).toHaveBeenCalled();

      expect(mockLgdService.getDistricts).toHaveBeenCalledWith(3);

      expect(mockChatbotRepository.generateChatBotData).toHaveBeenCalledWith(
        startDate,
        endDate,
        30,
        'all',
        undefined,
        [{districtNameEnglish: 'Bathinda'}],
        'Punjab',
        'annam',
      );

      expect(result).toBeTruthy();
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it('returns null when report data is not found', async () => {
      mockChatbotRepository.generateChatBotData.mockResolvedValue(null);

      const result = await service.generateChatbotAnalyticsExcelReport(
        startDate,
        endDate,
        'Punjab',
      );

      expect(result).toBeNull();
    });

    it('passes custom source and userType to repository', async () => {
      mockChatbotRepository.generateChatBotData.mockResolvedValue(reportData);

      await service.generateChatbotAnalyticsExcelReport(
        startDate,
        endDate,
        'Punjab',
        'whatsapp',
        'farmer',
      );

      expect(mockChatbotRepository.generateChatBotData).toHaveBeenCalledWith(
        startDate,
        endDate,
        30,
        'farmer',
        undefined,
        [{districtNameEnglish: 'Bathinda'}],
        'Punjab',
        'whatsapp',
      );
    });

    it('throws InternalServerError when state is not found', async () => {
      mockLgdService.getStates.mockResolvedValue([
        {
          stateNameEnglish: 'Punjab',
          stateCode: 3,
        },
      ]);

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          startDate,
          endDate,
          'Haryana',
        ),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          startDate,
          endDate,
          'Haryana',
        ),
      ).rejects.toThrow('Failed to generate chatbot analytics Excel report');

      expect(mockLgdService.getDistricts).not.toHaveBeenCalled();
      expect(mockChatbotRepository.generateChatBotData).not.toHaveBeenCalled();
    });

    it('throws InternalServerError when getStates fails', async () => {
      mockLgdService.getStates.mockRejectedValue(
        new Error('State service failed'),
      );

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          startDate,
          endDate,
          'Punjab',
        ),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          startDate,
          endDate,
          'Punjab',
        ),
      ).rejects.toThrow('Failed to generate chatbot analytics Excel report');
    });

    it('throws InternalServerError when getDistricts fails', async () => {
      mockLgdService.getDistricts.mockRejectedValue(
        new Error('District service failed'),
      );

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          startDate,
          endDate,
          'Punjab',
        ),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          startDate,
          endDate,
          'Punjab',
        ),
      ).rejects.toThrow('Failed to generate chatbot analytics Excel report');
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.generateChatBotData.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          startDate,
          endDate,
          'Punjab',
        ),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.generateChatbotAnalyticsExcelReport(
          startDate,
          endDate,
          'Punjab',
        ),
      ).rejects.toThrow('Failed to generate chatbot analytics Excel report');
    });
  });
  describe('generateChatbotAnalyticsPdfReport', () => {
    const startDate = new Date('2025-01-01');
    const endDate = new Date('2025-01-31');

    const reportData = {
      totalDownloads: 10,
      averageSession: 20,
      dau: 5,
      feedback: 3,
      positiveFeedBackCount: 2,
      negativeFeedBackCount: 1,
      feedbackAccpetancePct: 66,

      monthlyQueries: [],
      weeklyQueries: [],
      dailyQueries: [],

      genderSplit: [],
      farmingExperience: [],
      ageGroup: [],

      queryCatagoryData: [],

      topCrops: {
        topCrops: [],
      },

      topTenFaqs: [],
      districtAnalytics: [],

      positiveFeedback: [],
      negativeFeedback: [],
    };

    beforeEach(() => {
      vi.spyOn(service as any, 'drawTable').mockImplementation(() => {});
    });

    it('returns pdf buffer when report data exists', async () => {
      mockChatbotRepository.generateChatBotData.mockResolvedValue(reportData);

      const result = await service.generateChatbotAnalyticsPdfReport(
        startDate,
        endDate,
        'Punjab',
      );

      expect(mockChatbotRepository.generateChatBotData).toHaveBeenCalledWith(
        startDate,
        endDate,
        30,
        'annam',
        'all',
        undefined,
        'Punjab',
      );

      expect(service['drawTable']).toHaveBeenCalledTimes(12);

      expect(Buffer.isBuffer(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });

    it('passes custom source and userType', async () => {
      mockChatbotRepository.generateChatBotData.mockResolvedValue(reportData);

      await service.generateChatbotAnalyticsPdfReport(
        startDate,
        endDate,
        'Punjab',
        'whatsapp',
        'farmer',
      );

      expect(mockChatbotRepository.generateChatBotData).toHaveBeenCalledWith(
        startDate,
        endDate,
        30,
        'whatsapp',
        'farmer',
        undefined,
        'Punjab',
      );
    });

    it('calls drawTable with all expected sections', async () => {
      mockChatbotRepository.generateChatBotData.mockResolvedValue(reportData);

      const drawTable = vi.spyOn(service as any, 'drawTable');

      await service.generateChatbotAnalyticsPdfReport(
        startDate,
        endDate,
        'Punjab',
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        1,
        expect.anything(),
        'Monthly Queries',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        2,
        expect.anything(),
        'Weekly Queries',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        3,
        expect.anything(),
        'Daily Queries',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        4,
        expect.anything(),
        'Gender Split',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        5,
        expect.anything(),
        'Farming Experience',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        6,
        expect.anything(),
        'Age Group',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        7,
        expect.anything(),
        'Query Catagories',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        8,
        expect.anything(),
        'Top Crops',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        9,
        expect.anything(),
        'Top Faqs',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        10,
        expect.anything(),
        'District Analytics',
        [],
        'Punjab',
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        11,
        expect.anything(),
        'Positive Feedback',
        [],
      );

      expect(drawTable).toHaveBeenNthCalledWith(
        12,
        expect.anything(),
        'Negative Feedback',
        [],
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.generateChatBotData.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.generateChatbotAnalyticsPdfReport(startDate, endDate, 'Punjab'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.generateChatbotAnalyticsPdfReport(startDate, endDate, 'Punjab'),
      ).rejects.toThrow('Failed to generate chatbot analytics PDF report');
    });

    it('throws InternalServerError when drawTable fails', async () => {
      mockChatbotRepository.generateChatBotData.mockResolvedValue(reportData);

      vi.spyOn(service as any, 'drawTable').mockImplementation(() => {
        throw new Error('PDF rendering failed');
      });

      await expect(
        service.generateChatbotAnalyticsPdfReport(startDate, endDate, 'Punjab'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.generateChatbotAnalyticsPdfReport(startDate, endDate, 'Punjab'),
      ).rejects.toThrow('Failed to generate chatbot analytics PDF report');
    });
  });
  describe('getGrowth', () => {
    beforeEach(() => {
      vi.spyOn(service as any, '_withTransaction').mockImplementation(
        async (callback: any) => callback({}),
      );
    });

    it('returns growth data using default date range', async () => {
      mockChatbotRepository.getIdsCreated.mockResolvedValue([]);
      mockChatbotRepository.getInstalls.mockResolvedValue([]);
      mockChatbotRepository.getActiveUsers.mockResolvedValue([]);

      const result = await service.getGrowth('annam', 'all', 30);

      expect(mockChatbotRepository.getIdsCreated).toHaveBeenCalled();
      expect(mockChatbotRepository.getInstalls).toHaveBeenCalled();
      expect(mockChatbotRepository.getActiveUsers).toHaveBeenCalled();

      expect(result).toHaveProperty('labels');
      expect(result).toHaveProperty('series');
      expect(result.series).toHaveProperty('idsCreated');
      expect(result.series).toHaveProperty('installs');
      expect(result.series).toHaveProperty('activeUsers');
    });

    it('uses provided startDate and endDate', async () => {
      const start = new Date('2025-01-01');
      const end = new Date('2025-01-31');

      mockChatbotRepository.getIdsCreated.mockResolvedValue([]);
      mockChatbotRepository.getInstalls.mockResolvedValue([]);
      mockChatbotRepository.getActiveUsers.mockResolvedValue([]);

      await service.getGrowth('annam', 'farmer', 30, start, end);

      expect(mockChatbotRepository.getIdsCreated).toHaveBeenCalledWith(
        'farmer',
        start,
        end,
        {},
      );

      expect(mockChatbotRepository.getInstalls).toHaveBeenCalledWith(
        'farmer',
        start,
        end,
        {},
      );

      expect(mockChatbotRepository.getActiveUsers).toHaveBeenCalledWith(
        'farmer',
        start,
        end,
        {},
      );
    });

    it('uses WhatsApp growth path', async () => {
      const response = {
        labels: ['Jan'],
        series: {
          idsCreated: [1],
          installs: [2],
          activeUsers: [3],
        },
      };

      vi.spyOn(service, 'getWhatsappUserGrowth').mockResolvedValue(response);

      const result = await service.getGrowth('whatsapp', 'all', 30);

      expect(service.getWhatsappUserGrowth).toHaveBeenCalled();
      expect(mockChatbotRepository.getIdsCreated).not.toHaveBeenCalled();
      expect(mockChatbotRepository.getInstalls).not.toHaveBeenCalled();
      expect(mockChatbotRepository.getActiveUsers).not.toHaveBeenCalled();

      expect(result).toEqual(response);
    });

    it('propagates repository errors', async () => {
      mockChatbotRepository.getIdsCreated.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getGrowth('annam', 'all', 30)).rejects.toThrow(
        'Database error',
      );
    });

    it('propagates getWhatsappUserGrowth errors', async () => {
      vi.spyOn(service, 'getWhatsappUserGrowth').mockRejectedValue(
        new Error('Whatsapp error'),
      );

      await expect(service.getGrowth('whatsapp', 'all', 30)).rejects.toThrow(
        'Whatsapp error',
      );
    });
  });
  describe('getDuplicateQuestions', () => {
    it('returns duplicate questions from repository', async () => {
      const response = [
        {
          question: 'What is wheat rust?',
          count: 12,
        },
        {
          question: 'How to irrigate paddy?',
          count: 8,
        },
      ];

      mockChatbotRepository.getDuplicateQuestions.mockResolvedValue(response);

      const result = await service.getDuplicateQuestions();

      expect(mockChatbotRepository.getDuplicateQuestions).toHaveBeenCalledWith(
        'annam',
      );

      expect(result).toEqual(response);
    });

    it('passes custom source', async () => {
      const response = [
        {
          question: 'Test Question',
          count: 5,
        },
      ];

      mockChatbotRepository.getDuplicateQuestions.mockResolvedValue(response);

      await service.getDuplicateQuestions('whatsapp');

      expect(mockChatbotRepository.getDuplicateQuestions).toHaveBeenCalledWith(
        'whatsapp',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getDuplicateQuestions.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getDuplicateQuestions()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getDuplicateQuestions()).rejects.toThrow(
        'Failed to fetch duplicate questions',
      );
    });
  });
  describe('getDomainSpikes', () => {
    it('returns domain spikes from repository', async () => {
      const response = [
        {
          domain: 'Crop Advisory',
          spike: 45,
        },
        {
          domain: 'Weather',
          spike: 28,
        },
      ];

      mockChatbotRepository.getDomainSpikes.mockResolvedValue(response);

      const result = await service.getDomainSpikes();

      expect(mockChatbotRepository.getDomainSpikes).toHaveBeenCalledWith(60);

      expect(result).toEqual(response);
    });

    it('passes custom days', async () => {
      const response = [
        {
          domain: 'Soil Health',
          spike: 12,
        },
      ];

      mockChatbotRepository.getDomainSpikes.mockResolvedValue(response);

      await service.getDomainSpikes(30);

      expect(mockChatbotRepository.getDomainSpikes).toHaveBeenCalledWith(30);
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getDomainSpikes.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getDomainSpikes()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getDomainSpikes()).rejects.toThrow(
        'Failed to fetch domain spikes',
      );
    });
  });
  describe('getDailyQuestionTrends', () => {
    it('returns daily question trends from repository', async () => {
      const response = [
        {
          date: '2025-01-01',
          questions: 120,
        },
        {
          date: '2025-01-02',
          questions: 145,
        },
      ];

      mockChatbotRepository.getDailyQuestionTrends.mockResolvedValue(response);

      const result = await service.getDailyQuestionTrends();

      expect(mockChatbotRepository.getDailyQuestionTrends).toHaveBeenCalledWith(
        30,
        undefined,
        undefined,
        'all',
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes custom parameters', async () => {
      const response = [
        {
          date: '2025-02-01',
          questions: 50,
        },
      ];

      mockChatbotRepository.getDailyQuestionTrends.mockResolvedValue(response);

      await service.getDailyQuestionTrends(
        7,
        'whatsapp',
        'farmer',
        '08:00',
        '18:00',
      );

      expect(mockChatbotRepository.getDailyQuestionTrends).toHaveBeenCalledWith(
        7,
        'whatsapp',
        undefined,
        'farmer',
        '08:00',
        '18:00',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getDailyQuestionTrends.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getDailyQuestionTrends()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getDailyQuestionTrends()).rejects.toThrow(
        'Failed to fetch daily question trends',
      );
    });
  });
  describe('getTopFaqs', () => {
    it('returns top FAQs from repository', async () => {
      const response = [
        {
          question: 'How to increase wheat yield?',
          count: 120,
        },
        {
          question: 'When to irrigate paddy?',
          count: 95,
        },
      ];

      mockChatbotRepository.getTopFaqs.mockResolvedValue(response);

      const result = await service.getTopFaqs();

      expect(mockChatbotRepository.getTopFaqs).toHaveBeenCalledWith(
        'annam',
        undefined,
        'all',
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes custom source, userType and time filters', async () => {
      const response = [
        {
          question: 'Custom FAQ',
          count: 10,
        },
      ];

      mockChatbotRepository.getTopFaqs.mockResolvedValue(response);

      await service.getTopFaqs('whatsapp', 'farmer', '08:00', '18:00');

      expect(mockChatbotRepository.getTopFaqs).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
        '08:00',
        '18:00',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getTopFaqs.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getTopFaqs()).rejects.toThrow(InternalServerError);

      await expect(service.getTopFaqs()).rejects.toThrow(
        'Failed to fetch top FAQs',
      );
    });
  });
  describe('getUserById', () => {
    it('returns user from repository', async () => {
      const response = {
        _id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
      };

      mockChatbotRepository.getUserById.mockResolvedValue(response);

      const result = await service.getUserById('user-1', 'annam');

      expect(mockChatbotRepository.getUserById).toHaveBeenCalledWith(
        'user-1',
        'annam',
      );

      expect(result).toEqual(response);
    });

    it('passes custom source', async () => {
      mockChatbotRepository.getUserById.mockResolvedValue({
        _id: 'user-2',
      });

      await service.getUserById('user-2', 'whatsapp');

      expect(mockChatbotRepository.getUserById).toHaveBeenCalledWith(
        'user-2',
        'whatsapp',
      );
    });

    it('propagates repository errors', async () => {
      mockChatbotRepository.getUserById.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getUserById('user-1', 'annam')).rejects.toThrow(
        'Database error',
      );
    });
  });
  describe('deleteUser', () => {
    it('returns true when user is deleted', async () => {
      mockChatbotRepository.deleteUser.mockResolvedValue(true);

      const result = await service.deleteUser('user-1', 'annam');

      expect(mockChatbotRepository.deleteUser).toHaveBeenCalledWith(
        'user-1',
        'annam',
      );

      expect(result).toBe(true);
    });

    it('returns false when user is not deleted', async () => {
      mockChatbotRepository.deleteUser.mockResolvedValue(false);

      const result = await service.deleteUser('user-1', 'annam');

      expect(result).toBe(false);
    });

    it('passes custom source', async () => {
      mockChatbotRepository.deleteUser.mockResolvedValue(true);

      await service.deleteUser('user-1', 'whatsapp');

      expect(mockChatbotRepository.deleteUser).toHaveBeenCalledWith(
        'user-1',
        'whatsapp',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.deleteUser.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.deleteUser('user-1', 'annam')).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.deleteUser('user-1', 'annam')).rejects.toThrow(
        'Failed to delete user',
      );
    });
  });
  describe('updateUser', () => {
    it('updates user successfully', async () => {
      const data = {
        name: 'John Doe',
        userRole: 'farmer',
        farmerProfile: {
          farmerName: 'John',
          age: 35,
          gender: 'Male',
          villageName: 'Village A',
        },
      };

      mockChatbotRepository.updateUser.mockResolvedValue(true);

      const result = await service.updateUser('user-1', 'annam', data);

      expect(mockChatbotRepository.updateUser).toHaveBeenCalledWith(
        'user-1',
        'annam',
        data,
      );

      expect(result).toBe(true);
    });

    it('returns false when update fails', async () => {
      const data = {
        name: 'John Doe',
      };

      mockChatbotRepository.updateUser.mockResolvedValue(false);

      const result = await service.updateUser('user-1', 'annam', data);

      expect(result).toBe(false);
    });

    it('passes complete farmer profile', async () => {
      const data = {
        name: 'Ramesh',
        userRole: 'farmer',
        farmerProfile: {
          farmerName: 'Ramesh',
          age: 42,
          gender: 'Male',
          villageName: 'Village X',
          blockName: 'Block Y',
          district: 'Bathinda',
          state: 'Punjab',
          phoneNo: '9876543210',
          nearestKVK: 'KVK Bathinda',
          languagePreference: 'Punjabi',
          yearsOfExperience: 15,
          cropsCultivated: ['Wheat', 'Rice'],
          primaryCrop: 'Wheat',
          secondaryCrop: 'Rice',
          awarenessOfKCC: true,
          usesAgriApps: true,
          highestEducatedPerson: 'Graduate',
          numberOfSmartphones: 2,
          platform: 'Android',
          landhold: 12,
        },
      };

      mockChatbotRepository.updateUser.mockResolvedValue(true);

      await service.updateUser('user-1', 'whatsapp', data);

      expect(mockChatbotRepository.updateUser).toHaveBeenCalledWith(
        'user-1',
        'whatsapp',
        data,
      );
    });

    it('updates user with partial data', async () => {
      const data = {
        farmerProfile: {
          languagePreference: 'Hindi',
        },
      };

      mockChatbotRepository.updateUser.mockResolvedValue(true);

      await service.updateUser('user-1', 'annam', data);

      expect(mockChatbotRepository.updateUser).toHaveBeenCalledWith(
        'user-1',
        'annam',
        data,
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.updateUser.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.updateUser('user-1', 'annam', {})).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.updateUser('user-1', 'annam', {})).rejects.toThrow(
        'Failed to update user',
      );
    });
  });
  describe('changeUserPassword', () => {
    it('changes password successfully', async () => {
      mockChatbotRepository.changeUserPassword.mockResolvedValue(true);

      const result = await service.changeUserPassword(
        'user-1',
        'annam',
        'newPassword123',
        true,
      );

      expect(mockChatbotRepository.changeUserPassword).toHaveBeenCalledWith(
        'user-1',
        'annam',
        'newPassword123',
        true,
      );

      expect(result).toBe(true);
    });

    it('returns false when password is not changed', async () => {
      mockChatbotRepository.changeUserPassword.mockResolvedValue(false);

      const result = await service.changeUserPassword(
        'user-1',
        'annam',
        'newPassword123',
        false,
      );

      expect(result).toBe(false);
    });

    it('rethrows BadRequestError', async () => {
      const error = new BadRequestError('Invalid password');

      mockChatbotRepository.changeUserPassword.mockRejectedValue(error);

      await expect(
        service.changeUserPassword('user-1', 'annam', 'password', true),
      ).rejects.toBe(error);
    });

    it('rethrows NotFoundError', async () => {
      const error = new NotFoundError('User not found');

      mockChatbotRepository.changeUserPassword.mockRejectedValue(error);

      await expect(
        service.changeUserPassword('user-1', 'annam', 'password', true),
      ).rejects.toBe(error);
    });

    it('throws InternalServerError for unexpected errors', async () => {
      mockChatbotRepository.changeUserPassword.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.changeUserPassword('user-1', 'annam', 'password', true),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.changeUserPassword('user-1', 'annam', 'password', true),
      ).rejects.toThrow('Failed to change user password');
    });
  });
  describe('addUser', () => {
    it('adds user successfully', async () => {
      const data = {
        email: 'john@example.com',
        name: 'John Doe',
        password: 'password123',
        userRole: 'admin',
        isVerified: true,
      };

      mockChatbotRepository.addUser.mockResolvedValue(true);

      const result = await service.addUser('annam', data);

      expect(mockChatbotRepository.addUser).toHaveBeenCalledWith('annam', data);

      expect(result).toBe(true);
    });

    it('returns false when repository returns false', async () => {
      const data = {
        email: 'john@example.com',
        name: 'John Doe',
        password: 'password123',
      };

      mockChatbotRepository.addUser.mockResolvedValue(false);

      const result = await service.addUser('annam', data);

      expect(result).toBe(false);
    });

    it('rethrows BadRequestError', async () => {
      const error = new BadRequestError('User already exists');

      mockChatbotRepository.addUser.mockRejectedValue(error);

      await expect(
        service.addUser('annam', {
          email: 'john@example.com',
          name: 'John',
          password: 'password',
        }),
      ).rejects.toBe(error);
    });

    it('throws InternalServerError for Error objects', async () => {
      mockChatbotRepository.addUser.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.addUser('annam', {
          email: 'john@example.com',
          name: 'John',
          password: 'password',
        }),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.addUser('annam', {
          email: 'john@example.com',
          name: 'John',
          password: 'password',
        }),
      ).rejects.toThrow('Failed to add user');
    });

    it('throws InternalServerError for non-Error values', async () => {
      mockChatbotRepository.addUser.mockRejectedValue('Unknown failure');

      await expect(
        service.addUser('annam', {
          email: 'john@example.com',
          name: 'John',
          password: 'password',
        }),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.addUser('annam', {
          email: 'john@example.com',
          name: 'John',
          password: 'password',
        }),
      ).rejects.toThrow('Failed to add user: Unknown failure');
    });
  });
  describe('getRetentionMetrics', () => {
    it('returns retention metrics from repository', async () => {
      const response = {
        retentionRate: 72,
        retainedUsers: 144,
        totalUsers: 200,
      };

      mockChatbotRepository.getRetentionMetrics.mockResolvedValue(response);

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      const result = await service.getRetentionMetrics(
        'annam',
        'farmer',
        'weekly',
        startDate,
        endDate,
      );

      expect(mockChatbotRepository.getRetentionMetrics).toHaveBeenCalledWith(
        'annam',
        'farmer',
        'weekly',
        startDate,
        endDate,
      );

      expect(result).toEqual(response);
    });

    it('passes undefined dates when not provided', async () => {
      const response = {
        retentionRate: 80,
      };

      mockChatbotRepository.getRetentionMetrics.mockResolvedValue(response);

      await service.getRetentionMetrics('whatsapp', 'all', 'monthly');

      expect(mockChatbotRepository.getRetentionMetrics).toHaveBeenCalledWith(
        'whatsapp',
        'all',
        'monthly',
        undefined,
        undefined,
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getRetentionMetrics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getRetentionMetrics('annam', 'all', 'daily'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.getRetentionMetrics('annam', 'all', 'daily'),
      ).rejects.toThrow('Failed to fetch Retention Metrics');
    });
  });
  describe('getWhatsappUserGrowth', () => {
    it('returns growth for a single day', async () => {
      mockWhatsappService.getAllUsers.mockResolvedValue({
        data: [
          {
            firstMessageAt: '2025-01-01T10:00:00Z',
            lastMessageAt: '2025-01-01T11:00:00Z',
          },
          {
            firstMessageAt: '2025-01-01T12:00:00Z',
            lastMessageAt: '2025-01-01T13:00:00Z',
          },
        ],
      });

      const result = await service.getWhatsappUserGrowth(
        new Date('2025-01-01'),
        new Date('2025-01-01'),
      );

      expect(mockWhatsappService.getAllUsers).toHaveBeenCalled();

      expect(result).toEqual({
        labels: ['2025-01-01'],
        series: {
          idsCreated: [2],
          installs: [2],
          activeUsers: [2],
        },
      });
    });

    it('aggregates users across multiple days', async () => {
      mockWhatsappService.getAllUsers.mockResolvedValue({
        data: [
          {
            firstMessageAt: '2025-01-01T08:00:00Z',
            lastMessageAt: '2025-01-01T20:00:00Z',
          },
          {
            firstMessageAt: '2025-01-01T09:00:00Z',
            lastMessageAt: '2025-01-02T12:00:00Z',
          },
          {
            firstMessageAt: '2025-01-02T10:00:00Z',
            lastMessageAt: '2025-01-02T15:00:00Z',
          },
        ],
      });

      const result = await service.getWhatsappUserGrowth(
        new Date('2025-01-01'),
        new Date('2025-01-02'),
      );

      expect(result).toEqual({
        labels: ['2025-01-01', '2025-01-02'],
        series: {
          idsCreated: [2, 1],
          installs: [2, 1],
          activeUsers: [1, 2],
        },
      });
    });

    it('returns zero counts when there are no users', async () => {
      mockWhatsappService.getAllUsers.mockResolvedValue({
        data: [],
      });

      const result = await service.getWhatsappUserGrowth(
        new Date('2025-01-01'),
        new Date('2025-01-03'),
      );

      expect(result).toEqual({
        labels: ['2025-01-01', '2025-01-02', '2025-01-03'],
        series: {
          idsCreated: [0, 0, 0],
          installs: [0, 0, 0],
          activeUsers: [0, 0, 0],
        },
      });
    });

    it('propagates whatsapp service errors', async () => {
      mockWhatsappService.getAllUsers.mockRejectedValue(
        new Error('WhatsApp API failed'),
      );

      await expect(
        service.getWhatsappUserGrowth(
          new Date('2025-01-01'),
          new Date('2025-01-02'),
        ),
      ).rejects.toThrow('WhatsApp API failed');
    });
  });
  describe('notifyUser', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns success when webhook succeeds', async () => {
      mockChatbotRepository.getUserData.mockResolvedValue({
        userId: '12345',
      });

      vi.mocked(WebhookUtils.triggerWebhook).mockResolvedValue({
        ok: true,
        status: 200,
        body: 'Notification sent',
      } as any);

      const result = await service.notifyUser(
        'user@test.com',
        'message-1',
        'Hello farmer',
      );

      expect(mockChatbotRepository.getUserData).toHaveBeenCalledWith(
        'user@test.com',
        'annam',
      );

      expect(WebhookUtils.triggerWebhook).toHaveBeenCalledWith(
        appConfig.WEB_WEBHOOK_API_URL,
        appConfig.WEB_WEBHOOK_API_KEY,
        {
          customMessage: 'Hello farmer',
          userId: '12345',
          type: 'CUSTOM',
        },
        'Browser',
      );

      expect(result).toEqual({
        success: true,
        status: 200,
        message: 'Notification sent',
      });
    });

    it('throws InternalServerError when webhook returns ok=false', async () => {
      mockChatbotRepository.getUserData.mockResolvedValue({
        userId: '12345',
      });

      vi.mocked(WebhookUtils.triggerWebhook).mockResolvedValue({
        ok: false,
        status: 400,
        body: 'Bad Request',
      } as any);

      await expect(
        service.notifyUser('user@test.com', 'message-1', 'Hello'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.notifyUser('user@test.com', 'message-1', 'Hello'),
      ).rejects.toThrow(
        'Webhook failed with status 400, response: Bad Request',
      );
    });

    it('throws InternalServerError when webhook status is not 2xx', async () => {
      mockChatbotRepository.getUserData.mockResolvedValue({
        userId: '12345',
      });

      vi.mocked(WebhookUtils.triggerWebhook).mockResolvedValue({
        ok: true,
        status: 500,
        body: 'Server Error',
      } as any);

      await expect(
        service.notifyUser('user@test.com', 'message-1', 'Hello'),
      ).rejects.toThrow(
        'Webhook failed with status 500, response: Server Error',
      );
    });

    it('throws InternalServerError when webhook response has no body', async () => {
      mockChatbotRepository.getUserData.mockResolvedValue({
        userId: '12345',
      });

      vi.mocked(WebhookUtils.triggerWebhook).mockResolvedValue({
        ok: false,
        status: 503,
        body: '',
      } as any);

      await expect(
        service.notifyUser('user@test.com', 'message-1', 'Hello'),
      ).rejects.toThrow('Webhook failed with status 503, no response body');
    });

    it('propagates repository errors', async () => {
      mockChatbotRepository.getUserData.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.notifyUser('user@test.com', 'message-1', 'Hello'),
      ).rejects.toThrow('Database error');

      expect(WebhookUtils.triggerWebhook).not.toHaveBeenCalled();
    });

    it('propagates webhook errors', async () => {
      mockChatbotRepository.getUserData.mockResolvedValue({
        userId: '12345',
      });

      vi.mocked(WebhookUtils.triggerWebhook).mockRejectedValue(
        new Error('Webhook unavailable'),
      );

      await expect(
        service.notifyUser('user@test.com', 'message-1', 'Hello'),
      ).rejects.toThrow('Webhook unavailable');
    });
  });
  describe('getClosedAndNotifedData', () => {
    it('returns all dashboard data with default parameters', async () => {
      const closedVsTotalQuestions = {total: 100, closed: 80};
      const notifiedVsClosed = {notified: 60, closed: 80};
      const closedInLastTwoHours = {count: 5};
      const carryForward = {count: 12};

      mockChatbotRepository.getClosedVsTotalQuestions.mockResolvedValue(
        closedVsTotalQuestions,
      );
      mockChatbotRepository.getNotifiedVsClosed.mockResolvedValue(
        notifiedVsClosed,
      );
      mockChatbotRepository.getClosedInLastTwoHours.mockResolvedValue(
        closedInLastTwoHours,
      );
      mockChatbotRepository.getCarryForwardQuestions.mockResolvedValue(
        carryForward,
      );

      const result = await service.getClosedAndNotifedData();

      expect(
        mockChatbotRepository.getClosedVsTotalQuestions,
      ).toHaveBeenCalledWith(undefined, undefined, undefined, undefined);

      expect(mockChatbotRepository.getNotifiedVsClosed).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(
        mockChatbotRepository.getClosedInLastTwoHours,
      ).toHaveBeenCalledWith(undefined, undefined, undefined, undefined);

      expect(
        mockChatbotRepository.getCarryForwardQuestions,
      ).toHaveBeenCalledWith(undefined, undefined);

      expect(result).toEqual({
        closedVsTotalQuestions,
        notifiedVsClosed,
        closedInLastTwoHours,
        carryForward,
      });
    });

    it('passes source, userType and converted dates', async () => {
      mockChatbotRepository.getClosedVsTotalQuestions.mockResolvedValue({});
      mockChatbotRepository.getNotifiedVsClosed.mockResolvedValue({});
      mockChatbotRepository.getClosedInLastTwoHours.mockResolvedValue({});
      mockChatbotRepository.getCarryForwardQuestions.mockResolvedValue({});

      await service.getClosedAndNotifedData(
        'annam',
        'farmer',
        '2025-01-01',
        '2025-01-31',
      );

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      expect(
        mockChatbotRepository.getClosedVsTotalQuestions,
      ).toHaveBeenCalledWith('annam', 'farmer', startDate, endDate);

      expect(mockChatbotRepository.getNotifiedVsClosed).toHaveBeenCalledWith(
        'annam',
        'farmer',
        startDate,
        endDate,
      );

      expect(
        mockChatbotRepository.getClosedInLastTwoHours,
      ).toHaveBeenCalledWith('annam', 'farmer', startDate, endDate);

      expect(
        mockChatbotRepository.getCarryForwardQuestions,
      ).toHaveBeenCalledWith('annam', 'farmer');
    });

    it('propagates repository errors', async () => {
      mockChatbotRepository.getClosedVsTotalQuestions.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getClosedAndNotifedData()).rejects.toThrow(
        'Database error',
      );
    });
  });
  describe('getMonthlyChurnRate', () => {
    it('returns monthly churn rate from repository', async () => {
      const response = {
        currentMonth: 4.2,
        previousMonth: 3.8,
      };

      mockChatbotRepository.getMonthlyChurnRate.mockResolvedValue(response);

      const result = await service.getMonthlyChurnRate('annam', 'farmer');

      expect(mockChatbotRepository.getMonthlyChurnRate).toHaveBeenCalledWith(
        'annam',
        'farmer',
      );

      expect(result).toEqual(response);
    });

    it('propagates repository errors', async () => {
      mockChatbotRepository.getMonthlyChurnRate.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getMonthlyChurnRate('annam', 'farmer'),
      ).rejects.toThrow('Database error');
    });
  });
  describe('getActiveUsersTrend', () => {
    it('returns active users trend from repository', async () => {
      const response = [
        {
          _id: '2025-01',
          activeUsers: 120,
        },
        {
          _id: '2025-02',
          activeUsers: 145,
        },
      ];

      mockChatbotRepository.getActiveUsersTrend.mockResolvedValue(response);

      const result = await service.getActiveUsersTrend(
        'annam',
        'farmer',
        'monthly',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
      );

      expect(mockChatbotRepository.getActiveUsersTrend).toHaveBeenCalledWith(
        'annam',
        'farmer',
        'monthly',
        new Date('2025-01-01'),
        new Date('2025-02-01'),
      );

      expect(result).toEqual(response);
    });

    it('propagates repository errors', async () => {
      mockChatbotRepository.getActiveUsersTrend.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getActiveUsersTrend('annam', 'farmer', 'monthly'),
      ).rejects.toThrow('Database error');
    });
  });
  describe('getTopQuestionsFromCollection', () => {
    it('returns top questions with default parameters', async () => {
      const response = [
        {
          question: 'What is wheat rust?',
          count: 15,
        },
        {
          question: 'Best fertilizer?',
          count: 10,
        },
      ];

      mockChatbotRepository.getTopQuestionsFromCollection.mockResolvedValue(
        response,
      );

      const result = await service.getTopQuestionsFromCollection();

      expect(
        mockChatbotRepository.getTopQuestionsFromCollection,
      ).toHaveBeenCalledWith('annam', undefined, 'all', undefined, undefined);

      expect(result).toEqual(response);
    });

    it('passes custom source, userType and date filters', async () => {
      const response = [
        {
          question: 'Rice disease',
          count: 8,
        },
      ];

      mockChatbotRepository.getTopQuestionsFromCollection.mockResolvedValue(
        response,
      );

      await service.getTopQuestionsFromCollection(
        'whatsapp',
        'farmer',
        '2025-01-01',
        '2025-01-31',
      );

      expect(
        mockChatbotRepository.getTopQuestionsFromCollection,
      ).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
        '2025-01-01',
        '2025-01-31',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getTopQuestionsFromCollection.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getTopQuestionsFromCollection()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getTopQuestionsFromCollection()).rejects.toThrow(
        'Failed to fetch top FAQs',
      );
    });
  });
  describe('getRepeatQueryCount', () => {
    it('returns repeat query count with default parameters', async () => {
      const response = {
        repeatQueries: 45,
        totalQueries: 120,
      };

      mockChatbotRepository.getRepeatQueryCount.mockResolvedValue(response);

      const result = await service.getRepeatQueryCount();

      expect(mockChatbotRepository.getRepeatQueryCount).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes custom parameters', async () => {
      const response = {
        repeatQueries: 20,
        totalQueries: 60,
      };

      mockChatbotRepository.getRepeatQueryCount.mockResolvedValue(response);

      await service.getRepeatQueryCount(
        'annam',
        'farmer',
        '2025-01-01',
        '2025-01-31',
      );

      expect(mockChatbotRepository.getRepeatQueryCount).toHaveBeenCalledWith(
        'annam',
        'farmer',
        '2025-01-01',
        '2025-01-31',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getRepeatQueryCount.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getRepeatQueryCount()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getRepeatQueryCount()).rejects.toThrow(
        'Failed to fetch repeat query count',
      );
    });
  });
  describe('getUsersMetrics', () => {
    it('returns user metrics with default parameters', async () => {
      const userDemographics = {
        totalUsers: 100,
      };

      const platformInstalls = [
        {
          platform: 'Android',
          installs: 80,
        },
      ];

      const kccAndAgriAppUsage = {
        kccUsers: 50,
        agriAppUsers: 35,
      };

      const feedbackData = {
        positive: 40,
        negative: 10,
      };

      mockChatbotRepository.getUserDemographics.mockResolvedValue(
        userDemographics,
      );
      mockChatbotRepository.getPlatformInstalls.mockResolvedValue(
        platformInstalls,
      );
      mockChatbotRepository.getKccAndAgriAppStats.mockResolvedValue(
        kccAndAgriAppUsage,
      );
      mockChatbotRepository.getFeedbackData.mockResolvedValue(feedbackData);

      const result = await service.getUsersMetrics();

      expect(mockChatbotRepository.getUserDemographics).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
      );

      expect(mockChatbotRepository.getPlatformInstalls).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
      );

      expect(mockChatbotRepository.getKccAndAgriAppStats).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
      );

      expect(mockChatbotRepository.getFeedbackData).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual({
        userDemographics,
        platformInstalls,
        kccAndAgriAppUsage,
        feedbackData,
      });
    });

    it('passes custom source and userType', async () => {
      mockChatbotRepository.getUserDemographics.mockResolvedValue({});
      mockChatbotRepository.getPlatformInstalls.mockResolvedValue([]);
      mockChatbotRepository.getKccAndAgriAppStats.mockResolvedValue({});
      mockChatbotRepository.getFeedbackData.mockResolvedValue({});

      await service.getUsersMetrics('whatsapp', 'farmer');

      expect(mockChatbotRepository.getUserDemographics).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
      );

      expect(mockChatbotRepository.getPlatformInstalls).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
      );

      expect(mockChatbotRepository.getKccAndAgriAppStats).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
      );

      expect(mockChatbotRepository.getFeedbackData).toHaveBeenCalledWith(
        'whatsapp',
        undefined,
        'farmer',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.getUserDemographics.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getUsersMetrics()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getUsersMetrics()).rejects.toThrow(
        'Failed to fetch users metrics',
      );
    });
  });
  describe('getAllUnverifiedUsers', () => {
    it('returns unverified users with default parameters', async () => {
      const response = {
        users: [
          {
            email: 'user1@test.com',
            name: 'User One',
          },
          {
            email: 'user2@test.com',
            name: 'User Two',
          },
        ],
        totalUsers: 2,
        totalPages: 1,
      };

      mockChatbotRepository.findUnverifiedUsers.mockResolvedValue(response);

      const result = await service.getAllUnverifiedUsers();

      expect(mockChatbotRepository.findUnverifiedUsers).toHaveBeenCalledWith(
        1,
        10,
        '',
        'annam',
      );

      expect(result).toEqual(response);
    });

    it('passes custom parameters', async () => {
      const response = {
        users: [],
        totalUsers: 0,
        totalPages: 0,
      };

      mockChatbotRepository.findUnverifiedUsers.mockResolvedValue(response);

      await service.getAllUnverifiedUsers(2, 25, 'john', 'whatsapp');

      expect(mockChatbotRepository.findUnverifiedUsers).toHaveBeenCalledWith(
        2,
        25,
        'john',
        'whatsapp',
      );
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.findUnverifiedUsers.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getAllUnverifiedUsers()).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.getAllUnverifiedUsers()).rejects.toThrow(
        'Failed to fetch unverified users',
      );
    });
  });
  describe('verifyUser', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('verifies user and sends email when isVerified is true', async () => {
      const user = {
        _id: '1',
        name: 'John Doe',
        email: 'john@test.com',
      };

      mockChatbotRepository.verifyUser.mockResolvedValue(user);

      vi.mocked(sendEmailNotification).mockResolvedValue(undefined);

      const result = await service.verifyUser('user-1', 'annam', true);

      expect(mockChatbotRepository.verifyUser).toHaveBeenCalledWith(
        'user-1',
        'annam',
        true,
      );

      expect(sendEmailNotification).toHaveBeenCalledTimes(1);

      expect(sendEmailNotification).toHaveBeenCalledWith(
        'john@test.com',
        'Annam Verification Request Approved',
        '',
        expect.stringContaining('John Doe'),
      );

      expect(result).toEqual(user);
    });

    it('verifies user without sending email when isVerified is false', async () => {
      const user = {
        _id: '1',
        name: 'John Doe',
        email: 'john@test.com',
      };

      mockChatbotRepository.verifyUser.mockResolvedValue(user);

      const result = await service.verifyUser('user-1', 'annam', false);

      expect(mockChatbotRepository.verifyUser).toHaveBeenCalledWith(
        'user-1',
        'annam',
        false,
      );

      expect(sendEmailNotification).not.toHaveBeenCalled();

      expect(result).toEqual(user);
    });

    it('throws InternalServerError when userId is missing', async () => {
      await expect(service.verifyUser('', 'annam', true)).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.verifyUser('', 'annam', true)).rejects.toThrow(
        'Failed to verify user with ID',
      );

      expect(mockChatbotRepository.verifyUser).not.toHaveBeenCalled();
    });

    it('throws InternalServerError when user is not found', async () => {
      mockChatbotRepository.verifyUser.mockResolvedValue(null);

      await expect(service.verifyUser('user-1', 'annam', true)).rejects.toThrow(
        InternalServerError,
      );

      expect(mockChatbotRepository.verifyUser).toHaveBeenCalled();
    });

    it('throws InternalServerError when repository fails', async () => {
      mockChatbotRepository.verifyUser.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.verifyUser('user-1', 'annam', true)).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.verifyUser('user-1', 'annam', true)).rejects.toThrow(
        'Failed to verify user with ID user-1',
      );
    });

    it('throws InternalServerError when sending email fails', async () => {
      const user = {
        _id: '1',
        name: 'John Doe',
        email: 'john@test.com',
      };

      mockChatbotRepository.verifyUser.mockResolvedValue(user);

      vi.mocked(sendEmailNotification).mockRejectedValue(
        new Error('Email service unavailable'),
      );

      await expect(service.verifyUser('user-1', 'annam', true)).rejects.toThrow(
        InternalServerError,
      );

      await expect(service.verifyUser('user-1', 'annam', true)).rejects.toThrow(
        'Failed to verify user with ID user-1',
      );
    });
  });
  describe('getResponseAdherenceTable', () => {
    const defaultResponse = {
      date: '2025-01-01',
      time: '10:00',
      timeWindow: '10:00-11:00',
      whatsappQueriesAsked: 100,
      ajrasakhaQueriesAsked: 80,
      whatsappPushedToReviewer: 10,
      ajrasakhaPushedToReviewer: 8,
      whatsappAnsweredWithin120Min: 90,
      ajrasakhaAnsweredWithin120Min: 70,
      whatsappPassedQuestions: 85,
      ajrasakhaPassedQuestions: 65,
      whatsappMarkedDuplicate: 5,
      ajrasakhaMarkedDuplicate: 4,
      whatsappDynamicWeather: 3,
      ajrasakhaDynamicWeather: 2,
      whatsappDynamicMarket: 6,
      ajrasakhaDynamicMarket: 5,
      whatsappDynamicSchemes: 4,
      ajrasakhaDynamicSchemes: 3,
      whatsappNonGdbWithin120: 88,
      ajrasakhaNonGdbWithin120: 68,
      whatsappInReview: 2,
      ajrasakhaInReview: 1,
      whatsappOpen: 3,
      ajrasakhaOpen: 2,
      whatsappDelayed: 1,
      ajrasakhaDelayed: 1,
      whatsappAverageResponseMinutes: 42,
      ajrasakhaAverageResponseMinutes: 48,
      whatsappAdherencePct: 95,
      ajrasakhaAdherencePct: 91,
    };

    it('returns response adherence table', async () => {
      mockChatbotRepository.getResponseAdherenceTable.mockResolvedValue(
        defaultResponse,
      );

      const result = await service.getResponseAdherenceTable();

      expect(
        mockChatbotRepository.getResponseAdherenceTable,
      ).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual(defaultResponse);
    });

    it('passes all custom parameters correctly', async () => {
      mockChatbotRepository.getResponseAdherenceTable.mockResolvedValue(
        defaultResponse,
      );

      await service.getResponseAdherenceTable(
        'annam',
        'farmer',
        '2025-01-01T00:00:00Z',
        '2025-01-31T23:59:59Z',
      );

      expect(
        mockChatbotRepository.getResponseAdherenceTable,
      ).toHaveBeenCalledWith(
        undefined,
        'farmer',
        '2025-01-01T00:00:00Z',
        '2025-01-31T23:59:59Z',
        'annam',
      );
    });

    it('returns fallback response when repository throws', async () => {
      mockChatbotRepository.getResponseAdherenceTable.mockRejectedValue(
        new Error('Database error'),
      );

      const result = await service.getResponseAdherenceTable();

      expect(result).toEqual({
        date: '',
        time: '',
        timeWindow: '',
        whatsappQueriesAsked: 0,
        ajrasakhaQueriesAsked: 0,
        whatsappPushedToReviewer: 0,
        ajrasakhaPushedToReviewer: 0,
        whatsappAnsweredWithin120Min: 0,
        ajrasakhaAnsweredWithin120Min: 0,
        whatsappPassedQuestions: 0,
        ajrasakhaPassedQuestions: 0,
        whatsappMarkedDuplicate: 0,
        ajrasakhaMarkedDuplicate: 0,
        whatsappDynamicWeather: 0,
        ajrasakhaDynamicWeather: 0,
        whatsappDynamicMarket: 0,
        ajrasakhaDynamicMarket: 0,
        whatsappDynamicSchemes: 0,
        ajrasakhaDynamicSchemes: 0,
        whatsappNonGdbWithin120: 0,
        ajrasakhaNonGdbWithin120: 0,
        whatsappInReview: 0,
        ajrasakhaInReview: 0,
        whatsappOpen: 0,
        ajrasakhaOpen: 0,
        whatsappDelayed: 0,
        ajrasakhaDelayed: 0,
        whatsappAverageResponseMinutes: 0,
        ajrasakhaAverageResponseMinutes: 0,
        whatsappAdherencePct: 0,
        ajrasakhaAdherencePct: 0,
      });
    });
  });
  describe('getQuestionsByCrop', () => {
    const response = {
      questions: [
        {
          _id: 'q1',
          question: 'How to control blast disease?',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    it('returns questions by crop with default parameters', async () => {
      mockChatbotRepository.getQuestionsByCrop.mockResolvedValue(response);

      const result = await service.getQuestionsByCrop('Rice');

      expect(mockChatbotRepository.getQuestionsByCrop).toHaveBeenCalledWith(
        'Rice',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes all custom parameters correctly', async () => {
      mockChatbotRepository.getQuestionsByCrop.mockResolvedValue(response);

      await service.getQuestionsByCrop(
        'Rice',
        ['Rice', 'Wheat'],
        'duplicate',
        2,
        25,
        'whatsapp',
        'farmer',
        'blast',
      );

      expect(mockChatbotRepository.getQuestionsByCrop).toHaveBeenCalledWith(
        'Rice',
        ['Rice', 'Wheat'],
        'duplicate',
        2,
        25,
        'whatsapp',
        undefined,
        'farmer',
        'blast',
      );
    });

    it('returns empty result when repository returns no questions', async () => {
      const emptyResponse = {
        questions: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      mockChatbotRepository.getQuestionsByCrop.mockResolvedValue(emptyResponse);

      const result = await service.getQuestionsByCrop('UnknownCrop');

      expect(result).toEqual(emptyResponse);
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.getQuestionsByCrop.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getQuestionsByCrop('Rice')).rejects.toThrow(
        'Database error',
      );
    });
  });
  describe('getQuestionsByStatus', () => {
    const response = {
      questions: [
        {
          _id: 'q1',
          question: 'How to control blast disease?',
          status: 'open',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    it('returns questions by status with default parameters', async () => {
      mockChatbotRepository.getQuestionsByStatus.mockResolvedValue(response);

      const result = await service.getQuestionsByStatus('open');

      expect(mockChatbotRepository.getQuestionsByStatus).toHaveBeenCalledWith(
        'open',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes all custom parameters correctly', async () => {
      mockChatbotRepository.getQuestionsByStatus.mockResolvedValue(response);

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await service.getQuestionsByStatus(
        'closed',
        2,
        20,
        'whatsapp',
        'farmer',
        'wheat',
        startDate,
        endDate,
      );

      expect(mockChatbotRepository.getQuestionsByStatus).toHaveBeenCalledWith(
        'closed',
        2,
        20,
        'whatsapp',
        undefined,
        'farmer',
        'wheat',
        startDate,
        endDate,
      );
    });

    it('returns empty result when repository returns no questions', async () => {
      const emptyResponse = {
        questions: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      mockChatbotRepository.getQuestionsByStatus.mockResolvedValue(
        emptyResponse,
      );

      const result = await service.getQuestionsByStatus('closed');

      expect(result).toEqual(emptyResponse);
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.getQuestionsByStatus.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getQuestionsByStatus('open')).rejects.toThrow(
        'Database error',
      );
    });
  });
  describe('getQuestionsClosedWithinTwoHours', () => {
    const response = {
      questions: [
        {
          _id: 'q1',
          question: 'How to control blast disease?',
          status: 'closed',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    it('returns questions closed within two hours with default parameters', async () => {
      mockChatbotRepository.getQuestionsClosedWithinTwoHours.mockResolvedValue(
        response,
      );

      const result = await service.getQuestionsClosedWithinTwoHours();

      expect(
        mockChatbotRepository.getQuestionsClosedWithinTwoHours,
      ).toHaveBeenCalledWith(
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes all custom parameters correctly', async () => {
      mockChatbotRepository.getQuestionsClosedWithinTwoHours.mockResolvedValue(
        response,
      );

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await service.getQuestionsClosedWithinTwoHours(
        2,
        20,
        'whatsapp',
        'farmer',
        'wheat',
        startDate,
        endDate,
        'true',
      );

      expect(
        mockChatbotRepository.getQuestionsClosedWithinTwoHours,
      ).toHaveBeenCalledWith(
        2,
        20,
        'whatsapp',
        undefined,
        'farmer',
        'wheat',
        startDate,
        endDate,
        'true',
      );
    });

    it('returns empty result when repository returns no questions', async () => {
      const emptyResponse = {
        questions: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      mockChatbotRepository.getQuestionsClosedWithinTwoHours.mockResolvedValue(
        emptyResponse,
      );

      const result = await service.getQuestionsClosedWithinTwoHours();

      expect(result).toEqual(emptyResponse);
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.getQuestionsClosedWithinTwoHours.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getQuestionsClosedWithinTwoHours()).rejects.toThrow(
        'Database error',
      );
    });
  });
  describe('getQuestionsByNotificationStatus', () => {
    const response = {
      questions: [
        {
          _id: 'q1',
          question: 'How to control blast disease?',
          notificationType: 'notified',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    it('returns questions by notification status', async () => {
      mockChatbotRepository.getQuestionsByNotificationStatus.mockResolvedValue(
        response,
      );

      const result = await service.getQuestionsByNotificationStatus(
        'notified',
        1,
        10,
        'annam',
      );

      expect(
        mockChatbotRepository.getQuestionsByNotificationStatus,
      ).toHaveBeenCalledWith(
        'notified',
        1,
        10,
        'annam',
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes all custom parameters correctly', async () => {
      mockChatbotRepository.getQuestionsByNotificationStatus.mockResolvedValue(
        response,
      );

      const startDate = new Date('2025-01-01');
      const endDate = new Date('2025-01-31');

      await service.getQuestionsByNotificationStatus(
        'pending',
        2,
        20,
        'whatsapp',
        'farmer',
        'rice',
        startDate,
        endDate,
      );

      expect(
        mockChatbotRepository.getQuestionsByNotificationStatus,
      ).toHaveBeenCalledWith(
        'pending',
        2,
        20,
        'whatsapp',
        undefined,
        'farmer',
        'rice',
        startDate,
        endDate,
      );
    });

    it('returns empty result when repository returns no questions', async () => {
      const emptyResponse = {
        questions: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      mockChatbotRepository.getQuestionsByNotificationStatus.mockResolvedValue(
        emptyResponse,
      );

      const result = await service.getQuestionsByNotificationStatus(
        'notified',
        1,
        10,
        'annam',
      );

      expect(result).toEqual(emptyResponse);
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.getQuestionsByNotificationStatus.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getQuestionsByNotificationStatus('notified', 1, 10, 'annam'),
      ).rejects.toThrow('Database error');
    });
  });
  describe('getQueriesByPeriod', () => {
    const response = {
      questions: [
        {
          _id: 'q1',
          question: 'How to control blast disease?',
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };

    it('returns queries by period', async () => {
      mockChatbotRepository.getQueriesByPeriod.mockResolvedValue(response);

      const result = await service.getQueriesByPeriod('daily', 1, 10, 'annam');

      expect(mockChatbotRepository.getQueriesByPeriod).toHaveBeenCalledWith(
        'daily',
        1,
        10,
        'annam',
        undefined,
        undefined,
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes all custom parameters correctly', async () => {
      mockChatbotRepository.getQueriesByPeriod.mockResolvedValue(response);

      await service.getQueriesByPeriod(
        'weekly',
        2,
        20,
        'whatsapp',
        'farmer',
        'rice',
      );

      expect(mockChatbotRepository.getQueriesByPeriod).toHaveBeenCalledWith(
        'weekly',
        2,
        20,
        'whatsapp',
        undefined,
        'farmer',
        'rice',
      );
    });

    it('returns empty result when repository returns no queries', async () => {
      const emptyResponse = {
        questions: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      };

      mockChatbotRepository.getQueriesByPeriod.mockResolvedValue(emptyResponse);

      const result = await service.getQueriesByPeriod(
        'monthly',
        1,
        10,
        'annam',
      );

      expect(result).toEqual(emptyResponse);
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.getQueriesByPeriod.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getQueriesByPeriod('daily', 1, 10, 'annam'),
      ).rejects.toThrow('Database error');
    });
  });
  describe('getAllStatesQuestionsAndUsersData', () => {
    const states = [
      {
        stateCode: 1,
        stateNameEnglish: 'Punjab',
      },
      {
        stateCode: 2,
        stateNameEnglish: 'Haryana',
      },
    ];

    const response = [
      {
        state: 'Punjab',
        totalQuestions: 120,
        totalUsers: 45,
      },
      {
        state: 'Haryana',
        totalQuestions: 80,
        totalUsers: 30,
      },
    ];

    it('returns all states questions and users data', async () => {
      mockLgdService.getStates.mockResolvedValue(states);

      mockChatbotRepository.getAllStatesQuestionsAndUsersData.mockResolvedValue(
        response,
      );

      const result = await service.getAllStatesQuestionsAndUsersData(
        'annam',
        'all',
      );

      expect(mockLgdService.getStates).toHaveBeenCalled();

      expect(
        mockChatbotRepository.getAllStatesQuestionsAndUsersData,
      ).toHaveBeenCalledWith('annam', 'all', states, undefined);

      expect(result).toEqual(response);
    });

    it('passes custom source and userType', async () => {
      mockLgdService.getStates.mockResolvedValue(states);

      mockChatbotRepository.getAllStatesQuestionsAndUsersData.mockResolvedValue(
        response,
      );

      await service.getAllStatesQuestionsAndUsersData('whatsapp', 'farmer');

      expect(
        mockChatbotRepository.getAllStatesQuestionsAndUsersData,
      ).toHaveBeenCalledWith('whatsapp', 'farmer', states, undefined);
    });

    it('throws InternalServerError when getStates fails', async () => {
      mockLgdService.getStates.mockRejectedValue(
        new Error('LGD service failed'),
      );

      await expect(
        service.getAllStatesQuestionsAndUsersData('annam', 'all'),
      ).rejects.toThrow(InternalServerError);

      await expect(
        service.getAllStatesQuestionsAndUsersData('annam', 'all'),
      ).rejects.toThrow('Internal Server Error Error: LGD service failed');
    });

    it('propagates repository error', async () => {
      mockLgdService.getStates.mockResolvedValue(states);

      mockChatbotRepository.getAllStatesQuestionsAndUsersData.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getAllStatesQuestionsAndUsersData('annam', 'all'),
      ).rejects.toThrow('Database error');
    });
  });
  describe('getUserProfile', () => {
    const response = {
      _id: 'user-1',
      name: 'John Doe',
      email: 'john@example.com',
      farmerProfile: {
        villageName: 'Village A',
        district: 'Bathinda',
        state: 'Punjab',
      },
    };

    it('returns user profile', async () => {
      mockChatbotRepository.getUserProfile.mockResolvedValue(response);

      const result = await service.getUserProfile('user-1');

      expect(mockChatbotRepository.getUserProfile).toHaveBeenCalledWith(
        'user-1',
      );

      expect(result).toEqual(response);
    });

    it('returns null when user profile is not found', async () => {
      mockChatbotRepository.getUserProfile.mockResolvedValue(null);

      const result = await service.getUserProfile('unknown-user');

      expect(mockChatbotRepository.getUserProfile).toHaveBeenCalledWith(
        'unknown-user',
      );

      expect(result).toBeNull();
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.getUserProfile.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getUserProfile('user-1')).rejects.toThrow(
        'Database error',
      );
    });
  });
  describe('assignUsers', () => {
    it('assigns users successfully', async () => {
      mockChatbotRepository.assignUsers.mockResolvedValue({
        success: true,
      });

      const result = await service.assignUsers('user-1', ['user-2', 'user-3']);

      expect(mockChatbotRepository.assignUsers).toHaveBeenCalledWith('user-1', [
        'user-2',
        'user-3',
      ]);

      expect(result).toEqual({
        success: true,
      });
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.assignUsers.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.assignUsers('user-1', ['user-2'])).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('unAssignUsers', () => {
    it('unassigns users successfully', async () => {
      mockChatbotRepository.unAssignUsers.mockResolvedValue({
        success: true,
      });

      const result = await service.unAssignUsers('user-1', [
        'user-2',
        'user-3',
      ]);

      expect(mockChatbotRepository.unAssignUsers).toHaveBeenCalledWith(
        'user-1',
        ['user-2', 'user-3'],
      );

      expect(result).toEqual({
        success: true,
      });
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.unAssignUsers.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.unAssignUsers('user-1', ['user-2'])).rejects.toThrow(
        'Database error',
      );
    });
  });

  describe('getVillageUserCounts', () => {
    const response = [
      {
        village: 'Village A',
        userCount: 12,
      },
      {
        village: 'Village B',
        userCount: 8,
      },
    ];

    it('returns village user counts', async () => {
      mockChatbotRepository.getVillageUserCounts.mockResolvedValue(response);

      const result = await service.getVillageUserCounts(
        'Punjab',
        'Bathinda',
        'annam',
        'all',
      );

      expect(mockChatbotRepository.getVillageUserCounts).toHaveBeenCalledWith(
        'Punjab',
        'Bathinda',
        'annam',
        'all',
        undefined,
      );

      expect(result).toEqual(response);
    });

    it('passes custom parameters correctly', async () => {
      mockChatbotRepository.getVillageUserCounts.mockResolvedValue(response);

      await service.getVillageUserCounts(
        'Haryana',
        'Hisar',
        'whatsapp',
        'farmer',
      );

      expect(mockChatbotRepository.getVillageUserCounts).toHaveBeenCalledWith(
        'Haryana',
        'Hisar',
        'whatsapp',
        'farmer',
        undefined,
      );
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.getVillageUserCounts.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(
        service.getVillageUserCounts('Punjab', 'Bathinda', 'annam', 'all'),
      ).rejects.toThrow('Database error');
    });
  });

  describe('getQuestionLifecycle', () => {
    const response = {
      questionId: 'q1',
      events: [
        {
          status: 'OPEN',
        },
        {
          status: 'CLOSED',
        },
      ],
    };

    it('returns question lifecycle', async () => {
      mockChatbotRepository.getQuestionLifecycle.mockResolvedValue(response);

      const result = await service.getQuestionLifecycle('q1');

      expect(mockChatbotRepository.getQuestionLifecycle).toHaveBeenCalledWith(
        'q1',
      );

      expect(result).toEqual(response);
    });

    it('returns null when lifecycle is not found', async () => {
      mockChatbotRepository.getQuestionLifecycle.mockResolvedValue(null);

      const result = await service.getQuestionLifecycle('unknown');

      expect(result).toBeNull();
    });

    it('propagates repository error', async () => {
      mockChatbotRepository.getQuestionLifecycle.mockRejectedValue(
        new Error('Database error'),
      );

      await expect(service.getQuestionLifecycle('q1')).rejects.toThrow(
        'Database error',
      );
    });
  });
});
