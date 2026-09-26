import { useState, useEffect, useRef } from "react";
import { Ticket, X, ExternalLink, Copy, Check, AlertTriangle, Loader2, Users, Paperclip, Image as ImageIcon, Trash2, Calendar } from "lucide-react";
import { zohoTicketStatusService, type ZohoTeam } from "../../services/zohoTicketStatusService";

const APP_NAME_OPTIONS = [
    "Whatsapp Bot",
    "Web App",
    "Reviewer System",
    "Agent Call Center",
    "Outreach",
    "Data Processing System",
    "Testing System",
    "Agri Related",
];

interface CreateZohoTicketModalProps {
    isOpen: boolean;
    onClose: () => void;
    onTicketCreated: (ticketUrl: string, ticketNumber: string | null) => void;
    initialData: {
        queryText?: string;
        questionCategory?: string;
        channelTested?: string;
        languageTested?: string;
        threadId?: string;
        waThreadId?: string;
        buildVersion?: string;
        defectSeverity?: string;
        testerRemarks?: string;
        overallTestStatus?: string;
        testerName?: string;
        userEmail?: string;
    };
}

interface PendingAttachment {
    id: string;
    filename: string;
    previewUrl: string;
    contentBase64: string;
    inlineBase64?: string;
    contentType: string;
    size: number;
}

function compressImageForInline(file: File | Blob, maxWidth = 680, quality = 0.65): Promise<string> {
    return new Promise((resolve) => {
        try {
            if (!file.type || !file.type.startsWith("image/")) {
                resolve("");
                return;
            }
            const img = new Image();
            const objectUrl = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(objectUrl);
                let width = img.naturalWidth || img.width;
                let height = img.naturalHeight || img.height;

                if (!width || !height) {
                    resolve("");
                    return;
                }

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement("canvas");
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext("2d");
                if (!ctx) {
                    resolve("");
                    return;
                }

                // White background to prevent black PNG transparency artifacts
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                const dataUrl = canvas.toDataURL("image/jpeg", quality);
                const base64 = dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
                resolve(base64);
            };
            img.onerror = () => {
                URL.revokeObjectURL(objectUrl);
                resolve("");
            };
            img.src = objectUrl;
        } catch {
            resolve("");
        }
    });
}

