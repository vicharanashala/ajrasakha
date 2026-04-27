export type GrowthQuery = {
  range: number; // 30 | 60 | 90
};

export type GrowthResponse = {
  labels: string[];
  series: {
    idsCreated: number[];
    installs: number[];
    activeUsers: number[];
  };
};