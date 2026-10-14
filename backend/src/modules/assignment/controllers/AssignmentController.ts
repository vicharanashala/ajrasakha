import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Put,
  Param,
  Body,
  Authorized,
  QueryParam,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { injectable, inject } from 'inversify';
import { AssignmentService } from '../services/AssignmentService.js';
import { DashboardService } from '../services/DashboardService.js';
import {
  IAdminAssignmentStats,
  IAssignment,
  IExpertWorkload,
} from '../types.js';
import { AssignmentPriority } from '../types.js';

// ── Request DTOs ─────────────────────────────────────────────────────────────

class AssignQuestionBody {
  questionId!: string;
  priority!: 'low' | 'medium' | 'high' | 'critical';
  expertId?: string;
}

class ReassignBody {
  newExpertId!: string;
}

class FreezeBody {
  reason?: 'manual_freeze' | 'high_priority_occupies_slot';
}

// ── Response schemas (for OpenAPI) ──────────────────────────────────────────

class AssignmentResponse implements IAssignment {
  _id!: string;
  questionId!: string;
  expertId!: string;
  priority!: AssignmentPriority;
  status!: 'active' | 'frozen' | 'completed' | 'queued';
  frozenReason?: 'high_priority_occupies_slot' | 'manual_freeze';
  createdAt!: Date;
  updatedAt!: Date;
  completedAt?: Date;
}

class WorkloadResponse implements IExpertWorkload {
  expertId!: string;
  activeHigh!: number;
  activeMedium!: number;
  activeLow!: number;
  frozenMedium!: number;
  frozenLow!: number;
  queuedHigh!: number;
  queuedMedium!: number;
  queuedLow!: number;
  totalActive!: number;
  totalFrozen!: number;
  totalQueued!: number;
}

// ── Controller ───────────────────────────────────────────────────────────────

@injectable()
@JsonController('/assignments')
export class AssignmentController {
  constructor(
    private readonly assignmentService: AssignmentService,
    private readonly dashboardService: DashboardService,
  ) {}

  // ── Expert Dashboard ────────────────────────────────────────────────────

  @Get('/expert/:expertId/workload')
  @OpenAPI({ summary: 'Get workload for a specific expert' })
  @ResponseSchema(WorkloadResponse)
  async getExpertWorkload(@Param('expertId') expertId: string) {
    return this.dashboardService.getExpertWorkload(expertId);
  }

  @Get('/expert/:expertId/active')
  @OpenAPI({ summary: 'Get active assignments for an expert' })
  @ResponseSchema(AssignmentResponse, { isArray: true })
  async getExpertActive(@Param('expertId') expertId: string) {
    return this.dashboardService.getActiveAssignments(expertId);
  }

  @Get('/expert/:expertId/frozen')
  @OpenAPI({ summary: 'Get frozen assignments for an expert' })
  @ResponseSchema(AssignmentResponse, { isArray: true })
  async getExpertFrozen(@Param('expertId') expertId: string) {
    return this.dashboardService.getFrozenAssignments(expertId);
  }

  @Get('/expert/:expertId/queued')
  @OpenAPI({ summary: 'Get queued assignments for an expert' })
  @ResponseSchema(AssignmentResponse, { isArray: true })
  async getExpertQueued(@Param('expertId') expertId: string) {
    return this.dashboardService.getQueuedAssignments(expertId);
  }

  // ── Admin Dashboard ─────────────────────────────────────────────────────

  @Get('/admin/stats')
  @OpenAPI({ summary: 'Get admin-level assignment statistics' })
  async getAdminStats() {
    return this.dashboardService.getAdminStats();
  }

  @Get('/admin/active')
  @OpenAPI({ summary: 'Get all active assignments (admin view)' })
  @ResponseSchema(AssignmentResponse, { isArray: true })
  async getAllActive() {
    return this.dashboardService.getAllActiveAssignments();
  }

  @Get('/admin/frozen')
  @OpenAPI({ summary: 'Get all frozen assignments (admin view)' })
  @ResponseSchema(AssignmentResponse, { isArray: true })
  async getAllFrozen() {
    return this.dashboardService.getAllFrozenAssignments();
  }

  @Get('/admin/workloads')
  @OpenAPI({ summary: 'Get workload for all experts' })
  @ResponseSchema(WorkloadResponse, { isArray: true })
  async getAllWorkloads() {
    return this.dashboardService.getAllExpertWorkloads();
  }

  // ── Manual Assignment Operations ────────────────────────────────────────

  @Post('/assign')
  @OpenAPI({ summary: 'Assign a question to an expert (manual or auto)' })
  @ResponseSchema(AssignmentResponse)
  async assignQuestion(@Body() body: AssignQuestionBody) {
    return this.assignmentService.assignQuestion(
      body.questionId,
      body.priority,
      body.expertId,
    );
  }

  @Post('/:assignmentId/reassign')
  @OpenAPI({ summary: 'Reassign a question to a different expert' })
  @ResponseSchema(AssignmentResponse)
  async reassign(
    @Param('assignmentId') assignmentId: string,
    @Body() body: ReassignBody,
  ) {
    return this.assignmentService.reassignToExpert(assignmentId, body.newExpertId);
  }

  @Post('/:assignmentId/freeze')
  @OpenAPI({ summary: 'Manually freeze an assignment' })
  @ResponseSchema(AssignmentResponse)
  async freeze(@Param('assignmentId') assignmentId: string, @Body() body: FreezeBody) {
    return this.assignmentService.freezeAssignment(assignmentId, body.reason);
  }

  @Post('/:assignmentId/unfreeze')
  @OpenAPI({ summary: 'Manually unfreeze (reactivate) an assignment' })
  @ResponseSchema(AssignmentResponse)
  async unfreeze(@Param('assignmentId') assignmentId: string) {
    return this.assignmentService.unfreezeAssignment(assignmentId);
  }

  @Post('/:assignmentId/remove')
  @OpenAPI({ summary: 'Remove an assignment' })
  async remove(@Param('assignmentId') assignmentId: string) {
    await this.assignmentService['engine'].removeAssignment(assignmentId);
    return { ok: true };
  }

  @Post('/process-queue')
  @OpenAPI({ summary: 'Trigger queue processing (assign queued items to free slots)' })
  @ResponseSchema(AssignmentResponse, { isArray: true })
  async processQueue() {
    return this.assignmentService.processQueue();
  }

  @Post('/question/:questionId/complete')
  @OpenAPI({ summary: 'Mark a question as completed (completes its active assignment)' })
  async completeQuestion(@Param('questionId') questionId: string) {
    await this.assignmentService.onQuestionCompleted(questionId);
    return { ok: true };
  }
}