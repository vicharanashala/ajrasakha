import 'reflect-metadata';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {PerformanceService} from '../services/PerformanceService.js';
import * as backupEmailService from '#root/utils/backupEmailService.js';

vi.mock('#root/utils/backupEmailService.js', () => ({
  sendStatsEmail: vi.fn(),
}));

describe('PerformanceService ', () => {
  let service: PerformanceService;

  const mockQuestionRepo = {
    getContributionTrend: vi.fn(),
    getShiftBasedMetrics: vi.fn(),
    getShiftBasedTrends: vi.fn(),
    getQuestionStatusDistribution: vi.fn(),
    getQuestionLevelDistribution: vi.fn(),
    getShiftBasedTopExperts: vi.fn(),
    getShiftBasedTopApprovingExperts: vi.fn(),
    getCountBySource: vi.fn(),
    getModeratorApprovalRate: vi.fn(),
    getQuestionOverviewByStatus: vi.fn(),
    getQuestionAnalytics: vi.fn(),
    getClosedQuestionsCount: vi.fn(),
    getTodayApproved: vi.fn(),
    getYearAnalytics: vi.fn(),
    getMonthAnalytics: vi.fn(),
    getWeekAnalytics: vi.fn(),
    getDailyAnalytics: vi.fn(),
  };

  const mockUserRepo = {
    getCurrentUserWorkLoad: vi.fn(),
    updateCheckInTime: vi.fn(),
    getExpertPerformance: vi.fn(),
    getUserRoleCount: vi.fn(),
    findById: vi.fn(),
  };

  const mockRequestRepo = {};

  const mockQuestionSubmissionRepo = {
    heatMapResultsForReviewer: vi.fn(),
    getLevelWiseReport: vi.fn(),
  };

  const mockAnswerRepo = {
    getCurrentUserWorkLoad: vi.fn(),
    getAnswerOverviewByStatus: vi.fn(),
    getAnswerAnalytics: vi.fn(),
  };

  const mockDatabase = {};

  beforeEach(() => {
    vi.clearAllMocks();

    service = new PerformanceService(
      mockQuestionRepo as any,
      mockUserRepo as any,
      mockRequestRepo as any,
      mockQuestionSubmissionRepo as any,
      mockAnswerRepo as any,
      mockDatabase as any,
    );

    vi.spyOn(service as any, '_withTransaction').mockImplementation(
      async (callback: any) => callback({}),
    );
  });

  describe('getHeatMapresults', () => {
    it('returns reviewer heatmap', async () => {
      const query = {
        reviewerId: 'reviewer-1',
      };

      const response = {
        heatmap: [],
      };

      mockQuestionSubmissionRepo.heatMapResultsForReviewer.mockResolvedValueOnce(
        response,
      );

      const result = await service.getHeatMapresults(query as any);

      expect(result).toEqual(response);

      expect(
        mockQuestionSubmissionRepo.heatMapResultsForReviewer,
      ).toHaveBeenCalledWith(query);
    });
  });

  describe('getCurrentUserWorkLoad', () => {
    it('returns workload', async () => {
      const response = {
        currentUserAnswersCount: 5,
        totalQuestionsCount: 20,
        totalInreviewQuestionsCount: 7,
      };

      mockAnswerRepo.getCurrentUserWorkLoad.mockResolvedValueOnce(response);

      const result = await service.getCurrentUserWorkLoad('user-1');

      expect(result).toEqual(response);

      expect(mockAnswerRepo.getCurrentUserWorkLoad).toHaveBeenCalledWith(
        'user-1',
      );
    });
  });

  describe('updateCheckInTime', () => {
    it('updates check in time', async () => {
      const now = new Date();

      mockUserRepo.updateCheckInTime.mockResolvedValueOnce(undefined);

      await service.updateCheckInTime('user-1', now);

      expect(mockUserRepo.updateCheckInTime).toHaveBeenCalledWith(
        'user-1',
        now,
      );
    });
  });

  describe('getContributionTrend', () => {
    it('returns contribution trend', async () => {
      const response = [
        {
          source: 'APP',
          count: 10,
        },
      ];

      mockQuestionRepo.getCountBySource = vi
        .fn()
        .mockResolvedValueOnce(response);

      const result = await service.getContributionTrend('week');

      expect(result).toEqual(response);

      expect(mockQuestionRepo.getCountBySource).toHaveBeenCalledWith(
        'week',
        expect.anything(),
      );
    });
  });

  describe('getExpertPerformance', () => {
    it('returns expert performance', async () => {
      const response = [
        {
          expert: 'John',
          approved: 10,
        },
      ];

      mockUserRepo.getExpertPerformance.mockResolvedValueOnce(response);

      const result = await service.getExpertPerformance();

      expect(result).toEqual(response);

      expect(mockUserRepo.getExpertPerformance).toHaveBeenCalledWith(
        expect.anything(),
      );
    });
  });

  describe('getShiftBasedMetrics', () => {
    it('returns metrics', async () => {
      const response = {
        total: 15,
      };

      mockQuestionRepo.getShiftBasedMetrics.mockResolvedValueOnce(response);

      const result = await service.getShiftBasedMetrics(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
      );

      expect(result).toEqual(response);

      expect(mockQuestionRepo.getShiftBasedMetrics).toHaveBeenCalledWith(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
        expect.anything(),
      );
    });
  });

  describe('getShiftBasedTrends', () => {
    it('returns trends', async () => {
      const response = {
        trend: [],
      };

      mockQuestionRepo.getShiftBasedTrends.mockResolvedValueOnce(response);

      const result = await service.getShiftBasedTrends(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
      );

      expect(result).toEqual(response);

      expect(mockQuestionRepo.getShiftBasedTrends).toHaveBeenCalledWith(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
        expect.anything(),
      );
    });
  });

  describe('getQuestionStatusDistribution', () => {
    it('returns question status distribution', async () => {
      const response = [
        {
          status: 'OPEN',
          count: 20,
        },
      ];

      mockQuestionRepo.getQuestionStatusDistribution.mockResolvedValueOnce(
        response,
      );

      const result = await service.getQuestionStatusDistribution(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
      );

      expect(result).toEqual(response);

      expect(
        mockQuestionRepo.getQuestionStatusDistribution,
      ).toHaveBeenCalledWith(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
        expect.anything(),
      );
    });
  });

  describe('getQuestionLevelDistribution', () => {
    it('returns level distribution', async () => {
      const response = [
        {
          level: 'L1',
          count: 12,
        },
      ];

      mockQuestionRepo.getQuestionLevelDistribution.mockResolvedValueOnce(
        response,
      );

      const result = await service.getQuestionLevelDistribution(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
      );

      expect(result).toEqual(response);

      expect(
        mockQuestionRepo.getQuestionLevelDistribution,
      ).toHaveBeenCalledWith(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
        expect.anything(),
      );
    });
  });

  describe('getShiftBasedTopExperts', () => {
    it('returns top experts', async () => {
      const response = [
        {
          expert: 'John',
          score: 98,
        },
      ];

      mockQuestionRepo.getShiftBasedTopExperts.mockResolvedValueOnce(response);

      const result = await service.getShiftBasedTopExperts(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
      );

      expect(result).toEqual(response);

      expect(mockQuestionRepo.getShiftBasedTopExperts).toHaveBeenCalledWith(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
        expect.anything(),
      );
    });
  });

  describe('getShiftBasedTopApprovingExperts', () => {
    it('returns top approving experts', async () => {
      const response = [
        {
          expert: 'Jane',
          approvals: 50,
        },
      ];

      mockQuestionRepo.getShiftBasedTopApprovingExperts.mockResolvedValueOnce(
        response,
      );

      const result = await service.getShiftBasedTopApprovingExperts(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
      );

      expect(result).toEqual(response);

      expect(
        mockQuestionRepo.getShiftBasedTopApprovingExperts,
      ).toHaveBeenCalledWith(
        '2026-01-01',
        'Morning',
        'APP',
        '08:00',
        '14:00',
        expect.anything(),
      );
    });
  });

  describe('getOverview', () => {
    it('returns overview successfully', async () => {
      const userRoleOverview = [
        {
          role: 'expert',
          count: 12,
        },
      ];

      const moderatorApprovalRate = {
        approved: 90,
        rejected: 10,
      };

      mockUserRepo.getUserRoleCount.mockResolvedValueOnce(userRoleOverview);

      mockQuestionRepo.getModeratorApprovalRate.mockResolvedValueOnce(
        moderatorApprovalRate,
      );

      const result = await service.getOverview('user-1');

      expect(result).toEqual({
        userRoleOverview,
        moderatorApprovalRate,
      });

      expect(mockUserRepo.getUserRoleCount).toHaveBeenCalledWith(
        expect.anything(),
      );

      expect(mockQuestionRepo.getModeratorApprovalRate).toHaveBeenCalledWith(
        'user-1',
        expect.anything(),
      );
    });
  });

  describe('getQuestionsAnalytics', () => {
    it('returns question analytics', async () => {
      const analytics = {
        totalQuestions: 25,
      };

      mockQuestionRepo.getQuestionAnalytics.mockResolvedValueOnce({
        analytics,
      });

      const result = await service.getQuestionsAnalytics({
        type: 'question',
        startTime: '2026-01-01',
        endTime: '2026-01-31',
      } as any);

      expect(result).toEqual(analytics);

      expect(mockQuestionRepo.getQuestionAnalytics).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-01-31',
        expect.anything(),
        undefined,
        undefined,
        undefined,
        undefined,
      );
    });

    it('returns answer analytics', async () => {
      const analytics = {
        totalAnswers: 40,
      };

      mockAnswerRepo.getAnswerAnalytics.mockResolvedValueOnce({
        analytics,
      });

      const result = await service.getQuestionsAnalytics({
        type: 'answer',
        startTime: '2026-01-01',
        endTime: '2026-01-31',
      } as any);

      expect(result).toEqual(analytics);

      expect(mockAnswerRepo.getAnswerAnalytics).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-01-31',
        expect.anything(),
        undefined,
        undefined,
        undefined,
      );
    });

    it('passes all optional filters to question analytics', async () => {
      mockQuestionRepo.getQuestionAnalytics.mockResolvedValueOnce({
        analytics: {},
      });

      await service.getQuestionsAnalytics({
        type: 'question',
        startTime: '2026-01-01',
        endTime: '2026-01-31',
        status: 'OPEN',
        state: 'Punjab',
        source: 'APP',
        crop: 'Wheat',
      } as any);

      expect(mockQuestionRepo.getQuestionAnalytics).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-01-31',
        expect.anything(),
        'OPEN',
        'Punjab',
        'APP',
        'Wheat',
      );
    });

    it('passes optional filters to answer analytics', async () => {
      mockAnswerRepo.getAnswerAnalytics.mockResolvedValueOnce({
        analytics: {},
      });

      await service.getQuestionsAnalytics({
        type: 'answer',
        startTime: '2026-01-01',
        endTime: '2026-01-31',
        status: 'APPROVED',
        state: 'Punjab',
        source: 'APP',
      } as any);

      expect(mockAnswerRepo.getAnswerAnalytics).toHaveBeenCalledWith(
        '2026-01-01',
        '2026-01-31',
        expect.anything(),
        'Punjab',
        'APP',
        'APPROVED',
      );
    });
  });

  describe('getGoldenDataset', () => {
    beforeEach(() => {
      mockQuestionRepo.getClosedQuestionsCount.mockResolvedValue(100);

      mockQuestionRepo.getTodayApproved.mockResolvedValue({
        todayApproved: 15,
      });
    });

    it('returns yearly analytics', async () => {
      mockQuestionRepo.getYearAnalytics.mockResolvedValue({
        yearData: [{year: 2025}],
        totalEntriesByType: {},
        totalVerifiedByType: {},
        moderatorBreakdown: [],
        questionSourceBreakdown: [],
        questionsAnsweredWithin120Min: 10,
        averageResponseTime: 20,
        questionsAnsweredAfter120Min: 5,
        questionStateBreakdown: [],
        paeMetrics: {},
      });

      const result = await service.getGoldenDataset({
        viewType: 'year',
        selectedYear: 2025,
      } as any);

      expect(result.yearData).toEqual([{year: 2025}]);

      expect(mockQuestionRepo.getYearAnalytics).toHaveBeenCalledWith(
        2025,
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it('returns monthly analytics', async () => {
      mockQuestionRepo.getMonthAnalytics.mockResolvedValue({
        weeksData: [{week: 1}],
        totalEntriesByType: {},
        totalVerifiedByType: {},
        moderatorBreakdown: [],
        questionSourceBreakdown: [],
        questionsAnsweredWithin120Min: 10,
        averageResponseTime: 20,
        questionsAnsweredAfter120Min: 5,
        questionStateBreakdown: [],
        paeMetrics: {},
      });

      const result = await service.getGoldenDataset({
        viewType: 'month',
        selectedYear: 2025,
        selectedMonth: 5,
      } as any);

      expect(result.weeksData).toEqual([{week: 1}]);

      expect(mockQuestionRepo.getMonthAnalytics).toHaveBeenCalledWith(
        2025,
        5,
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it('returns weekly analytics', async () => {
      mockQuestionRepo.getWeekAnalytics.mockResolvedValue({
        dailyData: [{day: 1}],
        totalEntriesByType: {},
        totalVerifiedByType: {},
        moderatorBreakdown: [],
        questionSourceBreakdown: [],
        questionsAnsweredWithin120Min: 10,
        averageResponseTime: 20,
        questionsAnsweredAfter120Min: 5,
        questionStateBreakdown: [],
        paeMetrics: {},
      });

      const result = await service.getGoldenDataset({
        viewType: 'week',
        selectedYear: 2025,
        selectedMonth: 5,
        selectedWeek: 3,
      } as any);

      expect(result.dailyData).toEqual([{day: 1}]);

      expect(mockQuestionRepo.getWeekAnalytics).toHaveBeenCalledWith(
        2025,
        5,
        3,
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it('returns daily analytics', async () => {
      mockQuestionRepo.getDailyAnalytics.mockResolvedValue({
        dayHourlyData: [{hour: 10}],
        totalEntriesByType: {},
        totalVerifiedByType: {},
        moderatorBreakdown: [],
        questionSourceBreakdown: [],
        questionsAnsweredWithin120Min: 10,
        averageResponseTime: 20,
        questionsAnsweredAfter120Min: 5,
        questionStateBreakdown: [],
        paeMetrics: {},
      });

      const result = await service.getGoldenDataset({
        viewType: 'day',
        selectedYear: 2025,
        selectedMonth: 5,
        selectedWeek: 3,
        selectedDay: 12,
      } as any);

      expect(result.dayHourlyData).toEqual([{hour: 10}]);

      expect(mockQuestionRepo.getDailyAnalytics).toHaveBeenCalledWith(
        2025,
        5,
        3,
        12,
        undefined,
        undefined,
        expect.anything(),
      );
    });

    it('passes custom date range', async () => {
      mockQuestionRepo.getYearAnalytics.mockResolvedValue({
        yearData: [],
        totalEntriesByType: {},
        totalVerifiedByType: {},
        moderatorBreakdown: [],
        questionSourceBreakdown: [],
        questionsAnsweredWithin120Min: 0,
        averageResponseTime: 0,
        questionsAnsweredAfter120Min: 0,
        questionStateBreakdown: [],
        paeMetrics: {},
      });

      await service.getGoldenDataset({
        viewType: 'year',
        selectedYear: 2025,
        customStartDateTime: '2025-01-01',
        customEndDateTime: '2025-01-31',
      } as any);

      expect(mockQuestionRepo.getYearAnalytics).toHaveBeenCalledWith(
        2025,
        '2025-01-01',
        '2025-01-31',
        expect.anything(),
      );
    });
  });

  describe('getDashboardData', () => {
    const dashboardQuery = {
      goldenDataViewType: 'year',
      goldenDataSelectedYear: 2025,
      goldenDataSelectedMonth: 1,
      goldenDataSelectedWeek: 1,
      goldenDataSelectedDay: 1,
      sourceChartTimeRange: 'month',
      qnAnalyticsStartTime: '2025-01-01',
      qnAnalyticsEndTime: '2025-01-31',
      qnAnalyticsType: 'question',
    };

    beforeEach(() => {
      vi.spyOn(service, 'getOverview').mockResolvedValue({
        userRoleOverview: [{role: 'expert', count: 5}],
        moderatorApprovalRate: {approved: 10},
      } as any);

      vi.spyOn(service, 'getGoldenDataset').mockResolvedValue({
        yearData: [],
      } as any);

      vi.spyOn(service, 'getContributionTrend').mockResolvedValue([
        {source: 'APP', count: 10},
      ] as any);

      vi.spyOn(service, 'getStatusOverview').mockResolvedValue({
        questions: {},
        answers: {},
      } as any);

      vi.spyOn(service, 'getExpertPerformance').mockResolvedValue([
        {expert: 'John'},
      ] as any);

      vi.spyOn(service, 'getQuestionsAnalytics').mockResolvedValue({
        analytics: [],
      } as any);
    });

    it('returns dashboard successfully', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        _id: 'user-1',
        role: 'admin',
      });

      const result = await service.getDashboardData(
        'user-1',
        dashboardQuery as any,
      );

      expect(result.data.userRoleOverview).toEqual([
        {role: 'expert', count: 5},
      ]);

      expect(service.getOverview).toHaveBeenCalledWith('user-1');
      expect(service.getGoldenDataset).toHaveBeenCalled();
      expect(service.getContributionTrend).toHaveBeenCalled();
      expect(service.getStatusOverview).toHaveBeenCalled();
      expect(service.getExpertPerformance).toHaveBeenCalled();
      expect(service.getQuestionsAnalytics).toHaveBeenCalled();
    });

    it('throws when user does not exist', async () => {
      mockUserRepo.findById.mockResolvedValueOnce(null);

      await expect(
        service.getDashboardData('user-1', dashboardQuery as any),
      ).rejects.toThrow("You don't have permission to access this data");
    });

    it('throws when user is expert', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'expert',
      });

      await expect(
        service.getDashboardData('user-1', dashboardQuery as any),
      ).rejects.toThrow("You don't have permission to access this data");
    });

    it('allows moderator', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'moderator',
      });

      await service.getDashboardData('user-1', dashboardQuery as any);

      expect(service.getOverview).toHaveBeenCalled();
    });

    it('allows admin', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'admin',
      });

      await service.getDashboardData('user-1', dashboardQuery as any);

      expect(service.getOverview).toHaveBeenCalled();
    });

    it('passes contribution trend query', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'admin',
      });

      await service.getDashboardData('user-1', dashboardQuery as any);

      expect(service.getContributionTrend).toHaveBeenCalledWith(
        dashboardQuery.sourceChartTimeRange,
      );
    });

    it('passes analytics query', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'admin',
      });

      await service.getDashboardData('user-1', dashboardQuery as any);

      expect(service.getQuestionsAnalytics).toHaveBeenCalledWith({
        type: dashboardQuery.qnAnalyticsType,
        startTime: dashboardQuery.qnAnalyticsStartTime,
        endTime: dashboardQuery.qnAnalyticsEndTime,
      });
    });

    it('passes golden dataset query', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'admin',
      });

      await service.getDashboardData('user-1', dashboardQuery as any);

      expect(service.getGoldenDataset).toHaveBeenCalledWith({
        viewType: dashboardQuery.goldenDataViewType,
        selectedYear: dashboardQuery.goldenDataSelectedYear,
        selectedMonth: dashboardQuery.goldenDataSelectedMonth,
        selectedWeek: dashboardQuery.goldenDataSelectedWeek,
        selectedDay: dashboardQuery.goldenDataSelectedDay,
      });
    });
  });
  describe('sendCronSnapshotEmail', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('sends snapshot email successfully', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        _id: 'admin-1',
        role: 'admin',
        email: 'admin@test.com',
      });

      vi.mocked(backupEmailService.sendStatsEmail).mockResolvedValueOnce(
        undefined,
      );

      await service.sendCronSnapshotEmail('admin-1');

      expect(mockUserRepo.findById).toHaveBeenCalledWith(
        'admin-1',
        expect.anything(),
      );

      expect(backupEmailService.sendStatsEmail).toHaveBeenCalledWith(
        'admin@test.com',
      );
    });

    it('throws when user is not found', async () => {
      mockUserRepo.findById.mockResolvedValueOnce(null);

      await expect(service.sendCronSnapshotEmail('admin-1')).rejects.toThrow(
        'Only admins can send cron snapshot report',
      );
    });

    it('throws when user is not admin', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'moderator',
        email: 'moderator@test.com',
      });

      await expect(service.sendCronSnapshotEmail('user-1')).rejects.toThrow(
        'Only admins can send cron snapshot report',
      );
    });

    it('throws when admin has no email', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'admin',
        email: '',
      });

      await expect(service.sendCronSnapshotEmail('admin-1')).rejects.toThrow(
        'Target admin user does not have an email address defined.',
      );
    });

    it('propagates sendStatsEmail error', async () => {
      mockUserRepo.findById.mockResolvedValueOnce({
        role: 'admin',
        email: 'admin@test.com',
      });

      vi.mocked(backupEmailService.sendStatsEmail).mockRejectedValueOnce(
        new Error('SMTP failed'),
      );

      await expect(service.sendCronSnapshotEmail('admin-1')).rejects.toThrow(
        'SMTP failed',
      );
    });
  });

  describe('getLevelWiseReport', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns null when repository returns no data', async () => {
      mockQuestionSubmissionRepo.getLevelWiseReport.mockResolvedValue([]);

      const result = await service.getLevelWiseReport(
        '2025-01-01',
        '2025-01-31',
      );

      expect(result).toBeNull();

      expect(
        mockQuestionSubmissionRepo.getLevelWiseReport,
      ).toHaveBeenCalledWith('2025-01-01', '2025-01-31', expect.anything());
    });

    it('returns excel buffer when report data exists', async () => {
      mockQuestionSubmissionRepo.getLevelWiseReport.mockResolvedValue([
        {
          month: 'January 2025',
          data: [
            {
              level: 'L1',
              approvedCount: 10,
              approvedPercentage: 80,
              rejectedCount: 2,
              rejectedPercentage: 10,
              modifiedCount: 1,
              modifiedPercentage: 10,
              avgTimeTakenMinutes: 120,
            },
          ],
        },
      ]);

      console.log(await mockQuestionSubmissionRepo.getLevelWiseReport());

      const buffer = await service.getLevelWiseReport(
        '2025-01-01',
        '2025-01-31',
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('creates workbook for multiple months', async () => {
      mockQuestionSubmissionRepo.getLevelWiseReport.mockResolvedValue([
        {
          month: '2025-01',
          data: [],
        },
        {
          month: '2025-02',
          data: [],
        },
      ]);

      const buffer = await service.getLevelWiseReport(
        '2025-01-01',
        '2025-02-28',
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });

    it('creates workbook with multiple rows', async () => {
      mockQuestionSubmissionRepo.getLevelWiseReport.mockResolvedValue([
        {
          month: '2025-01',
          data: [
            {
              level: 'L1',
              approvedCount: 10,
              approvedPercentage: 80,
              rejectedCount: 1,
              rejectedPercentage: 10,
              modifiedCount: 1,
              modifiedPercentage: 10,
              avgTimeTakenMinutes: 60,
            },
            {
              level: 'L2',
              approvedCount: 20,
              approvedPercentage: 90,
              rejectedCount: 1,
              rejectedPercentage: 5,
              modifiedCount: 1,
              modifiedPercentage: 5,
              avgTimeTakenMinutes: 100,
            },
          ],
        },
      ]);

      const buffer = await service.getLevelWiseReport(
        '2025-01-01',
        '2025-01-31',
      );

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe('getShiftBasedMetrics', () => {
    it('returns repository response', async () => {
      const response = {
        totalQuestions: 120,
      };

      mockQuestionRepo.getShiftBasedMetrics.mockResolvedValue(response);

      const result = await service.getShiftBasedMetrics(
        '2025-01-01',
        'morning',
        'WHATSAPP',
        '08:00',
        '14:00',
      );

      expect(result).toEqual(response);

      expect(mockQuestionRepo.getShiftBasedMetrics).toHaveBeenCalledWith(
        '2025-01-01',
        'morning',
        'WHATSAPP',
        '08:00',
        '14:00',
        expect.anything(),
      );
    });

    it('propagates repository errors', async () => {
      mockQuestionRepo.getShiftBasedMetrics.mockRejectedValue(
        new Error('DB Error'),
      );

      await expect(
        service.getShiftBasedMetrics(
          '2025-01-01',
          'morning',
          'WHATSAPP',
          '08:00',
          '14:00',
        ),
      ).rejects.toThrow('DB Error');
    });
  });
});
