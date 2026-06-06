import { Card, CardHeader } from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { RefreshCw, Users } from "lucide-react";
import { useState } from "react";
import CountUp from "react-countup";

type WhatsAppUniqueUsersCardProps = {
  totalUsers: number;
  onClick?: () => void;
  isLoading?: boolean;
};

export function WhatsAppUniqueUsersCard({
  totalUsers,
  onClick,
  isLoading,
}: WhatsAppUniqueUsersCardProps) {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = async () => {
    setRefreshing(true);
    await queryClient.refetchQueries({ queryKey: ["whatsapp-unique-users"] });
    setRefreshing(false);
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      onClick={onClick}
    >
      {refreshing || isLoading ? (
        <Skeleton className="h-full w-full rounded-2xl" />
      ) : (
        <Card
          className={`
    w-full sm:max-w-[220px] md:max-w-[250px]
    border border-border rounded-2xl
    bg-gradient-to-br from-card to-card/50
    backdrop-blur-sm pb-8 h-full
    shadow-sm hover:shadow-md transition-shadow duration-300
    ${onClick ? "cursor-pointer" : ""}
  `}
        >
          <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
          <button
            onClick={(event) => {
              event.stopPropagation();
              handleRefresh();
            }}
            className=" absolute top-8 right-3 z-50 rounded-lg p-1.5 shadow-sm backdrop-blur-sm transition-all duration-200"
            title="Refresh"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
          <CardHeader className="pb-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>

              <motion.span
                key={totalUsers}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="text-3xl font-bold tracking-tight leading-none"
              >
                {/* {totalUsers} */}
                <CountUp
                  end={totalUsers}
                  duration={1.5}
                  decimals={0}
                  preserveValue
                />
              </motion.span>
            </div>

            <span className="mt-8 text-[11px] text-muted-foreground leading-tight">
              Total distinct WhatsApp users in the system.
            </span>
          </CardHeader>
        </Card>
      )}
    </motion.div>
  );
}
