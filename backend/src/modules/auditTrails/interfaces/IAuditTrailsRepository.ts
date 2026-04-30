import {ClientSession} from 'mongodb';
import {AuditFilters, ModeratorAuditTrail} from './IAuditTrails.js';

export interface IAuditTrailsRepository {
  createAuditTrail(
    data: ModeratorAuditTrail,
    session?: ClientSession,
  ): Promise<string>;

  getAuditTrails(
    page: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    category?: string | null,
    action?: string | null,
    order?: "asc" | "desc",
    outComeStatus?: string,
    session?: ClientSession,
  ): Promise<{data: ModeratorAuditTrail[]; totalDocuments: number}>;

  getAuditTrailById(
    id: string,
    session?: ClientSession,
  ): Promise<ModeratorAuditTrail | null>;

  getAuditTrailsByModeratorId(
    moderatorId: string,
    page: number,
    limit: number,
    startDate?: string,
    endDate?: string,
    category?: string | null,
    action?: string | null,
    order?: "asc" | "desc",
    outComeStatus?: string,
    session?: ClientSession,
  ): Promise<{data: ModeratorAuditTrail[]; totalDocuments: number}>;
}
