import 'reflect-metadata';
import {inject, injectable} from 'inversify';
import {BadRequestError, InternalServerError} from 'routing-controllers';
import {spawn} from 'child_process';
import path from 'path';
import {fileURLToPath} from 'url';
import {MongoDatabase} from '#shared/database/providers/mongo/MongoDatabase.js';
import {GLOBAL_TYPES} from '#root/types.js';
import type {
  ILocationService,
  ILocationState,
  ILocationDistrict,
  ILocationBlock,
  ILocationVillage,
  IKvk,
  IKvkSyncResult,
} from '../interfaces/ILocationService.js';

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
      cleaned.push(trimmed);
    }

    const set: Record<string, unknown> = { aliases: cleaned, updatedAt: new Date() };
    // Optionally rename the canonical state name.
    if (typeof name === 'string') {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new BadRequestError('name cannot be empty');
      }
      set.stateNameEnglish = trimmedName;
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
      cleaned.push(trimmed);
    }

    const set: Record<string, unknown> = { aliases: cleaned, updatedAt: new Date() };
    // Optionally rename the canonical district name.
    if (typeof name === 'string') {
      const trimmedName = name.trim();
      if (!trimmedName) {
        throw new BadRequestError('name cannot be empty');
      }
      set.districtNameEnglish = trimmedName;
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
}
