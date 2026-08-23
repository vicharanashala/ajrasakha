import type { IFarmerRegistrationRequest, IOwnerNotification, ApprovalStatus } from "../types";
import type { IFarmerProfile } from "@/features/farmerProfile/types";

const REQUESTS_STORAGE_KEY = "ajrasakha_owner_farmer_requests_v1";
const NOTIFICATIONS_STORAGE_KEY = "ajrasakha_owner_notifications_v1";

const SEED_REQUESTS: IFarmerRegistrationRequest[] = [
  {
    id: "REQ-2026-9182",
    profile: {
      id: "KID-2026-PB8812-4011",
      farmerName: "हरप्रीत सिंह ढिल्लों (Harpreet Singh)",
      phoneNo: "9814022334",
      gender: "male",
      age: 42,
      state: "Punjab",
      district: "Ludhiana",
      blockOrTehsil: "Samrala",
      villageName: "Bondli",
      pincode: "141114",
      landSizeAcres: 12.0,
      farmerCategory: "large",
      soilType: "alluvial",
      irrigationSource: "borewell",
      primaryCrop: "Wheat (गेहूं)",
      secondaryCrops: ["Paddy / Rice (धान / चावल)", "Sugarcane (गन्ना)"],
      farmingType: "mixed",
      livestock: ["Dairy Cow (देसी / साहीवाल गाय)", "Buffalo (मुर्रा / देसी भैंस)"],
      machineryOwned: ["Tractor 40-50 HP (ट्रैक्टर)", "Super Seeder / Drill (सुपर सीडर / ड्रिल)", "Rotavator (रोटावेटर)"],
      preferredLanguage: "hi",
      registeredAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(), // 25 mins ago
      isVerified: false,
    },
    submittedAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    status: "PENDING",
    deviceInfo: "Android 14 (Chrome Mobile)",
    ipAddress: "157.38.12.89 (Ludhiana)",
  },
  {
    id: "REQ-2026-7734",
    profile: {
      id: "KID-2026-UP4421-9921",
      farmerName: "दिनेश कुमार वर्मा (Dinesh Kumar)",
      phoneNo: "9721345678",
      gender: "male",
      age: 36,
      state: "Uttar Pradesh",
      district: "Meerut",
      blockOrTehsil: "Sardhana",
      villageName: "Kalyanpur",
      pincode: "250342",
      landSizeAcres: 3.5,
      farmerCategory: "small",
      soilType: "loam",
      irrigationSource: "canal",
      primaryCrop: "Sugarcane (गन्ना)",
      secondaryCrops: ["Mustard / Rapeseed (सरसों / राई)", "Potato (आलू)"],
      farmingType: "chemical",
      livestock: ["Buffalo (मुर्रा / देसी भैंस)"],
      machineryOwned: ["None / Hire from CHC (किराए पर लेते हैं)"],
      preferredLanguage: "hi",
      registeredAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
      isVerified: false,
    },
    submittedAt: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    status: "PENDING",
    deviceInfo: "OnePlus 11 (Android 14)",
    ipAddress: "49.36.210.45 (Meerut)",
  },
  {
    id: "REQ-2026-6109",
    profile: {
      id: "KID-2026-RJ9100-3341",
      farmerName: "मंजू देवी चौधरी (Manju Devi)",
      phoneNo: "9414567890",
      gender: "female",
      age: 40,
      state: "Rajasthan",
      district: "Nagaur",
      blockOrTehsil: "Merta City",
      villageName: "Riyan Bari",
      pincode: "341510",
      landSizeAcres: 8.0,
      farmerCategory: "medium",
      soilType: "sandy",
      irrigationSource: "borewell",
      primaryCrop: "Mustard / Rapeseed (सरसों / राई)",
      secondaryCrops: ["Gram / Chana (चना)", "Wheat (गेहूं)"],
      farmingType: "organic",
      livestock: ["Dairy Cow (देसी / साहीवाल गाय)", "Goats / Sheep (बकरी / भेड़)"],
      machineryOwned: ["Tractor 40-50 HP (ट्रैक्टर)", "Solar Pump (सोलर पंप)"],
      preferredLanguage: "hi",
      registeredAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
      isVerified: true,
    },
    submittedAt: new Date(Date.now() - 1000 * 60 * 180).toISOString(),
    status: "APPROVED",
    reviewedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    reviewedBy: "tomarjii",
    deviceInfo: "Samsung Galaxy M34",
    ipAddress: "103.212.14.92 (Jodhpur)",
  },
];

