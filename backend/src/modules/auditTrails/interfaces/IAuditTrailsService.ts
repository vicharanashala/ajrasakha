import { ModeratorAuditTrail } from "./IAuditTrails.js";

export interface IAuditTrailsService {
  // Define methods for the audit trails service here

  createAuditTrail(
    paload: ModeratorAuditTrail,
  ): Promise<string>;

  getAuditTrails(page: number, limit: number, startDate?: string, endDate?: string): Promise<ModeratorAuditTrail[]>;

  getAuditTrailById(id: string): Promise<ModeratorAuditTrail | null>;
}