import React, { useState } from "react";
import { ownerApprovalService } from "../services/ownerApprovalService";
import type { IOwnerNotification } from "../types";
import { useLanguage } from "@/features/ajrasakhaHub/context/LanguageContext";
import {
  Bell,
  CheckCircle2,
  XCircle,
  UserPlus,
  ShieldCheck,
  ExternalLink,
  Crown,
  Clock,
  Sparkles,
} from "lucide-react";
import { toast } from "@/shared/components/toast";

interface Props {
  onOpenOwnerDashboard: () => void;
}

export const OwnerNotificationBell: React.FC<Props> = ({ onOpenOwnerDashboard }) => {
  const { language, t } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<IOwnerNotification[]>(() => {
    return ownerApprovalService.getNotifications();
  });

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleOpenDropdown = () => {
    setNotifications(ownerApprovalService.getNotifications());
    setIsOpen((prev) => !prev);
  };

  const handleMarkAllRead = () => {
    ownerApprovalService.markAllNotificationsRead();
    setNotifications(ownerApprovalService.getNotifications());
    toast.success(t("सभी सूचनाएं पढ़ी गईं!", "All Notifications Marked as Read!", "All read!"));
  };

  const handleNotificationClick = (n: IOwnerNotification) => {
    ownerApprovalService.markNotificationRead(n.id);
    setNotifications(ownerApprovalService.getNotifications());
    setIsOpen(false);
    onOpenOwnerDashboard();
  };

  return (
    <div className="relative">
      {/* Bell Button */}
      <button
        onClick={handleOpenDropdown}
        className="relative p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 text-slate-300 hover:text-white transition-all shadow-md active:scale-95 cursor-pointer flex items-center justify-center"
        title="Owner Notification Alerts (मालिक सूचनाएं)"
      >
        <Bell className={`w-4 h-4 ${unreadCount > 0 ? "text-amber-400 animate-bounce" : "text-slate-400"}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-gradient-to-r from-red-600 to-rose-500 text-white font-mono text-[10px] font-black flex items-center justify-center shadow-lg shadow-red-950 border border-white/30 animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Panel */}
      {isOpen && (
        <>
          {/* Backdrop click dismiss */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-2xl bg-slate-900 border-2 border-emerald-500/40 shadow-2xl z-50 overflow-hidden backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="p-3.5 bg-gradient-to-r from-emerald-950 via-slate-950 to-amber-950 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crown className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-black text-white">
                  {t("मालिक अलर्ट (Tomarjii Hub)", "Owner Notifications", "Owner Alerts")}
                </span>
                {unreadCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-bold border border-amber-500/40">
                    {unreadCount} New
                  </span>
                )}
              </div>

              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[10px] text-slate-400 hover:text-emerald-300 underline cursor-pointer"
                >
                  {t("सभी पढ़ें", "Mark all read", "Mark read")}
                </button>
              )}
            </div>

            {/* Notifications List */}
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/80">
              {notifications.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">
                  {t("कोई नई सूचना नहीं है", "No notifications found", "No notifications")}
                </div>
              ) : (
                notifications.map((n) => {
                  const title = language === "hi" ? n.titleHi : n.title;
                  const msg = language === "hi" ? n.messageHi : n.message;
                  return (
                    <div
                      key={n.id}
                      onClick={() => handleNotificationClick(n)}
                      className={`p-3.5 hover:bg-slate-800/70 transition-colors cursor-pointer flex items-start gap-3 ${
                        !n.isRead ? "bg-emerald-950/20" : ""
                      }`}
                    >
                      <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex-shrink-0 mt-0.5">
                        <UserPlus className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <h4 className="text-xs font-bold text-white truncate">{title}</h4>
                          {!n.isRead && (
                            <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 line-clamp-2 mt-0.5 leading-snug">
                          {msg}
                        </p>
                        <span className="text-[9px] font-mono text-slate-500 mt-1 block flex items-center gap-1">
                          <Clock className="w-2.5 h-2.5" />
                          {new Date(n.timestamp).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Footer Action */}
            <div className="p-2.5 bg-slate-950 border-t border-slate-800 text-center">
              <button
                onClick={() => {
                  setIsOpen(false);
                  onOpenOwnerDashboard();
                }}
                className="w-full py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-black text-xs shadow-md transition-colors cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>{t("मालिक डैशबोर्ड खोलें (Open Tomarjii Dashboard)", "Open Tomarjii Dashboard", "Open Dashboard")}</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
