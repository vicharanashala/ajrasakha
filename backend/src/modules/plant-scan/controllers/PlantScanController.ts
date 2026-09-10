import 'reflect-metadata';
import {
  Get,
  HttpCode,
  JsonController,
  NotFoundError,
  Param,
  Post,
  Res,
  UploadedFile,
} from 'routing-controllers';
import type {Response} from 'express';
import {OpenAPI} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {UseBefore} from 'routing-controllers';
import {PlantScanService} from '../services/PlantScanService.js';
import {plantScanUploadOptions} from '../validators/plantScanUploadOptions.js';
import {InternalApiAuth} from '#root/shared/functions/internalApiAuth.js';

@OpenAPI({
  tags: ['plant-scan'],
  description: 'Plant and agricultural image analysis',
})
@injectable()
@JsonController('/plant-scan')
export class PlantScanController {
  constructor(
    @inject(PlantScanService)
    private readonly plantScanService: PlantScanService,
  ) {}

  @Get('/local-image/:fileName')
  async getLocalImage(
    @Param('fileName') fileName: string,
    @Res() response: Response,
  ): Promise<Response> {
    const filePath = this.plantScanService.getLocalImagePath(fileName);

    if (!filePath) {
      throw new NotFoundError('Plant scan image not found');
    }

    await new Promise<void>((resolve, reject) => {
      response.sendFile(filePath, (error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });

    return response;
  }

  @Post('/')
  @HttpCode(200)
  @UseBefore(InternalApiAuth)
  @OpenAPI({
    summary: 'Analyze a plant or agricultural image',
  })
  async analyze(
    @UploadedFile('file', {options: plantScanUploadOptions})
    file: Express.Multer.File,
  ) {
    return this.plantScanService.analyze(file);
  }
}
