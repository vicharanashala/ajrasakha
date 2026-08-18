import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
import {MongoDatabase} from '#shared/database/providers/mongo/MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';
import {toTitleCase} from '#root/utils/ToTitlecase.js';
import * as XLSX from 'xlsx';
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

// Collection holding the immutable add/delete audit trail for states & districts.
const LOCATION_AUDIT_COLLECTION = 'location_audits';

// The single common "All" district used for general / state-agnostic cases.
const ALL_DISTRICT_NAME = 'All';
const ALL_DISTRICT_CODE = 0;
const ALL_DISTRICT_STATE_CODE = 0;

// build/modules/lgd/services/locationService.js -> ../../../../scripts (i.e.
// backend/scripts, which the Dockerfile copies to /app/scripts alongside
// /app/build) — same resolution used by src/jobs/lgd-sync/run.ts.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KVK_SCRIPT_PATH = path.resolve(__dirname, '../../../../scripts/create-lgd-kvks-collection.mjs');

@injectable()
export class LocationService implements ILocationService {
  constructor(
    @inject(GLOBAL_TYPES.Database)
    private readonly db: MongoDatabase,
  ) {}

  public async getStates(): Promise<ILocationState[]> {
    const collection = await this.db.getCollection<any>('states');
    const records = await collection.find({}).sort({ stateCode: 1 }).toArray();

    return records.map((record: any) => ({
      stateCode: record.stateCode,
      stateNameEnglish: record.stateNameEnglish,
      aliases: Array.isArray(record.aliases) ? record.aliases : [],
    }));
  }

  public async updateStateAliases(
    stateCode: number,
    aliases: string[],
    name?: string,
  ): Promise<ILocationState> {
    if (stateCode === undefined || stateCode === null || Number.isNaN(Number(stateCode))) {
      throw new BadRequestError('A valid stateCode is required');
    }
    // Trim, drop blanks, and de-duplicate (case-insensitive) the aliases.
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const a of Array.isArray(aliases) ? aliases : []) {
      const trimmed = typeof a === 'string' ? a.trim() : '';
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // Store all location names in Title Case (e.g. "orissa" -> "Orissa").
      cleaned.push(toTitleCase(trimmed));
    }

