import { useState } from "react";
import { EllipsisVertical, Loader2, Pencil, Trash2 } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/atoms/dropdown-menu";
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/atoms/alert-dialog";
import { Button } from "@/components/atoms/button";
import type { ITesterLogEntry } from "../types";
import { useDeleteTesterLogEntry } from "../hooks/useTesterLogAdminActions";
import { TesterEntryEditDialog } from "./TesterEntryEditDialog";

// The three-dot menu on a Tester Data row: Edit opens TesterEntryEditDialog,
// Delete asks for confirmation first. Admin-only, like the whole Testers
// Dashboard - the API enforces that too.
export function TesterEntryRowActions({ entry }: { entry: ITesterLogEntry }) {
    const [editOpen, setEditOpen] = useState(false);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { mutate: deleteEntry, isPending: deleting } = useDeleteTesterLogEntry();

    function confirmDelete() {
        if (!entry._id) return;
        deleteEntry(entry._id, { onSuccess: () => setDeleteOpen(false) });
    }

    return (
        <>
            {/* modal={false}: a modal menu would still be holding focus and
                pointer-events when the dialog it opens mounts, leaving the
                page unclickable after that dialog closes. */}
            <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label="More actions"
                        title="More actions"
                        disabled={!entry._id}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground hover:bg-muted hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <EllipsisVertical className="h-3.5 w-3.5" />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                    <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                        <Pencil />
                        Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => setDeleteOpen(true)}>
                        <Trash2 />
                        Delete
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>

            <TesterEntryEditDialog entry={entry} open={editOpen} onOpenChange={setEditOpen} />

            <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete this tester entry?</AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-3">
                                <p>
                                    The selected tester record will be deleted. It will no longer appear in
                                    this table, its summary cards, or any other view built from database entries.
                                </p>
                                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
                                    <dt className="text-muted-foreground">Test ID</dt>
                                    <dd className="font-mono text-foreground [overflow-wrap:anywhere]">{entry.testId || "—"}</dd>
                                    <dt className="text-muted-foreground">Tester</dt>
                                    <dd className="text-foreground">{entry.testerName || "Unknown tester"}</dd>
                                    <dt className="text-muted-foreground">Test Date</dt>
                                    <dd className="text-foreground">{entry.testDate || "No date"}</dd>
                                    {entry.typeOfQuestion && (
                                        <>
                                            <dt className="text-muted-foreground">Type</dt>
                                            <dd className="text-foreground">{entry.typeOfQuestion}</dd>
                                        </>
                                    )}
                                </dl>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        {/* Plain buttons rather than AlertDialogAction/Cancel,
                            which close the dialog on click - it has to stay
                            open while the delete is in flight. */}
                        <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                            Cancel
                        </Button>
                        <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
                            {deleting && <Loader2 className="animate-spin" />}
                            {deleting ? "Deleting..." : "Confirm Delete"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
