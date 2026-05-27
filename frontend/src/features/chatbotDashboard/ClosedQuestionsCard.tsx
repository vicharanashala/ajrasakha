import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";
import { motion } from "framer-motion";

type ClosedQuestionsCardProps = {
  closedQuestions: number;
  totalQuestions: number;
  inReview: number;
};

export function ClosedQuestionsCard({
  closedQuestions,
  totalQuestions,
  inReview,
}: ClosedQuestionsCardProps) {
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
          backdrop-blur
          h-fit
          bg-gradient-to-br from-card to-card/50 backdrop-blur-sm shadow-sm hover:shadow-md transition-shadow duration-300     

        "
      >
        <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-transparent via-primary/60 to-transparent" />

        <CardHeader className="pb-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <span className="h-4 w-1 rounded-full bg-gradient-to-b from-primary to-primary/40" />
                Question Status
              </div>
            </div>

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
                  <p>Distribution of total, closed, and in-review questions.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          {/* Stats */}
          <motion.div
            className="mt-5 flex items-center justify-between gap-4"
            initial="hidden"
            animate="visible"
            variants={{
              hidden: {},
              visible: {
                transition: {
                  staggerChildren: 0.1,
                },
              },
            }}
          >
            {/* Total */}
            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <span className="text-xs text-muted-foreground">Total</span>

              <motion.span
                key={totalQuestions}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="
                  text-3xl
                  font-bold
                  tracking-tight
                "
              >
                {totalQuestions}
              </motion.span>
            </motion.div>

            {/* Closed */}
            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <span className="text-xs text-muted-foreground">Closed</span>

              <motion.span
                key={closedQuestions}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="
                  text-3xl
                  font-bold
                  tracking-tight
                "
              >
                {closedQuestions}
              </motion.span>
            </motion.div>

            {/* in-review */}
            <motion.div
              className="flex flex-1 flex-col"
              variants={{
                hidden: { opacity: 0, y: 12 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.4, ease: "easeOut" }}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <motion.span
                      whileHover={{ scale: 1.05 }}
                      className="text-xs text-muted-foreground cursor-help w-fit"
                    >
                      In review
                    </motion.span>
                  </TooltipTrigger>

                  <TooltipContent>
                    <p>The count of questions that are not yet closed.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <motion.span
                key={Math.max(inReview, 0)}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
                className="
                  text-3xl
                  font-bold
                  tracking-tight
                "
              >
                {Math.max(inReview, 0)}
              </motion.span>
            </motion.div>
          </motion.div>
        </CardHeader>
      </Card>
    </motion.div>
  );
}