import { useMemo } from "react";
import { toLocalDateKey } from "@/config/festive-season";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import {
  DIWALI_WISHES,
  getTimeOfDayGreeting,
  pickWishIndex,
} from "@/utils/festiveGreeting";
import { DiyaIcon } from "./DiyaIcon";
import { HarvestScene } from "./HarvestScene";

interface DiwaliGreetingCardProps {
  seasonName: string;
  animated: boolean;
}

// Personalised festive card: greets the signed-in user by name and shows one
// harvest-themed wish per day.
export function DiwaliGreetingCard({ seasonName, animated }: DiwaliGreetingCardProps) {
  // Reuses the cached /me response, so opening the card adds no request.
  const { data: user, isLoading } = useGetCurrentUser();

  const now = useMemo(() => new Date(), []);
  const firstName = user?.firstName?.trim();

  const seed = `${user?._id ?? user?.email ?? "guest"}:${toLocalDateKey(now)}`;
  const wishIndex = pickWishIndex(seed, DIWALI_WISHES.length);

  return (
    <>
      <div className="diwali-card-hero relative h-28 overflow-hidden">
        <HarvestScene />
        <DiyaIcon
          className="absolute bottom-3 left-1/2 h-14 w-14 -translate-x-1/2 drop-shadow-lg"
          animated={animated}
        />
      </div>

      <div className="px-5 pb-4 pt-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-diwali-ink">
          {getTimeOfDayGreeting(now)} &middot; Shubh Deepavali
        </p>
        <p className="mt-1.5 font-['Playfair_Display',serif] text-[22px] font-semibold leading-tight text-foreground">
          {isLoading ? (
            <span className="mx-auto block h-6 w-48 animate-pulse rounded bg-muted" />
          ) : firstName ? (
            `Happy ${seasonName}, ${firstName}`
          ) : (
            `Wishing you a Happy ${seasonName}`
          )}
        </p>

        <div aria-hidden="true" className="my-3 flex items-center justify-center gap-2">
          <span className="h-px w-12 bg-gradient-to-r from-transparent to-diwali-gold/70" />
          <span className="h-1.5 w-1.5 rotate-45 bg-diwali-gold" />
          <span className="h-px w-12 bg-gradient-to-l from-transparent to-diwali-gold/70" />
        </div>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {DIWALI_WISHES[wishIndex]}
        </p>

        <p className="mt-3 text-xs text-muted-foreground">
          Warm regards, <span className="font-semibold text-diwali-ink">Review System Team</span>
        </p>
      </div>
    </>
  );
}
