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
  BodyParam,
  JsonController,
  CurrentUser,
  UseBefore,
} from 'routing-controllers';
import { OpenAPI, ResponseSchema } from 'routing-controllers-openapi';
import { Request, Response, urlencoded } from 'express';
import { appConfig } from '#root/config/app.js';
import { inject, injectable } from 'inversify';
import plivo from 'plivo';
import axios from 'axios';
import { PLIVO_TYPES } from '../types.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { ICallDetailsRepository, AgentAnalytics, ACCAnalytics } from '#root/shared/database/interfaces/ICallDetailsRepository.js';
import type { IUser } from '#root/shared/interfaces/models.js';
import { PlivoService } from '../services/PlivoService.js';


@OpenAPI({
  tags: ['plivo'],
  description: 'Operations for managing Plivo calls',
})
@injectable()
@JsonController('/plivo')
export class PlivoController {
  private client = new plivo.Client(process.env.PLIVO_AUTH_ID, process.env.PLIVO_AUTH_TOKEN, { timeout: 30000 });

  constructor(
    @inject(PLIVO_TYPES.CallDetailsRepository) private callDetailsRepository: ICallDetailsRepository,
    @inject(GLOBAL_TYPES.UserService) private userService: any,
    @inject(PLIVO_TYPES.PlivoService) private plivoService: PlivoService
  ) { }


  @Post('/answer')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  @OpenAPI({ summary: 'Handle inbound call answer from Plivo' })
  async answer(@Req() req: Request, @Res() res: Response): Promise<void> {
    let availableAgent: IUser | null = null;
    try {
      const streamUrl = appConfig.plivo.streamUrl;
      const myPlivoNumber = appConfig.plivo.plivo_number;
      const callUuid = req.body?.CallUUID || req.query?.CallUUID;


      // Atomically find and mark an available agent as busy (prevents race conditions)
      availableAgent = await this.userService.findAndMarkAvailableAgent(callUuid);


      let endpointUser: string;
      let fallbackMessage: string;
      let welcomeMessage: string = "Thank you for calling ACC, we will connect you with a specialist shortly. Please stay on the line.";

      if (availableAgent && availableAgent.agent) {
        // Get the Plivo endpoint credentials for this agent
        const agentNumber = availableAgent.agent; // e.g., "agent_1"
        const credentials = appConfig.plivo.getAgentCredentials(agentNumber);
        endpointUser = credentials.username;


        // Store the agent userid for this call in PlivoService
        this.plivoService.setCallAgent(callUuid, availableAgent._id.toString());

        fallbackMessage = 'The specialist is busy. Please stay on the line.';
      } else {
        // No available agents - play busy message
        endpointUser = '';
        fallbackMessage = 'All agents are busy. Please call back later.';
      }

      // FIXED XML Structure: Stream outside Dial, proper fallback handling
      let xml: string;

      if (endpointUser) {
        xml = `<?xml version="1.0" encoding="UTF-8"?>
                    <Response>
                              <Stream contentType="audio/x-l16;rate=16000"
          noiseCancellation="true" audioTrack="both" noise_cancellation_level="85"
          >${streamUrl}</Stream>
          <Speak voice="MAN" language="en-US">${welcomeMessage}</Speak>
                              <Dial timeout="40" callerId="${myPlivoNumber}">
                                        <User>${endpointUser}</User>
                              </Dial>
                              <Speak>${fallbackMessage}</Speak>
                              <Wait length="10" />
                    </Response>`;
      } else {
        // All agents busy - just play the message
        xml = `<?xml version="1.0" encoding="UTF-8"?>
                    <Response>
                              <Speak>${fallbackMessage}</Speak>
                              <Hangup />
                    </Response>`;
      }

      res.set('Content-Type', 'text/xml');
      res.send(xml);
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error in answer endpoint:', error);
      console.error('❌ [PLIVO-CONTROLLER] Error stack:', error?.stack);

      if (availableAgent) {
        try {
          // console.log(`[PLIVO-CONTROLLER] Releasing agent ${availableAgent._id} due to answer endpoint error`);
          await this.userService.markAgentAsAvailable(availableAgent._id.toString());
        } catch (releaseError) {
          console.error(`[PLIVO-CONTROLLER] Failed to release agent ${availableAgent._id} after error:`, releaseError);
        }
      }

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
    callDetails?: any;
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

      // Attach Call Details from MongoDB
      for (const item of history) {
        try {
          const details = await this.callDetailsRepository.getByCallUuid(item.uuid);
          if (details) {
            item.callDetails = details;
          }
        } catch (e) {
          console.error(`[PLIVO-CONTROLLER] Could not fetch details for ${item.uuid}`);
        }
      }

      return history;
    } catch (error: any) {
      console.error('❌ Error fetching call history:', error);
      throw new InternalServerError('Failed to fetch call history');
    }
  }


