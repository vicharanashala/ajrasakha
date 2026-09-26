import 'reflect-metadata';
import {
  JsonController,
  Get,
  Post,
  HttpCode,
  QueryParams,
  Authorized,
  Res,
  QueryParam,
  Delete,
  Param,
  Patch,
  Body,
  BadRequestError,
  CurrentUser,
  ForbiddenError,
} from 'routing-controllers';
import {OpenAPI, ResponseSchema} from 'routing-controllers-openapi';
import {inject, injectable} from 'inversify';
import {CHATBOT_TYPES} from '../types.js';
import type {IChatbotService} from '../interfaces/IChatbotService.js';
import {IUser} from '#root/shared/interfaces/models.js';
import {
  AuditAction,
  AuditCategory,
  ModeratorAuditTrail,
  OutComeStatus,
} from '#root/modules/auditTrails/interfaces/IAuditTrails.js';
import {AUDIT_TRAILS_TYPES} from '#root/modules/auditTrails/types.js';
import {IAuditTrailsService} from '#root/modules/auditTrails/interfaces/IAuditTrailsService.js';
import {
  ChatbotErrorResponse,
} from '../classes/validators/ChatbotResponseValidators.js';
import {
  GrowthQuery,
  GrowthResponse,
} from '../types/chatbot.type.js';
import {COORDINATOR_ROLES} from '#root/shared/constants/roles.js';

@OpenAPI({
  tags: ['chatbot-user-management'],
  description: 'Chatbot user management endpoints',
})
@injectable()
@JsonController('/analytics', {transformResponse: false})
export class ChatbotUserManagementController {
  constructor(
    @inject(CHATBOT_TYPES.ChatbotService)
    private readonly chatbotService: IChatbotService,

    @inject(AUDIT_TRAILS_TYPES.AuditTrailsService)
    private readonly auditTrailsService: IAuditTrailsService,
  ) {}

  private assertStrongPassword(password?: string) {
    if (!password || !password.trim()) {
      throw new BadRequestError('Password is required');
    }
    if (password.length < 8) {
      throw new BadRequestError('Password must be at least 8 characters');
    }
    if (!/[A-Z]/.test(password)) {
      throw new BadRequestError(
        'Password must contain at least one uppercase letter',
      );
    }
    if (!/[a-z]/.test(password)) {
      throw new BadRequestError(
        'Password must contain at least one lowercase letter',
      );
    }
    if (!/[0-9]/.test(password)) {
      throw new BadRequestError('Password must contain at least one number');
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      throw new BadRequestError(
        'Password must contain at least one special character',
      );
    }
  }

  @Get('/user-growth')
  @HttpCode(200)
  @Authorized()
  async getGrowth(@QueryParams() query: GrowthQuery): Promise<GrowthResponse> {
    const hasCustomRange = Boolean(query.startDate && query.endDate);

    if (hasCustomRange) {
      const startDate = new Date(query.startDate!);
      const endDate = new Date(query.endDate!);

      if (
        Number.isNaN(startDate.getTime()) ||
        Number.isNaN(endDate.getTime())
      ) {
        throw new Error('Invalid startDate or endDate.');
      }

      if (startDate > endDate) {
        throw new Error('startDate cannot be after endDate.');
      }

      const data = await this.chatbotService.getGrowth(
        query.source,
        query.userType,
        30,
        startDate,
        endDate,
        query.coordinatorId,
      );
      return data;
    }

    const range = Number(query.range) || 30;
    const data = await this.chatbotService.getGrowth(query.source, query.userType, range,undefined, undefined, query.coordinatorId,);
    return data;
  }

