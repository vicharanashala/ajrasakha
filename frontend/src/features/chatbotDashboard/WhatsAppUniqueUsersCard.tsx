import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";

type WhatsAppUniqueUsersCardProps = {
  totalUsers: number;
};

export function WhatsAppUniqueUsersCard({
  totalUsers,
}: WhatsAppUniqueUsersCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <Card
        className="
        border
        border-border
        rounded-2xl
        bg-background/80
        pb-8
         h-fit
        bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300
        "
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <CardHeader className="pb-11">
          <div
            className="
            flex
            items-center
            gap-2
            text-sm
            text-muted-foreground
            mb-2
          "
          >
            <div className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />{" "}
            Total WhatsApp Users
          </div>

          <motion.div
            className="
            flex        
            items-center
            justify-between "
            variants={{
              hidden: { opacity: 0, y: 12 },
              visible: { opacity: 1, y: 0 },
            }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <motion.span
              key={totalUsers}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: "easeOut" }}
              className="
                  text-3xl
                  font-bold
                  tracking-tight
                "
            >
              {totalUsers}
            </motion.span>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.span
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.92 }}
                    className="
                      flex h-4 w-4 cursor-pointer
                      items-center justify-center
                      rounded-full border text-[10px]
                    "
                  >
                    i
                  </motion.span>
                </TooltipTrigger>

                <TooltipContent className="max-w-[260px]">
                  <p>Total distinct WhatsApp users in the system.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </motion.div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}
