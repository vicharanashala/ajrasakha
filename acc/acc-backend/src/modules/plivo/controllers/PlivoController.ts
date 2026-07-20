import 'reflect-metadata';
import {
  Post,
  Get,
  HttpCode,
  Body,
  QueryParam,
  Req,
  Res,
  Authorized,
  BadRequestError,
  InternalServerError,
  JsonController,
  CurrentUser,
  UseBefore,
} from 'routing-controllers';
import { OpenAPI } from 'routing-controllers-openapi';
import { Request, Response, urlencoded } from 'express';
import { appConfig } from '#root/config/app.js';
import { inject, injectable } from 'inversify';
import plivo from 'plivo';
import axios from 'axios';
import { PLIVO_TYPES } from '../types.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { ICallDetailsRepository, AgentAnalytics, ACCAnalytics } from '#shared/database/interfaces/ICallDetailsRepository.js';
import type { ICallFarmerRepository } from '#shared/database/interfaces/IFarmerRepository.js';
import type { IUser } from '#shared/interfaces/models.js';
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
    @inject(GLOBAL_TYPES.UserRepository) private userRepository: any,
    @inject(PLIVO_TYPES.AgentAssignmentService) private agentAssignmentService: any,
    @inject(PLIVO_TYPES.PlivoService) private plivoService: PlivoService,
    @inject(PLIVO_TYPES.CallFarmerRepository) private callFarmerRepository: ICallFarmerRepository
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
      const callerNumber = req.body?.From || req.query?.From || 'unknown';
      // console.log(`📞 [PLIVO-CONTROLLER] Incoming call: CallUUID=${callUuid}, From=${callerNumber}`);

      availableAgent = await this.agentAssignmentService.findAndMarkAvailableAgent(callUuid);

      let endpointUser: string;
      let fallbackMessage: string;
      let welcomeMessage = 'Thank you for calling ACC, we will connect you with a specialist shortly. Please stay on the line.';

      if (availableAgent && availableAgent.agent) {
        const agentNumber = availableAgent.agent;
        const credentials = this.agentAssignmentService.getAgentCredentials(agentNumber);
        endpointUser = credentials.username;

        this.plivoService.setCallAgent(callUuid, availableAgent._id.toString());
        // console.log(`✅ [PLIVO-CONTROLLER] Assigned agent ${agentNumber} (userId=${availableAgent._id}, endpoint=${endpointUser}) to call ${callUuid}`);
        fallbackMessage = 'The specialist is busy. Please stay on the line.';
      } else {
        endpointUser = '';
        fallbackMessage = 'All agents are busy. Please call back later.';
        console.warn(`⚠️ [PLIVO-CONTROLLER] No available agents for call ${callUuid}. Caller: ${callerNumber}`);
      }

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
      if (availableAgent) {
        try {
          console.log(`♻️ [PLIVO-CONTROLLER] Releasing agent ${availableAgent._id} due to answer endpoint error`);
          await this.agentAssignmentService.markAgentAsAvailable(availableAgent._id.toString());
        } catch (releaseError) {
          console.error(`❌ [PLIVO-CONTROLLER] Failed to release agent ${availableAgent._id} after error:`, releaseError);
        }
      }
      res.status(500).send('Internal Server Error');
    }
  }

  @Post('/webhook/call-answered')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  @OpenAPI({ summary: 'Handle Plivo call answered webhook' })
  async handleCallAnswered(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
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

      const allCallAgents = await this.userRepository.findCallAgents();
      const agentWithCall = allCallAgents.find(agent => agent.currentCallUuid === callUuid);

      if (agentWithCall) {
        await this.agentAssignmentService.markAgentAsAvailable(agentWithCall._id.toString());
        console.log(`✅ [PLIVO-CONTROLLER] Marked agent ${agentWithCall.agent} as available`);
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
      const plivoQuery: any = {
        limit: limit,
        offset: offset
      };

      if (startDate) plivoQuery.start_time = startDate;
      if (endDate) plivoQuery.end_time = endDate;
      if (status) plivoQuery.status = status;
      if (direction) plivoQuery.call_direction = direction;

      const response = await this.client.calls.list(plivoQuery);

      const history = (response as any)
        .filter((item: any) => item.callUuid)
        .map((call: any) => ({
          uuid: call.callUuid,
          from: call.fromNumber,
          to: call.toNumber,
          duration: call.callDuration,
          status: call.callState,
          startTime: call.initiationTime,
          direction: call.callDirection
        }));

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
      if (user.role !== 'call_agent') {
        throw new BadRequestError('Only call agents can access their analytics');
      }

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
      if (user.role !== 'admin') {
        throw new BadRequestError('Only admins can access ACC analytics');
      }

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

  @Get('/acc-queries')
  @Authorized()
  @OpenAPI({ summary: 'Get paginated list of queries asked with domains for a specified time period' })
  async getQueries(
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
    @QueryParam('search') search?: string,
    @QueryParam('domain') domain?: string,
    @QueryParam('limit') limitStr?: string,
    @QueryParam('page') pageStr?: string,
    @CurrentUser() user?: IUser
  ): Promise<any> {
    try {
      if (user?.role !== 'admin' && user?.role !== 'moderator') {
        throw new BadRequestError('Only admins/moderators can access ACC queries');
      }

      // console.log('📬 [ACC-BACKEND] GET /acc-queries parameters received:', {
      //   startDate, endDate, search, domain, limitStr, pageStr, userRole: user?.role
      // });

      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) {
        start = new Date(startDate);
        if (isNaN(start.getTime())) throw new BadRequestError('Invalid startDate format');
      }
      if (endDate) {
        end = new Date(endDate);
        if (isNaN(end.getTime())) throw new BadRequestError('Invalid endDate format');
      }

      const limit = limitStr ? parseInt(limitStr, 10) : 10;
      const page = pageStr ? parseInt(pageStr, 10) : 1;
      const offset = (page - 1) * limit;

      const { queries, total } = await this.callDetailsRepository.getQueriesByPeriod({
        startDate: start,
        endDate: end,
        search,
        domain,
        limit,
        offset
      });

      // console.log(`📊 [ACC-BACKEND] Found ${queries.length} calls from DB (total match count: ${total})`);

      const phoneToFarmerNameCache = new Map<string, string>();
      const enrichedQueries = [];

      for (const call of queries) {
        if (!call.QA_pairs) continue;
        const phone = call.from || '';
        let farmerName = '';

        if (phone) {
          if (phoneToFarmerNameCache.has(phone)) {
            farmerName = phoneToFarmerNameCache.get(phone) || '';
          } else {
            try {
              const farmer = await this.callFarmerRepository.findByPhoneNo(phone);
              farmerName = farmer?.profile?.farmerName || '';
              phoneToFarmerNameCache.set(phone, farmerName);
            } catch (err) {
              console.warn(`[PlivoController] Failed to look up farmer for phone ${phone}:`, err);
            }
          }
        }

        const metadata = call.QA_pairs.metadata;
        const qnas = call.QA_pairs.QnA || [];
        for (const qna of qnas) {
          enrichedQueries.push({
            id: qna.id,
            callUuid: call.callUuid,
            createdAt: call.createdAt,
            phone,
            farmerName,
            crop: metadata.extracted_crop,
            state: metadata.extracted_state,
            district: metadata.extracted_district,
            domain: metadata.standardized_domains || metadata.extracted_domain || [],
            season: metadata.extracted_season,
            question: qna.question,
            answer: qna.answer,
            agri_specialist: qna.agri_specialist,
            authorName: qna.authorName || '',
            sourceName: qna.sourceName || '',
            sourceLink: qna.sourceLink || ''
          });
        }
      }

      // console.log(`✅ [ACC-BACKEND] Returning ${enrichedQueries.length} enriched QnA pairs to frontend`);
      return { queries: enrichedQueries, total };
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error getting ACC queries:', error);
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError('Failed to get ACC queries');
    }
  }

  @Get('/download-acc-queries')
  @Authorized()
  @OpenAPI({ summary: 'Download all queries asked with domains for a specified time period as a CSV' })
  async downloadQueries(
    @Res() res: Response,
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
    @QueryParam('search') search?: string,
    @QueryParam('domain') domain?: string,
    @CurrentUser() user?: IUser
  ): Promise<any> {
    try {
      if (user?.role !== 'admin' && user?.role !== 'moderator') {
        throw new BadRequestError('Only admins/moderators can access ACC queries download');
      }

      let start: Date | undefined;
      let end: Date | undefined;

      if (startDate) {
        start = new Date(startDate);
        if (isNaN(start.getTime())) throw new BadRequestError('Invalid startDate format');
      }
      if (endDate) {
        end = new Date(endDate);
        if (isNaN(end.getTime())) throw new BadRequestError('Invalid endDate format');
      }

      const { queries } = await this.callDetailsRepository.getQueriesByPeriod({
        startDate: start,
        endDate: end,
        search,
        domain
      });

      const csvHeaders = [
        'Call UUID',
        'Call Date',
        'Farmer Phone',
        'Farmer Name',
        'Crop',
        'State',
        'District',
        'Domain',
        'Season',
        'Question Asked',
        'Specialist/AI Answer',
        'Reference Author',
        'Source Name',
        'Source Link'
      ];

      const escapeCSV = (val: any) => {
        if (val === null || val === undefined) return '';
        let str = String(val);
        str = str.replace(/"/g, '""');
        if (/[",\n\r]/.test(str)) {
          str = `"${str}"`;
        }
        return str;
      };

      const csvRows = [csvHeaders.join(',')];
      const phoneToFarmerNameCache = new Map<string, string>();

      for (const call of queries) {
        if (!call.QA_pairs) continue;
        const phone = call.from || '';
        let farmerName = '';

        if (phone) {
          if (phoneToFarmerNameCache.has(phone)) {
            farmerName = phoneToFarmerNameCache.get(phone) || '';
          } else {
            try {
              const farmer = await this.callFarmerRepository.findByPhoneNo(phone);
              farmerName = farmer?.profile?.farmerName || '';
              phoneToFarmerNameCache.set(phone, farmerName);
            } catch (err) {
              console.warn(`[PlivoController] CSV Lookup Failed for ${phone}:`, err);
            }
          }
        }

        const metadata = call.QA_pairs.metadata;
        const qnas = call.QA_pairs.QnA || [];

        for (const qna of qnas) {
          const row = [
            escapeCSV(call.callUuid),
            escapeCSV(call.createdAt ? call.createdAt.toISOString() : ''),
            escapeCSV(phone),
            escapeCSV(farmerName),
            escapeCSV(metadata.extracted_crop),
            escapeCSV(metadata.extracted_state),
            escapeCSV(metadata.extracted_district),
            escapeCSV(Array.isArray(metadata.extracted_domain) ? metadata.extracted_domain.join('; ') : metadata.extracted_domain),
            escapeCSV(metadata.extracted_season),
            escapeCSV(qna.question),
            escapeCSV(qna.answer),
            escapeCSV(qna.authorName),
            escapeCSV(qna.sourceName),
            escapeCSV(qna.sourceLink)
          ];
          csvRows.push(row.join(','));
        }
      }

      const csvString = csvRows.join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=acc_queries_${Date.now()}.csv`);
      res.status(200).send(csvString);
      return res;
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error exporting ACC queries:', error);
      if (error instanceof BadRequestError) throw error;
      throw new InternalServerError('Failed to export ACC queries');
    }
  }
}
