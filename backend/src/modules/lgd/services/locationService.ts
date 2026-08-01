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
    }));
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
      pincode: record.pincode || 0, // Fallback since it might not be in DB
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
