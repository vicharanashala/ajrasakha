"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Users } from "lucide-react";

export function ModeratorsOverview() {
  // Mock data - replace with real API
  const experts = 156;
  const moderators = 24;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="w-4 h-4" />
            Total Experts
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-foreground">{experts}</div>
          <p className="text-xs text-muted-foreground mt-2">
            Active on platform
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Users className="w-4 h-4" />
            Total Moderators
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-foreground">{moderators}</div>
          <p className="text-xs text-muted-foreground mt-2">
            Active moderators
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
