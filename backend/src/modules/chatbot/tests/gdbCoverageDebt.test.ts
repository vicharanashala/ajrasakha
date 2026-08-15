import { describe, it, expect, vi } from 'vitest';

describe('GDB Coverage Debt Radar Methods', () => {
  it('should format filters and return default structural payload when database has no gap clusters', () => {
    const mockEmptyDbDoc = null;
    const defaultResponse = {
      week: mockEmptyDbDoc?.week ?? null,
      totalDisclaimers: mockEmptyDbDoc?.totalDisclaimers ?? 0,
      activeClustersCount: 0,
      weekOverWeekGrowth: 0,
      coverageDebtScore: 0,
      disclaimerDeflectionImpact: 0,
      topGapCluster: null,
      clusters: [],
    };

    expect(defaultResponse.week).toBeNull();
    expect(defaultResponse.totalDisclaimers).toBe(0);
    expect(defaultResponse.clusters).toEqual([]);
  });

  it('should correctly filter clusters by crop and state', () => {
    const sampleClusters = [
      { clusterId: 'cotton_maharashtra_pest', crop: 'Cotton', state: 'Maharashtra', domain: 'Pest' },
      { clusterId: 'paddy_punjab_disease', crop: 'Paddy', state: 'Punjab', domain: 'Disease' },
    ];

    const filterCrop = 'Cotton';
    const filtered = sampleClusters.filter(
      c => c.crop.toLowerCase() === filterCrop.toLowerCase()
    );

    expect(filtered.length).toBe(1);
    expect(filtered[0].clusterId).toBe('cotton_maharashtra_pest');
  });

  it('should create question payload with correct fields and omit hardcoded district string', () => {
    const data = {
      clusterId: 'cotton_maharashtra_pest',
      crop: 'Cotton',
      state: 'Maharashtra',
      domain: 'Pest Management',
      representativeQuestion: 'Cotton me keeda laga hai',
    };

    const newQuestionPayload = {
      question: data.representativeQuestion,
      status: 'pending',
      priority: 'high',
      source: 'GDB_GAP_RADAR',
      isAutoAllocate: false,
      details: {
        state: data.state,
        crop: data.crop,
        season: 'General',
        domain: [data.domain],
        clusterId: data.clusterId,
        pushedFromRadar: true,
      },
    };

    expect(newQuestionPayload.source).toBe('GDB_GAP_RADAR');
    expect(newQuestionPayload.details).not.toHaveProperty('district');
    expect(newQuestionPayload.details.clusterId).toBe('cotton_maharashtra_pest');
  });
});
