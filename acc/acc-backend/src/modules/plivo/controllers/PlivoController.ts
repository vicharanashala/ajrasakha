import 'reflect-metadata';
import {
  Post,
  Get,
  Put,
  Delete,
  HttpCode,
  Body,
  Param,
  QueryParam,
  Req,
  Res,
  Authorized,
  BadRequestError,
  ForbiddenError,
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
import type { ICallDetailsRepository, AgentAnalytics, ACCAnalytics, CallRecording } from '#shared/database/interfaces/ICallDetailsRepository.js';
import type { ICallFarmerRepository } from '#shared/database/interfaces/IFarmerRepository.js';
import type { IPlivoCredentialsRepository } from '#shared/database/interfaces/IPlivoCredentialsRepository.js';
import type { IUser } from '#shared/interfaces/models.js';
import { PlivoService } from '../services/PlivoService.js';
import { StorageService } from '#root/modules/storage/services/StorageService.js';
import { STORAGE_TYPES } from '#root/modules/storage/types.js';

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
    @inject(PLIVO_TYPES.CallFarmerRepository) private callFarmerRepository: ICallFarmerRepository,
    @inject(GLOBAL_TYPES.PlivoCredentialsRepository) private plivoCredentialsRepository: IPlivoCredentialsRepository,
    @inject(STORAGE_TYPES.StorageService) private storageService: StorageService
  ) { }

  @Post('/answer')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  @OpenAPI({ summary: 'Handle inbound call answer from Plivo' })
  async answer(@Req() req: Request, @Res() res: Response): Promise<void> {
    let availableAgent: IUser | null = null;
    try {
      const streamUrl = appConfig.plivo.streamUrl;
      const recordCallbackUrl = appConfig.plivo.recordCallbackUrl;
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
        const credentials = await this.agentAssignmentService.getAgentCredentials(agentNumber);
        endpointUser = credentials.username;

        this.plivoService.registerCall(callUuid, {
          from: callerNumber,
          to: myPlivoNumber,
          agentUserId: availableAgent._id.toString(),
          startTime: new Date(),
        });
        // console.log(`✅ [PLIVO-CONTROLLER] Assigned agent ${agentNumber} (userId=${availableAgent._id}, endpoint=${endpointUser}) to call ${callUuid}`);
        fallbackMessage = 'The specialist is busy. Please stay on the line.';
      } else {
        endpointUser = '';
        fallbackMessage = 'All agents are busy. Please call back later.';
        console.warn(`⚠️ [PLIVO-CONTROLLER] No available agents for call ${callUuid}. Caller: ${callerNumber}`);
        this.plivoService.registerCall(callUuid, {
          from: callerNumber,
          to: myPlivoNumber,
          startTime: new Date(),
        });
      }

      let xml: string;
      if (endpointUser) {
        xml = `<?xml version="1.0" encoding="UTF-8"?>
                    <Response>
                              <Stream contentType="audio/x-l16;rate=16000"
          noiseCancellation="true" audioTrack="both" noise_cancellation_level="85"
          >${streamUrl}</Stream>
                              <Speak voice="MAN" language="en-US">${welcomeMessage}</Speak>
                              <Record action="${recordCallbackUrl}" method="POST" startOnDialAnswer="true" redirect="false" fileFormat="mp3" maxLength="3600" />
                              <Dial timeout="40" callerId="${myPlivoNumber}">
                                        <User>${endpointUser}</User>
                              </Dial>
                              <Speak voice="MAN" language="en-US">Thank you for calling Annam Call Center</Speak>
                              <Wait length="5" />
                              <Hangup />
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

  @Post('/webhook/record')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  @OpenAPI({ summary: 'Handle Plivo recording completed webhook callback' })
  async handleRecordWebhook(@Req() req: Request, @Res() res: Response): Promise<void> {
    try {
      const body = req.body || {};
      const query = req.query || {};

      const recordingId = body.RecordingID || query.RecordingID || body.recording_id;
      const callUuid = body.CallUUID || query.CallUUID || body.call_uuid;
      const recordUrl = body.RecordUrl || query.RecordUrl || body.recording_url;
      const recordingDuration = body.RecordingDuration || query.RecordingDuration || body.recording_duration;
      const recordingDurationMs = body.RecordingDurationMs || query.RecordingDurationMs || body.recording_duration_ms;
      const recordingFormat = body.RecordingFormat || query.RecordingFormat || body.recording_format || 'mp3';
      const recordingType = body.RecordingType || query.RecordingType || body.recording_type || 'normal';

      console.log(`🎙️ [PLIVO-CONTROLLER] Received recording webhook: CallUUID=${callUuid}, RecordingID=${recordingId}, Duration=${recordingDuration}s`);

      if (!callUuid || !recordUrl) {
        console.warn('⚠️ [PLIVO-CONTROLLER] Missing CallUUID or RecordUrl in record webhook payload:', body);
        res.status(200).send('Ignored: missing fields');
        return;
      }

      // Respond 200 OK immediately to Plivo so webhook does not timeout
      res.status(200).send('OK');

      // Process streaming upload to GCS / Storage Emulator asynchronously
      (async () => {
        try {
          // 1. Strictly wait for the call to end / hang up first before doing anything
          if (this.plivoService.isCallActive(callUuid)) {
            console.log(`⏳ [PLIVO-CONTROLLER] Recording webhook arrived for ${callUuid}, but call is still active. Waiting for call to hangup...`);
            const maxWaitCallEndMs = 300000; // max 5 mins
            const startWait = Date.now();
            while (this.plivoService.isCallActive(callUuid) && (Date.now() - startWait) < maxWaitCallEndMs) {
              await new Promise((r) => setTimeout(r, 2000));
            }
            console.log(`📞 [PLIVO-CONTROLLER] Call ${callUuid} has hung up / ended. Now proceeding to download pipeline.`);
          }

          const now = new Date();
          const year = now.getFullYear();
          const month = String(now.getMonth() + 1).padStart(2, '0');
          const prefix = appConfig.storage?.recordingsPathPrefix || 'call-recordings';
          const ext = recordingFormat.toLowerCase().includes('wav') ? 'wav' : 'mp3';
          const destinationPath = `${prefix}/${year}/${month}/${callUuid}_${recordingId || Date.now()}.${ext}`;

          const auth = appConfig.plivo.authId && appConfig.plivo.authToken ? {
            user: appConfig.plivo.authId,
            pass: appConfig.plivo.authToken,
          } : undefined;



          let finalRecordUrl = recordUrl;
          try {
            if (recordingId && this.client?.recordings) {
              const plivoRec = await this.client.recordings.get(recordingId);
              if (plivoRec?.recordingUrl) {
                finalRecordUrl = plivoRec.recordingUrl;
                console.log(`[PLIVO-CONTROLLER] Obtained canonical recording URL from Plivo API: ${finalRecordUrl}`);
              }
            }
          } catch (recApiErr: any) {
            console.warn(`[PLIVO-CONTROLLER] Plivo API getRecording warning:`, recApiErr.message || recApiErr);
          }

          const uploadResult = await this.storageService.uploadStreamFromUrl(
            finalRecordUrl,
            destinationPath,
            auth,
            ext === 'wav' ? 'audio/wav' : 'audio/mpeg'
          );


          const recordingItem: CallRecording = {
            recordingId: recordingId || `rec_${Date.now()}`,
            storagePath: uploadResult.storagePath,
            storageBucket: appConfig.firebase.storageBucket,
            duration: Math.round(Number(recordingDuration) || 0),
            durationMs: Number(recordingDurationMs) || (recordingDuration ? Number(recordingDuration) * 1000 : undefined),
            format: ext as 'mp3' | 'wav',
            status: 'completed',
            sizeBytes: uploadResult.size,
            plivoRecordUrl: recordUrl,
            plivoDeleted: false,
            plivoDeletedAt: null,
            type: recordingType as 'normal' | 'conference',
            createdAt: now,
            updatedAt: now,
          };

          await this.callDetailsRepository.addRecordingToCall(callUuid, recordingItem);
          console.log(`✅ [PLIVO-CONTROLLER] Successfully stored recording for call ${callUuid} in MongoDB & Storage.`);
        } catch (uploadError: any) {
          console.error(`❌ [PLIVO-CONTROLLER] Failed to stream recording for ${callUuid} to storage:`, uploadError);
          try {
            const failedItem: CallRecording = {
              recordingId: recordingId || `rec_${Date.now()}`,
              storagePath: '',
              storageBucket: appConfig.firebase.storageBucket,
              duration: Math.round(Number(recordingDuration) || 0),
              format: 'mp3',
              status: 'failed',
              plivoRecordUrl: recordUrl,
              plivoDeleted: false,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            await this.callDetailsRepository.addRecordingToCall(callUuid, failedItem);
          } catch (e) {
            // ignore
          }
        }
      })();
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error in record webhook handler:', error);
      res.status(500).send('Internal Server Error');
    }
  }

  @Get('/recordings/:callUuid/url')
  @Authorized()
  @HttpCode(200)
  @OpenAPI({ summary: 'Get signed playback URL for a call recording' })
  async getRecordingPlaybackUrl(
    @Param('callUuid') callUuid: string,
    @CurrentUser() currentUser: IUser
  ) {
    try {
      const callDetails = await this.callDetailsRepository.getByCallUuid(callUuid);
      if (!callDetails) {
        throw new BadRequestError(`Call details not found for UUID: ${callUuid}`);
      }

      // Authorization check: User must be admin, moderator, or the agent who handled the call
      if (
        currentUser.role !== 'admin' &&
        currentUser.role !== 'moderator' &&
        callDetails.agent?.userid?.toString() !== currentUser._id?.toString()
      ) {
        throw new ForbiddenError('You are not authorized to access this call recording');
      }

      const recording = callDetails.recording;

      if (!recording || recording.status !== 'completed' || !recording.storagePath) {
        return {
          callUuid,
          hasRecording: false,
          message: 'No completed recording available for this call',
          recording: recording || null,
        };
      }

      const signedUrl = await this.storageService.getSignedPlaybackUrl(recording.storagePath, 15);

      return {
        callUuid,
        hasRecording: true,
        url: signedUrl,
        recordingId: recording.recordingId,
        duration: recording.duration,
        format: recording.format,
        status: recording.status,
        recording,
      };
    } catch (error: any) {
      console.error(`❌ [PLIVO-CONTROLLER] Error generating recording URL for ${callUuid}:`, error);
      if (error instanceof BadRequestError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new InternalServerError('Failed to generate recording playback URL');
    }
  }

  /* Commented out local recordings endpoint (audio recordings are streamed via Firebase Storage Emulator / GCS Signed URLs):
  @Get('/recordings/local')
  @OpenAPI({ summary: 'Stream local audio recording file' })
  async streamLocalRecording(
    @QueryParam('path') queryPath: string,
    @Req() req: Request,
    @Res() res: Response
  ): Promise<void> {
    try {
      const fs = await import('fs');
      const path = await import('path');

      const rawPath = queryPath || (req.query?.path as string) || '';
      const cleanPath = decodeURIComponent(rawPath).replace(/^(\/|\\)+/, '');
      const localFilePath = path.join(process.cwd(), 'uploads', cleanPath);

      if (!cleanPath || !fs.existsSync(localFilePath)) {
        res.status(404).send('Audio recording file not found');
        return;
      }

      const stat = fs.statSync(localFilePath);
      const fileSize = stat.size;
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = end - start + 1;
        const fileStream = fs.createReadStream(localFilePath, { start, end });
        const head = {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize,
          'Content-Type': 'audio/mpeg',
        };
        res.writeHead(206, head);
        fileStream.pipe(res);
      } else {
        const head = {
          'Content-Length': fileSize,
          'Content-Type': 'audio/mpeg',
          'Accept-Ranges': 'bytes',
        };
        res.writeHead(200, head);
        fs.createReadStream(localFilePath).pipe(res);
      }
    } catch (err: any) {
      console.error('Error streaming local recording:', err);
      res.status(500).send('Error streaming recording');
    }
  }
  */






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

      if (callUuid) {
        this.plivoService.markCallEnded(callUuid);
      }

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
    agentUserId?: string;
    agentUsername?: string;
    agentEmail?: string;
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

      await Promise.all(
        (history as any[]).map(async (item) => {
          try {
            const details = await this.callDetailsRepository.getByCallUuid(item.uuid);
            let agentUserIdStr = details?.agent?.userid ? details.agent.userid.toString() : this.plivoService.getCallAgent(item.uuid);

            if (details) {
              item.callDetails = details;
            }

            if (agentUserIdStr) {
              try {
                const agentUser = await this.userRepository.findById(agentUserIdStr);
                if (agentUser) {
                  const fullName = [agentUser.firstName, agentUser.lastName].filter(Boolean).join(' ') || agentUser.agent || agentUser.email;

                  item.agentUserId = agentUserIdStr;
                  item.agentUsername = fullName;
                  item.agentEmail = agentUser.email;

                  if (item.callDetails) {
                    item.callDetails.agent = item.callDetails.agent || { transcript: '', translation: '', detectedLanguage: 'unknown' };
                    item.callDetails.agent.userid = agentUserIdStr;
                    item.callDetails.agent.username = fullName;
                    item.callDetails.agent.email = agentUser.email;
                  }
                }
              } catch (userErr) {
                console.warn(`[PLIVO-CONTROLLER] Could not resolve user details for agent ${agentUserIdStr}:`, userErr);
              }
            }
          } catch (e) {
            console.error(`[PLIVO-CONTROLLER] Could not fetch details for ${item.uuid}`);
          }
        })
      );

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

      // Sanitize phone number (remove non-digits, take last 10 digits for Indian numbers)
      const sanitizedPhone = body.destination.replace(/\D/g, '').slice(-10);
      if (!/^[6-9]\d{9}$/.test(sanitizedPhone)) {
        return res.status(400).json({
          success: false,
          error: "Invalid 10-digit Indian mobile number provided"
        });
      }

      const cleanText = body.text.trim();
      if (!cleanText || cleanText.length > 500) {
        return res.status(400).json({
          success: false,
          error: "Message text must be between 1 and 500 characters"
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
        message: cleanText,
        language: 'english',
        flash: 0,
        numbers: sanitizedPhone,
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
    @QueryParam('state') state?: string,
    @QueryParam('district') district?: string,
    @QueryParam('block') block?: string,
    @QueryParam('crop') crop?: string,
    @QueryParam('season') season?: string,
    @QueryParam('limit') limitStr?: string,
    @QueryParam('page') pageStr?: string,
    @CurrentUser() user?: IUser
  ): Promise<any> {
    try {
      if (user?.role !== 'admin' && user?.role !== 'moderator') {
        throw new BadRequestError('Only admins/moderators can access ACC queries');
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

      const limit = limitStr ? parseInt(limitStr, 10) : 10;
      const page = pageStr ? parseInt(pageStr, 10) : 1;
      const offset = (page - 1) * limit;

      const { queries, total } = await this.callDetailsRepository.getQueriesByPeriod({
        startDate: start,
        endDate: end,
        search,
        domain,
        state,
        district,
        block,
        crop,
        season,
        limit,
        offset
      });

      const phoneToFarmerCache = new Map<string, any>();
      const enrichedQueries = [];

      for (const qItem of queries) {
        const phone = qItem.from || '';
        let farmer: any = null;

        if (phone) {
          if (phoneToFarmerCache.has(phone)) {
            farmer = phoneToFarmerCache.get(phone);
          } else {
            try {
              farmer = await this.callFarmerRepository.findByPhoneNo(phone);
              phoneToFarmerCache.set(phone, farmer);
            } catch (err) {
              console.warn(`[PlivoController] Failed to look up farmer for phone ${phone}:`, err);
            }
          }
        }

        const metadata = qItem.metadata || {};
        const farmerName = farmer?.profile?.farmerName || '';
        const blockName = metadata.extracted_block || farmer?.profile?.blockName || '';
        const stateName = metadata.extracted_state || farmer?.profile?.state || '';
        const districtName = metadata.extracted_district || farmer?.profile?.district || '';

        enrichedQueries.push({
          id: qItem._id ? qItem._id.toString() : '',
          callUuid: qItem.callUuid,
          createdAt: qItem.createdAt,
          phone,
          farmerName,
          crop: metadata.extracted_crop || '',
          state: stateName,
          district: districtName,
          block: blockName,
          domain: metadata.standardized_domains?.length ? metadata.standardized_domains : (metadata.extracted_domain || []),
          season: metadata.extracted_season || '',
          question: qItem.question || '',
          answer: qItem.answer || '',
          agri_specialist: qItem.agri_specialist || 'ACC_AGENT',
          authorName: qItem.authorName || '',
          sourceName: qItem.sourceName || '',
          sourceLink: qItem.sourceLink || ''
        });
      }

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
    @QueryParam('state') state?: string,
    @QueryParam('district') district?: string,
    @QueryParam('block') block?: string,
    @QueryParam('crop') crop?: string,
    @QueryParam('season') season?: string,
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
        domain,
        state,
        district,
        block,
        crop,
        season
      });

      const csvHeaders = [
        'Call UUID',
        'Call Date',
        'Farmer Phone',
        'Farmer Name',
        'Crop',
        'State',
        'District',
        'Block',
        'Domain',
        'Season',
        'Question',
        'Answer',
        'Author Name',
        'Source Name',
        'Source Link'
      ];

      const maskPhone = (phoneStr: string) => {
        if (!phoneStr) return '';
        const digitsOnly = phoneStr.replace(/\D/g, '');
        if (digitsOnly.length <= 3) return phoneStr;
        const last3 = digitsOnly.slice(-3);
        const maskedPrefix = '*'.repeat(digitsOnly.length - 3);
        return maskedPrefix + last3;
      };

      const stripMarkdown = (text: string): string => {
        if (!text) return '';
        return text
          .replace(/^#+\s+/gm, '')
          .replace(/(\*\*|__)(.*?)\1/g, '$2')
          .replace(/(\*|_)(.*?)\1/g, '$2')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/```[\s\S]*?```/g, '')
          .replace(/^[\s]*[-*+]\s+/gm, '')
          .replace(/^[\s]*\d+\.\s+/gm, '')
          .trim();
      };

      const escapeCSV = (field: any) => {
        if (field === null || field === undefined) return '""';
        let str = String(field).replace(/"/g, '""');
        if (/[",\n\r]/.test(str)) {
          str = `"${str}"`;
        }
        return str;
      };

      const csvRows = [csvHeaders.join(',')];
      const phoneToFarmerCache = new Map<string, any>();

      for (const qItem of queries) {
        const phone = qItem.from || '';
        let farmer: any = null;

        if (phone) {
          if (phoneToFarmerCache.has(phone)) {
            farmer = phoneToFarmerCache.get(phone);
          } else {
            try {
              farmer = await this.callFarmerRepository.findByPhoneNo(phone);
              phoneToFarmerCache.set(phone, farmer);
            } catch (err) {
              console.warn(`[PlivoController] CSV Lookup Failed for ${phone}:`, err);
            }
          }
        }

        const metadata = qItem.metadata || {};
        const farmerName = farmer?.profile?.farmerName || '';
        const blockName = metadata.extracted_block || farmer?.profile?.blockName || '';
        const stateName = metadata.extracted_state || farmer?.profile?.state || '';
        const districtName = metadata.extracted_district || farmer?.profile?.district || '';

        const domainStr = Array.isArray(metadata.extracted_domain)
          ? metadata.extracted_domain.join('; ')
          : (metadata.extracted_domain || (Array.isArray(metadata.standardized_domains) ? metadata.standardized_domains.join('; ') : ''));

        const row = [
          escapeCSV(qItem.callUuid),
          escapeCSV(qItem.createdAt ? (qItem.createdAt instanceof Date ? qItem.createdAt.toISOString() : new Date(qItem.createdAt).toISOString()) : ''),
          escapeCSV(maskPhone(phone)),
          escapeCSV(farmerName),
          escapeCSV(metadata.extracted_crop || ''),
          escapeCSV(stateName),
          escapeCSV(districtName),
          escapeCSV(blockName),
          escapeCSV(domainStr),
          escapeCSV(metadata.extracted_season || ''),
          escapeCSV(stripMarkdown(qItem.question || '')),
          escapeCSV(stripMarkdown(qItem.answer || '')),
          escapeCSV(qItem.authorName || ''),
          escapeCSV(qItem.sourceName || ''),
          escapeCSV(qItem.sourceLink || '')
        ];
        csvRows.push(row.join(','));
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

  @Get('/agent-credentials')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get current call agent Plivo SIP endpoint credentials from database' })
  async getAgentCredentials(@CurrentUser() currentUser: IUser) {
    const latestUser = currentUser?._id
      ? await this.userRepository.findById(currentUser._id.toString())
      : currentUser;

    let agentNumber = latestUser?.agent || currentUser?.agent;

    if (!agentNumber || agentNumber === 'not_available') {
      if (latestUser?.role === 'call_agent' || currentUser?.role === 'call_agent') {
        agentNumber = 'agent_1';
      } else {
        return {
          username: '',
          password: '',
          streamUrl: appConfig.plivo.streamUrl,
        };
      }
    }

    const cred = await this.plivoCredentialsRepository.findByAgentNumber(agentNumber);
    const fallbackUsername = process.env.VITE_PLIVO_ENDPOINT_USERNAME || process.env.PLIVO_ENDPOINT_USERNAME || 'annamuser1293525305518427216';
    const fallbackPassword = process.env.VITE_PLIVO_ENDPOINT_PASSWORD || process.env.PLIVO_ENDPOINT_PASSWORD || 'testing@annam26';

    return {
      username: cred?.username || fallbackUsername,
      password: cred?.password || fallbackPassword,
      streamUrl: appConfig.plivo.streamUrl,
    };
  }

  @Get('/credentials/all')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get all Plivo endpoint credentials (Call Centre Managers only)' })
  async getAllCredentials(@CurrentUser() currentUser: IUser) {
    if (currentUser?.role !== 'admin' || !currentUser?.Call_centre_manager) {
      throw new ForbiddenError('Only a Call Centre Manager can access Plivo endpoints management');
    }
    const creds = await this.plivoCredentialsRepository.getAllAgentCredentials();
    return creds;
  }

  @Get('/credentials/next-agent-number')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Get next auto-incremented agent number for Plivo endpoint creation' })
  async getNextAgentNumber(@CurrentUser() currentUser: IUser) {
    if (currentUser?.role !== 'admin' || !currentUser?.Call_centre_manager) {
      throw new ForbiddenError('Only a Call Centre Manager can access Plivo endpoints management');
    }
    const nextAgentNumber = await this.plivoCredentialsRepository.getNextAgentNumber();
    return { nextAgentNumber };
  }

  @Post('/credentials')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Create or update a Plivo endpoint credential' })
  async upsertCredential(
    @CurrentUser() currentUser: IUser,
    @Body() body: { agentNumber?: string; username: string; password: string }
  ) {
    if (currentUser?.role !== 'admin' || !currentUser?.Call_centre_manager) {
      throw new ForbiddenError('Only a Call Centre Manager can edit Plivo endpoints');
    }
    if (!body.username || !body.password) {
      throw new BadRequestError('username and password are required');
    }
    const agentNum = body.agentNumber ? body.agentNumber.trim() : await this.plivoCredentialsRepository.getNextAgentNumber();
    const result = await this.plivoCredentialsRepository.upsertAgentCredential(
      agentNum,
      body.username.trim(),
      body.password.trim()
    );
    return { success: true, credential: result };
  }

  @Put('/credentials/:agentNumber')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Update a specific Plivo endpoint credential' })
  async updateCredential(
    @CurrentUser() currentUser: IUser,
    @Param('agentNumber') agentNumber: string,
    @Body() body: { username: string; password: string }
  ) {
    if (currentUser?.role !== 'admin' || !currentUser?.Call_centre_manager) {
      throw new ForbiddenError('Only a Call Centre Manager can edit Plivo endpoints');
    }
    if (!body.username || !body.password) {
      throw new BadRequestError('username and password are required');
    }
    const result = await this.plivoCredentialsRepository.upsertAgentCredential(
      agentNumber.trim(),
      body.username.trim(),
      body.password.trim()
    );
    return { success: true, credential: result };
  }

  @Delete('/credentials/:agentNumber')
  @HttpCode(200)
  @Authorized()
  @OpenAPI({ summary: 'Delete a Plivo endpoint credential' })
  async deleteCredential(
    @CurrentUser() currentUser: IUser,
    @Param('agentNumber') agentNumber: string
  ) {
    if (currentUser?.role !== 'admin' || !currentUser?.Call_centre_manager) {
      throw new ForbiddenError('Only a Call Centre Manager can delete Plivo endpoints');
    }
    const deleted = await this.plivoCredentialsRepository.deleteCredential(agentNumber.trim());
    return { success: deleted };
  }
}
