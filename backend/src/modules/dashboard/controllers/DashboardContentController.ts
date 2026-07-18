import 'reflect-metadata';
import {
  JsonController,
  Get,
  Put,
  Post,
  Delete,
  Param,
  QueryParam,
  Body,
  BodyParam,
  UploadedFile,
  CurrentUser,
  Authorized,
  ForbiddenError,
  BadRequestError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import { GLOBAL_TYPES } from '#root/types.js';
import {
  IDashboardBlock,
  IDashboardContent,
  IDashboardStat,
  IUser,
  MediaKind,
} from '#root/shared/interfaces/models.js';
import { IMediaService } from '#root/modules/media/interfaces/IMediaService.js';
import {
  MediaUploadOptions,
  SignedUrlBody,
  CompleteUploadBody,
  YoutubeBody,
  ImageLinkBody,
  MEDIA_KINDS,
} from '#root/modules/media/classes/validators/MediaValidators.js';
import {
  IDashboardContentService,
  PublicDashboardCounts,
  PublicDashboardStats,
} from '../interfaces/IDashboardContentService.js';
import { UpdateDashboardContentDto } from '../validators/DashboardContentValidators.js';

/**
 * The single controller for the public ACE dashboard — public reads AND admin writes.
 *
 * It owns no business logic: every route delegates to an existing service.
 *   • PerformanceService      → live figures (validated Q&A pairs + coverage)
 *   • DashboardContentService → admin-edited narrative blocks & headline stats
 *   • MediaService            → carousel images, outreach images/videos
 *
 * Reads carry no @Authorized (the public dashboard is unauthenticated); every write is
 * @Authorized and additionally gated to admin/moderator.
 */
@injectable()
@JsonController('/dashboard')
export class DashboardContentController {
  constructor(
    @inject(GLOBAL_TYPES.DashboardContentService)
    private contentService: IDashboardContentService,

    @inject(GLOBAL_TYPES.MediaService)
    private mediaService: IMediaService,
  ) {}

  /* ───────────────────────────── PUBLIC READS ───────────────────────────── */

  /**
   * Live figures straight from the questions collection: total validated Q&A pairs
   * (closed / dynamic_closed / duplicate_closed) plus states, crops and domains covered.
   */
  @OpenAPI({ summary: 'Public — validated Q&A pairs + states/crops/domains covered' })
  @Get('/stats')
  async stats(): Promise<PublicDashboardStats> {
    return this.contentService.getPublicDashboardStats();
  }

  /**
   * Just the four headline counts — cheap (no aggregation), so the public dashboard polls
   * this every few seconds to track new questions in near-real-time.
   */
  @OpenAPI({ summary: 'Public — headline counts only (poll-friendly, real-time)' })
  @Get('/counts')
  async counts(): Promise<PublicDashboardCounts> {
    return this.contentService.getPublicDashboardCounts();
  }

  /** Admin-edited narrative blocks + headline stats. */
  @OpenAPI({ summary: 'Public — editable dashboard content (blocks + headline stats)' })
  @Get('/content')
  async content(): Promise<IDashboardContent> {
    const content = await this.contentService.getContent();
    // Media lives inside the content doc; sign its read URLs here so the public dashboard
    // can render images straight from /content without a separate /media call.
    return { ...content, media: await this.mediaService.signMediaUrls(content.media ?? []) };
  }

  /** Uploaded media, optionally filtered by kind. */
  @OpenAPI({ summary: 'Public — dashboard media (carousel / outreach images & videos)' })
  @Get('/media')
  async media(@QueryParam('kind') kind?: MediaKind) {
    return this.mediaService.list(kind);
  }

  /** Everything the dashboard needs in one round-trip. */
  @OpenAPI({ summary: 'Public — stats + content + media in a single call' })
  @Get('/')
  async all() {
    const [stats, content, media] = await Promise.all([
      this.contentService.getPublicDashboardStats(),
      this.contentService.getContent(),
      this.mediaService.list(),
    ]);
    return { stats, content, media };
  }

  /* ──────────────────────── ADMIN WRITES (moderator+) ─────────────────────── */

  /** Replace the narrative blocks and the headline stats. */
  @Authorized()
  @Put('/content')
  async updateContent(
    @CurrentUser() user: IUser,
    @Body() body: UpdateDashboardContentDto,
  ): Promise<IDashboardContent> {
    this.assertCanManage(user);
    return this.contentService.updateContent(
      body.blocks as unknown as IDashboardBlock[],
      (body.stats ?? []) as unknown as IDashboardStat[],
      (user._id ?? '').toString(),
      body.saturationThreshold,
    );
  }

  /** Upload a small file through the API (≤31 MB). Large videos use the signed-URL flow. */
  @Authorized()
  @Post('/media')
  async uploadMedia(
    @CurrentUser() user: IUser,
    @UploadedFile('file', { options: MediaUploadOptions }) file: Express.Multer.File,
    @BodyParam('kind') kind: MediaKind,
    @BodyParam('title', { required: false }) title?: string,
    @BodyParam('caption', { required: false }) caption?: string,
  ) {
    this.assertCanManage(user);
    this.assertKind(kind);
    return this.mediaService.upload({
      kind,
      file,
      title,
      caption,
      userId: (user._id ?? '').toString(),
    });
  }

  /** Signed PUT URL so the browser uploads straight to the bucket (no size limit). */
  @Authorized()
  @Post('/media/upload-url')
  async mediaUploadUrl(@CurrentUser() user: IUser, @Body() body: SignedUrlBody) {
    this.assertCanManage(user);
    return this.mediaService.createUploadUrl({
      kind: body.kind,
      filename: body.filename,
      contentType: body.contentType,
    });
  }

  /** Record the file after a direct-to-bucket upload finishes. */
  @Authorized()
  @Post('/media/complete')
  async mediaComplete(@CurrentUser() user: IUser, @Body() body: CompleteUploadBody) {
    this.assertCanManage(user);
    return this.mediaService.completeUpload({
      kind: body.kind,
      storagePath: body.storagePath,
      title: body.title,
      caption: body.caption,
      userId: (user._id ?? '').toString(),
    });
  }

  /** Add a YouTube video to the outreach section (URL only — no file upload). */
  @Authorized()
  @Post('/media/youtube')
  async addYoutube(@CurrentUser() user: IUser, @Body() body: YoutubeBody) {
    this.assertCanManage(user);
    return this.mediaService.addYoutube({
      url: body.url,
      title: body.title,
      caption: body.caption,
      userId: (user._id ?? '').toString(),
    });
  }

  /** Add an external image by URL to the carousel / outreach images (no file upload). */
  @Authorized()
  @Post('/media/image-link')
  async addImageLink(@CurrentUser() user: IUser, @Body() body: ImageLinkBody) {
    this.assertCanManage(user);
    return this.mediaService.addImageLink({
      kind: body.kind,
      url: body.url,
      title: body.title,
      caption: body.caption,
      userId: (user._id ?? '').toString(),
    });
  }

  /** Delete a file — removes the bucket object AND the record, so it can be replaced. */
  @Authorized()
  @Delete('/media/:id')
  async deleteMedia(@CurrentUser() user: IUser, @Param('id') id: string) {
    this.assertCanManage(user);
    const deleted = await this.mediaService.remove(id);
    return { deleted };
  }

  /* ──────────────────────────────── helpers ──────────────────────────────── */

  private assertCanManage(user: IUser): void {
    if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
      throw new ForbiddenError('Only admins and moderators can manage the dashboard.');
    }
  }

  private assertKind(kind: MediaKind): void {
    if (!kind || !MEDIA_KINDS.includes(kind)) {
      throw new BadRequestError(`kind must be one of: ${MEDIA_KINDS.join(', ')}`);
    }
  }
}
