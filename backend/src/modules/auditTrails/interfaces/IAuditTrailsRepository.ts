import { ClientSession } from "mongodb";
import { ModeratorAuditTrail } from "./IAuditTrails.js";

export interface IAuditTrailsRepository {
    createAuditTrail(
        data: ModeratorAuditTrail,
        session?: ClientSession
    ): Promise<string>;

    getAuditTrails(page: number, limit: number, startDate?: string, endDate?: string, session?: ClientSession): Promise<ModeratorAuditTrail[]>;

    getAuditTrailById(id: string, session?: ClientSession): Promise<ModeratorAuditTrail | null>;
}
