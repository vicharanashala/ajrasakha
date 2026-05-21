export type GrowthQuery = {
  range?: number;
  startDate?: string;
  endDate?: string;
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
};
