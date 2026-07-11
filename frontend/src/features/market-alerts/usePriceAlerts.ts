import { useState, useEffect } from "react";

export type CropType = "Wheat" | "Rice" | "Cotton" | "Tomato" | "Onion" | "Potato";

export interface PriceAlert {
  crop: CropType;
  enabled: boolean;
}

const DEFAULT_CROPS: CropType[] = ["Wheat", "Rice", "Cotton", "Tomato", "Onion", "Potato"];
const STORAGE_KEY = "market_price_alerts";

/**
 * Hook to manage farmer price alerts preferences
 * Stores state in localStorage for persistence across sessions
 */
export const usePriceAlerts = () => {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Initialize from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setAlerts(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved alerts", e);
        // Fall back to default
        setAlerts(DEFAULT_CROPS.map((crop) => ({ crop, enabled: false })));
      }
    } else {
      // Initialize with default crops, all disabled
      setAlerts(DEFAULT_CROPS.map((crop) => ({ crop, enabled: false })));
    }
    setIsLoaded(true);
  }, []);

  // Persist to localStorage whenever alerts change
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
    }
  }, [alerts, isLoaded]);

  const toggleAlert = (crop: CropType) => {
    setAlerts((prev) =>
      prev.map((alert) =>
        alert.crop === crop ? { ...alert, enabled: !alert.enabled } : alert
      )
    );
  };

  const savePreferences = () => {
    // Persist is handled automatically by the useEffect above
    // This is exposed for explicit save button interaction
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  };

  return {
    alerts,
    toggleAlert,
    savePreferences,
    isLoaded,
  };
};
