// import { Card, CardHeader } from "@/components/atoms/card";
// import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";

// type CustomerNotificationsCardProps = {
//   notified: number;
//   closed: number;
//   untrackedClosedQuestions: number;
// };

// export function CustomerNotificationsCard({
//   notified,
//   closed,
//   untrackedClosedQuestions,
// }: CustomerNotificationsCardProps) {
//   return (
//     <Card
//       className="
//         border
//         border-border
//         rounded-2xl
//         bg-background/80
//         backdrop-blur
//         h-fit
//       "
//     >
//       <CardHeader className="pb-2">
//         <div className="text-sm text-muted-foreground">
//           Customer Notifications
//         </div>

//         <div
//           className="
//             flex
//             items-center
//             justify-between
//             gap-2
//           "
//         >
//           <div
//             className="
//               text-5xl
//               font-bold
//               tracking-tight
//             "
//           >
//             {notified}
//           </div>

//           <TooltipProvider>
//             <Tooltip>
//               <TooltipTrigger asChild>
//                 <span
//                   className="
//                     flex h-4 w-4 cursor-pointer
//                     items-center justify-center
//                     rounded-full border text-[10px]
//                   "
//                 >
//                   i
//                 </span>
//               </TooltipTrigger>

//               <TooltipContent className="max-w-[240px]">
//                 <p>
//                   Customers successfully notified after
//                   question closure.
//                 </p>
//               </TooltipContent>
//             </Tooltip>
//           </TooltipProvider>
//         </div>

//         <div className="text-sm text-muted-foreground">
//             <span>/ {closed} closed</span><span> / {untrackedClosedQuestions} Untracked</span>
//         </div>
//       </CardHeader>
//     </Card>
//   );
// }


import { Card, CardHeader } from "@/components/atoms/card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/atoms/tooltip";

type CustomerNotificationsCardProps = {
  notified: number;
  notNotified: number;
  untrackedClosedQuestions: number;
};

export function CustomerNotificationsCard({
  notified,
  notNotified,
  untrackedClosedQuestions,
}: CustomerNotificationsCardProps) {
  return (
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
      <CardHeader className="pb-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Customer Notifications
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className="
                    flex h-4 w-4 cursor-pointer
                    items-center justify-center
                    rounded-full border text-[10px]
                  "
                >
                  i
                </span>
              </TooltipTrigger>

              <TooltipContent className="max-w-[260px]">
                <p>
                  Notification delivery breakdown for closed
                  questions.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* Stats */}
        <div className="mt-5 flex items-center justify-between gap-4">
          {/* Notified */}
          <div className="flex flex-1 flex-col">
            <span className="text-xs text-muted-foreground">
              Notified
            </span>

            <span
              className="
                text-3xl
                font-bold
                tracking-tight
              "
            >
              {notified}
            </span>
          </div>

          {/* Not Notified */}
          <div className="flex flex-1 flex-col">
            <span className="text-xs text-muted-foreground">
              Not Notified
            </span>

            <span
              className="
                text-3xl
                font-bold
                tracking-tight
              "
            >
              {notNotified}
            </span>
          </div>

          {/* Untracked */}
          <div className="flex flex-1 flex-col">
            <span className="text-xs text-muted-foreground">
              Untracked
            </span>

            <span
              className="
                text-3xl
                font-bold
                tracking-tight
              "
            >
              {untrackedClosedQuestions}
            </span>
          </div>
        </div>
      </CardHeader>
    </Card>
  );
}