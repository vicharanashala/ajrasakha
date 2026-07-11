"use client";

import { Bell } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Skeleton } from "@/components/atoms/skeleton";
import { usePriceAlerts } from "./usePriceAlerts";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { toast } from "sonner";

/**
 * PriceAlertPanel - Farmer-facing component for managing crop price alerts
 *
 * Features:
 * - Display 6 common crops (Wheat, Rice, Cotton, Tomato, Onion, Potato)
 * - Toggle alerts per crop with bell icon feedback
 * - Save preferences button
 * - Local storage persistence
 * - Role-aware rendering (farmers only)
 */
export const PriceAlertPanel = () => {
  const { alerts, toggleAlert, savePreferences, isLoaded } = usePriceAlerts();
  const [isSaving, setIsSaving] = useState(false);

  if (!isLoaded) {
    return (
      <Card className="w-full bg-gradient-to-br from-emerald-50 to-transparent border-emerald-200">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-lg font-semibold text-emerald-900">
              Market Price Alerts
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  const handleToggle = (crop: string) => {
    toggleAlert(crop as any);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      savePreferences();
      const enabledCrops = alerts
        .filter((a) => a.enabled)
        .map((a) => a.crop)
        .join(", ");

      toast.success(
        enabledCrops.length > 0
          ? `Alerts set for: ${enabledCrops}`
          : "Price alerts disabled"
      );
    } catch (error) {
      toast.error("Failed to save preferences");
      console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const enabledCount = alerts.filter((a) => a.enabled).length;

  return (
    <Card className="w-full bg-gradient-to-br from-emerald-50 to-transparent border-emerald-200 shadow-sm hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-lg font-semibold text-emerald-900">
              Market Price Alerts
            </CardTitle>
          </div>
          {enabledCount > 0 && (
            <span className="inline-flex items-center rounded-full bg-emerald-600 px-2.5 py-0.5 text-xs font-medium text-white">
              {enabledCount} active
            </span>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Crop Toggle Grid */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {alerts.map((alert) => (
            <button
              key={alert.crop}
              onClick={() => handleToggle(alert.crop)}
              className={cn(
                "group relative inline-flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 font-medium text-sm transition-all duration-200",
                alert.enabled
                  ? "bg-emerald-100 text-emerald-900 ring-2 ring-emerald-300"
                  : "bg-white text-gray-700 border border-gray-200 hover:border-emerald-200"
              )}
            >
              <span className="truncate">{alert.crop}</span>
              <Bell
                className={cn(
                  "h-4 w-4 flex-shrink-0 transition-all",
                  alert.enabled
                    ? "fill-emerald-600 text-emerald-600"
                    : "text-gray-400 group-hover:text-emerald-400"
                )}
              />
            </button>
          ))}
        </div>

        {/* Info Text */}
        <p className="text-xs text-gray-600">
          {enabledCount > 0
            ? `You'll be notified when prices change for ${enabledCount} selected crop${enabledCount !== 1 ? "s" : ""}`
            : "Select crops to receive price alerts"}
        </p>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium transition-colors"
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Saving...
            </span>
          ) : (
            "Save Preferences"
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
