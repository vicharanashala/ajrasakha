import { Card, CardHeader } from "@/components/atoms/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/atoms/tooltip";

type WhatsAppUniqueUsersCardProps = {
  totalUsers: number;
};

export function WhatsAppUniqueUsersCard({
  totalUsers,
}: WhatsAppUniqueUsersCardProps) {
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
      <CardHeader className="pb-2">
        <div
          className="
            text-sm
            text-muted-foreground
          "
        >
          Total WhatsApp Users
        </div>

        <div
          className="
            flex
            items-center
            justify-between
          "
        >
          <div
            className="
              text-5xl
              font-bold
              tracking-tight
            "
          >
            {totalUsers}
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
                  Total distinct WhatsApp users in the system.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </CardHeader>
    </Card>
  );
}