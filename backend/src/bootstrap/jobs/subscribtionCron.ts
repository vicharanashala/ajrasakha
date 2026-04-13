import cron from "node-cron";
import { CORE_TYPES, NotificationService } from "#root/modules/core/index.js";
import { getContainer } from "../loadModules.js";


// Hourly schedule
cron.schedule("0 * * * *", 
    async () => {
        try {
            const contaier=getContainer();
            const notificationService = contaier.get<NotificationService>(CORE_TYPES.NotificationService);
            console.log("[CRON] Cleaning expired subscriptions...");
            const result = await notificationService.deleteExpiredSubscriptions();
            if (result.deletedCount > 0) {
                console.log(`[CRON] Deleted ${result.deletedCount} expired subscriptions`);
            } else {
                console.log("[CRON] No expired subscriptions found");
            }
        } catch (error) {
        console.error("[CRON] Error cleaning subscriptions:", error);
        }
    },
    {
        timezone: 'Asia/Kolkata',
    }
);