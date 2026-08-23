import React, { useState, useMemo } from "react";
import { ownerApprovalService } from "./services/ownerApprovalService";
import type { IFarmerRegistrationRequest, ApprovalStatus } from "./types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import { toast } from "@/shared/components/toast";
import {
  Crown,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Clock,
  UserCheck,
  UserX,
  RotateCcw,
  Search,
  Users,
  MapPin,
  Wheat,
  Tractor,
  Phone,
  Radio,
  Lock,
  Download,
  Flame,
  Sparkles,
  Smartphone,
  ExternalLink,
} from "lucide-react";

interface Props {
  onResetSession: () => void;
}

export const OwnerDashboard: React.FC<Props> = ({ onResetSession }) => {
  const { language, t } = useLanguage();
  const [requests, setRequests] = useState<IFarmerRegistrationRequest[]>(() => {
    return ownerApprovalService.getRequests();
  });

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ApprovalStatus>("ALL");
  const [selectedReqForModal, setSelectedReqForModal] = useState<IFarmerRegistrationRequest | null>(null);

  // Broadcast modal state
  const [broadcastMessage, setBroadcastMessage] = useState("");

  const refreshRequests = () => {
    setRequests(ownerApprovalService.getRequests());
  };

  const handleApprove = (id: string, name: string) => {
    ownerApprovalService.approveRequest(id);
    refreshRequests();
    toast.success(
      t(
        `किसान ${name} का लॉगिन अनुरोध स्वीकृत कर दिया गया है!`,
        `Farmer ${name}'s login request APPROVED!`,
        `Approved ${name}!`
      )
    );
  };

  const handleReject = (id: string, name: string) => {
    ownerApprovalService.rejectRequest(id, "Denied by Tomarjii");
    refreshRequests();
    toast.error(
      t(
        `किसान ${name} का अनुरोध अस्वीकार कर दिया गया।`,
        `Farmer ${name}'s request DENIED.`,
        `Rejected ${name}.`
      )
    );
  };

  const handleFullReset = () => {
    if (
      window.confirm(
        t(
          "क्या आप वर्तमान किसान सत्र रीसेट करके नया लॉगिन शुरू करना चाहते हैं?",
          "Are you sure you want to reset current profile data and start a fresh farmer login?",
          "Reset profile and start fresh login?"
        )
      )
    ) {
      ownerApprovalService.resetAllData();
      toast.success(t("डेटा रीसेट हो गया! नया पंजीकरण शुरू हो रहा है...", "Data reset! Starting fresh login...", "Reset done!"));
      onResetSession();
    }
  };

  const handleBroadcast = (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim()) return;
    toast.success(
      t(
        "अखिल भारतीय किसान एडवाइजरी ब्रॉडकास्ट जारी कर दी गई है!",
        "All-India Farmer Advisory Broadcast Sent Successfully!",
        "Advisory Broadcast Sent!"
      )
    );
    setBroadcastMessage("");
  };

  const filteredRequests = useMemo(() => {
    let list = [...requests];
    if (statusFilter !== "ALL") {
      list = list.filter((r) => r.status === statusFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (r) =>
          r.profile.farmerName.toLowerCase().includes(q) ||
          r.profile.phoneNo.includes(q) ||
          r.profile.villageName.toLowerCase().includes(q) ||
          r.profile.district.toLowerCase().includes(q) ||
          r.profile.state.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q)
      );
    }
    return list;
  }, [requests, statusFilter, searchQuery]);

  const pendingCount = requests.filter((r) => r.status === "PENDING").length;
  const approvedCount = requests.filter((r) => r.status === "APPROVED").length;
  const totalLandAcreage = requests.reduce((acc, r) => acc + (r.profile.landSizeAcres || 0), 0);

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 flex flex-col gap-6">
      {/* 👑 Master Owner Hero Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-amber-950/60 via-slate-900/90 to-emerald-950/60 border-2 border-amber-500/40 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="p-4 rounded-2xl bg-gradient-to-tr from-amber-500 via-amber-600 to-emerald-500 text-slate-950 shadow-xl shadow-amber-950/80 flex-shrink-0">
            <Crown className="w-9 h-9 fill-slate-950" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2">
                <span>tomarjii</span>
                <span className="text-amber-400 font-semibold text-lg sm:text-xl">(Owner Admin Command)</span>
              </h1>
              <span className="px-3 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-400/50 flex items-center gap-1 shadow-md">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400" />
                Master Administrator
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl leading-relaxed">
              {t(
                "अज्रसखा राष्ट्रीय कृषि AI का मुख्य नियंत्रण केंद्र: किसान पंजीकरण अनुमोदन, सुरक्षा निगरानी, फ्रेश लॉगिन और ब्रॉडकास्ट प्रबंधन",
                "Ajrasakha National Agricultural AI Master Control: Farmer Approvals, Security Telemetry, Fresh Logins & Broadcast System",
                "Tomarjii Master Dashboard for approvals and system management"
              )}
            </p>
          </div>
        </div>

        {/* Action Button: Fresh Login / Reset Session */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleFullReset}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-red-600 to-rose-500 hover:from-red-500 hover:to-rose-400 text-white text-xs sm:text-sm font-bold shadow-lg shadow-red-950/80 transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-4 h-4" />
            <span>{t("डेटा रीसेट व फ्रेश लॉगिन (Fresh Login)", "Reset & Fresh Farmer Login", "Fresh Login")}</span>
          </button>
        </div>
      </div>

      {/* 📊 Owner KPI Statistics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Farmers */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium">{t("कुल पंजीकृत किसान", "Total Registered Farmers", "Total Farmers")}</span>
            <p className="text-2xl font-black text-white mt-1">{requests.length}</p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Users className="w-6 h-6" />
          </div>
        </div>

        {/* Pending Approvals */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-500/30 backdrop-blur-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-amber-400 font-bold">{t("अनुमोदन हेतु लंबित (Pending)", "Pending Approvals", "Pending")}</span>
            <p className="text-2xl font-black text-amber-300 mt-1">{pendingCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Clock className="w-6 h-6" />
          </div>
        </div>

        {/* Approved Farmers */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium">{t("स्वीकृत व सक्रिय किसान", "Approved & Active Farmers", "Approved")}</span>
            <p className="text-2xl font-black text-emerald-400 mt-1">{approvedCount}</p>
          </div>
          <div className="p-3 rounded-xl bg-teal-500/20 text-teal-400 border border-teal-500/30">
            <UserCheck className="w-6 h-6" />
          </div>
        </div>

        {/* Total Land Managed */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-xl flex items-center justify-between shadow-lg">
          <div>
            <span className="text-xs text-slate-400 font-medium">{t("कुल कृषि क्षेत्रफल (Acres)", "Total Acreage Covered", "Total Land")}</span>
            <p className="text-2xl font-black text-amber-400 mt-1">{totalLandAcreage.toFixed(1)} एकड़</p>
          </div>
          <div className="p-3 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
            <Wheat className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* 📝 Farmer Approvals & Registration Ledger Section */}
      <div className="rounded-3xl bg-slate-900/85 border border-slate-800 p-5 sm:p-7 shadow-2xl backdrop-blur-2xl space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-emerald-400" />
              <span>{t("किसान लॉगिन एवं पंजीकरण सत्यापन (Farmer Access Approval)", "Farmer Registration & Login Approvals", "Approvals Ledger")}</span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {t(
                "नए किसान लॉगिन की जांच करें और 1-क्लिक में आधिकारिक पहुंच स्वीकृत या अस्वीकृत करें।",
                "Review new farmer requests and grant or deny access in 1 click.",
                "Review and approve farmer requests."
              )}
            </p>
          </div>

          {/* Status Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800">
            {[
              { id: "ALL", label: t("सभी (All)", "All", "All") },
              { id: "PENDING", label: t("लंबित (Pending)", "Pending", "Pending") },
              { id: "APPROVED", label: t("स्वीकृत (Approved)", "Approved", "Approved") },
              { id: "REJECTED", label: t("अस्वीकृत (Rejected)", "Rejected", "Rejected") },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setStatusFilter(f.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                  statusFilter === f.id
                    ? "bg-emerald-600 text-white font-bold shadow"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("किसान का नाम, फोन नंबर, गांव, जिला या आईडी से खोजें...", "Search by farmer name, phone, village, state or ID...", "Search...")}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Requests Table / Cards */}
        {filteredRequests.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-xs">
            {t("कोई किसान अनुरोध नहीं मिला", "No registration requests found", "No requests")}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredRequests.map((req) => {
              const p = req.profile;
              const isPending = req.status === "PENDING";
              const isApproved = req.status === "APPROVED";
              return (
                <div
                  key={req.id}
                  className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-all ${
                    isPending
                      ? "bg-gradient-to-br from-amber-950/30 via-slate-900 to-slate-900 border-amber-500/40 shadow-lg shadow-amber-950/20"
                      : isApproved
                      ? "bg-slate-900/90 border-emerald-500/30"
                      : "bg-slate-900/60 border-slate-800 opacity-75"
                  }`}
                >
                  <div>
                    {/* Card Top: Request ID & Status Badge */}
                    <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
                      <span className="text-[10px] font-mono text-slate-400">{req.id}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-1 ${
                          isPending
                            ? "bg-amber-500/20 text-amber-300 border border-amber-400"
                            : isApproved
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-400"
                            : "bg-red-500/20 text-red-300 border border-red-500/40"
                        }`}
                      >
                        {isPending && <Clock className="w-3 h-3" />}
                        {isApproved && <CheckCircle2 className="w-3 h-3" />}
                        {req.status}
                      </span>
                    </div>

                    {/* Farmer Identity */}
                    <div className="pt-2">
                      <h3 className="text-base font-black text-white">{p.farmerName}</h3>
                      <p className="text-xs text-slate-300 flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                        <span>
                          {p.villageName}, {p.district} ({p.state})
                        </span>
                      </p>
                      <p className="text-xs font-mono text-slate-400 flex items-center gap-1 mt-1">
                        <Phone className="w-3 h-3 text-slate-500" />
                        <span>+91 {p.phoneNo}</span>
                      </p>
                    </div>

                    {/* Agricultural Details Summary */}
                    <div className="grid grid-cols-2 gap-2 mt-3 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px]">
                      <div>
                        <span className="text-slate-500 block">कुल भूमि (Land)</span>
                        <span className="font-bold text-amber-400">{p.landSizeAcres} एकड़</span>
                      </div>
                      <div>
                        <span className="text-slate-500 block">मुख्य फसल (Crop)</span>
                        <span className="font-bold text-emerald-300 truncate block">{p.primaryCrop}</span>
                      </div>
                    </div>

                    {/* Submission Time & Device */}
                    <div className="mt-2 text-[10px] text-slate-500 flex items-center justify-between">
                      <span>{new Date(req.submittedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}</span>
                      <span className="truncate max-w-[120px]">{req.deviceInfo}</span>
                    </div>
                  </div>

                  {/* Owner Action Buttons */}
                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                    {isPending ? (
                      <>
                        <button
                          onClick={() => handleReject(req.id, p.farmerName)}
                          className="flex-1 py-2 px-3 rounded-xl bg-red-950/50 hover:bg-red-900/80 text-red-300 border border-red-800/60 text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>{t("अस्वीकार (Deny)", "Deny", "Deny")}</span>
                        </button>
                        <button
                          onClick={() => handleApprove(req.id, p.farmerName)}
                          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs shadow-md shadow-emerald-950 transition-all active:scale-95 cursor-pointer flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t("स्वीकृत करें (Approve)", "Approve", "Approve")}</span>
                        </button>
                      </>
                    ) : isApproved ? (
                      <div className="w-full text-center py-1 text-xs text-emerald-400 font-bold flex items-center justify-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>अनुमोदित (Approved by tomarjii)</span>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleApprove(req.id, p.farmerName)}
                        className="w-full py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors"
                      >
                        {t("पुनः अनुमति दें (Re-Approve)", "Re-Approve", "Re-Approve")}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 📢 Emergency Broadcast & Advisory Transmitter */}
      <div className="rounded-3xl bg-slate-900/80 border border-slate-800 p-6 shadow-xl backdrop-blur-xl">
        <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-3">
          <Radio className="w-4 h-4 text-rose-400 animate-pulse" />
          <span>{t("अखिल भारतीय किसान एडवाइजरी ब्रॉडकास्ट (Emergency Farmer Broadcast)", "Broadcast Advisory to All Farmers", "Farmer Broadcast")}</span>
        </h3>
        <form onSubmit={handleBroadcast} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={broadcastMessage}
            onChange={(e) => setBroadcastMessage(e.target.value)}
            placeholder={t(
              "उदा. 'मौसम चेतावनी: अगले 24 घंटे में तेज आंधी व बारिश की संभावना, कीटनाशक स्प्रे स्थगित रखें...'",
              "e.g. 'Weather Advisory: Postpone pesticide spray due to high winds...'",
              "Advisory message..."
            )}
            className="flex-1 px-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
          <button
            type="submit"
            className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white font-bold text-xs shadow-md shadow-rose-950 transition-all active:scale-95 cursor-pointer whitespace-nowrap"
          >
            {t("ब्रॉडकास्ट भेजें (Send)", "Send Broadcast", "Send")}
          </button>
        </form>
      </div>

      {/* 🛡️ Master Footer & Ownership Trademark */}
      <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800/80 text-center text-xs text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-inner">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-slate-200">
            Designed, Engineered & Owned by <strong className="text-amber-400 font-black">tomarjii</strong>
          </span>
        </div>
        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
          <Lock className="w-3.5 h-3.5 text-emerald-400" />
          <span>All Rights Reserved © 2026 tomarjii • Ajrasakha Sovereign AI</span>
        </div>
      </div>
    </div>
  );
};
