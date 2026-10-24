import { Fragment, type ReactNode } from "react";
import { Laptop, MonitorSmartphone, Smartphone, type LucideIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/atoms/tabs";
import type { ITesterLogEntry } from "../types";
import { CROSS_PLATFORM_FIELD_PAIRS, type IEntryDetailField } from "../entryDetailFields";
import { statusBadgeClass } from "../utils/badgeClasses";

// One titled card of the Test Entry Details / Edit Test Entry dialogs.
export function EntryDetailSection({ title, icon: Icon, children }: {
    title: string;
    icon: LucideIcon;
    children: ReactNode;
}) {
    return (
        <section className="rounded-xl border bg-card shadow-xs">
            <h3 className="sticky top-0 z-10 flex items-center gap-2.5 rounded-t-xl border-b bg-card px-4 py-2.5 text-sm font-semibold text-foreground">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary" aria-hidden>
                    <Icon className="h-4 w-4" />
                </span>
                {title}
            </h3>
            {children}
        </section>
    );
}

export type CrossPlatformSide = "web" | "wa";

// Same colours as the form's Web App / WhatsApp blocks (TesterLogForm.tsx).
// The active tab is filled with its platform's colour, and the panel below
// it is edged in the same colour, so it is always clear whose fields are
// showing.
const PLATFORMS = [
    {
        side: "web",
        label: "WebApp",
        icon: Laptop,
        textClass: "text-blue-700 dark:text-blue-300",
        panelClass: "border-blue-500/30 bg-blue-500/5",
        activeTabClass: "data-[state=active]:bg-blue-600 dark:data-[state=active]:bg-blue-600 data-[state=active]:text-white",
        keyOf: (p: (typeof CROSS_PLATFORM_FIELD_PAIRS)[number]) => ({ key: p.webKey, label: p.webLabel }),
    },
    {
        side: "wa",
        label: "WhatsApp",
        icon: Smartphone,
        textClass: "text-emerald-700 dark:text-emerald-300",
        panelClass: "border-emerald-500/30 bg-emerald-500/5",
        activeTabClass: "data-[state=active]:bg-emerald-600 dark:data-[state=active]:bg-emerald-600 data-[state=active]:text-white",
        keyOf: (p: (typeof CROSS_PLATFORM_FIELD_PAIRS)[number]) => ({ key: p.waKey, label: p.waLabel }),
    },
] as const;

// The at-a-glance comparison above the tabs: what a reviewer most wants to
// compare, readable without switching tabs.
const SUMMARY_ITEMS: { side: CrossPlatformSide; label: string; key: keyof ITesterLogEntry; isStatus?: boolean }[] = [
    { side: "web", label: "Response Time", key: "responseTimeMins" },
    { side: "wa", label: "Response Time", key: "waResponseTimeMins" },
    { side: "web", label: "Overall Test Status", key: "webOverallTestStatus", isStatus: true },
    { side: "wa", label: "Overall Test Status", key: "waOverallTestStatus", isStatus: true },
];

const BADGE_CLASS = "inline-block max-w-full text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded";

function SummaryStrip({ values }: { values: Partial<ITesterLogEntry> }) {
    return (
        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Cross-platform summary">
            {SUMMARY_ITEMS.map((item) => {
                const platform = PLATFORMS.find((p) => p.side === item.side)!;
                const value = values[item.key] as string | undefined;
                return (
                    <div key={item.key} className="min-w-0 rounded-lg border border-muted-foreground/10 bg-muted/30 px-3 py-2">
                        <dt className="text-[11px] font-medium leading-tight text-muted-foreground">
                            <span className={`font-semibold ${platform.textClass}`}>{platform.label}</span> {item.label}
                        </dt>
                        <dd className="mt-1 text-sm font-medium text-foreground tabular-nums">
                            {!value ? (
                                <span className="text-muted-foreground/40">—</span>
                            ) : item.isStatus ? (
                                <span className={`${BADGE_CLASS} ${statusBadgeClass(value)}`}>{value}</span>
                            ) : (
                                value
                            )}
                        </dd>
                    </div>
                );
            })}
        </dl>
    );
}

// A cross-platform entry's WebApp and WhatsApp halves: a read-only summary
// of the two response times and statuses, then one tab per platform showing
// only that platform's fields (CROSS_PLATFORM_FIELD_PAIRS).
//
// - values: what the summary shows - the entry itself in View, the entry
//   with the admin's unsaved edits in Edit.
// - renderField draws one field the same way the dialog draws all its
//   others (a read-only tile in View, an input in Edit). listAs is "dl" when
//   those fields are <dt>/<dd> pairs.
// - changedCount, in Edit, badges a tab holding unsaved changes - an
//   inactive tab's fields aren't on screen to show their own highlight.
export function CrossPlatformComparison({ values, renderField, listAs: List = "div", changedCount }: {
    values: Partial<ITesterLogEntry>;
    renderField: (field: IEntryDetailField) => ReactNode;
    listAs?: "dl" | "div";
    changedCount?: Record<CrossPlatformSide, number>;
}) {
    return (
        <EntryDetailSection title="Cross-Platform Comparison" icon={MonitorSmartphone}>
            <div className="space-y-3 p-3">
                <SummaryStrip values={values} />

                <Tabs defaultValue="web" className="gap-0">
                    <TabsList className="h-10 w-full sm:w-auto sm:self-start" aria-label="Platform">
                        {PLATFORMS.map((platform) => {
                            const Icon = platform.icon;
                            const changed = changedCount?.[platform.side] ?? 0;
                            return (
                                <TabsTrigger
                                    key={platform.side}
                                    value={platform.side}
                                    className={`group px-4 ${platform.activeTabClass}`}
                                >
                                    <Icon aria-hidden />
                                    {platform.label}
                                    {changed > 0 && (
                                        <span className="ml-0.5 rounded-full bg-primary/15 px-1.5 text-[10px] font-semibold text-primary group-data-[state=active]:bg-white/25 group-data-[state=active]:text-white">
                                            {changed}
                                            <span className="sr-only"> changed</span>
                                        </span>
                                    )}
                                </TabsTrigger>
                            );
                        })}
                    </TabsList>

                    {PLATFORMS.map((platform) => (
                        <TabsContent
                            key={platform.side}
                            value={platform.side}
                            className={`mt-2 rounded-lg border p-2 ${platform.panelClass}`}
                        >
                            <List className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 gap-2">
                                {CROSS_PLATFORM_FIELD_PAIRS.map((pair) => {
                                    const { key, label } = platform.keyOf(pair);
                                    return (
                                        <Fragment key={String(key)}>
                                            {renderField({ key, label, isDateTime: pair.isDateTime })}
                                        </Fragment>
                                    );
                                })}
                            </List>
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
        </EntryDetailSection>
    );
}
