import { Avatar, AvatarFallback, AvatarImage } from "./atoms/avatar";
import { Crown } from "lucide-react";
import type { IUser } from "@/types";

const crownStyles: Record<number, string> = {
  1: "fill-yellow-400 text-yellow-500",
  2: "fill-gray-300 text-gray-400",
  3: "fill-amber-700 text-amber-800",
};

const ringStyles: Record<number, string> = {
  1: "ring-2 ring-yellow-400",
  2: "ring-2 ring-gray-400",
  3: "ring-2 ring-amber-700",
};

type AvatarComponentProps = {
  u?: IUser;
  name?: string;
  image?: string;
  rankPosition?: number;
  showRankBadge?: boolean;
};

const getInitials = (name?: string) =>
  name
    ?.trim()
    ?.split(" ")
    ?.filter(Boolean)
    ?.slice(0, 2)
    ?.map(word => word[0].toUpperCase())
    ?.join("") || "";

const AvatarComponent = ({
  u,
  name,
  image,
  rankPosition,
  showRankBadge = false,
}: AvatarComponentProps) => {
  const displayName = name || `${u?.firstName || ""} ${u?.lastName || ""}`.trim();
  const avatarSrc = image || u?.avatar;
  const rank = rankPosition ?? u?.rankPosition;

  const showCrown =
    showRankBadge && [1, 2, 3].includes(rank);

  return (
    <div className="relative inline-block">
      {showCrown && (
        <Crown
          className={`absolute -top-2 left-1/2 -translate-x-1/2 z-10 w-4 h-4 ${
            crownStyles[rank]
          }`}
        />
      )}

      <Avatar
        className={`h-8 w-8 flex-shrink-0 ${
          showRankBadge ? ringStyles[rank] || "" : ""
        }`}
      >
        <AvatarImage src={avatarSrc} alt={displayName} />
        <AvatarFallback>
          {getInitials(displayName)}
        </AvatarFallback>
      </Avatar>
    </div>
  );
};

export default AvatarComponent;