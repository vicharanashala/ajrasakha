import {ClientSession} from 'mongodb';
import {AuditFilters, CropManagementAuditFilters, ModeratorAuditTrail} from './IAuditTrails.js';

export interface IAuditTrailsRepository {
  createAuditTrail(
    data: ModeratorAuditTrail,
    session?: ClientSession,
  ): Promise<string>;

  createAuditTrails(
    data: ModeratorAuditTrail[],
    session?: ClientSession,
  ): Promise<number>;

  getCropManagementAuditTrails(
    filters: CropManagementAuditFilters,
    session?: ClientSession,
  ): Promise<{data: ModeratorAuditTrail[]; totalDocuments: number}>;

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

  getShiftBasedAuditActionCounts(
    startDate: string,
    // endDate: string,
    shift: string,
    from: string,
    to: string,
    isTrainingUser?: boolean,
    isAdmin?: boolean,
    session?: ClientSession
  ): Promise<any>;

  getAuditTrailsByQuestionId(
    questionId: string,
    page?: number,
    limit?: number,
    action?: string | null,
    order?: "asc" | "desc",
    session?: ClientSession,
  ): Promise<{ data: ModeratorAuditTrail[]; totalDocuments: number }>;

  getAuditTrailsByCropId(
    cropId: string,
    page?: number,
    limit?: number,
    action?: string | null,
    order?: "asc" | "desc",
    session?: ClientSession,
  ): Promise<{ data: ModeratorAuditTrail[]; totalDocuments: number }>;
}
