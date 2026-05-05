import 'reflect-metadata';
import { JsonController, Post, Req, Res } from 'routing-controllers';
import { Request, Response } from 'express';
import { appConfig } from '#root/config/app.js';
import { injectable } from 'inversify';

@injectable()
@JsonController('/plivo')
export class PlivoController {
  @Post('/answer')
  answer(@Req() req: Request, @Res() res: Response) {
    const streamUrl = appConfig.plivo.streamUrl;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream bidirectional="true">${streamUrl}</Stream>
</Response>`;

    res.set('Content-Type', 'text/xml');
    return res.send(xml);
  }
}
