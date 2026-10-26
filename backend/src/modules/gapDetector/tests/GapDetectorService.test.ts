import 'reflect-metadata';
import { describe, it, expect, beforeEach } from 'vitest';
import { GapDetectorService } from '../services/GapDetectorService.js';

describe('GapDetectorService', () => {
  let service: GapDetectorService;

  beforeEach(() => {
    service = new GapDetectorService();
  });

  it('should initialize and generate coverage heatmap matrix', () => {
    const heatmap = service.getHeatmapMatrix();

    expect(heatmap).toBeDefined();
    expect(heatmap.states.length).toBeGreaterThan(0);
    expect(heatmap.crops.length).toBeGreaterThan(0);
    expect(heatmap.cells.length).toBe(heatmap.states.length * heatmap.crops.length);
    expect(heatmap.overallCoverageScore).toBeGreaterThan(0);
    expect(heatmap.overallCoverageScore).toBeLessThanOrEqual(100);
    expect(heatmap.totalDisclaimers).toBeGreaterThan(0);
  });

  it('should identify semantic gap clusters ranked by query volume', () => {
    const clusters = service.getClusters();

    expect(clusters.length).toBeGreaterThan(0);
    // Should be sorted descending by query count
    for (let i = 0; i < clusters.length - 1; i++) {
      expect(clusters[i].queryCount).toBeGreaterThanOrEqual(clusters[i + 1].queryCount);
    }

    const first = clusters[0];
    expect(first.title).toBeDefined();
    expect(first.crop).toBeDefined();
    expect(first.state).toBeDefined();
    expect(first.sampleQueries.length).toBeGreaterThan(0);
    expect(first.recommendedGDBAction).toBeDefined();
  });

  it('should filter clusters by crop and state', () => {
    const wheatClusters = service.getClusters({ crop: 'Wheat' });
    expect(wheatClusters.every(c => c.crop.toLowerCase() === 'wheat')).toBe(true);

    const punjabWheatClusters = service.getClusters({ crop: 'Wheat', state: 'Punjab' });
    expect(punjabWheatClusters.every(c => c.crop.toLowerCase() === 'wheat' && c.state.toLowerCase() === 'punjab')).toBe(true);
  });

  it('should generate weekly GDB Gap & Outreach Report with recommendations', () => {
    const report = service.generateWeeklyReport();

    expect(report.reportId).toBeDefined();
    expect(report.summary.totalDisclaimers).toBeGreaterThan(0);
    expect(report.summary.projectedGDBTargetCount).toBe(200000);
    expect(report.topGaps.length).toBeLessThanOrEqual(20);
    expect(report.outreachRecommendations.length).toBeGreaterThan(0);

    const firstRec = report.outreachRecommendations[0];
    expect(firstRec.state).toBeDefined();
    expect(firstRec.district).toBeDefined();
    expect(firstRec.suggestedAction).toBeDefined();
  });

  it('should route a cluster to reviewer pipeline successfully', () => {
    const clusters = service.getClusters();
    const target = clusters[0];

    const result = service.routeClusterToReviewer(target.id);
    expect(result.success).toBe(true);
    expect(result.cluster?.status).toBe('in_review');

    const updated = service.getClusterById(target.id);
    expect(updated?.status).toBe('in_review');
  });
});

