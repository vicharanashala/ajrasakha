/* ============================================================
   USE MAP ANALYTICS - Hook for computing map analytics data
============================================================ */

import { useMemo } from "react";
import type { Analytics, LevelKey } from "../lib/types";
import { mockAnalytics, mockDistrictDetails } from "../lib/mockData";
import { useQuery } from "@tanstack/react-query";
import { ChatbotService } from "@/hooks/services/chatbotService";
import type { DistrictAnalyticsResponse } from "@/features/chatbotDashboard/hooks/useStateQueryData";

interface UseMapAnalyticsProps {
  statesGeo: unknown;
  districtsAll: unknown;
  level: LevelKey;
  selectedState: string | null;
  selectedDistrict: string | null;
  allStatesData?: any[];
  districtAnalytics?: DistrictAnalyticsResponse;
}

// const normalizeState = (state: string) => {
//   const key = state.trim().toLowerCase();

//   const aliases: Record<string, string> = {
//     "uttaranchal": "uttarakhand",
//     "andhra pradesh": "andra pradesh",
//     "jammu and kashmir": "jammu and kashmir",
//     'orissa': 'odisha'
//   };

//   return aliases[key] || key;
// };

export function useMapAnalytics({
  statesGeo,
  districtsAll,
  level,
  selectedState,
  selectedDistrict,
  allStatesData,
  districtAnalytics
}: UseMapAnalyticsProps) {
  // Attach analytics to states
  // const statesWithData = useMemo(() => {
  //   if (!statesGeo) return null;
  //   const geo = statesGeo as {
  //     type?: string;
  //     features: Array<{ type?: string; geometry?: unknown; properties: Record<string, unknown> }>;
  //   };
  //   return {
  //     type: geo.type ?? "FeatureCollection",
  //     features: geo.features.map((f) => ({
  //       type: f.type ?? "Feature",
  //       geometry: f.geometry,
  //       properties: {
  //         ...f.properties,
  //         _name: f.properties.NAME_1 as string,
  //         _analytics: mockAnalytics(`state:${f.properties.NAME_1}`),
  //       },
  //     })),
  //   };
  // }, [statesGeo]);

  const analyticsMap = useMemo(() => {
  if (!allStatesData) return new Map();

  return new Map(
    allStatesData.map((item) => [
      String(item.state).toLowerCase(),
      item,
    ]),
  );
}, [allStatesData]);

const statesWithData = useMemo(() => {
  if (!statesGeo) return null;

  const geo = statesGeo as {
    type?: string;
    features: Array<{
      type?: string;
      geometry?: unknown;
      properties: Record<string, unknown>;
    }>;
  };

  return {
    type: geo.type ?? "FeatureCollection",
    features: geo.features.map((f) => {
      const stateName = String(f.properties.NAME_1);

      const analytics = analyticsMap.get(
        stateName.trim().toLowerCase()
      );

      return {
        type: f.type ?? "Feature",
        geometry: f.geometry,
        properties: {
          ...f.properties,
          _name: stateName,
          _analytics: {
            questions: analytics?.totalQuestions ?? 0,
            answers: analytics?.closedQuestions ?? 0,
            users: analytics?.totalUsers ?? 0,
            activeUsers: analytics?.activeUsers ?? 0,
            coordinators: 0,
            closureHrs: analytics?.avgCloseTimeHours ?? 0,
          },
        },
      };
    }),
  };
}, [statesGeo, analyticsMap]);


  const districtMap = useMemo(() => {
  if (!districtAnalytics) return new Map();

  return new Map(
    districtAnalytics.map((item) => [
      item.district.toLowerCase(),
      item,
    ]),
  );
}, [districtAnalytics]);

  // Filter districts by selected state

  const districtsOfState = useMemo(() => {
  if (!districtsAll || !selectedState) return null;

  const geo = districtsAll as {
    type?: string;
    features: Array<{
      type?: string;
      geometry?: unknown;
      properties: Record<string, unknown>;
    }>;
  };

  const features = geo.features
    .filter((f) => f.properties.NAME_1 === selectedState)
    .map((f) => {
      const districtName = String(f.properties.NAME_2);

      const analytics = districtMap.get(
        districtName.toLowerCase(),
      );

      return {
        type: f.type ?? "Feature",
        geometry: f.geometry,
        properties: {
          ...f.properties,
          _name: districtName,
          _parent: f.properties.NAME_1 as string,
          _analytics: {
            questions: analytics?.totalQuestions ?? 0,
            answers: analytics?.closedQuestions?? 0,
            users: analytics?.totalUsers ?? 0,
            activeUsers: analytics?.activeUsers ?? 0,
            coordinators: analytics?.coordinators ?? 0,
            closureHrs: 0,
          },
        },
      };
    });

  return {
    type: "FeatureCollection",
    features,
  };
}, [
  districtsAll,
  selectedState,
  districtMap,
]);



  // Active geo to render
  const activeGeo =
    level === "india"
      ? statesWithData
      : level === "state"
        ? districtsOfState
        : districtsOfState;

  // District details
  const districtDetails = useMemo(
    () => (selectedDistrict ? mockDistrictDetails(selectedDistrict) : null),
    [selectedDistrict],
  );

  // Min/max for color ramp
  const [minV, maxV] = useMemo(() => {
    if (!activeGeo) return [0, 1];
    const geo = activeGeo as { features: Array<{ properties: { _analytics: Analytics } }> };
    const arr = geo.features.map((f) => f.properties._analytics.questions);
    return [Math.min(...arr), Math.max(...arr)];
  }, [activeGeo]);

  // Compute active analytics
  const activeAnalytics = useMemo(() => {
    if (!statesWithData) return null;

    // District level
    if (selectedDistrict && districtsOfState) {
      const district = districtsOfState.features.find(
        (f) => f.properties._name === selectedDistrict,
      );
      return district?.properties._analytics ?? null;
    }

    // State level
    if (selectedState) {
      const state = statesWithData.features.find(
        (f) => f.properties._name === selectedState,
      );
      return state?.properties._analytics ?? null;
    }

    // Country level (aggregate all)
    return statesWithData.features.reduce(
      (acc, f) => {
        const x = f.properties._analytics;
        return {
          questions: acc.questions + x.questions,
          answers: acc.answers + x.answers,
          users: acc.users + x.users,
          activeUsers: acc.activeUsers + x.activeUsers,
          coordinators: acc.coordinators + x.coordinators,
          closureHrs: acc.closureHrs + x.closureHrs,
        };
      },
      {
        questions: 0,
        answers: 0,
        users: 0,
        activeUsers: 0,
        coordinators: 0,
        closureHrs: 0,
      },
    );
  }, [statesWithData, districtsOfState, selectedState, selectedDistrict]);

  return {
    statesWithData,
    districtsOfState,
    districtDetails,
    activeGeo,
    minV,
    maxV,
    activeAnalytics,
  };
}

