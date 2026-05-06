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
    const streamUrl = /*appConfig.plivo.streamUrl*/`wss://kevin-south-bios-inexpensive.trycloudflare.com/plivo-stream`;
    const agentNumber = appConfig.plivo.agentNumber

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="WOMAN" language="hi-IN">
  Namaskar! Welcome to Annam Agri Support. 
  Please stay on the line, our agriculture expert will connect with you shortly.
  </Speak>
  <Stream bidirectional="true" >${streamUrl}</Stream>
  <Dial> 
  <Number>${agentNumber}</Number> 
  </Dial>
  <Wait length="10" />
</Response>`;

    res.set('Content-Type', 'text/xml');
    return res.send(xml);
  }
}
