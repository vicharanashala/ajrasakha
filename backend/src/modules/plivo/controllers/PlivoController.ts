import 'reflect-metadata';
import {
  Post,
  Get,
  Body,
  HttpCode,
  QueryParam,
  Req,
  Res,
  Authorized,
  BadRequestError,
  InternalServerError,
  Controller,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { Request, Response } from 'express';
import { appConfig } from '#root/config/app.js';
import { injectable } from 'inversify';
import plivo from 'plivo';


@OpenAPI({
  tags: ['plivo'],
  description: 'Operations for managing Plivo calls',
})
@injectable()
@Controller('/plivo')
export class PlivoController {
  private client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN, { timeout: 30000 });

  
  @Post('/answer')
  @HttpCode(200)
  @OpenAPI({ summary: 'Handle inbound call answer from Plivo' })
  answer(@Req() req: Request, @Res() res: Response): void {
    try {
      const streamUrl = appConfig.plivo.streamUrl;
      const endpointUser = process.env.PLIVO_ENDPOINT_USERNAME;
      const myPlivoNumber = appConfig.plivo.plivo_number;

      // FIXED XML Structure: Stream outside Dial, proper fallback handling
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
                    <Response>
                              <Stream contentType="audio/x-l16;rate=16000" bidirectional="true"
          noiseCancellation="true" audioTrack="inbound" 
          >${streamUrl}</Stream>
                              <Dial timeout="40" callerId="${myPlivoNumber}">
                                        <User>${endpointUser}</User>
                              </Dial>
                              <Speak>The specialist is busy. Please stay on the line.</Speak>
                              <Wait length="10" />
                    </Response>`;
      res.set('Content-Type', 'text/xml');
      res.send(xml);
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error in answer endpoint:', error);
      console.error('❌ [PLIVO-CONTROLLER] Error stack:', error?.stack);
      res.status(500).send('Internal Server Error');
    }
  }


  @Get('/history')
  @HttpCode(200)
  @OpenAPI({ summary: 'Get call history from Plivo' })
  async getHistory(
    @QueryParam('limit') limit: number = 20,
    @QueryParam('offset') offset: number = 0,
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
    @QueryParam('status') status?: string,
    @QueryParam('direction') direction?: string
  ): Promise<Array<{
    uuid: string;
    from: string;
    to: string;
    duration: number;
    status: string;
    startTime: string;
    direction: string;
  }>> {
    try {
      // Build the query object for Plivo API
      const plivoQuery: any = {
        limit: limit,
        offset: offset
      };

      // Add optional filters if provided
      if (startDate) plivoQuery.start_time = startDate;
      if (endDate) plivoQuery.end_time = endDate;
      if (status) plivoQuery.status = status;
      if (direction) plivoQuery.call_direction = direction;

      // Fetching the list of calls from Plivo
      const response = await this.client.calls.list(plivoQuery);

      // console.log('✅ [PLIVO-CONTROLLER] Fetched calls:', response);

      // Map the data to a cleaner format for your Frontend
      // Response is an array of call objects with a meta object at the end
      const history = (response as any)
        .filter((item: any) => item.callUuid) // Filter out meta object
        .map((call: any) => ({
        uuid: call.callUuid,
        from: call.fromNumber,
        to: call.toNumber,
        duration: call.callDuration, // in seconds
        status: call.callState,
        startTime: call.initiationTime,
        direction: call.callDirection
      }));

      return history;
    } catch (error: any) {
      console.error('❌ Error fetching call history:', error);
      throw new InternalServerError('Failed to fetch call history');
    }
  }
}
