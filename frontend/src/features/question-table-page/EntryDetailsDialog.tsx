import { CalendarClock, ExternalLink, Languages, Pencil, UserRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/atoms/dialog";
import { Button } from "@/components/atoms/button";
import { formatDate } from "@/utils/formatDate";
import type { ICropAlias, ICropResponse } from "@/hooks/services/cropService";

/** Formats an optional ISO date, or a dash when it is missing or invalid. */
const formatOptionalDate = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : formatDate(date);
};

/** Turns a snake_case key from extra_fields into a readable label. */
const humanize = (key: string) => key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** A small label / value pair in the details grid. */
const Detail = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
    <dd className="mt-0.5 break-words text-sm text-foreground">{value || "—"}</dd>
  </div>
);

/** One stored alias with every detail it carries. */
const AliasCard = ({ alias, chipClassName }: { alias: ICropAlias; chipClassName: string }) => {
  const extras = Object.entries(alias.extra_fields ?? {}).filter(([, value]) => value);
  return (
    <li className="rounded-lg border bg-card p-3">
      <div className="flex flex-wrap items-center gap-2">
        {alias.language && (
          <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${chipClassName}`}>
            {alias.language}
          </span>
        )}
        {alias.region && <span className="text-xs text-muted-foreground">{alias.region}</span>}
      </div>
      <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 text-sm">
        <span className="font-semibold text-foreground">{alias.english_representation}</span>
        {alias.native_representation && <span className="text-muted-foreground">{alias.native_representation}</span>}
      </p>
      {(alias.source_link || alias.page_number || alias.agri_expert || alias.remark || extras.length > 0) && (
        <dl className="mt-2.5 grid grid-cols-1 gap-x-4 gap-y-2 border-t pt-2.5 sm:grid-cols-2">
          {alias.source_link && (
            <Detail
              label="Source"
              value={
                /^https?:\/\//i.test(alias.source_link) ? (
                  <a
                    href={alias.source_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex max-w-full items-center gap-1 text-primary underline-offset-2 hover:underline"
                    title={alias.source_link}
                  >
                    <span className="truncate">{alias.source_link}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                  </a>
                ) : (
                  alias.source_link
                )
              }
            />
          )}
          {alias.page_number && <Detail label="Page" value={alias.page_number} />}
          {alias.agri_expert && <Detail label="Agri expert" value={alias.agri_expert} />}
          {alias.remark && <Detail label="Remark" value={alias.remark} />}
          {extras.map(([key, value]) => (
            <Detail key={key} label={humanize(key)} value={value} />
          ))}
        </dl>
      )}
    </li>
  );
};

/**
 * Read-only view of an AgriTech entry: its details and every alias. Editing happens
 * only through the pencil action, which this dialog also offers as "Edit".
 */
export const EntryDetailsDialog = ({
  entry,
  onClose,
  onEdit,
  typeLabel,
  avatarClassName,
  editButtonClassName,
}: {
  entry: ICropResponse | null;
  onClose: () => void;
  onEdit: (entry: ICropResponse) => void;
  /** Singular type name shown as a badge, e.g. "Crop". */
  typeLabel: string;
  avatarClassName: string;
  editButtonClassName: string;
}) => {
  const structured = (entry?.aliases ?? []).filter((a): a is ICropAlias => typeof a !== "string");
  const legacy = (entry?.aliases ?? []).filter((a): a is string => typeof a === "string");
  const isChemical = entry?.type === "chemical";

  return (
    <Dialog open={!!entry} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[720px] max-w-[95vw] max-h-[88vh] p-0 gap-0 flex flex-col overflow-hidden">
        {entry && (
          <>
            <DialogHeader className="flex-row items-center gap-4 space-y-0 border-b px-6 py-5 text-left">
              {entry.imageUrl ? (
                <img
                  src={entry.imageUrl}
                  alt={entry.name}
                  className="h-14 w-14 shrink-0 rounded-xl object-cover ring-1 ring-border"
                />
              ) : (
                <span
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl text-xl font-semibold ${avatarClassName}`}
                  aria-hidden
                >
                  {entry.name.trim().charAt(0).toUpperCase() || "?"}
                </span>
              )}
              <div className="min-w-0 space-y-1">
                <DialogTitle className="flex flex-wrap items-center gap-2 text-lg">
                  <span className="truncate">{entry.name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${avatarClassName}`}>{typeLabel}</span>
                  {entry.status && (
                    <span className="rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
                      {entry.status}
                    </span>
                  )}
                </DialogTitle>
                <DialogDescription className="text-sm italic">
                  {entry.scientificName || <span className="not-italic">No scientific name</span>}
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
              <dl className="grid grid-cols-1 gap-4 rounded-lg border bg-muted/30 p-4 sm:grid-cols-3">
                <Detail
                  label="Created"
                  value={
                    <span className="flex flex-col">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        {formatOptionalDate(entry.createdAt)}
                      </span>
                      {entry.createdByName?.trim() && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserRound className="h-3 w-3" aria-hidden />
                          {entry.createdByName.trim()}
                        </span>
                      )}
                    </span>
                  }
                />
                <Detail
                  label="Last updated"
                  value={
                    <span className="flex flex-col">
                      <span className="inline-flex items-center gap-1.5">
                        <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                        {formatOptionalDate(entry.updatedAt)}
                      </span>
                      {entry.updatedByName?.trim() && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                          <UserRound className="h-3 w-3" aria-hidden />
                          {entry.updatedByName.trim()}
                        </span>
                      )}
                    </span>
                  }
                />
                <Detail label={isChemical ? "Trade names" : "Aliases"} value={String(entry.aliases?.length ?? 0)} />
                {isChemical && (entry.crops?.length ?? 0) > 0 && (
                  <div className="sm:col-span-3">
                    <Detail
                      label="Associated crops"
                      value={
                        <span className="flex flex-wrap gap-1.5">
                          {entry.crops!.map((crop) => (
                            <span key={crop} className="rounded-md bg-muted px-2 py-0.5 text-xs">{crop}</span>
                          ))}
                        </span>
                      }
                    />
                  </div>
                )}
              </dl>

              <section aria-labelledby="entry-aliases-heading">
                <h3
                  id="entry-aliases-heading"
                  className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >
                  <Languages className="h-3.5 w-3.5" aria-hidden />
                  {isChemical ? "Trade names" : "Aliases"}
                </h3>
                {structured.length === 0 && legacy.length === 0 ? (
                  <p className="rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
                    No aliases yet
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {structured.map((alias, i) => (
                      <AliasCard key={`${alias.language}-${alias.english_representation}-${i}`} alias={alias} chipClassName={avatarClassName} />
                    ))}
                    {legacy.length > 0 && (
                      <li className="rounded-lg border bg-card p-3">
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Older aliases (no language or region)
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {legacy.map((name, i) => (
                            <span key={`${name}-${i}`} className="rounded-md bg-muted px-2 py-0.5 text-xs">{name}</span>
                          ))}
                        </div>
                      </li>
                    )}
                  </ul>
                )}
              </section>
            </div>

            <div className="border-t px-6 py-4">
              <Button
                onClick={() => onEdit(entry)}
                className={`h-10 w-full gap-1.5 text-sm font-semibold text-white shadow-sm ${editButtonClassName}`}
              >
                <Pencil className="h-4 w-4" />
                Edit {typeLabel.toLowerCase()}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
