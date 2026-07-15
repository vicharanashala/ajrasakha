import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Body,
  HttpCode,
  Params,
  Authorized,
  Param,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { CORE_TYPES } from '#root/modules/core/types.js';
import type { AssignmentEngineService } from '../services/AssignmentEngineService.js';
import type { WaitingQueueService } from '../services/WaitingQueueService.js';
import type { IQuestionPriority } from '#root/shared/interfaces/models.js';

@OpenAPI({
  tags: ['assignments'],
  description: 'Priority-aware question assignment engine',
})
@injectable()
@JsonController('/assignments')
export class AssignmentController {
  constructor(
    @inject(CORE_TYPES.AssignmentEngineService)
    private readonly assignmentEngine: AssignmentEngineService,

    @inject(CORE_TYPES.WaitingQueueService)
    private readonly waitingQueueService: WaitingQueueService,
  ) {}

  @Post('/assign')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Assign a question to an available expert' })
  async assignQuestion(
    @Body() body: { questionId: string; priority: IQuestionPriority },
  ) {
    const result = await this.assignmentEngine.assignQuestion(
      body.questionId,
      body.priority,
    );
    return { success: true, data: result };
  }

  @Post('/complete')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Mark a question as completed and free the slot' })
  async completeQuestion(
    @Body() body: { questionId: string; expertId: string },
  ) {
    await this.assignmentEngine.handleCompletion(body.questionId, body.expertId);
    return { success: true, message: 'Question completed, slot freed' };
  }

  @Post('/freeze')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Freeze lower-priority questions for an expert' })
  async freezeLowerPriority(
    @Body() body: { expertId: string },
  ) {
    const frozen = await this.assignmentEngine.freezeLowerPriority(body.expertId);
    return { success: true, data: { frozenQuestionIds: frozen } };
  }

  @Post('/unfreeze')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Unfreeze all frozen questions for an expert' })
  async unfreezeQuestions(
    @Body() body: { expertId: string },
  ) {
    const unfrozen = await this.assignmentEngine.unfreezeQuestions(body.expertId);
    return { success: true, data: { unfrozenQuestionIds: unfrozen } };
  }

  @Post('/force-unfreeze')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Force unfreeze a specific question' })
  async forceUnfreeze(
    @Body() body: { questionId: string; moderatorId: string },
  ) {
    await this.assignmentEngine.forceUnfreeze(body.questionId, body.moderatorId);
    return { success: true, message: 'Question unfrozen' };
  }

  @Get('/queue')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get current waiting queue counts by priority' })
  async getQueueLengths() {
    const data = await this.assignmentEngine.getQueueLengths();
    return { success: true, data };
  }

  @Get('/queue/entries')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get all waiting queue entries' })
  async getQueueEntries() {
    const data = await this.assignmentEngine.getQueueEntries();
    return { success: true, data };
  }

  @Get('/workloads')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get workload snapshot for all experts' })
  async getAllWorkloads() {
    const data = await this.assignmentEngine.getAllWorkloads();
    return { success: true, data };
  }

  @Get('/workloads/:expertId')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get workload snapshot for a specific expert' })
  async getWorkloadSnapshot(
    @Param('expertId') expertId: string,
  ) {
    const data = await this.assignmentEngine.getWorkloadSnapshot(expertId);
    return { success: true, data };
  }

  @Post('/manual-assign')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Manually assign a question to a specific expert' })
  async manualAssign(
    @Body() body: { questionId: string; expertId: string },
  ) {
    await this.assignmentEngine.manualAssign(body.questionId, body.expertId);
    return { success: true, message: 'Question manually assigned' };
  }

  @Post('/reassign')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Reassign a question from one expert to another' })
  async reassignQuestion(
    @Body() body: { questionId: string; fromExpertId: string; toExpertId: string },
  ) {
    await this.assignmentEngine.reassignQuestion(
      body.questionId,
      body.fromExpertId,
      body.toExpertId,
    );
    return { success: true, message: 'Question reassigned' };
  }

  @Post('/remove')
  @HttpCode(200)
  @Authorized(['admin', 'moderator'])
  @OpenAPI({ summary: 'Remove an assignment and free the expert slot' })
  async removeAssignment(
    @Body() body: { questionId: string; expertId: string },
  ) {
    await this.assignmentEngine.removeAssignment(body.questionId, body.expertId);
    return { success: true, message: 'Assignment removed' };
  }

  @Post('/process-queue')
  @HttpCode(200)
  @Authorized(['admin'])
  @OpenAPI({ summary: 'Manually trigger waiting queue processing' })
  async processQueue() {
    const assigned = await this.assignmentEngine.processWaitingQueue();
    return { success: true, data: { assigned } };
  }
}
