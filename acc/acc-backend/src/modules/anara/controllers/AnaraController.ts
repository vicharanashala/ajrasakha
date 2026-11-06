import 'reflect-metadata';
import {
  JsonController,
  Post,
  Get,
  Body,
  Param,
  Res,
  HttpCode,
  Authorized,
  BadRequestError,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { inject, injectable } from 'inversify';
import type { Response } from 'express';
import { GLOBAL_TYPES } from '#root/types.js';
import type { IAnaraService, AnaraDraftResponse } from '../types.js';

class DraftBodyDto {
  question!: string;
  crop?: string | null;
  domain?: string | null;
}

@OpenAPI({
  tags: ['anara'],
  description: 'Anara / Package of Practices (POP) Library Integration Endpoints',
})
@injectable()
@Authorized()
@JsonController('/anara')
export class AnaraController {
  constructor(
    @inject(GLOBAL_TYPES.AnaraService)
    private readonly anaraService: IAnaraService,
  ) { }

  @Post('/draft')
  @HttpCode(200)
  @OpenAPI({
    summary: 'Draft an answer grounded in the POP library with passage citations',
    description: 'Searches translated agricultural Package of Practices (POP) documents and drafts an answer using MiniMax with [P#] citations.',
  })
  async draft(
    @Body({ required: true }) body: DraftBodyDto,
  ): Promise<AnaraDraftResponse> {
    if (!body?.question || !body.question.trim()) {
      throw new BadRequestError('Question is required');
    }

    return await this.anaraService.draft(body.question, body.crop, body.domain);
  }

  @Get('/documents/:documentId/pdf')
  @HttpCode(200)
  @OpenAPI({
    summary: 'Stream the PDF of a cited library document',
    description: 'Returns the cited Package of Practices PDF file inline so the agent can inspect the source page.',
  })
  async getDocumentPdf(
    @Param('documentId') documentId: string,
    @Res() response: Response,
  ) {
    if (!documentId) {
      throw new BadRequestError('Document ID is required');
    }

    const pdfBuffer = await this.anaraService.getDocumentPdf(documentId);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', 'inline; filename="document.pdf"');
    response.setHeader('Content-Length', pdfBuffer.length);
    return response.send(pdfBuffer);
  }
}

