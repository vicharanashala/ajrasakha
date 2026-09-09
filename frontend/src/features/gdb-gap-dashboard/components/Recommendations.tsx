import { Badge } from "@/components/atoms/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import type { GapReport } from "../types";

/**
 * Renders the outreach-recommendations block.
 *
 * The backend currently emits plain-text recommendations (strings) but
 * the response schema also tolerates `{title, description}` objects, so
 * this component handles both.
 */
export function Recommendations({ report }: { report?: GapReport }) {
  const items = report?.recommendations ?? [];

  if (!items || items.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Outreach recommendations</CardTitle>
          <CardDescription>
            The pipeline has not surfaced any explicit recommendations for this
            report.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground" role="status">
            Try refreshing the report once the gap detector has run again.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Outreach recommendations</CardTitle>
        <CardDescription>
          Actionable next steps generated from the current gap report.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="space-y-3" aria-label="Outreach recommendations">
          {items.map((rec, idx) => {
            const title =
              typeof rec === "string" ? rec : rec?.title ?? "Untitled recommendation";
            const description =
              typeof rec === "string" ? undefined : rec?.description;
            return (
              <li
                key={`${title}-${idx}`}
                className="rounded-md border p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="font-medium">{title}</p>
                  <Badge variant="outline">Auto-generated</Badge>
                </div>
                {description && (
                  <p className="mt-2 text-sm text-muted-foreground">{description}</p>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}