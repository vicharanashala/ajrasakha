import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Body,
  QueryParams,
  Param,
  HttpCode,
  NotFoundError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GapDetectorService } from '../services/GapDetectorService.js';
import { GAP_DETECTOR_TYPES } from '../types.js';

@OpenAPI({
  tags: ['gap-detector'],
  description: 'GDB Coverage Gap Detector & Outreach Planning Endpoints',
})
@JsonController('/gap-detector')
@injectable()
export class GapDetectorController {
  constructor(
    @inject(GAP_DETECTOR_TYPES.GapDetectorService)
    private gapDetectorService: GapDetectorService
  ) {}

  @Get('/analytics')
  @OpenAPI({ summary: 'Get high-level GDB coverage metrics and overview stats' })
  async getAnalytics() {
    const heatmap = this.gapDetectorService.getHeatmapMatrix();
    const clusters = this.gapDetectorService.getClusters();
    const criticalClusters = clusters.filter(c => c.urgency === 'critical');
    const report = this.gapDetectorService.generateWeeklyReport();

    return {
      success: true,
      data: {
        overallCoverageScore: heatmap.overallCoverageScore,
        totalDisclaimersLogged: heatmap.totalDisclaimers,
        criticalGapsCount: criticalClusters.length,
        totalClustersIdentified: clusters.length,
        topUrgentGaps: clusters.slice(0, 5),
        summary: report.summary,
      },
    };
  }

  @Get('/heatmap')
  @OpenAPI({ summary: 'Get state vs crop coverage heatmap matrix' })
  async getHeatmap(@QueryParams() query: { domain?: string }) {
    const heatmap = this.gapDetectorService.getHeatmapMatrix(query.domain);
    return {
      success: true,
      data: heatmap,
    };
  }

  @Get('/clusters')
  @OpenAPI({ summary: 'List prioritized semantic gap clusters with filtering' })
  async getClusters(
    @QueryParams() query: {
      crop?: string;
      state?: string;
      domain?: string;
      urgency?: string;
      search?: string;
    }
  ) {
    const clusters = this.gapDetectorService.getClusters(query);
    return {
      success: true,
      count: clusters.length,
      data: clusters,
    };
  }

  @Get('/clusters/:id')
  @OpenAPI({ summary: 'Get details and sample farmer queries for a specific cluster' })
  async getClusterDetails(@Param('id') id: string) {
    const cluster = this.gapDetectorService.getClusterById(id);
    if (!cluster) {
      throw new NotFoundError(`Gap cluster with ID ${id} not found.`);
    }

    return {
      success: true,
      data: cluster,
    };
  }

  @Get('/report')
  @OpenAPI({ summary: 'Generate and return the full weekly GDB Gap & Outreach Report' })
  async getWeeklyReport() {
    const report = this.gapDetectorService.generateWeeklyReport();
    return {
      success: true,
      data: report,
    };
  }

  @Post('/route-to-reviewer')
  @HttpCode(200)
  @OpenAPI({ summary: 'Route an unanswered gap cluster to the PAE expert review pipeline' })
  async routeToReviewer(@Body() body: { clusterId: string }) {
    if (!body?.clusterId) {
      return {
        success: false,
        message: 'clusterId is required.',
      };
    }

    const result = this.gapDetectorService.routeClusterToReviewer(body.clusterId);
    return result;
  }
}

