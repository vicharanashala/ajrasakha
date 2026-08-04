import 'reflect-metadata';
import {JsonController, Get, Post, Put, Delete, Body, Param, HttpCode, QueryParam, Authorized, CurrentUser, ForbiddenError, BadRequestError, ContentType, QueryParams, Res} from 'routing-controllers';
import {inject, injectable} from 'inversify';
import {LGD_TYPES} from '../types.js';
import {IUser} from '#root/shared/interfaces/models.js';
import type {
  ILocationService,
  ILocationState,
  ILocationDistrict,
  ILocationBlock,
  ILocationVillage,
  IKvk,
  IKvkSyncResult,
  IAuditActor,
  ILocationAudit,
} from '../interfaces/ILocationService.js';

// ── Allowed roles for triggering the KVK registry sync ──
const KVK_SYNC_ROLES = ['admin'];

@injectable()
@JsonController('/location')
export class LocationController {
  constructor(
    @inject(LGD_TYPES.LocationService)
    private readonly locationService: ILocationService,
  ) {}

  // Only admins/moderators may add or delete states/districts.
  private assertCanManage(user: IUser): void {
    if (user.role !== 'admin' && user.role !== 'moderator') {
      throw new ForbiddenError(
        'Only admins and moderators can add or delete states and districts',
      );
    }
  }

  private toActor(user: IUser): IAuditActor {
    return {
      userId: user._id?.toString?.() ?? undefined,
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ').trim() || undefined,
    };
  }

  @Get('/states')
  @HttpCode(200)
  async getStates(): Promise<ILocationState[]> {
    return this.locationService.getStates();
  }

  // Admins/moderators manage the alternate names (aliases) for a state.
  @Put('/states/:stateCode/aliases')
  @HttpCode(200)
  @Authorized()
  async updateStateAliases(
    @CurrentUser() user: IUser,
    @Param('stateCode') stateCode: number,
    @Body() body: { aliases: string[]; name?: string },
  ): Promise<ILocationState> {
    if (user.role !== 'admin' && user.role !== 'moderator') {
      throw new ForbiddenError('Only admins and moderators can edit state aliases');
    }
    if (!Array.isArray(body?.aliases)) {
      throw new BadRequestError('aliases must be an array of strings');
    }
    return this.locationService.updateStateAliases(
      Number(stateCode),
      body.aliases,
      body.name,
    );
  }

  // Add a new state. A reason is required and recorded in the audit trail.
  @Post('/states')
  @HttpCode(201)
  @Authorized()
  async addState(
    @CurrentUser() user: IUser,
    @Body() body: { name: string; reason: string },
  ): Promise<ILocationState> {
    this.assertCanManage(user);
    return this.locationService.addState(
      body?.name,
      body?.reason,
      this.toActor(user),
    );
  }

  // Delete a state (districts are left intact). A reason is required and audited.
  @Delete('/states/:stateCode')
  @HttpCode(200)
  @Authorized()
  async deleteState(
    @CurrentUser() user: IUser,
    @Param('stateCode') stateCode: number,
    @Body() body: { reason: string },
  ): Promise<{ success: true }> {
    this.assertCanManage(user);
    return this.locationService.deleteState(
      Number(stateCode),
      body?.reason,
      this.toActor(user),
    );
  }

  @Get('/districts')
  @HttpCode(200)
  async getDistricts(
    @QueryParam('stateCode') stateCode: number,
  ): Promise<ILocationDistrict[]> {
    return this.locationService.getDistricts(stateCode);
  }

  // All districts across every state (each carrying its stateName) for the Districts tab.
  @Get('/districts/all')
  @HttpCode(200)
  async getAllDistricts(): Promise<ILocationDistrict[]> {
    return this.locationService.getAllDistricts();
  }

