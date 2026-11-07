import 'reflect-metadata';
import {JsonController, Post, Get, UploadedFile, CurrentUser, HttpCode, Req, Authorized} from 'routing-controllers';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CORE_TYPES} from '#root/modules/core/types.js';
import {IUser} from '#root/shared/interfaces/models.js';
import {popUploadOptions} from '../validators/popUploadOptions.js';
import {PopUploadsService, PopUploadIntakeResult, PopUploadSummary} from '../services/PopUploadsService.js';

// Intake for the PoP "Add Document" upload — accepts the file fast (direct to our own Cloud
// Run instance + Mongo GridFS, no Tailscale hop in this request at all) and forwards it to PoP
// in the background. See PopUploadsService for the full design/reasoning.
@OpenAPI({
  tags: ['PopUploads'],
  description: 'Backend-held queue for PoP document uploads — intake is fast and durable; the actual forward to PoP happens asynchronously.',
})
@injectable()
@JsonController('/pop-uploads')
export class PopUploadsController {
  constructor(
    @inject(CORE_TYPES.PopUploadsService)
    private readonly popUploadsService: PopUploadsService,
  ) {}

  @OpenAPI({summary: 'Queue a PoP document upload'})
  @Post('/')
  @HttpCode(201)
  @Authorized()
  async create(
    @UploadedFile('file', {options: popUploadOptions})
    file: Express.Multer.File,
    @CurrentUser() user: IUser,
    @Req() req: any,
  ): Promise<PopUploadIntakeResult> {
    const body = req.body || {};
    return this.popUploadsService.intake(
      file,
      body.fields_json,
      body.placements_json,
      body.language,
      user,
      user._id.toString(),
      user.role,
    );
  }

  @OpenAPI({summary: "This caller's own pending PoP uploads"})
  @Get('/')
  @Authorized()
  async listMine(@CurrentUser() user: IUser): Promise<PopUploadSummary[]> {
    return this.popUploadsService.getMine(user._id.toString());
  }
}
