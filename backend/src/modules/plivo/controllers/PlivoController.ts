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
import type { ICallDetailsRepository, AgentAnalytics } from '#root/shared/database/interfaces/ICallDetailsRepository.js';
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
    try {
      const streamUrl = appConfig.plivo.streamUrl;
      const myPlivoNumber = appConfig.plivo.plivo_number;
      const callUuid = req.body?.CallUUID || req.query?.CallUUID;

      console.log('📞 [PLIVO-CONTROLLER] Answer endpoint called with:', {
        body: req.body,
        query: req.query,
        callUuid
      });

      // Atomically find and mark an available agent as busy (prevents race conditions)
      const availableAgent = await this.userService.findAndMarkAvailableAgent(callUuid);

      // console.log('🔍 [PLIVO-CONTROLLER] Available agent found:', availableAgent ? {
      //   id: availableAgent._id,
      //   name: `${availableAgent.firstName} ${availableAgent.lastName}`,
      //   agent: availableAgent.agent,
      //   isBusy: availableAgent.isBusy,
      //   isCallAgentActive: availableAgent.isCallAgentActive
      // } : null);

      let endpointUser: string;
      let fallbackMessage: string;

      if (availableAgent && availableAgent.agent) {
        // Get the Plivo endpoint credentials for this agent
        const agentNumber = availableAgent.agent; // e.g., "agent_1"
        const credentials = appConfig.plivo.getAgentCredentials(agentNumber);
        endpointUser = credentials.username;

        // // console.log(`🔐 [PLIVO-CONTROLLER] Agent credentials for ${agentNumber}:`, {
        //   username: credentials.username,
        //   hasPassword: !!credentials.password
        // });

        // Store the agent userid for this call in PlivoService
        this.plivoService.setCallAgent(callUuid, availableAgent._id.toString());

        // console.log(`✅ [PLIVO-CONTROLLER] Routing call ${callUuid} to ${agentNumber} (${availableAgent.firstName} ${availableAgent.lastName})`);
        fallbackMessage = 'The specialist is busy. Please stay on the line.';
      } else {
        // No available agents - play busy message
        endpointUser = '';
        fallbackMessage = 'All agents are busy. Please call back later.';
        // console.log(`⚠️ [PLIVO-CONTROLLER] No available agents for call ${callUuid}`);
      }

      // FIXED XML Structure: Stream outside Dial, proper fallback handling
      let xml: string;

      if (endpointUser) {
        xml = `<?xml version="1.0" encoding="UTF-8"?>
                    <Response>
                              <Stream contentType="audio/x-l16;rate=16000"
          noiseCancellation="true" audioTrack="both" noise_cancellation_level="85"
          >${streamUrl}</Stream>
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
      res.status(500).send('Internal Server Error');
    }
  }



  @Post('/webhook/call-answered')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  @OpenAPI({ summary: 'Handle Plivo call answered webhook' })
  async handleCallAnswered(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const callUuid = req.body?.CallUUID || req.query?.CallUUID;
      const fromNumber = req.body?.From || req.query?.From;

      console.log(`📞 [PLIVO-CONTROLLER] Call answered webhook received: CallUUID=${callUuid}, From=${fromNumber}`);

      // The agent is already marked as busy in the answer endpoint
      // This webhook is just for logging and potential future enhancements

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error in call answered webhook:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  @Post('/webhook/call-ended')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  @OpenAPI({ summary: 'Handle Plivo call ended webhook' })
  async handleCallEnded(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const callUuid = req.body?.CallUUID || req.query?.CallUUID;
      const fromNumber = req.body?.From || req.query?.From;
      const callStatus = req.body?.CallStatus || req.query?.CallStatus;

      console.log(`📞 [PLIVO-CONTROLLER] Call ended webhook received: CallUUID=${callUuid}, From=${fromNumber}, Status=${callStatus}`);

      // Find the agent who was handling this call and mark them as available
      const allCallAgents = await this.userService.getCallAgents();
      const agentWithCall = allCallAgents.find(agent => agent.currentCallUuid === callUuid);

      if (agentWithCall) {
        await this.userService.markAgentAsAvailable(agentWithCall._id.toString());
        // Clear the agent mapping from PlivoService
        this.plivoService.clearTranscript(callUuid);
        console.log(`✅ [PLIVO-CONTROLLER] Marked agent ${agentWithCall.agent} (${agentWithCall.firstName} ${agentWithCall.lastName}) as available`);
      } else {
        console.log(`⚠️ [PLIVO-CONTROLLER] No agent found with currentCallUuid=${callUuid}`);
      }

      res.status(200).send('OK');
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error in call ended webhook:', error);
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
      // console.log("🚀 ~ PlivoController ~ sendMessage ~ destination:", body.destination);
      // console.log("🚀 ~ PlivoController ~ sendMessage ~ text:", body.text);

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
}
