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
    try {

      const streamUrl = appConfig.plivo.streamUrl;
      const endpointUser = process.env.PLIVO_ENDPOINT_USERNAME;
      const myPlivoNumber = appConfig.plivo.plivo_number;

      // FIXED XML Structure: Stream outside Dial, proper fallback handling
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
                    <Response>
                              <Stream audioTrack="both" contentType="audio/x-l16;rate=16000">${streamUrl}</Stream>
                              <Dial timeout="40" callerId="${myPlivoNumber}">
                                        <User>${endpointUser}</User>
                              </Dial>
                              <Speak>The specialist is busy. Please stay on the line.</Speak>
                              <Wait length="10" />
                    </Response>`;
      res.set('Content-Type', 'text/xml');
      return res.send(xml);
    } catch (error) {
      console.error('❌ [PLIVO-CONTROLLER] Error in answer endpoint:', error);
      console.error('❌ [PLIVO-CONTROLLER] Error stack:', error?.stack);
      res.status(500).send('Internal Server Error');
    }
  }
}
