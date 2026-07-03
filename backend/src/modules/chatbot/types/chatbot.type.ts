export type GrowthQuery = {
  range?: number;
  startDate?: string;
  endDate?: string;
  source?: string;
  userType?: string,
};

export type GrowthResponse = {
  labels: string[];
  series: {
    idsCreated: number[];
    installs: number[];
    activeUsers: number[];
  };
};

export type ActiveUsersQuery = {
  startDate?: string;
  endDate?: string;
  source?: string;
  userType?: string;
  requestType?: string;
};

export type RetentionMetricsQuery = {
  startDate?: string;
  endDate?: string;
  source?: string;
  userType?: string;
  requestType?: string;
}

export type TopFaqsQuery = {
  userType?: string;
  source?: string;
  startTime?: string;
  endTime?: string;
}

export type userProfileQuery = {
  userId: string;
}