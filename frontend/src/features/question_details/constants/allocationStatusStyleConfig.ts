export const getStatusStyles = (status: string) => {
  switch (status) {
    case "answerCreated":
      return {
        container:
          "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 shadow-yellow-100/50",
        icon: "text-yellow-700 dark:text-yellow-400",
        badge:
          "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 border border-yellow-300 dark:border-yellow-700",
        iconBg: "bg-yellow-200 dark:bg-yellow-800/40",
        legendDot: "bg-yellow-500",
      };
    case "approved":
      return {
        container:
          "bg-green-100 dark:bg-green-900/30 border-green-300 dark:border-green-700 shadow-green-100/50",
        icon: "text-green-700 dark:text-green-400",
        badge:
          "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700",
        iconBg: "bg-green-200 dark:bg-green-800/40",
        legendDot: "bg-green-500",
      };
    case "rejected":
      return {
        container:
          "bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 shadow-red-100/50",
        icon: "text-red-700 dark:text-red-400",
        badge:
          "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700",
        iconBg: "bg-red-200 dark:bg-red-800/40",
        legendDot: "bg-red-500",
      };
    case "modified":
      return {
        container:
          "bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 shadow-orange-100/50",
        icon: "text-orange-700 dark:text-orange-400",
        badge:
          "bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border border-orange-300 dark:border-orange-700",
        iconBg: "bg-orange-200 dark:bg-orange-800/40",
        legendDot: "bg-orange-500",
      };
    case "waiting":
      return {
        container:
          "bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 shadow-blue-100/50",
        icon: "text-blue-700 dark:text-blue-400",
        badge:
          "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-300 dark:border-blue-700",
        iconBg: "bg-blue-200 dark:bg-blue-800/40",
        legendDot: "bg-blue-500",
      };
    case "pending":
      return {
        container: "bg-muted/50 border-muted shadow-muted/5",
        icon: "text-muted-foreground",
        badge: "bg-muted/50 text-muted-foreground border border-muted",
        iconBg: "bg-muted",
        legendDot: "bg-muted-foreground/40",
      };
    default:
      return {
        container: "bg-muted/50 border-muted shadow-muted/5",
        icon: "text-muted-foreground",
        badge: "bg-muted/50 text-muted-foreground border border-muted",
        iconBg: "bg-muted",
        legendDot: "bg-muted-foreground/40",
      };
  }
};
