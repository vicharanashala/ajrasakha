export interface ILgdLocation {
  stateCode: number;
  stateNameEnglish: string;
  districtCode: number;
  districtNameEnglish: string;
  subdistrictCode: number;
  subdistrictNameEnglish: string;
  villageCode: number;
  villageNameEnglish: string;
  pincode: number;
  [key: string]: unknown;
}

export interface ILocationState {
  stateCode: number;
  stateNameEnglish: string;
  /** Alternate spellings/names for this state, added by admins/moderators. */
  aliases?: string[];
}

export interface ILocationDistrict {
  districtCode: number;
  districtNameEnglish: string;
  stateCode: number;
  /** Parent state name — populated by getAllDistricts for the cross-state view. */
  stateName?: string;
  /** Alternate spellings/names for this district, added by admins/moderators. */
  aliases?: string[];
}

export interface ILocationBlock {
  blockCode: number;
  blockNameEnglish: string;
  districtCode: number;
}

export interface ILocationVillage {
  villageCode: number;
  villageNameEnglish: string;
  blockCode: number;
}

export interface IKvk {
  kvkId: string;
  kvkName: string;
  kvkAddress?: string;
  districtCode?: number;
  stateCode?: number;
  latitude?: number;
  longitude?: number;
}

export interface IKvkSyncResult {
  success: boolean;
  message: string;
}

/** Who performed an audited location change. */
export interface IAuditActor {
  userId?: string;
  email?: string;
  name?: string;
}

/** One immutable audit-trail entry for an add/delete of a state or district. */
export interface ILocationAudit {
  _id?: string;
  action: 'add' | 'delete';
  entity: 'state' | 'district';
  code: number;
  name: string;
  /** Parent state code — only present for district entries. */
  stateCode?: number;
  reason: string;
  performedByUserId?: string;
  performedByEmail?: string;
  performedByName?: string;
  createdAt: Date;
}

export interface ILocationService {
  getStates(): Promise<ILocationState[]>;
  /** Update a state's aliases and (optionally) its canonical name (admin/moderator). */
  updateStateAliases(
    stateCode: number,
    aliases: string[],
    name?: string,
  ): Promise<ILocationState>;
  getDistricts(stateCode: number): Promise<ILocationDistrict[]>;
  /** All districts across every state (each carrying its stateName), for the Districts tab. */
  getAllDistricts(): Promise<ILocationDistrict[]>;
  /** Update a district's aliases and (optionally) its canonical name (admin/moderator). */
  updateDistrictAliases(
    districtCode: number,
    aliases: string[],
    name?: string,
  ): Promise<ILocationDistrict>;
  getBlocks(districtCode: number): Promise<ILocationBlock[]>;
  getVillages(blockCode: number): Promise<ILocationVillage[]>;
  getKvks(districtCode: number): Promise<IKvk[]>;
  syncKvks(): Promise<IKvkSyncResult>;

  /** Add a new state (auto-assigns stateCode). Reason is recorded in the audit trail. */
  addState(
    name: string,
    reason: string,
    actor: IAuditActor,
  ): Promise<ILocationState>;
  /** Delete a state by code. Districts are left intact. Reason is audited. */
  deleteState(
    stateCode: number,
    reason: string,
    actor: IAuditActor,
  ): Promise<{ success: true }>;
  /** Add a new district under a state (auto-assigns districtCode). Reason is audited. */
  addDistrict(
    stateCode: number,
    name: string,
    reason: string,
    actor: IAuditActor,
    aliases?: string[],
  ): Promise<ILocationDistrict>;
  /** Delete a district by code. Reason is audited. */
  deleteDistrict(
    districtCode: number,
    reason: string,
    actor: IAuditActor,
  ): Promise<{ success: true }>;
  /**
   * Insert the single common "All" district (for general/state-agnostic cases).
   * Idempotent — errors if it already exists. Reason is audited.
   */
  addAllDistrict(reason: string, actor: IAuditActor): Promise<ILocationDistrict>;
  /** The location add/delete audit trail, newest first. */
  getLocationAudits(limit?: number): Promise<ILocationAudit[]>;
  getStateOrDistrictReport(type?: 'state' | 'district'): Promise<any>;
}