  // Admins/moderators manage the alternate names (aliases) for a district.
  @Put('/districts/:districtCode/aliases')
  @HttpCode(200)
  @Authorized()
  async updateDistrictAliases(
    @CurrentUser() user: IUser,
    @Param('districtCode') districtCode: number,
    @Body() body: { aliases: string[]; name?: string },
  ): Promise<ILocationDistrict> {
    if (user.role !== 'admin' && user.role !== 'moderator') {
      throw new ForbiddenError('Only admins and moderators can edit district aliases');
    }
    if (!Array.isArray(body?.aliases)) {
      throw new BadRequestError('aliases must be an array of strings');
    }
    return this.locationService.updateDistrictAliases(
      Number(districtCode),
      body.aliases,
      body.name,
    );
  }

  // Add a new district under a state. A reason is required and audited.
  @Post('/districts')
  @HttpCode(201)
  @Authorized()
  async addDistrict(
    @CurrentUser() user: IUser,
    @Body() body: { stateCode: number; name: string; reason: string; aliases?: string[] },
  ): Promise<ILocationDistrict> {
    this.assertCanManage(user);
    return this.locationService.addDistrict(
      Number(body?.stateCode),
      body?.name,
      body?.reason,
      this.toActor(user),
      body?.aliases,
    );
  }

  // Add the single common "All" district (state-agnostic). A reason is required and audited.
  @Post('/districts/all')
  @HttpCode(201)
  @Authorized()
  async addAllDistrict(
    @CurrentUser() user: IUser,
    @Body() body: { reason: string },
  ): Promise<ILocationDistrict> {
    this.assertCanManage(user);
    return this.locationService.addAllDistrict(body?.reason, this.toActor(user));
  }

  // Delete a district. A reason is required and audited.
  @Delete('/districts/:districtCode')
  @HttpCode(200)
  @Authorized()
  async deleteDistrict(
    @CurrentUser() user: IUser,
    @Param('districtCode') districtCode: number,
    @Body() body: { reason: string },
  ): Promise<{ success: true }> {
    this.assertCanManage(user);
    return this.locationService.deleteDistrict(
      Number(districtCode),
      body?.reason,
      this.toActor(user),
    );
  }

  // The add/delete audit trail for states & districts (newest first).
  @Get('/audits')
  @HttpCode(200)
  @Authorized()
  async getLocationAudits(
    @CurrentUser() user: IUser,
    @QueryParam('limit') limit?: number,
  ): Promise<ILocationAudit[]> {
    this.assertCanManage(user);
    return this.locationService.getLocationAudits(limit);
  }

  @Get('/blocks')
  @HttpCode(200)
  async getBlocks(
    @QueryParam('districtCode') districtCode: number,
  ): Promise<ILocationBlock[]> {
    return this.locationService.getBlocks(districtCode);
  }

  @Get('/villages')
  @HttpCode(200)
  async getVillages(
    @QueryParam('blockCode') blockCode: number,
  ): Promise<ILocationVillage[]> {
    return this.locationService.getVillages(blockCode);
  }

  @Get('/kvks')
  @HttpCode(200)
  async getKvks(
    @QueryParam('districtCode') districtCode: number,
  ): Promise<IKvk[]> {
    return this.locationService.getKvks(districtCode);
  }

  // Runs the existing `scripts/create-lgd-kvks-collection.mjs --apply` script,
  // which reads the KVK registry CSV and upserts it into the `kvks` collection.
  @Post('/kvks/sync')
  @HttpCode(200)
  // @Authorized()
  async syncKvks(): Promise<IKvkSyncResult> {
    // if (!KVK_SYNC_ROLES.includes(user.role)) {
    //   throw new ForbiddenError('Only admins can trigger the KVK sync.');
    // }

    return this.locationService.syncKvks();
  }

  // ─── DOWNLOAD STATES OR DISTRICTS AS EXCEL ─────────────────────────────────────────────
  @Get('/download')
  @HttpCode(200)
  @Authorized()
  @ContentType(
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  async downloadStateOrDistrictsReport(
    @QueryParams() query: { type?: 'state' | 'district' },
    @Res() response: any,
  ): Promise<Buffer> {
    const type = query.type;

    const buffer = await this.locationService.getStateOrDistrictReport(type);

    const filename =
      type === 'state'
        ? 'states_list.xlsx'
        : 'districts_list.xlsx';

    response.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`,
    );

    return buffer;
  }

    
}
