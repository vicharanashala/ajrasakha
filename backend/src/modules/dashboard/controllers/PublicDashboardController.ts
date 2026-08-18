import 'reflect-metadata';
import {
  Authorized,
  BadRequestError,
  Body,
  BodyParam,
  CurrentUser,
  Delete,
  ForbiddenError,
  Get,
  JsonController,
  Param,
  Post,
  Put,
  UploadedFile,
} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {PublicDashboardService} from '../services/PublicDashboardService.js';
import {mediaUploadOptions} from '../validators/mediaUploadOptions.js';
import {IUser} from '#root/shared/interfaces/models.js';

@OpenAPI({
  tags: ['public-dashboard'],
  description: 'Public (no-auth) dashboard data endpoints',
})
@injectable()
@JsonController('/public-dashboard')
export class PublicDashboardController {
  constructor(
    @inject(PublicDashboardService)
    private readonly publicDashboardService: PublicDashboardService,
  ) {}

  /**
   * Public: crops grouped by state whose question document count exceeds the
   * (admin-configured) saturation limit. No authentication required.
   */
  @Get('/saturated-crops')
  @OpenAPI({
    summary:
      'Saturated crops grouped by state (question count > saturation limit)',
  })
  async getSaturatedCrops() {
    return this.publicDashboardService.getSaturatedCrops();
  }

  /**
   * Public: all active users with their public-facing fields
   * (firstName, lastName, preference, avatar, role, university, createdAt).
   */
  @Get('/users')
  @OpenAPI({
    summary: 'Active users with public-facing profile fields',
  })
  async getActiveUsers() {
    return this.publicDashboardService.getActiveUsers();
  }

  // ── Public dashboard items (unified CRUD for every admin-editable value) ───

  /** Public: list all stored items (saturation limit, outreach videos, …). */
  @Get('/items')
  @OpenAPI({summary: 'List all public dashboard items'})
  async getItems() {
    return this.publicDashboardService.getItems();
  }

  /** Admin-only: add an item. */
  @Post('/items')
  @Authorized(['admin'])
  @OpenAPI({summary: 'Admin: add a public dashboard item'})
  async addItem(
    @Body() body: {name: string; value: unknown},
    @CurrentUser() user: IUser,
  ) {
    this.assertAdmin(user);
    return this.publicDashboardService.addItem(body?.name, body?.value);
  }

  /**
   * Admin-only: upload an outreach image/video file to the GCS media bucket and store its
   * public URL as an item. Multipart form-data: `file` (the upload) + `type`
   * ('image' | 'video', defaults to image).
   */
  @Post('/media')
  @Authorized(['admin'])
  @OpenAPI({
    summary: 'Admin: upload an outreach image/video to GCS and store its URL',
  })
  async uploadMedia(
    @UploadedFile('file', {options: mediaUploadOptions})
    file: Express.Multer.File,
    @BodyParam('type') type: string,
    @BodyParam('name') name: string,
    @CurrentUser() user: IUser,
  ) {
    this.assertAdmin(user);
    if (!file) {
      throw new BadRequestError('file is required');
    }
    const kind: 'image' | 'video' = type === 'video' ? 'video' : 'image';
    return this.publicDashboardService.uploadMedia(file, kind, name);
  }

  /** Admin-only: update an item's name/value by id. */
  @Put('/items/:id')
  @Authorized(['admin'])
  @OpenAPI({summary: 'Admin: update a public dashboard item'})
  async updateItem(
    @Param('id') id: string,
    @Body() body: {name?: string; value?: unknown},
    @CurrentUser() user: IUser,
  ) {
    this.assertAdmin(user);
    return this.publicDashboardService.updateItem(id, body ?? {});
  }

  /** Admin-only: delete an item by id. */
  @Delete('/items/:id')
  @Authorized(['admin'])
  @OpenAPI({summary: 'Admin: delete a public dashboard item'})
  async deleteItem(@Param('id') id: string, @CurrentUser() user: IUser) {
    this.assertAdmin(user);
    await this.publicDashboardService.deleteItem(id);
    return {success: true};
  }

  /** The global authorizationChecker only verifies authentication, so enforce the admin
   *  role here (matching how the rest of the codebase gates admin actions). */
  private assertAdmin(user: IUser): void {
    if (user?.role !== 'admin') {
      throw new ForbiddenError(
        'Only admins can modify the public dashboard config',
      );
    }
  }
}