const SEED_NOTIFICATIONS: IOwnerNotification[] = [
  {
    id: "NOTIF-01",
    title: "New Farmer Registration Pending Approval",
    titleHi: "नया किसान पंजीकरण अनुमोदन हेतु लंबित",
    message: "Harpreet Singh Dhillon (Ludhiana, Punjab - 12 Acres) has submitted registration.",
    messageHi: "हरप्रीत सिंह ढिल्लों (लुधियाना, पंजाब - 12 एकड़) ने नया किसान पंजीकरण भेजा है।",
    type: "NEW_REGISTRATION",
    timestamp: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
    isRead: false,
    requestId: "REQ-2026-9182",
  },
  {
    id: "NOTIF-02",
    title: "Small Farmer Access Request",
    titleHi: "लघु किसान पहुंच अनुरोध",
    message: "Dinesh Kumar (Meerut, UP - 3.5 Acres) requested AI & Equipment access.",
    messageHi: "दिनेश कुमार (मेरठ, यूपी - 3.5 एकड़) ने AI व उपकरण एक्सेस का अनुरोध किया है।",
    type: "NEW_REGISTRATION",
    timestamp: new Date(Date.now() - 1000 * 60 * 55).toISOString(),
    isRead: false,
    requestId: "REQ-2026-7734",
  },
];

export const ownerApprovalService = {
  getRequests: (): IFarmerRegistrationRequest[] => {
    try {
      const raw = localStorage.getItem(REQUESTS_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    // Initialize seed
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(SEED_REQUESTS));
    return SEED_REQUESTS;
  },

  getNotifications: (): IOwnerNotification[] => {
    try {
      const raw = localStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
      if (raw) {
        return JSON.parse(raw);
      }
    } catch {}
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(SEED_NOTIFICATIONS));
    return SEED_NOTIFICATIONS;
  },

  registerNewFarmer: (profile: IFarmerProfile): IFarmerRegistrationRequest => {
    const requests = ownerApprovalService.getRequests();
    const notifications = ownerApprovalService.getNotifications();

    const reqId = `REQ-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const newReq: IFarmerRegistrationRequest = {
      id: reqId,
      profile: { ...profile, isVerified: false },
      submittedAt: new Date().toISOString(),
      status: "PENDING",
      deviceInfo: navigator.userAgent.includes("Mobile") ? "Mobile Device" : "Desktop Browser",
      ipAddress: "Live Session (Online)",
    };

    const updatedRequests = [newReq, ...requests];
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(updatedRequests));

    // Add Notification for Tomarjii (Owner)
    const newNotif: IOwnerNotification = {
      id: `NOTIF-${Date.now()}`,
      title: `New Login/Registration: ${profile.farmerName}`,
      titleHi: `नया लॉगिन/पंजीकरण: ${profile.farmerName}`,
      message: `${profile.farmerName} from ${profile.villageName}, ${profile.district} (${profile.landSizeAcres} Acres) requested login access.`,
      messageHi: `${profile.farmerName} (${profile.villageName}, ${profile.district} - ${profile.landSizeAcres} एकड़) ने लॉगिन की अनुमति मांगी है।`,
      type: "NEW_REGISTRATION",
      timestamp: new Date().toISOString(),
      isRead: false,
      requestId: reqId,
    };

    const updatedNotifs = [newNotif, ...notifications];
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updatedNotifs));

    return newReq;
  },

  approveRequest: (requestId: string): void => {
    const requests = ownerApprovalService.getRequests();
    const updated = requests.map((r) => {
      if (r.id === requestId) {
        return {
          ...r,
          status: "APPROVED" as ApprovalStatus,
          reviewedAt: new Date().toISOString(),
          reviewedBy: "tomarjii",
          profile: { ...r.profile, isVerified: true },
        };
      }
      return r;
    });
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(updated));
  },

  rejectRequest: (requestId: string, notes?: string): void => {
    const requests = ownerApprovalService.getRequests();
    const updated = requests.map((r) => {
      if (r.id === requestId) {
        return {
          ...r,
          status: "REJECTED" as ApprovalStatus,
          reviewedAt: new Date().toISOString(),
          reviewedBy: "tomarjii",
          notes: notes || "Access denied by owner",
        };
      }
      return r;
    });
    localStorage.setItem(REQUESTS_STORAGE_KEY, JSON.stringify(updated));
  },

  markNotificationRead: (id: string): void => {
    const notifs = ownerApprovalService.getNotifications();
    const updated = notifs.map((n) => (n.id === id ? { ...n, isRead: true } : n));
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  },

  markAllNotificationsRead: (): void => {
    const notifs = ownerApprovalService.getNotifications();
    const updated = notifs.map((n) => ({ ...n, isRead: true }));
    localStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(updated));
  },

  resetAllData: (): void => {
    localStorage.removeItem(REQUESTS_STORAGE_KEY);
    localStorage.removeItem(NOTIFICATIONS_STORAGE_KEY);
    localStorage.removeItem("ajrasakha_farmer_profile_v1");
  },
};