  @Post('/send-message')
  @Authorized()
  @OpenAPI({
    summary: 'Send SMS using Fast2SMS',
    description: 'Send SMS to one or multiple phone numbers using Fast2SMS Quick SMS API',
  })
  @HttpCode(200)
  async sendMessage(
    @Body() body: { destination: string, text: string },
    @Res() res: Response
  ) {
    try {


      if (!body.destination || !body.text) {
        return res.status(400).json({
          success: false,
          error: "destination and text are required parameters"
        });
      }

      const apiKey = appConfig.fast2sms.apiKey;
      if (!apiKey) {
        return res.status(500).json({
          success: false,
          error: "Fast2SMS API key not configured"
        });
      }

      const requestBody = {
        route: 'q',
        message: body.text,
        language: 'english',
        flash: 0,
        numbers: body.destination,
        sms_details: 1
      };

      const response = await axios.post(
        'https://www.fast2sms.com/dev/bulkV2',
        requestBody,
        {
          headers: {
            'authorization': apiKey,
            'Content-Type': 'application/json',
          },
        }
      );

      console.log("✅ Fast2SMS response:", response.data);

      return res.json({
        success: true,
        data: response.data
      });
    } catch (err: any) {
      console.error('❌ Fast2SMS error:', err.response?.data || err.message);
      return res.status(500).json({
        success: false,
        error: err.response?.data?.message || err.message || 'Failed to send SMS'
      });
    }
  }

  @Get('/analytics')
  @Authorized()
  @OpenAPI({
    summary: 'Get call agent analytics',
    description: 'Retrieves analytics data for the authenticated call agent including call statistics, domains, and trends. Only accessible by users with call_agent role.',
  })
  @HttpCode(200)
  async getAgentAnalytics(
    @CurrentUser() user: IUser,
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string
  ): Promise<AgentAnalytics> {
    try {
      // Verify user is a call agent
      if (user.role !== 'call_agent') {
        throw new BadRequestError('Only call agents can access their analytics');
      }

      // Parse date filters if provided
      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) {
        start = new Date(startDate);
        if (isNaN(start.getTime())) {
          throw new BadRequestError('Invalid startDate format');
        }
      }

      if (endDate) {
        end = new Date(endDate);
        if (isNaN(end.getTime())) {
          throw new BadRequestError('Invalid endDate format');
        }
      }

      // Get analytics for the current user
      const analytics = await this.callDetailsRepository.getAgentAnalytics(
        user._id?.toString() || '',
        start,
        end
      );

      return analytics;
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error getting agent analytics:', error);
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to get agent analytics');
    }
  }

  @Get('/acc-analytics')
  @Authorized()
  @OpenAPI({
    summary: 'Get ACC analytics for admin',
    description: 'Retrieves domain-based call analytics for admin including call statistics by domain, monthly trends, and daily trends. Only accessible by users with admin role.',
  })
  @HttpCode(200)
  async getACCAnalytics(
    @CurrentUser() user: IUser,
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string
  ): Promise<ACCAnalytics> {
    try {
      // Verify user is an admin
      if (user.role !== 'admin') {
        throw new BadRequestError('Only admins can access ACC analytics');
      }

      // Parse date filters if provided
      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) {
        start = new Date(startDate);
        if (isNaN(start.getTime())) {
          throw new BadRequestError('Invalid startDate format');
        }
      }

      if (endDate) {
        end = new Date(endDate);
        if (isNaN(end.getTime())) {
          throw new BadRequestError('Invalid endDate format');
        }
      }

      // Get ACC analytics
      const analytics = await this.callDetailsRepository.getACCAnalytics(
        start,
        end
      );

      return analytics;
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error getting ACC analytics:', error);
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw new InternalServerError('Failed to get ACC analytics');
    }
  }
}
