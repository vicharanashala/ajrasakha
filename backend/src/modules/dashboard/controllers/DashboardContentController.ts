import 'reflect-metadata';
import {
  JsonController,
  Get,
  Put,
  Body,
  CurrentUser,
  Authorized,
  ForbiddenError,
} from 'routing-controllers';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IDashboardBlock, IUser } from '#root/shared/interfaces/models.js';
import { IDashboardContentService } from '../interfaces/IDashboardContentService.js';
import { UpdateDashboardContentDto } from '../validators/DashboardContentValidators.js';

@injectable()
@JsonController('/dashboard-content')
export class DashboardContentController {
  constructor(
    @inject(GLOBAL_TYPES.DashboardContentService)
    private service: IDashboardContentService,
  ) {}

  /** Public — feeds the public dashboard. No @Authorized so it's reachable without a token. */
  @Get('/')
  async get() {
    return this.service.getContent();
  }

  /** Admin / moderator only — replaces the editable content blocks. */
  @Authorized()
  @Put('/')
  async update(
    @CurrentUser() user: IUser,
    @Body() body: UpdateDashboardContentDto,
  ) {
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
      throw new ForbiddenError('Only admins and moderators can edit dashboard content.');
    }
    const userId = (user._id ?? '').toString();
    return this.service.updateContent(
      body.blocks as unknown as IDashboardBlock[],
      userId,
    );
  }
}