const chatbotService = new ChatbotService();

export const useAllStatesandUserData = ({
  // category,
  // district,
  // state,
  // crop,
  // crops,
  // status,
  // closedWithInTwohours,
  // notificationType,
  // period,
  // questionType,
  // page,
  // limit,
  source,
  userType,
  // startDate,
  // endDate,
  // search = "",
  enabled = true,
}: {
  // category?: string;
  // district?: string;
  // state: string
  // crop?: string
  // crops?: string[]
  // status?: string
  // closedWithInTwohours?: boolean
  // notificationType?: string
  // period?: string
  // questionType: QueryCategoryQuestionType;
  // page: number;
  // limit: number;
  source: string;
  userType: string;
  // startDate?: Date;
  // endDate?: Date;
  // search?: string;
  enabled: boolean;
}) => {
  return useQuery<any>({
  queryKey: [
    "get-user-and-map-data",
    // category,
    // district,
    // state,
    // crop,
    // crops?.join(","),
    // status,
    // closedWithInTwohours,
    // notificationType,
    // period,
    // questionType,
    // page,
    // limit,
    source,
    userType,
    // stringStartDate,
    // stringEndDate,
    // search,
  ],
    queryFn: () =>
      chatbotService.getAllStatesQuestionsAndUsersData({
        // category: category ?? "",
        // district: district ?? "",
        // state: state ?? "",
        // crop: crop ?? "",
        // crops: crops ?? [],
        // status: status,
        // closedWithInTwohours: closedWithInTwohours,
        // notificationType: notificationType ?? "",
        // period: period,
        // questionType,
        // page,
        // limit,
        source,
        userType,
        // stringStartDate,
        // stringEndDate,
        // search
      }),
    enabled: enabled && Boolean(true),
  });
};