  @OpenAPI({
    summary: 'Delete a farmer',
    description: 'Deletes a farmer from the specified source database.',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to delete farmer',
  })
  @Delete('/users/:userId')
  @HttpCode(200)
  @Authorized(['admin'])
  async deleteUser(
    @Param('userId') userId: string,
    @QueryParam('source') source: string,
    @CurrentUser() user: IUser,
  ) {
    if (!source) {
      source = 'annam';
    }

    const actorPayload = user
      ? {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.FARMER_MANAGEMENT,
      action: AuditAction.DELETE_FARMER,
      actor: actorPayload!,
      context: {
        userId,
        source,
      },
      createdAt: new Date(),
    };

    let beforeUser: any = null;
    try {
      beforeUser = await this.chatbotService.getUserById(userId, source);
    } catch (e) {
      console.error('Failed to fetch user before deletion for audit trail', e);
    }

    try {
      const success = await this.chatbotService.deleteUser(userId, source);
      if (success) {
        auditPayload = {
          ...auditPayload,
          changes: {
            before: beforeUser
              ? {
                  id: beforeUser._id?.toString(),
                  name: beforeUser.name,
                  email: beforeUser.email,
                  userRole: beforeUser.userRole,
                  farmerProfile: beforeUser.farmerProfile,
                }
              : {},
          },
          outcome: {
            status: OutComeStatus.SUCCESS,
          },
        };
      } else {
        auditPayload = {
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorMessage: 'Failed to delete user',
          },
        };
      }
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      return {
        success,
        message: success
          ? 'User deleted successfully'
          : 'Failed to delete user',
      };
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to delete user',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Edit a farmer',
    description:
      'Updates editable farmer fields for a user in the selected source database.',
  })
  @Patch('/users/:userId')
  @HttpCode(200)
  @Authorized(['admin', ...COORDINATOR_ROLES])
  async updateUser(
    @Param('userId') userId: string,
    @QueryParam('source') source: string,
    @Body()
    body: {
      name?: string;
      userRole?: string;
      farmerProfile?: {
        farmerName?: string;
        age?: number;
        gender?: string | null;
        villageName?: string;
        blockName?: string;
        district?: string;
        state?: string;
        phoneNo?: string;
        nearestKVK?: string;
        languagePreference?: string;
        yearsOfExperience?: number;
        totalLandCultivating?: number;
        cropsCultivated?: string[];
        primaryCrop?: string;
        secondaryCrop?: string;
        awarenessOfKCC?: boolean;
        usesAgriApps?: boolean;
        highestEducatedPerson?: string;
        numberOfSmartphones?: number;
        platform?: string;
        landhold?: number;
      };
    },
    @CurrentUser() user: IUser,
  ) {
    if (!source) {
      source = 'annam';
    }
    // console.log('Body---------', body);

    const actorPayload = user
      ? {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.FARMER_MANAGEMENT,
      action: AuditAction.UPDATE_FARMER,
      actor: actorPayload!,
      context: {
        userId,
        source,
      },
      createdAt: new Date(),
    };

    let beforeUser: any = null;
    try {
      beforeUser = await this.chatbotService.getUserById(userId, source);
    } catch (e) {
      console.error('Failed to fetch user before update for audit trail', e);
    }

    if (user.role !== 'admin') {
      if (source !== 'annam') {
        throw new ForbiddenError(
          'Coordinators can only update their linked Annam profile',
        );
      }

      const targetEmail = beforeUser?.email?.trim().toLowerCase();
      const actorEmail = user.email?.trim().toLowerCase();

      if (!targetEmail || !actorEmail || targetEmail !== actorEmail) {
        throw new ForbiddenError(
          'Coordinators can only update their own linked farmer profile',
        );
      }

      if (body.userRole && body.userRole !== beforeUser?.userRole) {
        throw new ForbiddenError('Coordinators cannot change coordinator role');
      }

      delete body.userRole;
    }

    try {
      const success = await this.chatbotService.updateUser(
        userId,
        source,
        body,
      );
      if (success) {
        let afterUser: any = null;
        try {
          afterUser = await this.chatbotService.getUserById(userId, source);
        } catch (e) {
          console.error('Failed to fetch user after update for audit trail', e);
        }

        auditPayload = {
          ...auditPayload,
          changes: {
            before: beforeUser
              ? {
                  name: beforeUser.name,
                  userRole: beforeUser.userRole,
                  farmerProfile: beforeUser.farmerProfile,
                }
              : {},
            after: afterUser
              ? {
                  name: afterUser.name,
                  userRole: afterUser.userRole,
                  farmerProfile: afterUser.farmerProfile,
                }
              : {},
          },
          outcome: {
            status: OutComeStatus.SUCCESS,
          },
        };
      } else {
        auditPayload = {
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorMessage: 'Failed to update user',
          },
        };
      }
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      return {
        success,
        message: success
          ? 'User updated successfully'
          : 'Failed to update user',
      };
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to update user',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Change farmer password',
    description:
      'Updates a farmer password securely in the selected source database.',
  })
  @Post('/admin/users/:userId/change-password')
  @HttpCode(200)
  @Authorized(['admin'])
  async changeUserPassword(
    @Param('userId') userId: string,
    @QueryParam('source') source: string,
    @Body()
    body: {
      newPassword: string;
      keepLoggedIn: boolean;
    },
    @CurrentUser() user: IUser,
  ) {
    if (!source) {
      source = 'annam';
    }
    this.assertStrongPassword(body.newPassword);

    const actorPayload = user
      ? {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.FARMER_MANAGEMENT,
      action: AuditAction.CHANGE_USER_PASSWORD,
      actor: actorPayload!,
      context: {
        userId,
        source,
        origin: 'Admin Panel',
      },
      createdAt: new Date(),
    };

    let targetUser: any = null;
    try {
      targetUser = await this.chatbotService.getUserById(userId, source);
    } catch (e) {
      console.error('Failed to fetch target user for password audit trail', e);
    }

    try {
      const success = await this.chatbotService.changeUserPassword(
        userId,
        source,
        body.newPassword,
        body.keepLoggedIn
      );

      auditPayload = {
        ...auditPayload,
        changes: {
          before: targetUser
            ? {
                id: targetUser._id?.toString(),
                email: targetUser.email,
                userRole: targetUser.userRole,
                passwordChanged: false,
              }
            : {},
          after: {
            passwordChanged: success,
            sessionsInvalidated: success,
          },
        },
        outcome: {
          status: success ? OutComeStatus.SUCCESS : OutComeStatus.FAILED,
          ...(success ? {} : {errorMessage: 'Failed to change user password'}),
        },
      };

      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }

      return {
        success,
        message: success
          ? 'Password changed successfully'
          : 'Failed to change password',
      };
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to change password',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      throw error;
    }
  }

  @OpenAPI({
    summary: 'Add a new farmer',
    description:
      'Creates a new farmer in the selected database source (restricted to annam).',
  })
  @Post('/users')
  @HttpCode(201)
  @Authorized(['admin'])
  async addUser(
    @QueryParam('source') source: string,
    @Body()
    body: {
      email: string;
      name: string;
      password: string;
      userRole?: string;
      isVerified?: boolean;
    },
    @CurrentUser() user: IUser,
  ) {
    if (!source) {
      source = 'annam';
    }
    if (source === 'whatsapp') {
      throw new BadRequestError(
        'Add farmer functionality is not supported for whatsapp source',
      );
    }
    if (!body.email || !body.email.trim()) {
      throw new BadRequestError('Email is required');
    }
    if (!body.name || !body.name.trim()) {
      throw new BadRequestError('Name is required');
    }
    this.assertStrongPassword(body.password);

    const actorPayload = user
      ? {
          id: user._id.toString(),
          name: `${user.firstName} ${user.lastName}`,
          email: user.email,
          role: user.role,
          avatar: user.avatar || '',
        }
      : null;

    let auditPayload: ModeratorAuditTrail = {
      category: AuditCategory.FARMER_MANAGEMENT,
      action: AuditAction.ADD_FARMER,
      actor: actorPayload!,
      context: {
        source,
        email: body.email.trim().toLowerCase(),
      },
      createdAt: new Date(),
    };

    try {
      const success = await this.chatbotService.addUser(source, body);
      if (success) {
        let createdUser = null;
        try {
          const userRepo = (this.chatbotService as any).chatbotRepository;
          await userRepo.init(source);
          createdUser = await userRepo.users.findOne({
            email: body.email.trim().toLowerCase(),
          });
        } catch (e) {
          console.error('Failed to fetch added user for audit trail', e);
        }

        auditPayload = {
          ...auditPayload,
          changes: {
            after: createdUser
              ? {
                  id: createdUser._id?.toString(),
                  name: createdUser.name,
                  email: createdUser.email,
                  userRole: createdUser.userRole,
                  isVerified: createdUser.isVerified ?? true,
                  createdAt: createdUser.createdAt,
                }
              : {
                  name: body.name,
                  email: body.email,
                  userRole: body.userRole || 'FARMER',
                  isVerified: body.isVerified ?? true,
                },
          },
          outcome: {
            status: OutComeStatus.SUCCESS,
          },
        };
      } else {
        auditPayload = {
          ...auditPayload,
          outcome: {
            status: OutComeStatus.FAILED,
            errorMessage: 'Failed to create user',
          },
        };
      }
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      return {
        success,
        message: success
          ? 'User created successfully'
          : 'Failed to create user',
      };
    } catch (error: any) {
      auditPayload = {
        ...auditPayload,
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage: error?.message || 'Failed to create user',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      };
      if (actorPayload) {
        this.auditTrailsService.createAuditTrail(auditPayload);
      }
      if (error instanceof BadRequestError) {
        throw error;
      }
      throw error;
    }
  }

  @Get('/download-chatbot-report')
  @Authorized()
  @OpenAPI({
    summary: 'Download chatbot analytics report as Excel or PDF',
  })
  async downloadChatbotReport(
    @QueryParams()
    query: {
      startDate?: string;
      endDate?: string;
      source?: string;
      downloadFormat?: 'pdf' | 'xlsx';
      state?: string;
    },

    @Res() response: any,
  ) {
    try {
      if (!query.startDate || !query.endDate) {
        return response.status(400).json({
          success: false,
          message: 'startDate and endDate are required',
        });
      }

      const startDate = new Date(query.startDate);
      const endDate = new Date(query.endDate);
      const state = query.state;
      const format = query.downloadFormat || 'xlsx';

      // console.log('state is', state);

      let data: ArrayBuffer | Buffer | null = null;

      // ───────────────────────────────
      // PDF
      // ───────────────────────────────

      if (format === 'pdf') {
        data = await this.chatbotService.generateChatbotAnalyticsPdfReport(
          startDate,
          endDate,
          state,
          query.source,
        );

        if (!data) {
          return response.status(200).json({
            success: false,
            message: 'No data found for selected date range',
          });
        }

        response.set({
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename=chatbot-report-${Date.now()}.pdf`,
        });

        return response.send(data);
      }

      // ───────────────────────────────
      // EXCEL
      // ───────────────────────────────

      data = await this.chatbotService.generateChatbotAnalyticsExcelReport(
        startDate,
        endDate,
        state,
        query.source,
      );

      if (!data) {
        return response.status(200).json({
          success: false,
          message: 'No data found for selected date range',
        });
      }

      response.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

        'Content-Disposition': `attachment; filename=chatbot-report-${Date.now()}.xlsx`,
      });

      return response.send(Buffer.from(data));
    } catch (error) {
      return response.status(500).json({
        success: false,
        message: 'Failed to download report',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  @OpenAPI({
    summary: 'Get user growth metrics',
    description:
      'Retrieves user growth metrics over the last N days, suitable for bar graph visualization.',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to fetch user growth trend',
  })
  @OpenAPI({summary: 'Get duplicate questions with farmer details'})
  @Get('/duplicate-questions')
  @HttpCode(200)
  @Authorized()
  async getDuplicateQuestions(@QueryParams() query: {source?: string; coordinatorId?: string}) {
    return this.chatbotService.getDuplicateQuestions(query.source || 'annam', query.coordinatorId);
  }

  @OpenAPI({
    summary: 'Get domain query spikes',
    description:
      'Returns domains where daily question count is ≥1.5× the rolling average over the last N days.',
  })
  @Get('/domain-spikes')
  @HttpCode(200)
  @Authorized()
  async getDomainSpikes(@QueryParams() query: {days?: number; coordinatorId?: string}) {
    return this.chatbotService.getDomainSpikes(query.days ?? 60, query.coordinatorId);
  }

  @OpenAPI({
    summary: 'Update user verification status',
    description:
      "Updates a user's verification status. Only users with admin role can perform this action.",
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 401,
    description: 'Unauthorized - Authentication required',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 404,
    description: 'User not found',
  })
  @ResponseSchema(ChatbotErrorResponse, {
    statusCode: 500,
    description: 'Internal server error - Failed to verify user',
  })
  @Patch('/verify-user/:userId')
  @HttpCode(200)
  @Authorized(['admin'])
  async verifyUser(
    @Param('userId') userId: string,
    @Body() body: {isVerified?: boolean},
    @QueryParam('source') source: string = 'annam',
    @CurrentUser() currentUser: IUser,
  ) {
    if (!userId) {
      throw new BadRequestError('User ID is required');
    }
    try {
      const targetStatus = body?.isVerified ?? true;
      const beforeUser = await this.chatbotService.getUserById(userId, source);
      const previousValue = beforeUser?.isVerified ?? true;
      const verifiedUser = await this.chatbotService.verifyUser(
        userId,
        source,
        targetStatus,
      );
      this.auditTrailsService.createAuditTrail({
        category: AuditCategory.FARMER_MANAGEMENT,
        action: AuditAction.UPDATE_USER_VERIFICATION,
        actor: {
          id: currentUser._id.toString(),
          name: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
          email: currentUser.email,
          role: currentUser.role,
          avatar: currentUser.avatar || '',
        },
        context: {
          userId,
          source,
          name: beforeUser?.name || beforeUser?.username || '',
          email: beforeUser?.email || '',
          role: beforeUser?.role || beforeUser?.userRole || '',
        },
        changes: {
          before: {isVerified: previousValue},
          after: {isVerified: targetStatus},
        },
        outcome: {
          status: OutComeStatus.SUCCESS,
        },
      });
      return {
        success: true,
        message: targetStatus
          ? 'User verified successfully'
          : 'User marked unverified successfully',
        user: verifiedUser,
      };
    } catch (error: any) {
      this.auditTrailsService.createAuditTrail({
        category: AuditCategory.FARMER_MANAGEMENT,
        action: AuditAction.UPDATE_USER_VERIFICATION,
        actor: {
          id: currentUser._id.toString(),
          name: `${currentUser.firstName} ${currentUser.lastName}`.trim(),
          email: currentUser.email,
          role: currentUser.role,
          avatar: currentUser.avatar || '',
        },
        context: {userId, source},
        changes: {
          after: {isVerified: body?.isVerified ?? true},
        },
        outcome: {
          status: OutComeStatus.FAILED,
          errorCode: error?.errorCode || 'INTERNAL_ERROR',
          errorMessage:
            error?.message || 'Failed to update verification status',
          errorName: error?.name || 'Error',
          errorStack:
            error?.stack?.split('\n')?.slice(0, 5)?.join('\n') ||
            'No stack trace available',
        },
      });
      throw error;
    }
  }
}
