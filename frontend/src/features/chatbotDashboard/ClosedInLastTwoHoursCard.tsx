import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
  import { motion } from "framer-motion";

type ClosedInLastTwoHoursCardProps = {
  count: number;
  totalClosed: number;
};

export function ClosedInLastTwoHoursCard({
  count,
  totalClosed,
}: ClosedInLastTwoHoursCardProps) {
  return (

    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
    >
      <Card
        className="
          border
          border-border
          rounded-2xl
          bg-background/80
          backdrop-blur
          h-fit      
          "
      >
        <CardHeader className="pb-10">
          <motion.div
            className="text-sm text-muted-foreground"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            Closed within 2 Hours
          </motion.div>

          <div
            className="
              flex
              items-center
              justify-between
              gap-2
              "
          >
            <motion.div
              className="
                text-5xl
                font-bold
                tracking-tight
                "
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, delay: 0.15, type: "spring", stiffness: 200 }}
              key={`${count}-${totalClosed}`}
            >
              {count} / {totalClosed}
            </motion.div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <motion.span
                    className="
                      flex h-4 w-4 cursor-pointer
                      items-center justify-center
                      rounded-full border text-[10px]
                      "
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    i
                  </motion.span>
                </TooltipTrigger>

                <TooltipContent className="max-w-[240px]">
                  <p>Questions closed during the last two hours.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}
