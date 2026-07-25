import { injectable } from 'inversify';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import csv from 'csv-parser';
import {
    ITestersDashboardService,
    TestersDashboardDataResponse,
    TestersDashboardRecord,
} from '../interfaces/ITestersDashboardService.js';

const CSV_PATH =
    process.env.TESTERS_DASHBOARD_CSV_PATH ||
    path.join(process.cwd(), 'data', 'testers-dashboard', 'updated.csv');

@injectable()
export class TestersDashboardService implements ITestersDashboardService {
    private cachedRecords: TestersDashboardRecord[] | null = null;

    private parseCSV(filePath: string): Promise<TestersDashboardRecord[]> {
        return new Promise((resolve, reject) => {
            let fileContent: string;
            try {
                fileContent = fs.readFileSync(filePath, 'utf8');
            } catch (err) {
                return reject(err);
            }

            const headerIndex = fileContent.indexOf('Test ID,');
            if (headerIndex !== -1) {
                fileContent = fileContent.substring(headerIndex);
            }

            const results: TestersDashboardRecord[] = [];
            Readable.from([fileContent])
                .pipe(csv())
                .on('data', (data: TestersDashboardRecord) => {
                    const testId = data['Test ID'] ? data['Test ID'].trim() : '';
                    if (
                        testId &&
                        !testId.startsWith('Project:') &&
                        !testId.startsWith('Test ID')
                    ) {
                        results.push(data);
                    }
                })
                .on('end', () => resolve(results))
                .on('error', reject);
        });
    }

    async getData(): Promise<TestersDashboardDataResponse> {
        if (!fs.existsSync(CSV_PATH)) {
            return { success: false, totalRecords: 0, records: [] };
        }

        const records = await this.parseCSV(CSV_PATH);
        this.cachedRecords = records;

        return {
            success: true,
            totalRecords: records.length,
            records,
        };
    }
}