    const set: Record<string, unknown> = { aliases: cleaned, updatedAt: new Date() };
    // Optionally rename the canonical state name.
    if (typeof name === 'string') {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new BadRequestError('name cannot be empty');
      }
      set.stateNameEnglish = toTitleCase(trimmedName);
    }

    const collection = await this.db.getCollection<any>('states');
    const result = await collection.findOneAndUpdate(
      { stateCode: Number(stateCode) },
      { $set: set },
      { returnDocument: 'after' },
    );
    const updated = (result as any)?.value ?? result;
    if (!updated) {
      throw new BadRequestError(`No state found for stateCode ${stateCode}`);
    }
    return {
      stateCode: updated.stateCode,
      stateNameEnglish: updated.stateNameEnglish,
      aliases: Array.isArray(updated.aliases) ? updated.aliases : [],
    };
  }

  public async getDistricts(stateCode: number): Promise<ILocationDistrict[]> {
    if (!stateCode) {
      throw new BadRequestError('stateCode is required');
    }

    const collection = await this.db.getCollection<any>('districts');
    const records = await collection
      .find({ stateCode: Number(stateCode) })
      .sort({ districtCode: 1 })
      .toArray();

    return records.map((record: any) => ({
      districtCode: record.districtCode,
      districtNameEnglish: record.districtNameEnglish,
      stateCode: record.stateCode,
      aliases: Array.isArray(record.aliases) ? record.aliases : [],
    }));
  }

  public async getAllDistricts(): Promise<ILocationDistrict[]> {
    const [statesCollection, districtsCollection] = await Promise.all([
      this.db.getCollection<any>('states'),
      this.db.getCollection<any>('districts'),
    ]);

    const [states, records] = await Promise.all([
      statesCollection.find({}).toArray(),
      districtsCollection.find({}).sort({ stateCode: 1, districtCode: 1 }).toArray(),
    ]);

    // Map stateCode -> stateName so each district can show which state it belongs to.
    const stateNameByCode = new Map<number, string>();
    for (const s of states) {
      stateNameByCode.set(Number(s.stateCode), s.stateNameEnglish);
    }

    return records.map((record: any) => ({
      districtCode: record.districtCode,
      districtNameEnglish: record.districtNameEnglish,
      stateCode: record.stateCode,
      stateName:
        record.stateCode === ALL_DISTRICT_STATE_CODE
          ? 'All'
          : stateNameByCode.get(Number(record.stateCode)) ?? '',
      aliases: Array.isArray(record.aliases) ? record.aliases : [],
    }));
  }

  public async updateDistrictAliases(
    districtCode: number,
    aliases: string[],
    name?: string,
  ): Promise<ILocationDistrict> {
    if (
      districtCode === undefined ||
      districtCode === null ||
      Number.isNaN(Number(districtCode))
    ) {
      throw new BadRequestError('A valid districtCode is required');
    }
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const a of Array.isArray(aliases) ? aliases : []) {
      const trimmed = typeof a === 'string' ? a.trim() : '';
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      // Store all location names in Title Case (e.g. "orissa" -> "Orissa").
      cleaned.push(toTitleCase(trimmed));
    }

    const set: Record<string, unknown> = { aliases: cleaned, updatedAt: new Date() };
    // Optionally rename the canonical district name.
    if (typeof name === 'string') {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new BadRequestError('name cannot be empty');
      }
      set.districtNameEnglish = toTitleCase(trimmedName);
    }

    const collection = await this.db.getCollection<any>('districts');
    const result = await collection.findOneAndUpdate(
      { districtCode: Number(districtCode) },
      { $set: set },
      { returnDocument: 'after' },
    );
    const updated = (result as any)?.value ?? result;
    if (!updated) {
      throw new BadRequestError(`No district found for districtCode ${districtCode}`);
    }
    return {
      districtCode: updated.districtCode,
      districtNameEnglish: updated.districtNameEnglish,
      stateCode: updated.stateCode,
      aliases: Array.isArray(updated.aliases) ? updated.aliases : [],
    };
  }

  // ── Add / delete states & districts (audited) ──────────────────────────────

  private async writeAudit(
    entry: Omit<ILocationAudit, '_id' | 'createdAt'>,
  ): Promise<void> {
    const collection = await this.db.getCollection<any>(LOCATION_AUDIT_COLLECTION);
    await collection.insertOne({ ...entry, createdAt: new Date() });
  }

  private static cleanReason(reason: string): string {
    const trimmed = typeof reason === 'string' ? reason.trim() : '';
    if (!trimmed) {
      throw new BadRequestError('A reason is required for this action');
    }
    return trimmed;
  }

  // Trim, drop blanks, Title-Case and case-insensitively de-duplicate aliases.
  private static cleanAliases(aliases?: string[]): string[] {
    const seen = new Set<string>();
    const cleaned: string[] = [];
    for (const a of Array.isArray(aliases) ? aliases : []) {
      const trimmed = typeof a === 'string' ? a.trim() : '';
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      cleaned.push(toTitleCase(trimmed));
    }
    return cleaned;
  }

  public async addState(
    name: string,
    reason: string,
    actor: IAuditActor,
  ): Promise<ILocationState> {
    // Store the canonical name in Title Case (e.g. "andhra pradesh" -> "Andhra Pradesh").
    const trimmedName = toTitleCase(name);
    if (!trimmedName) {
      throw new BadRequestError('State name is required');
    }
    const cleanedReason = LocationService.cleanReason(reason);

    const collection = await this.db.getCollection<any>('states');

    // Reject case-insensitive duplicates by name.
    const existing = await collection.findOne({
      stateNameEnglish: { $regex: `^${escapeRegExp(trimmedName)}$`, $options: 'i' },
    });
    if (existing) {
      throw new BadRequestError(`State "${trimmedName}" already exists`);
    }

    // Auto-assign the next state code (max existing + 1).
    const [maxDoc] = await collection.find({}).sort({ stateCode: -1 }).limit(1).toArray();
    const stateCode = (Number(maxDoc?.stateCode) || 0) + 1;

    await collection.insertOne({
      stateCode,
      stateNameEnglish: trimmedName,
      aliases: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.writeAudit({
      action: 'add',
      entity: 'state',
      code: stateCode,
      name: trimmedName,
      reason: cleanedReason,
      performedByUserId: actor.userId,
      performedByEmail: actor.email,
      performedByName: actor.name,
    });

    return { stateCode, stateNameEnglish: trimmedName, aliases: [] };
  }

  public async deleteState(
    stateCode: number,
    reason: string,
    actor: IAuditActor,
  ): Promise<{ success: true }> {
    if (stateCode === undefined || stateCode === null || Number.isNaN(Number(stateCode))) {
      throw new BadRequestError('A valid stateCode is required');
    }
    const cleanedReason = LocationService.cleanReason(reason);

    const collection = await this.db.getCollection<any>('states');
    const existing = await collection.findOne({ stateCode: Number(stateCode) });
    if (!existing) {
      throw new BadRequestError(`No state found for stateCode ${stateCode}`);
    }

    await collection.deleteOne({ stateCode: Number(stateCode) });

    await this.writeAudit({
      action: 'delete',
      entity: 'state',
      code: Number(stateCode),
      name: existing.stateNameEnglish,
      reason: cleanedReason,
      performedByUserId: actor.userId,
      performedByEmail: actor.email,
      performedByName: actor.name,
    });

    return { success: true };
  }

  public async addDistrict(
    stateCode: number,
    name: string,
    reason: string,
    actor: IAuditActor,
    aliases?: string[],
  ): Promise<ILocationDistrict> {
    if (stateCode === undefined || stateCode === null || Number.isNaN(Number(stateCode))) {
      throw new BadRequestError('A valid stateCode is required');
    }
    // Store the canonical name in Title Case (e.g. "chittoor" -> "Chittoor").
    const trimmedName = toTitleCase(name);
    if (!trimmedName) {
      throw new BadRequestError('District name is required');
    }
    const cleanedReason = LocationService.cleanReason(reason);
    const cleanedAliases = LocationService.cleanAliases(aliases);

    // Ensure the parent state exists.
    const statesCollection = await this.db.getCollection<any>('states');
    const parent = await statesCollection.findOne({ stateCode: Number(stateCode) });
    if (!parent) {
      throw new BadRequestError(`No state found for stateCode ${stateCode}`);
    }

    const collection = await this.db.getCollection<any>('districts');

    // Reject case-insensitive duplicates within the same state.
    const existing = await collection.findOne({
      stateCode: Number(stateCode),
      districtNameEnglish: { $regex: `^${escapeRegExp(trimmedName)}$`, $options: 'i' },
    });
    if (existing) {
      throw new BadRequestError(
        `District "${trimmedName}" already exists in this state`,
      );
    }

    // Auto-assign the next district code (global max + 1).
    const [maxDoc] = await collection
      .find({})
      .sort({ districtCode: -1 })
      .limit(1)
      .toArray();
    const districtCode = (Number(maxDoc?.districtCode) || 0) + 1;

    await collection.insertOne({
      districtCode,
      districtNameEnglish: trimmedName,
      stateCode: Number(stateCode),
      aliases: cleanedAliases,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.writeAudit({
      action: 'add',
      entity: 'district',
      code: districtCode,
      name: trimmedName,
      stateCode: Number(stateCode),
      reason: cleanedReason,
      performedByUserId: actor.userId,
      performedByEmail: actor.email,
      performedByName: actor.name,
    });

    return {
      districtCode,
      districtNameEnglish: trimmedName,
      stateCode: Number(stateCode),
      aliases: cleanedAliases,
    };
  }

  public async deleteDistrict(
    districtCode: number,
    reason: string,
    actor: IAuditActor,
  ): Promise<{ success: true }> {
    if (
      districtCode === undefined ||
      districtCode === null ||
      Number.isNaN(Number(districtCode))
    ) {
      throw new BadRequestError('A valid districtCode is required');
    }
    const cleanedReason = LocationService.cleanReason(reason);

    const collection = await this.db.getCollection<any>('districts');
    const existing = await collection.findOne({ districtCode: Number(districtCode) });
    if (!existing) {
      throw new BadRequestError(`No district found for districtCode ${districtCode}`);
    }

    await collection.deleteOne({ districtCode: Number(districtCode) });

    await this.writeAudit({
      action: 'delete',
      entity: 'district',
      code: Number(districtCode),
      name: existing.districtNameEnglish,
      stateCode: existing.stateCode,
      reason: cleanedReason,
      performedByUserId: actor.userId,
      performedByEmail: actor.email,
      performedByName: actor.name,
    });

    return { success: true };
  }

  public async addAllDistrict(
    reason: string,
    actor: IAuditActor,
  ): Promise<ILocationDistrict> {
    const cleanedReason = LocationService.cleanReason(reason);

    const collection = await this.db.getCollection<any>('districts');

    // Idempotent: only ever one common "All" district.
    const existing = await collection.findOne({
      $or: [
        { districtCode: ALL_DISTRICT_CODE },
        { districtNameEnglish: { $regex: `^${ALL_DISTRICT_NAME}$`, $options: 'i' } },
      ],
    });
    if (existing) {
      throw new BadRequestError('The common "All" district already exists');
    }

    await collection.insertOne({
      districtCode: ALL_DISTRICT_CODE,
      districtNameEnglish: ALL_DISTRICT_NAME,
      stateCode: ALL_DISTRICT_STATE_CODE,
      aliases: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await this.writeAudit({
      action: 'add',
      entity: 'district',
      code: ALL_DISTRICT_CODE,
      name: ALL_DISTRICT_NAME,
      stateCode: ALL_DISTRICT_STATE_CODE,
      reason: cleanedReason,
      performedByUserId: actor.userId,
      performedByEmail: actor.email,
      performedByName: actor.name,
    });

    return {
      districtCode: ALL_DISTRICT_CODE,
      districtNameEnglish: ALL_DISTRICT_NAME,
      stateCode: ALL_DISTRICT_STATE_CODE,
      aliases: [],
    };
  }

  public async getLocationAudits(limit = 200): Promise<ILocationAudit[]> {
    const collection = await this.db.getCollection<any>(LOCATION_AUDIT_COLLECTION);
    const records = await collection
      .find({})
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(Number(limit) || 200, 1), 1000))
      .toArray();

    return records.map((r: any) => ({
      _id: r._id?.toString?.() ?? undefined,
      action: r.action,
      entity: r.entity,
      code: r.code,
      name: r.name,
      stateCode: r.stateCode,
      reason: r.reason,
      performedByUserId: r.performedByUserId,
      performedByEmail: r.performedByEmail,
      performedByName: r.performedByName,
      createdAt: r.createdAt,
    }));
  }

  public async getBlocks(districtCode: number): Promise<ILocationBlock[]> {
    if (!districtCode) {
      throw new BadRequestError('districtCode is required');
    }

    const collection = await this.db.getCollection<any>('blocks');
    const records = await collection
      .find({ districtCode: Number(districtCode) })
      .sort({ blockCode: 1 })
      .toArray();

    return records.map((record: any) => ({
      blockCode: record.blockCode,
      blockNameEnglish: record.blockNameEnglish,
      districtCode: record.districtCode,
    }));
  }

  public async getVillages(blockCode: number): Promise<ILocationVillage[]> {
    if (!blockCode) {
      throw new BadRequestError('blockCode is required');
    }

    const collection = await this.db.getCollection<any>('villages');
    const records = await collection
      .find({ blockCode: Number(blockCode) })
      .sort({ villageCode: 1 })
      .toArray();

    return records.map((record: any) => ({
      villageCode: record.villageCode,
      villageNameEnglish: record.villageNameEnglish,
      blockCode: record.blockCode,
    }));
  }

  public async getKvks(districtCode: number): Promise<IKvk[]> {
    if (!districtCode) {
      throw new BadRequestError('districtCode is required');
    }

    const collection = await this.db.getCollection<any>('kvks');
    const records = await collection
      .find({ districtCode: Number(districtCode) })
      .sort({ kvkName: 1 })
      .toArray();

    return records.map((record: any) => ({
      kvkId: record.kvkId,
      kvkName: record.kvkName,
      kvkAddress: record.kvkAddress,
      districtCode: record.districtCode,
      stateCode: record.stateCode,
      latitude: record.latitude,
      longitude: record.longitude,
    }));
  }

  // Runs the existing standalone `create-lgd-kvks-collection.mjs --apply` script
  // (reads the KVK registry CSV and upserts it into the `kvks` collection). No
  // sync logic is reimplemented here — this mirrors the same spawn pattern the
  // `lgd-sync` Cloud Run Job uses to run the sibling LGD scripts, just exposed
  // synchronously over HTTP instead of on a schedule.
  public async syncKvks(): Promise<IKvkSyncResult> {
    const summary = await new Promise<string>((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      const child = spawn('node', [KVK_SCRIPT_PATH, '--apply'], {
        env: process.env,
      });

      child.stdout.on('data', chunk => {
        const text = chunk.toString();
        stdout += text;
        console.log(`[kvk-sync] ${text.trimEnd()}`);
      });
      child.stderr.on('data', chunk => {
        const text = chunk.toString();
        stderr += text;
        console.error(`[kvk-sync] ${text.trimEnd()}`);
      });

      child.on('error', err => {
        reject(new InternalServerError(`Failed to start KVK sync script: ${err.message}`));
      });

      child.on('exit', (code, signal) => {
        if (code === 0) {
          const lastLine = stdout.trim().split('\n').filter(Boolean).pop();
          resolve(lastLine || 'KVK sync completed successfully.');
        } else {
          const detail = stderr.trim().split('\n').filter(Boolean).pop() || `exit code ${code}`;
          reject(
            new InternalServerError(
              `KVK sync script exited with code ${code}${signal ? ` (signal ${signal})` : ''}: ${detail}`,
            ),
          );
        }
      });
    });

    return {success: true, message: summary};
  }

  public async getStateOrDistrictReport(
    type?: 'state' | 'district',
  ): Promise<Buffer> {
    if (type !== 'state' && type !== 'district') {
      throw new BadRequestError('Invalid type');
    }

    const stateCollection = await this.db.getCollection<any>('states');
    const districtCollection = await this.db.getCollection<any>('districts');

    let rows: Record<string, string | number>[] = [];

    if (type === 'state') {
      const states = await stateCollection
        .find({})
        .sort({ stateNameEnglish: 1 })
        .toArray();

      rows = states.map((state) => ({
        'State Code': state.stateCode ?? '',
        'State Name English': state.stateNameEnglish?.trim() ?? '',
        'State Name Local': state.stateNameLocal?.trim() ?? '',
        'Aliases': Array.isArray(state.aliases)
          ? state.aliases.join(', ')
          : '',
      }));
    }

    if (type === 'district') {
      const districts = await districtCollection
        .find({})
        .sort({ districtNameEnglish: 1 })
        .toArray();

      rows = districts.map((district) => ({
        'District Code': district.districtCode ?? '',
        'District Name English': district.districtNameEnglish?.trim() ?? '',
        'District Name Local': district.districtNameLocal?.trim() ?? '',
        'State Code': district.stateCode ?? '',
        'Aliases': Array.isArray(district.aliases)
          ? district.aliases.join(', ')
          : '',
      }));
    }

    const sheetName = type === 'state' ? 'States' : 'Districts';

    const ws = XLSX.utils.json_to_sheet(rows);

    // Optional: set readable column widths
    ws['!cols'] =
      type === 'state'
        ? [
          { wch: 12 }, // State Code
          { wch: 25 }, // English
          { wch: 25 }, // Local
          { wch: 50 }, // Aliases
        ]
        : [
          { wch: 15 }, // District Code
          { wch: 25 }, // English
          { wch: 25 }, // Local
          { wch: 12 }, // State Code
          { wch: 50 }, // Aliases
        ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    return Buffer.from(
      XLSX.write(wb, {
        type: 'buffer',
        bookType: 'xlsx',
      }),
    );
  }
  
}

// Escape user-supplied text for safe use inside a MongoDB $regex.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
