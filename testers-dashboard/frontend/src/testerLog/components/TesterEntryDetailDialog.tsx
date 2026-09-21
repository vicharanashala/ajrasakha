import { Eye } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/atoms/dialog";
import { ScrollArea } from "@/components/atoms/scroll-area";
import type { ITesterLogEntry } from "../types";
import { ENTRY_DETAIL_GROUPS } from "../entryDetailFields";

interface TesterEntryDetailDialogProps {
    entry: ITesterLogEntry;
}

// Full-record detail view for a single Tester Data row - the table only
// shows 10 columns at a glance; this shows all ~82 fields on the entry,
// grouped and labelled the same way the submission form does, so nothing
// requires horizontal scrolling to read (values wrap, the dialog itself
// scrolls vertically). Mirrors the wide-Dialog + ScrollArea pattern already
// used for "View More" elsewhere in the app (see
// features/question_details/components/answer_item/ViewMoreDialog.tsx).
export function TesterEntryDetailDialog({ entry }: TesterEntryDetailDialogProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md border hover:bg-muted transition-colors whitespace-nowrap"
                >
                    <Eye className="h-3.5 w-3.5" />
                    View more
                </button>
            </DialogTrigger>
            <DialogContent className="w-[95vw] max-w-4xl h-[85vh] flex flex-col">
                <DialogHeader className="pb-3 border-b">
                    <DialogTitle className="text-lg font-semibold">
                        Test Entry Details
                    </DialogTitle>
                    <p className="text-xs text-muted-foreground">
                        {entry.testerName || "Unknown tester"} &middot; {entry.testDate || "No date"} &middot; Test ID: {entry._id || "—"}
                    </p>
                </DialogHeader>

                <ScrollArea className="flex-1 h-[85vh]">
                    <div className="space-y-5 pb-2 pr-3">
                        {ENTRY_DETAIL_GROUPS.map((group) => (
                            <div key={group.title}>
                                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 pb-1 border-b">
                                    {group.title}
                                </h3>
                                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2.5">
                                    {group.fields.map((field) => {
                                        const value = entry[field.key] as string | undefined;
                                        return (
                                            <div key={String(field.key)} className="min-w-0">
                                                <dt className="text-[11px] font-medium text-muted-foreground">
                                                    {field.label}
                                                </dt>
                                                <dd className="text-sm text-foreground break-words whitespace-pre-wrap">
                                                    {value || "—"}
                                                </dd>
                                            </div>
                                        );
                                    })}
                                </dl>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
