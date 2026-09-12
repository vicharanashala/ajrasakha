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
import { PLIVO_TYPES } from '../types.js';
import { GLOBAL_TYPES } from '#root/types.js';
import type { ICallDetailsRepository, AgentAnalytics, ACCAnalytics, CallRecording } from '#shared/database/interfaces/ICallDetailsRepository.js';
import type { ICallFarmerRepository } from '#shared/database/interfaces/IFarmerRepository.js';
import type { IPlivoCredentialsRepository } from '#shared/database/interfaces/IPlivoCredentialsRepository.js';
import type { IUser } from '#shared/interfaces/models.js';
import { PlivoService } from '../services/PlivoService.js';
import { StorageService } from '#root/modules/storage/services/StorageService.js';
import { STORAGE_TYPES } from '#root/modules/storage/types.js';
import { BsnlSmsService } from '#root/modules/sms/services/BsnlSmsService.js';
import { SMS_TYPES } from '#root/modules/sms/types.js';

function maskPhone(phoneStr: string): string {
  if (!phoneStr) return '';
  const digitsOnly = phoneStr.replace(/\D/g, '');
  if (digitsOnly.length <= 3) return phoneStr;
  const last3 = digitsOnly.slice(-3);
  const maskedPrefix = '*'.repeat(digitsOnly.length - 3);
  return maskedPrefix + last3;
}

