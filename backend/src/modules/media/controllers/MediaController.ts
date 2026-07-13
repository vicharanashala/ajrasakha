import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  Delete,
  Param,
  QueryParams,
  Body,
  BodyParam,
  UploadedFile,
  CurrentUser,
  Authorized,
  ForbiddenError,
  BadRequestError,
} from 'routing-controllers';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import { IUser, MediaKind } from '#root/shared/interfaces/models.js';
import { IMediaService } from '../interfaces/IMediaService.js';
import {
  ListMediaQuery,
  MediaUploadOptions,
  SignedUrlBody,
  CompleteUploadBody,
  MEDIA_KINDS,
} from '../classes/validators/MediaValidators.js';

@injectable()
@JsonController('/media')
export class MediaController {
  constructor(
    @inject(GLOBAL_TYPES.MediaService)
    private mediaService: IMediaService,
  ) {}

  /** Public — feeds the public dashboard (carousel + outreach sections). */
  @Get('/')
  async list(@QueryParams() query: ListMediaQuery) {
    return this.mediaService.list(query?.kind);
  }

  /** Admin / moderator — upload a carousel image, outreach image, or outreach video. */
  @Authorized()
  @Post('/')
  async upload(
    @CurrentUser() user: IUser,
    @UploadedFile('file', { options: MediaUploadOptions }) file: Express.Multer.File,
    @BodyParam('kind') kind: MediaKind,
    @BodyParam('title', { required: false }) title?: string,
    @BodyParam('caption', { required: false }) caption?: string,
  ) {
    this.assertCanManage(user);
    if (!kind || !MEDIA_KINDS.includes(kind)) {
      throw new BadRequestError(`kind must be one of: ${MEDIA_KINDS.join(', ')}`);
    }
    return this.mediaService.upload({
      kind,
      file,
      title,
      caption,
      userId: (user._id ?? '').toString(),
    });
  }

  /**
   * Admin / moderator — get a signed PUT URL to upload straight to the bucket.
   * Use this for large files (outreach videos), which exceed the API request limit.
   */
  @Authorized()
  @Post('/upload-url')
  async uploadUrl(@CurrentUser() user: IUser, @Body() body: SignedUrlBody) {
    this.assertCanManage(user);
    return this.mediaService.createUploadUrl({
      kind: body.kind,
      filename: body.filename,
      contentType: body.contentType,
    });
  }

  /** Admin / moderator — record the file after a direct-to-bucket upload finishes. */
  @Authorized()
  @Post('/complete')
  async complete(@CurrentUser() user: IUser, @Body() body: CompleteUploadBody) {
    this.assertCanManage(user);
    return this.mediaService.completeUpload({
      kind: body.kind,
      storagePath: body.storagePath,
      title: body.title,
      caption: body.caption,
      userId: (user._id ?? '').toString(),
    });
  }

  /** Admin / moderator — delete a file (removes the bucket object and the record). */
  @Authorized()
  @Delete('/:id')
  async remove(@CurrentUser() user: IUser, @Param('id') id: string) {
    this.assertCanManage(user);
    const deleted = await this.mediaService.remove(id);
    return { deleted };
  }

  private assertCanManage(user: IUser): void {
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
      throw new ForbiddenError('Only admins and moderators can manage media.');
    }
  }
}