function fileToBase64(file: File | Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const result = reader.result as string;
            const base64 = result.includes(",") ? result.split(",")[1] : result;
            resolve(base64);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getAutoSelectedTeamId(channelTested: string | undefined, availableTeams: ZohoTeam[]): string {
    const channel = (channelTested || "").trim().toLowerCase();
    if (!channel || channel === "both") {
        return "";
    }
    if (channel.includes("whatsapp")) {
        const waTeam = availableTeams.find(t => t.name.toLowerCase().includes("whatsapp"));
        return waTeam ? waTeam.id : "";
    }
    if (channel.includes("web")) {
        const webTeam = availableTeams.find(t => t.name.toLowerCase().includes("web app") || t.name.toLowerCase().includes("web"));
        return webTeam ? webTeam.id : "";
    }
    return "";
}

export function CreateZohoTicketModal({
    isOpen,
    onClose,
    onTicketCreated,
    initialData,
}: CreateZohoTicketModalProps) {
    const [subject, setSubject] = useState("");
    const [priority, setPriority] = useState("Medium");
    const [teamId, setTeamId] = useState("");
    const [teams, setTeams] = useState<ZohoTeam[]>([]);
    const [isLoadingTeams, setIsLoadingTeams] = useState(false);
    const [appName, setAppName] = useState("Whatsapp Bot");
    const [issueReoccurredBefore, setIssueReoccurredBefore] = useState(false);
    const [dueDate, setDueDate] = useState("");
    const [description, setDescription] = useState("");
    const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [scopeUpgradeNeeded, setScopeUpgradeNeeded] = useState(false);
    const [copied, setCopied] = useState(false);
    const [successInfo, setSuccessInfo] = useState<{ ticketNumber: string | null; url: string; attachmentsCount?: number } | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const wasOpenRef = useRef(false);

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        setIsLoadingTeams(true);
        zohoTicketStatusService.getTeams()
            .then((res) => {
                if (isMounted && res?.teams) {
                    const EXCLUDED_TEAMS = ["hackathon team", "vibe team"];
                    const filteredTeams = res.teams.filter(
                        t => !EXCLUDED_TEAMS.includes(t.name.trim().toLowerCase())
                    );
                    setTeams(filteredTeams);
                    // Preselect only if user hasn't already made a selection
                    setTeamId(prev => (prev ? prev : getAutoSelectedTeamId(initialData.channelTested, filteredTeams)));
                }
            })
            .catch((err) => {
                console.warn("Could not fetch Zoho teams:", err);
            })
            .finally(() => {
                if (isMounted) setIsLoadingTeams(false);
            });

        return () => {
            isMounted = false;
        };
    }, [isOpen]);

    // Populate default subject & description only on first open - never overwrite user edits on parent re-render
    useEffect(() => {
        if (!isOpen) {
            setSuccessInfo(null);
            setErrorMsg(null);
            setScopeUpgradeNeeded(false);
            setAttachments([]);
            wasOpenRef.current = false;
            return;
        }

        if (!wasOpenRef.current) {
            wasOpenRef.current = true;

            setTeamId(getAutoSelectedTeamId(initialData.channelTested, teams));

            // Map defectSeverity to priority (Urgent/P0 -> High/P1 -> Medium/P2 -> Low/P3)
            const sev = (initialData.defectSeverity || "").toLowerCase();
            let defaultPriority = "Medium";
            if (sev.includes("critical") || sev.includes("blocker") || sev.includes("p0") || sev.includes("urgent")) {
                defaultPriority = "Urgent";
            } else if (sev.includes("major") || sev.includes("high") || sev.includes("p1")) {
                defaultPriority = "High";
            } else if (sev.includes("minor") || sev.includes("trivial") || sev.includes("low") || sev.includes("p3")) {
                defaultPriority = "Low";
            } else if (sev.includes("medium") || sev.includes("p2")) {
                defaultPriority = "Medium";
            }
            setPriority(defaultPriority);

            // Auto-detect App Name from channel tested
            const ch = (initialData.channelTested || "").toLowerCase();
            const isCross = ch.includes("both") || ch.includes("cross");
            if (isCross) {
                setAppName("Cross-Platform Sync");
            } else if (ch.includes("web")) {
                setAppName("Web App");
            } else if (ch.includes("reviewer")) {
                setAppName("Reviewer System");
            } else if (ch.includes("call") || ch.includes("center")) {
                setAppName("Agent Call Center");
            } else {
                setAppName("Whatsapp Bot");
            }
            setIssueReoccurredBefore(false);
            setDueDate("");
            const cat = initialData.questionCategory ? ` [${initialData.questionCategory}]` : "";
            const prefix = isCross ? "[Cross-Platform" : "[QA Defect";
            const querySnippet = initialData.queryText
                ? initialData.queryText.length > 60
                    ? initialData.queryText.slice(0, 60).trim() + "..."
                    : initialData.queryText.trim()
                : "Defect observed during testing";
            setSubject(`${prefix}${cat}] ${querySnippet}`);

            // Build comprehensive structured description
            const threadLines = isCross
                ? [
                    `• Web App Thread ID: ${initialData.threadId || "N/A"}`,
                    `• WhatsApp Thread ID: ${initialData.waThreadId || "N/A"}`
                ]
                : [`• Thread ID: ${initialData.threadId || "N/A"}`];
            const descParts = [
                "QA Defect Report",
                "----------------",
                "",
                "Query Tested:",
                initialData.queryText || "N/A",
                "",
                "Test Case Details:",
                `• Channel: ${initialData.channelTested || "N/A"}`,
                `• Language: ${initialData.languageTested || "N/A"}`,
                `• Category: ${initialData.questionCategory || "N/A"}`,
                ...threadLines,
                `• Build Version: ${initialData.buildVersion || "N/A"}`,
                `• Defect Severity: ${initialData.defectSeverity || "N/A"}`,
                `• Overall Test Status: ${initialData.overallTestStatus || "N/A"}`,
                "",
                "Tester Remarks / Steps to Reproduce:",
                initialData.testerRemarks || "No additional remarks provided.",
                "",
                `Reported By: ${initialData.testerName || "QA Tester"} (${initialData.userEmail || "tester@annamai.org"})`,
            ];
            setDescription(descParts.join("\n"));
        }
    }, [isOpen]);

    const addImageFile = async (file: File | Blob, customName?: string) => {
        try {
            const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB Zoho Desk attachment limit
            if (file.size > MAX_FILE_SIZE) {
                setErrorMsg(`File "${(file as File).name || 'screenshot'}" (${formatBytes(file.size)}) exceeds the 20MB limit supported by Zoho Desk.`);
                return;
            }

            const currentTotal = attachments.reduce((sum, a) => sum + a.size, 0);
            if (currentTotal + file.size > 40 * 1024 * 1024) {
                setErrorMsg("Total attachments size exceeds 40MB. Please remove some files or use smaller images.");
                return;
            }

            const [base64, inlineBase64] = await Promise.all([
                fileToBase64(file),
                compressImageForInline(file),
            ]);
            const previewUrl = URL.createObjectURL(file);
            const name = customName || (file as File).name || `screenshot-${Date.now()}.png`;
            const type = file.type || "image/png";

            setAttachments(prev => [
                ...prev,
                {
                    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                    filename: name,
                    previewUrl,
                    contentBase64: base64,
                    inlineBase64: inlineBase64 || undefined,
                    contentType: type,
                    size: file.size,
                },
            ]);
            setErrorMsg(null);
        } catch (err) {
            console.error("Failed to process attachment:", err);
            setErrorMsg("Failed to process attachment. Please try again.");
        }
    };

    const processClipboard = async (clipboardData: DataTransfer | null) => {
        if (!clipboardData) return false;

        // 1. Files
        const files = Array.from(clipboardData.files || []);
        const imageFiles = files.filter(f => f.type.startsWith("image/"));
        if (imageFiles.length > 0) {
            for (const file of imageFiles) {
                await addImageFile(file, `screenshot-${Date.now()}.png`);
            }
            return true;
        }

        // 2. Items
        const items = clipboardData.items;
        if (items) {
            let found = false;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                        found = true;
                        await addImageFile(file, `screenshot-${Date.now()}.png`);
                    }
                }
            }
            if (found) return true;
        }

        return false;
    };

    const lastPasteTimeRef = useRef(0);

    const handlePaste = async (e: React.ClipboardEvent) => {
        const clipboardData = e.clipboardData;
        if (!clipboardData) return;

        const now = Date.now();
        if (now - lastPasteTimeRef.current < 500) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        const handled = await processClipboard(clipboardData);
        if (handled) {
            lastPasteTimeRef.current = Date.now();
            e.preventDefault();
            e.stopPropagation();
        }
    };

    if (!isOpen) return null;

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        for (let i = 0; i < files.length; i++) {
            await addImageFile(files[i]);
        }
        e.target.value = "";
    };

    const handleRemoveAttachment = (id: string) => {
        setAttachments(prev => {
            const item = prev.find(a => a.id === id);
            if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
            return prev.filter(a => a.id !== id);
        });
    };

    const handleCreateTicket = async () => {
        if (!subject.trim()) {
            setErrorMsg("Please enter a ticket subject.");
            return;
        }
        if (!description.trim()) {
            setErrorMsg("Please enter bug description/test context.");
            return;
        }

        setIsSubmitting(true);
        setErrorMsg(null);
        setScopeUpgradeNeeded(false);

        try {
            const res = await zohoTicketStatusService.createTicket({
                subject: subject.trim(),
                description: description.trim(),
                priority,
                teamId: teamId || undefined,
                appName: appName || undefined,
                issueReoccurredBefore,
                dueDate: dueDate || undefined,
                testerName: initialData.testerName,
                email: initialData.userEmail,
                attachments: attachments.map(a => ({
                    filename: a.filename,
                    contentBase64: a.contentBase64,
                    contentType: a.contentType,
                    inlineBase64: a.inlineBase64,
                })),
            });

            if (res.success && res.ticket) {
                setSuccessInfo({
                    ticketNumber: res.ticket.ticketNumber,
                    url: res.ticket.url,
                    attachmentsCount: res.ticket.attachmentsUploaded ?? attachments.length,
                });
                onTicketCreated(res.ticket.url, res.ticket.ticketNumber);
                setTimeout(() => {
                    onClose();
                }, 1800);
            } else if (res.requiresScopeUpgrade) {
                setScopeUpgradeNeeded(true);
                setErrorMsg(res.error || "Zoho OAuth token requires Desk.tickets.CREATE scope.");
            } else {
                setErrorMsg(res.error || "Failed to create ticket. Please check your network or try again.");
            }
        } catch (err: any) {
            setErrorMsg(err?.message || "An unexpected error occurred while communicating with Zoho Desk.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleCopyReport = async () => {
        const fullReport = `Subject: ${subject}\n\n${description}`;
        try {
            await navigator.clipboard.writeText(fullReport);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            const el = document.createElement("textarea");
            el.value = fullReport;
            document.body.appendChild(el);
            el.select();
            document.execCommand("copy");
            document.body.removeChild(el);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-xs"
            onPaste={handlePaste}
        >
            <div className="relative w-full max-w-3xl max-h-[92vh] flex flex-col bg-card border border-border rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/40">
                    <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-md bg-primary/10 text-primary">
                            <Ticket className="h-5 w-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">Create Zoho Desk Ticket</h2>
                            <p className="text-xs text-muted-foreground">
                                File a defect in Zoho Desk & auto-link it to this test log entry
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Modal Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                    {/* Success Notice */}
                    {successInfo && (
                        <div className="p-3.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-sm flex items-start gap-2.5 animate-in fade-in">
                            <Check className="h-5 w-5 mt-0.5 shrink-0" />
                            <div>
                                <p className="font-semibold">
                                    Ticket {successInfo.ticketNumber ? `#${successInfo.ticketNumber}` : ""} Created Successfully!
                                </p>
                                <p className="text-xs opacity-90 mt-0.5">
                                    Linked to test case
                                    {successInfo.attachmentsCount && successInfo.attachmentsCount > 0
                                        ? ` with ${successInfo.attachmentsCount} screenshot(s) uploaded to Zoho Cloud.`
                                        : "."}{" "}
                                    Closing window...
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Scope Upgrade Notice / Fallback */}
                    {scopeUpgradeNeeded && (
                        <div className="p-4 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-sm space-y-3 animate-in fade-in">
                            <div className="flex items-start gap-2.5">
                                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-semibold text-amber-800 dark:text-amber-300">
                                        Zoho OAuth Write Scope Needed
                                    </p>
                                    <p className="text-xs text-muted-foreground mt-0.5">
                                        The Zoho Desk integration requires <code className="px-1 py-0.5 rounded bg-muted">Desk.tickets.CREATE</code>.
                                    </p>
                                </div>
                            </div>
                            <div className="border-t border-amber-500/20 pt-2.5 flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={handleCopyReport}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium transition-colors shadow-xs"
                                >
                                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                    {copied ? "Report Copied!" : "Copy Pre-filled Bug Report"}
                                </button>
                                <a
                                    href="https://desk.zoho.in/agent/annamai/annam-ai/tickets/add"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-amber-600/30 hover:bg-amber-500/20 text-xs font-medium transition-colors"
                                >
                                    Open Zoho Desk Portal
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Standard Error Notice */}
                    {errorMsg && !scopeUpgradeNeeded && (
                        <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <span>{errorMsg}</span>
                        </div>
                    )}

                    {/* Form Controls */}
                    <div className="space-y-4">
                        {/* Subject, Priority & Team */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                            <div className="sm:col-span-6 flex flex-col gap-1">
                                <label className="text-xs font-semibold text-foreground">
                                    Ticket Subject <span className="text-destructive">*</span>
                                </label>
                                <input
                                    type="text"
                                    required
                                    value={subject}
                                    onChange={(e) => setSubject(e.target.value)}
                                    placeholder="Brief summary of the issue..."
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                            </div>

                            <div className="sm:col-span-3 flex flex-col gap-1">
                                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    <Users className="h-3.5 w-3.5 text-muted-foreground" />
                                    Owner Team
                                </label>
                                <select
                                    value={teamId}
                                    onChange={(e) => setTeamId(e.target.value)}
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                    disabled={isLoadingTeams}
                                >
                                    <option value="">-- Unassigned --</option>
                                    {teams.map((t) => (
                                        <option key={t.id} value={t.id}>
                                            {t.name}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="sm:col-span-3 flex flex-col gap-1">
                                <label className="text-xs font-semibold text-foreground">Priority</label>
                                <select
                                    value={priority}
                                    onChange={(e) => setPriority(e.target.value)}
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    <option value="Urgent">Urgent (P0)</option>
                                    <option value="High">High (P1)</option>
                                    <option value="Medium">Medium (P2)</option>
                                    <option value="Low">Low (P3)</option>
                                </select>
                            </div>
                        </div>

                        {/* App Name, Due Date & Issue Reoccurred Before */}
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                            <div className="sm:col-span-5 flex flex-col gap-1">
                                <label className="text-xs font-semibold text-foreground">
                                    App Name <span className="text-destructive">*</span>
                                </label>
                                <select
                                    value={appName}
                                    onChange={(e) => setAppName(e.target.value)}
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                >
                                    {APP_NAME_OPTIONS.map((opt) => (
                                        <option key={opt} value={opt}>
                                            {opt}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="sm:col-span-4 flex flex-col gap-1">
                                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                                    Due Date
                                </label>
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={(e) => setDueDate(e.target.value)}
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                                />
                            </div>

                            <div className="sm:col-span-3 flex items-center h-9">
                                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-foreground select-none">
                                    <input
                                        type="checkbox"
                                        checked={issueReoccurredBefore}
                                        onChange={(e) => setIssueReoccurredBefore(e.target.checked)}
                                        className="h-4 w-4 rounded border-input text-primary focus:ring-primary focus:ring-1 cursor-pointer"
                                    />
                                    <span>Issue Reoccurred Before</span>
                                </label>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-foreground">
                                    Bug Description & Test Context <span className="text-destructive">*</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleCopyReport}
                                    className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                                >
                                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                                    {copied ? "Copied" : "Copy text"}
                                </button>
                            </div>
                            <textarea
                                required
                                rows={7}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Enter bug description and test details..."
                                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-y"
                            />
                        </div>

                        {/* Screenshots / Attachments to Zoho Cloud */}
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                                    <Paperclip className="h-3.5 w-3.5 text-primary" />
                                    Screenshots & Attachments
                                    <span className="text-[11px] font-normal text-muted-foreground">
                                        (First 2 embedded inline in description; all uploaded to Zoho Cloud)
                                    </span>
                                </label>
                                <span className="text-[11px] text-muted-foreground">
                                    Tip: You can press <kbd className="px-1 py-0.5 rounded bg-muted border border-border text-[10px]">Ctrl+V</kbd> anywhere to paste screenshot
                                </span>
                            </div>

                            {/* Dropzone / Upload Trigger */}
                            <div
                                onClick={() => fileInputRef.current?.click()}
                                className="border-2 border-dashed border-border hover:border-primary/50 hover:bg-primary/5 rounded-md p-3 text-center cursor-pointer transition-colors"
                            >
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    multiple
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    onChange={handleFileInputChange}
                                    className="hidden"
                                />
                                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                                    <ImageIcon className="h-4 w-4 text-primary" />
                                    <span className="font-medium text-foreground">Click to upload screenshot</span>
                                    <span>or paste from clipboard</span>
                                </div>
                            </div>

                            {/* Thumbnail Previews */}
                            {attachments.length > 0 && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                                    {attachments.map((att, idx) => (
                                        <div
                                            key={att.id}
                                            className="group relative border border-border rounded-md bg-muted/30 p-1.5 flex flex-col gap-1 overflow-hidden"
                                        >
                                            <div className="relative h-24 w-full bg-background rounded overflow-hidden flex items-center justify-center">
                                                <img
                                                    src={att.previewUrl}
                                                    alt={att.filename}
                                                    className="h-full w-full object-cover"
                                                />
                                                <div className="absolute bottom-1 left-1 pointer-events-none">
                                                    {idx < 2 ? (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-600/90 text-white backdrop-blur-xs shadow-xs">
                                                            Inline & Cloud
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-medium bg-background/80 text-muted-foreground backdrop-blur-xs shadow-xs">
                                                            Cloud Only
                                                        </span>
                                                    )}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleRemoveAttachment(att.id);
                                                    }}
                                                    className="absolute top-1 right-1 p-1 rounded-full bg-background/80 hover:bg-destructive hover:text-destructive-foreground text-foreground shadow-xs transition-colors"
                                                    title="Remove screenshot"
                                                >
                                                    <Trash2 className="h-3 w-3" />
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between text-[11px] px-0.5">
                                                <span className="truncate max-w-[100px] text-foreground font-medium" title={att.filename}>
                                                    {att.filename}
                                                </span>
                                                <span className="text-muted-foreground text-[10px]">
                                                    {formatBytes(att.size)}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Metadata summary */}
                        <div className="p-2.5 rounded-md bg-muted/50 text-xs text-muted-foreground flex items-center justify-between">
                            <div>
                                <span className="font-medium text-foreground">Reporter:</span>{" "}
                                {initialData.testerName || "QA Tester"} ({initialData.userEmail || "tester@annamai.org"})
                            </div>
                            <div>
                                <span className="font-medium text-foreground">Department:</span> Annam.ai (Bugs Tracker)
                            </div>
                        </div>
                    </div>
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-2.5 px-6 py-3 border-t border-border bg-muted/40">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded-md border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleCreateTicket}
                        disabled={isSubmitting || !!successInfo}
                        className="inline-flex items-center gap-2 px-5 py-2 rounded-md bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Creating ticket & uploading to Zoho Cloud...
                            </>
                        ) : (
                            <>
                                <Ticket className="h-4 w-4" />
                                Create Zoho Ticket
                                {attachments.length > 0 && (
                                    <span className="ml-1 px-1.5 py-0.2 bg-primary-foreground/20 rounded-full text-xs">
                                        +{attachments.length} {attachments.length === 1 ? "file" : "files"}
                                    </span>
                                )}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
