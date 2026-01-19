import {
  AlertCircle,
  CheckCircle2,
  Clock,
  RefreshCcw,
  UserCheck,
} from "lucide-react";
import { ExpertIcon, ModeratorIcon } from "../components/RerouteStatusIcons";

export const getStatusInfo = (status: string) => {
  switch (status) {
    case "expert_completed":
      return {
        label: "Expert Completed",
        icon: CheckCircle2,
        styles: {
          container:
            "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
          icon: "text-green-700 dark:text-green-400",
          badge:
            "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
          iconBg: "bg-green-200 dark:bg-green-800/40",
        },
      };

    case "moderator_approved":
      return {
        label: "Moderator Approved",
        icon: UserCheck,
        styles: {
          container:
            "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-300 dark:border-emerald-700 shadow-emerald-100/50",
          icon: "text-emerald-700 dark:text-emerald-400",
          badge:
            "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-700",
          iconBg: "bg-emerald-200 dark:bg-emerald-800/40",
        },
      };

    case "pending":
      return {
        label: "Pending",
        icon: Clock,
        styles: {
          container:
            "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 shadow-yellow-100/50",
          icon: "text-yellow-700 dark:text-yellow-400",
          badge:
            "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700",
          iconBg: "bg-yellow-200 dark:bg-yellow-800/40",
        },
      };

    case "approved":
      return {
        label: "Approved",
        icon: CheckCircle2,
        styles: {
          container:
            "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
          icon: "text-green-700 dark:text-green-400",
          badge:
            "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
          iconBg: "bg-green-200 dark:bg-green-800/40",
        },
      };

    case "rejected":
      return {
        label: "Rejected",
        icon: AlertCircle,
        styles: {
          container:
            "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 shadow-red-100/50",
          icon: "text-red-700 dark:text-red-400",
          badge:
            "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700",
          iconBg: "bg-red-200 dark:bg-red-800/40",
        },
      };

    case "modified":
      return {
        label: "Modified",
        icon: RefreshCcw,
        styles: {
          container:
            "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 shadow-orange-100/50",
          icon: "text-orange-700 dark:text-orange-400",
          badge:
            "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700",
          iconBg: "bg-orange-200 dark:bg-orange-800/40",
        },
      };

    case "waiting":
      return {
        label: "Waiting",
        icon: RefreshCcw,
        styles: {
          container:
            "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 shadow-blue-100/50",
          icon: "text-blue-700 dark:text-blue-400",
          badge:
            "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700",
          iconBg: "bg-blue-200 dark:bg-blue-800/40",
        },
      };

    case "expert_rejected":
      return {
        label: "Request Rejected",
        icon: ExpertIcon,
        styles: {
          container:
            "bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-zinc-200/50",
          icon: "text-zinc-900 dark:text-zinc-100",
          badge:
            "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-400 dark:border-zinc-600",
          iconBg: "bg-zinc-300 dark:bg-zinc-700/70",
        },
      };

    case "moderator_rejected":
      return {
        label: "Request Rejected",
        icon: ModeratorIcon,
        styles: {
          container:
            "bg-zinc-100 dark:bg-zinc-900 border-zinc-300 dark:border-zinc-700 shadow-zinc-200/50",
          icon: "text-zinc-900 dark:text-zinc-100",
          badge:
            "bg-zinc-200 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-400 dark:border-zinc-600",
          iconBg: "bg-zinc-300 dark:bg-zinc-700/70",
        },
      };

    default:
      return {
        label: "Unknown",
        icon: AlertCircle,
        styles: {
          container:
            "bg-gray-100 dark:bg-gray-900/30 border-gray-300 dark:border-gray-700 shadow-gray-100/50",
          icon: "text-gray-700 dark:text-gray-400",
          badge:
            "bg-gray-100 dark:bg-gray-900/30 text-gray-700 dark:text-gray-400 border border-gray-300 dark:border-gray-700",
          iconBg: "bg-gray-200 dark:bg-gray-800/40",
        },
      };
  }
};
