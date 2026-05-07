import 'reflect-metadata';
import { Controller, JsonController, Post, Req, Res } from 'routing-controllers';
import { Request, Response } from 'express';
import { appConfig } from '#root/config/app.js';
import { injectable } from 'inversify';

@injectable()
@Controller('/plivo')
export class PlivoController {
  @Post('/answer')
  answer(@Req() req: Request, @Res() res: Response) {
    const streamUrl = appConfig.plivo.streamUrl;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak>Hello, Annam agri specialist here.</Speak>
  <Stream bidirectional="true"  contentType="audio/x-l16;rate=16000">${streamUrl}</Stream>
  <Wait length="100" />
</Response>`;

    res.set('Content-Type', 'text/xml');
    return res.send(xml);
  }
}
