import { Card, CardHeader } from "@/components/atoms/card";
import { Skeleton } from "@/components/atoms/skeleton";
import { motion } from "framer-motion";
import { Users } from "lucide-react";

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
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      onClick={onClick}
    >
      {isLoading ? (
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
                {totalUsers}
              </motion.span>
            </div>

            <span className="mt-3 text-[11px] text-muted-foreground leading-tight">
              Total distinct WhatsApp users in the system.
            </span>
          </CardHeader>
        </Card>
      )}
    </motion.div>
  );
}
