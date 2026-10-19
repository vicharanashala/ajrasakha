import { useEffect, useState } from "react";
import { CheckCircle, Clock } from "lucide-react";
import { useCheckIn } from "@/hooks/api/performance/useCheckIn";
import { useBlockUser } from "@/hooks/api/user/useBlockUser";
import type { IUser } from "@/types";

/** GateKeeper/Auditor check-in / check-out control. Kept as its own component so its
 *  per-second timer re-render stays isolated here and does NOT re-render the
 *  whole Dashboard (which would restart all the card count-up animations).
 *  Reuses the existing check-in + block/unblock endpoints; for a gatekeeper/auditor,
 *  isBlocked is the availability flag (checked-in = not blocked). */
export const GateKeeperAuditorCheckInControl = ({
  user,
}: {
  user?: IUser | null;
}) => {
  const { checkIn, isPending: isCheckingIn } = useCheckIn();
  const blockUser = useBlockUser();

  const isGateKeeperOrAuditor =
    user?.role === "gate_keeper" || user?.role === "auditor";

  // Local, optimistic state seeded from the server. Check-in/checkout updates
  // ONLY this state (no global ["user"] invalidation), so just this control
  // re-renders — the dashboard and its cards are never re-rendered/re-animated.
  const [checkedIn, setCheckedIn] = useState(
    () => isGateKeeperOrAuditor && user?.isBlocked === false,
  );
  const [checkedInAt, setCheckedInAt] = useState<number | null>(() =>
    user?.lastCheckInAt ? new Date(user.lastCheckInAt).getTime() : null,
  );
  const [timer, setTimer] = useState("00:00:00");
  const busy = isCheckingIn || blockUser.isPending;

  // Re-sync with the server only when /me genuinely changes (initial load,
  // window-focus refetch, etc.) — not on our own optimistic toggles.
  useEffect(() => {
    setCheckedIn(isGateKeeperOrAuditor && user?.isBlocked === false);
    setCheckedInAt(
      user?.lastCheckInAt ? new Date(user.lastCheckInAt).getTime() : null,
    );
  }, [isGateKeeperOrAuditor, user?.isBlocked, user?.lastCheckInAt]);

  useEffect(() => {
    if (!checkedIn || !checkedInAt) {
      setTimer("00:00:00");
      return;
    }
    const tick = () => {
      const diff = Date.now() - checkedInAt;
      const f = (n: number) => Math.max(0, n).toString().padStart(2, "0");
      setTimer(
        `${f(Math.floor(diff / 3600000))}:${f(Math.floor((diff / 60000) % 60))}:${f(
          Math.floor((diff / 1000) % 60),
        )}`,
      );
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [checkedIn, checkedInAt]);

  if (!isGateKeeperOrAuditor) return null;

  const handleCheckIn = async () => {
    if (!user?._id || busy) return;
    try {
      await blockUser.mutateAsync({ userId: user._id, action: "unblock" });
      await checkIn();
      setCheckedInAt(Date.now());
      setCheckedIn(true);
    } catch {
      /* errors surfaced via the hooks' toasts */
    }
  };

  const handleCheckOut = async () => {
    if (!user?._id || busy) return;
    try {
      await blockUser.mutateAsync({ userId: user._id, action: "block" });
      setCheckedIn(false);
    } catch {
      /* errors surfaced via the hooks' toasts */
    }
  };

  return (
    <div className="flex flex-col items-center gap-0.5">
      {checkedIn && (
        <span className="text-lg px-1 font-semibold tracking-widest w-full text-center">
          {timer}
        </span>
      )}
      <button
        disabled={busy}
        onClick={() => (checkedIn ? handleCheckOut() : handleCheckIn())}
        className={`flex items-center gap-2 px-2 py-2 rounded-xl border transition-all duration-200 cursor-pointer ${
          checkedIn
            ? "bg-card border-red-300 text-red-600 hover:bg-red-50"
            : "bg-card border-green-300 text-green-600 hover:bg-green-50"
        } ${busy ? "opacity-60 cursor-not-allowed" : ""}`}
      >
        {checkedIn ? (
          <CheckCircle className="w-4 h-4 text-red-500" />
        ) : (
          <Clock className="w-5 h-5 text-green-500" />
        )}
        <span className="text-sm font-medium">
          {checkedIn ? "Check Out" : "Check In"}
        </span>
      </button>
    </div>
  );
};
