import type { IFarmerProfile } from "@/features/farmerProfile/types";

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IFarmerRegistrationRequest {
  id: string; // Request ID e.g. "REQ-17244589"
  profile: IFarmerProfile;
  submittedAt: string;
  status: ApprovalStatus;
  reviewedAt?: string;
  reviewedBy?: string; // "tomarjii"
  notes?: string;
  ipAddress?: string;
  deviceInfo?: string;
}

export interface IOwnerNotification {
  id: string;
  title: string;
  titleHi: string;
  message: string;
  messageHi: string;
  type: "NEW_REGISTRATION" | "APPROVAL_ACTION" | "SECURITY_ALERT" | "SYSTEM_UPDATE";
  timestamp: string;
  isRead: boolean;
  requestId?: string;
}