function stripMarkdown(text: string): string {
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
}

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
    @inject(STORAGE_TYPES.StorageService) private storageService: StorageService,
    @inject(SMS_TYPES.BsnlSmsService) private bsnlSmsService: BsnlSmsService
  ) { }

  @Post('/answer')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  @OpenAPI({ summary: 'Handle inbound call answer or agent outbound redial from Plivo' })
  async answer(@Req() req: Request, @Res() res: Response): Promise<any> {
    let availableAgent: IUser | null = null;
    try {
      const streamUrl = appConfig.plivo.streamUrl;
      const recordCallbackUrl = appConfig.plivo.recordCallbackUrl;
      const myPlivoNumber = appConfig.plivo.plivo_number;
      const callUuid = req.body?.CallUUID || req.query?.CallUUID;
      const callerNumber = req.body?.From || req.query?.From || 'unknown';
      // console.log(`📞 [PLIVO-CONTROLLER] Call webhook received: CallUUID=${callUuid}, From=${callerNumber}`);

      // Check if this call is initiated outbound by an agent's SIP WebRTC softphone
      const isOutbound =
        (typeof callerNumber === 'string' && callerNumber.startsWith('sip:')) ||
        req.body?.['X-PH-callType'] === 'outbound' ||
        req.headers?.['x-ph-calltype'] === 'outbound' ||
        req.query?.['X-PH-callType'] === 'outbound' ||
        Boolean(req.body?.['X-PH-destination'] || req.headers?.['x-ph-destination'] || req.query?.['X-PH-destination']);

      if (isOutbound) {
        console.log(`📞 [PLIVO-CONTROLLER] Agent outbound redial call detected: CallUUID=${callUuid}, From=${callerNumber}`);

        const rawDest =
          req.body?.['X-PH-destination'] ||
          req.headers?.['x-ph-destination'] ||
          req.query?.['X-PH-destination'] ||
          req.body?.To ||
          req.query?.To;

        const agentIdentifier =
          req.body?.['X-PH-agentId'] ||
          req.headers?.['x-ph-agentid'] ||
          req.query?.['X-PH-agentId'];

        // Format destination phone number to E.164 (+91...)
        let destination = String(rawDest || '').trim();
        if (destination) {
          destination = destination.replace(/[^\d+]/g, '');
          if (!destination.startsWith('+')) {
            if (destination.startsWith('91') && destination.length === 12) {
              destination = '+' + destination;
            } else if (destination.length === 10) {
              destination = '+91' + destination;
            } else if (destination.startsWith('0') && destination.length === 11) {
              destination = '+91' + destination.substring(1);
            } else {
              destination = '+' + destination;
            }
          }
        }

        if (!destination || destination.length < 10) {
          console.warn(`⚠️ [PLIVO-CONTROLLER] Invalid destination for outbound call ${callUuid}: ${destination}`);
          const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Speak voice="MAN" language="en-US">Invalid destination number.</Speak>
  <Hangup />
</Response>`;
          res.set('Content-Type', 'text/xml');
          return res.send(xml);
        }

        // Identify agent user in DB
        let agentUser: IUser | null = null;
        try {
          const activeAgents = await this.userRepository.findActiveCallAgents();
          if (agentIdentifier) {
            agentUser = activeAgents.find(a => a.agent === agentIdentifier || a._id.toString() === agentIdentifier) || null;
          }
          if (!agentUser && typeof callerNumber === 'string' && callerNumber.startsWith('sip:')) {
            const sipUser = callerNumber.replace(/^sip:/, '').split('@')[0];
            const allCreds = await this.plivoCredentialsRepository.getAllAgentCredentials();
            const matchedCred = allCreds.find(c => c.username === sipUser || c.agentNumber === sipUser);
            if (matchedCred) {
              agentUser = activeAgents.find(a => a.agent === matchedCred.agentNumber) || null;
            }
          }
          if (!agentUser && activeAgents.length > 0) {
            agentUser = activeAgents[0];
          }
        } catch (findErr) {
          console.warn(`⚠️ [PLIVO-CONTROLLER] Error identifying agent for outbound call ${callUuid}:`, findErr);
        }

        const effectiveCallerId = myPlivoNumber && !myPlivoNumber.includes('+1555') ? myPlivoNumber : '+918031150392';

        if (agentUser) {
          availableAgent = agentUser;
          await this.agentAssignmentService.markAgentAsBusy(agentUser._id.toString(), callUuid);
        }

        this.plivoService.registerCall(callUuid, {
          from: effectiveCallerId,
          to: destination,
          agentUserId: agentUser?._id?.toString(),
          direction: 'outbound',
          startTime: new Date(),
        });

        console.log(`✅ [PLIVO-CONTROLLER] Outbound call ${callUuid} to ${destination} registered for agent ${agentUser?.agent || 'unknown'}`);

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Stream contentType="audio/x-l16;rate=16000" noiseCancellation="true" audioTrack="both" noise_cancellation_level="85">${streamUrl}</Stream>
  <Record action="${recordCallbackUrl}" method="POST" startOnDialAnswer="true" redirect="false" fileFormat="mp3" maxLength="3600" />
  <Dial timeout="40" callerId="${effectiveCallerId}">
    <Number>${destination}</Number>
  </Dial>
</Response>`;

        res.set('Content-Type', 'text/xml');
        return res.send(xml);
      }

      // --- Inbound Call Flow ---
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
          direction: 'inbound',
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
          direction: 'inbound',
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
                              <Speak voice="MAN" language="en-US">Thank you for calling Annam Call Centre</Speak>
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
      return res.send(xml);
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
      res.set('Content-Type', 'text/plain');
      return res.status(500).send('Internal Server Error');
    }
  }

  @Post('/webhook/record')
  @HttpCode(200)
  @UseBefore(urlencoded({ extended: true }))
  @OpenAPI({ summary: 'Handle Plivo recording completed webhook callback' })
  async handleRecordWebhook(@Req() req: Request, @Res() res: Response): Promise<any> {
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
        return res.status(200).send('Ignored: missing fields');
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

          const resolveFreshUrl = async (): Promise<string | null> => {
            if (recordingId && this.client?.recordings) {
              try {
                const plivoRec = await this.client.recordings.get(recordingId);
                if (plivoRec?.recordingUrl) {
                  return plivoRec.recordingUrl;
                }
              } catch (recApiErr: any) {
                // Plivo API will return 404 until transcoding finishes
              }
            }
            return null;
          };

          const uploadResult = await this.storageService.uploadStreamFromUrl(
            recordUrl,
            destinationPath,
            auth,
            ext === 'wav' ? 'audio/wav' : 'audio/mpeg',
            resolveFreshUrl
          );

          const recordingItem: CallRecording = {
            recordingId: recordingId || `rec_${Date.now()}`,
            storagePath: uploadResult.storagePath,
            storageBucket: appConfig.storage.bucket || appConfig.firebase.storageBucket,
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
    @QueryParam('download') isDownload: boolean,
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

      const ext = recording.format || 'mp3';
      const downloadFilename = isDownload ? `call_${callUuid}.${ext}` : undefined;
      const signedUrl = await this.storageService.getSignedPlaybackUrl(recording.storagePath, 15, downloadFilename);

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






  @Post('/call-answered')
  @HttpCode(200)
  @OpenAPI({ summary: 'Save call answered state immediately when call connects in browser' })
  async handleBrowserCallAnswered(
    @Body() body: { callUuid: string; phoneNumber?: string; direction?: string; agentUserId?: string },
    @CurrentUser() currentUser?: IUser
  ): Promise<any> {
    try {
      const { callUuid, phoneNumber, direction, agentUserId } = body;
      if (!callUuid) {
        return { success: false, message: 'callUuid is required' };
      }

      const isTestCall = callUuid.startsWith('testing_');
      let farmerProfile: any = null;

      if (!isTestCall && phoneNumber && phoneNumber.toLowerCase() !== 'unknown') {
        try {
          const farmerDoc = await this.callFarmerRepository.findByPhoneNo(phoneNumber);
          if (farmerDoc) {
            farmerProfile = farmerDoc.profile || farmerDoc;
          }
        } catch (fErr) {
          console.warn(`[PlivoController] Failed to lookup farmer for ${phoneNumber}:`, fErr);
        }
      }

      const existingCall = await this.callDetailsRepository.getByCallUuid(callUuid);
      const isOutbound = direction === 'outbound' || existingCall?.direction === 'outbound';
      const myPlivoNumber = appConfig.plivo.plivo_number;

      const fromNumber = isOutbound
        ? (existingCall?.from || myPlivoNumber)
        : (phoneNumber || existingCall?.from || '');
      const toNumber = isOutbound
        ? (phoneNumber || existingCall?.to || '')
        : (existingCall?.to || myPlivoNumber);

      const agentId = agentUserId || (currentUser?._id ? currentUser._id.toString() : existingCall?.agent?.userid?.toString());
      const agentObj: any = {
        transcript: existingCall?.agent?.transcript || '',
        translation: existingCall?.agent?.translation || '',
        detectedLanguage: existingCall?.agent?.detectedLanguage || '',
      };
      if (agentId) {
        agentObj.userid = agentId;
      }

      if (!existingCall) {
        await this.callDetailsRepository.create({
          callUuid,
          from: fromNumber,
          to: toNumber,
          direction: direction || (isOutbound ? 'outbound' : 'inbound'),
          status: 'connected',
          caller: {
            transcript: '',
            translation: '',
            detectedLanguage: '',
          },
          agent: agentObj,
        });
      } else {
        await this.callDetailsRepository.updateCallDetails(callUuid, {
          status: 'connected',
          ...(fromNumber ? { from: fromNumber } : {}),
          ...(toNumber ? { to: toNumber } : {}),
          direction: direction || existingCall.direction || (isOutbound ? 'outbound' : 'inbound'),
          agent: {
            ...existingCall.agent,
            ...agentObj,
          }
        });
      }

      return { success: true, farmerProfile };
    } catch (error: any) {
      console.error('❌ [PLIVO-CONTROLLER] Error in call-answered endpoint:', error);
      return { success: false, error: error.message };
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
  @OpenAPI({ summary: 'Get call history from database' })
  async getHistory(
    @QueryParam('limit') limit: number = 20,
    @QueryParam('offset') offset: number = 0,
    @QueryParam('startDate') startDate?: string,
    @QueryParam('endDate') endDate?: string,
    @QueryParam('status') status?: string,
    @QueryParam('direction') direction?: string,
    @QueryParam('agentId') agentId?: string
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
    farmerProfile?: any;
    callDetails?: any;
  }>> {
    try {
      const dbCalls = await this.callDetailsRepository.getHistory({
        limit: Number(limit) || 20,
        offset: Number(offset) || 0,
        startDate,
        endDate,
        status,
        direction,
        agentId
      });

      const myPlivoNumber = appConfig.plivo.plivo_number || '+918031150392';
      const formattedCalls: any[] = [];

      for (const call of dbCalls) {
        let agentUserIdStr = call.agent?.userid ? call.agent.userid.toString() : this.plivoService.getCallAgent(call.callUuid);
        let agentName = call.agent?.username;
        let agentEmail = call.agent?.email;

        if (agentUserIdStr && (!agentName || !agentEmail)) {
          if (/^[0-9a-fA-F]{24}$/.test(agentUserIdStr)) {
            try {
              const agentUser = await this.userRepository.findById(agentUserIdStr);
              if (agentUser) {
                agentName = [agentUser.firstName, agentUser.lastName].filter(Boolean).join(' ') || agentUser.agent || agentUser.email;
                agentEmail = agentUser.email;
              }
            } catch (userErr) {
              console.warn(`[PLIVO-CONTROLLER] Could not resolve user details for agent ${agentUserIdStr}:`, userErr);
            }
          } else {
            agentName = agentName || agentUserIdStr;
          }
        }

        const isOutbound = String(call.direction || '').toLowerCase() === 'outbound';

        formattedCalls.push({
          uuid: call.callUuid,
          from: call.from || (isOutbound ? myPlivoNumber : 'unknown'),
          to: call.to || (isOutbound ? 'unknown' : myPlivoNumber),
          duration: call.duration || 0,
          status: call.status || 'completed',
          startTime: new Date(call.createdAt || call.updatedAt || Date.now()).toISOString(),
          direction: isOutbound ? 'outbound' : (call.direction || 'inbound'),
          agentUserId: agentUserIdStr,
          agentUsername: agentName,
          agentEmail: agentEmail,
          farmerProfile: (call as any).farmerProfile,
          callDetails: {
            caller: call.caller,
            agent: {
              ...call.agent,
              userid: agentUserIdStr,
              username: agentName,
              email: agentEmail
            },
            recording: call.recording,
            recordings: call.recordings || (call.recording ? [call.recording] : []),
            queries: call.queries,
            QA_pairs: call.QA_pairs
          }
        });
      }

      return formattedCalls;
    } catch (error: any) {
      console.error('❌ Error fetching call history:', error);
      throw new InternalServerError('Failed to fetch call history');
    }
  }

  @Post('/send-message')
  @Authorized()
  @OpenAPI({
    summary: 'Send SMS via BSNL BRPS',
    description: 'Send advisory SMS to farmer mobile number using BSNL Retail Push SMS (BRPS) service',
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

      const cleanText = body.text.trim();
      if (!cleanText || cleanText.length > 500) {
        return res.status(400).json({
          success: false,
          error: "Message text must be between 1 and 500 characters"
        });
      }

      const result = await this.bsnlSmsService.sendSms(body.destination, cleanText);

      return res.json({
        success: true,
        data: result.data || { messageId: result.messageId },
        messageId: result.messageId,
      });
    } catch (err: any) {
      console.error('[PlivoController] SMS sending error:', err.message);
      return res.status(500).json({
        success: false,
        error: err.message || 'Failed to send SMS via BSNL BRPS'
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
        const isTestCall = !qItem.callUuid || qItem.callUuid.startsWith('testing_');
        let phone = isTestCall ? '' : (qItem.from || qItem.metadata?.farmerPhone || '');
        if (phone.toLowerCase() === 'unknown' || phone.toLowerCase() === 'undefined') {
          phone = '';
        }

        // Do not include testing calls or calls where from and to are empty
        if (isTestCall || !phone) {
          continue;
        }

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
        const farmerName = isTestCall ? '' : (farmer?.profile?.farmerName || metadata.farmerName || metadata.extracted_name || '');
        const blockName = metadata.extracted_block || farmer?.profile?.blockName || '';
        const stateName = metadata.extracted_state || farmer?.profile?.state || '';
        const districtName = metadata.extracted_district || farmer?.profile?.district || '';
        const cropName = metadata.extracted_crop || farmer?.profile?.primaryCrop || farmer?.profile?.crop || '';

        enrichedQueries.push({
          id: qItem._id ? qItem._id.toString() : '',
          callUuid: qItem.callUuid,
          createdAt: qItem.createdAt,
          phone: maskPhone(phone),
          rawPhone: phone,
          farmerName,
          crop: cropName,
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
        const isTestCall = !qItem.callUuid || qItem.callUuid.startsWith('testing_');
        let phone = isTestCall ? '' : (qItem.from || qItem.metadata?.farmerPhone || '');
        if (phone.toLowerCase() === 'unknown' || phone.toLowerCase() === 'undefined') {
          phone = '';
        }

        // Do not include testing calls or calls where from and to are empty
        if (isTestCall || !phone) {
          continue;
        }

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
        const farmerName = isTestCall ? '' : (farmer?.profile?.farmerName || metadata.farmerName || metadata.extracted_name || '');
        const blockName = metadata.extracted_block || farmer?.profile?.blockName || '';
        const stateName = metadata.extracted_state || farmer?.profile?.state || '';
        const districtName = metadata.extracted_district || farmer?.profile?.district || '';
        const cropName = metadata.extracted_crop || farmer?.profile?.primaryCrop || farmer?.profile?.crop || '';

        const domainStr = Array.isArray(metadata.extracted_domain)
          ? metadata.extracted_domain.join('; ')
          : (metadata.extracted_domain || (Array.isArray(metadata.standardized_domains) ? metadata.standardized_domains.join('; ') : ''));

        const row = [
          escapeCSV(qItem.callUuid),
          escapeCSV(qItem.createdAt ? (qItem.createdAt instanceof Date ? qItem.createdAt.toISOString() : new Date(qItem.createdAt).toISOString()) : ''),
          escapeCSV(maskPhone(phone)),
          escapeCSV(farmerName),
          escapeCSV(cropName),
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
