import { useState, useRef } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import { Badge } from "@/components/atoms/badge";
import { Input } from "@/components/atoms/input";
import { Label } from "@/components/atoms/label";
import { Textarea } from "@/components/atoms/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/atoms/select";
import {
  Upload,
  FileText,
  Users,
  ArrowRightLeft,
  Trash2,
  Download,
  CheckCircle,
  AlertTriangle,
  Loader2,
  FileSpreadsheet,
  X,
} from "lucide-react";
import { toast } from "sonner";

interface BulkOperation {
  id: string;
  type: string;
  status: "pending" | "processing" | "completed" | "failed";
  totalItems: number;
  processedItems: number;
  createdAt: Date;
  description: string;
}

const MOCK_HISTORY: BulkOperation[] = [
  {
    id: "op_001",
    type: "assign",
    status: "completed",
    totalItems: 45,
    processedItems: 45,
    createdAt: new Date(Date.now() - 86400000),
    description: "Assigned 45 questions to Dr. Patel",
  },
  {
    id: "op_002",
    type: "reroute",
    status: "completed",
    totalItems: 120,
    processedItems: 120,
    createdAt: new Date(Date.now() - 172800000),
    description: "Re-routed 120 questions from inactive experts",
  },
  {
    id: "op_003",
    type: "status_change",
    status: "completed",
    totalItems: 30,
    processedItems: 30,
    createdAt: new Date(Date.now() - 259200000),
    description: "Closed 30 duplicate questions",
  },
];

export function BulkOperationsPanel() {
  const [activeTab, setActiveTab] = useState<"assign" | "reroute" | "status" | "upload">("assign");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [targetExpert, setTargetExpert] = useState("");
  const [newStatus, setNewStatus] = useState("");
  const [reason, setReason] = useState("");
  const [questionIds, setQuestionIds] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith(".csv") && !file.name.endsWith(".xlsx")) {
        toast.error("Only CSV and Excel files are supported");
        return;
      }
      setSelectedFile(file);
      toast.success(`File "${file.name}" selected`);
    }
  };

  const handleBulkAssign = async () => {
    const ids = questionIds.split(/[,\n]/).map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      toast.error("Enter at least one question ID");
      return;
    }
    if (!targetExpert) {
      toast.error("Select a target expert");
      return;
    }
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsProcessing(false);
    toast.success(`Assigned ${ids.length} questions to ${targetExpert}`);
    setQuestionIds("");
  };

  const handleBulkReroute = async () => {
    const ids = questionIds.split(/[,\n]/).map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      toast.error("Enter at least one question ID");
      return;
    }
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsProcessing(false);
    toast.success(`Re-routed ${ids.length} questions successfully`);
    setQuestionIds("");
  };

  const handleBulkStatusChange = async () => {
    const ids = questionIds.split(/[,\n]/).map((id) => id.trim()).filter(Boolean);
    if (ids.length === 0) {
      toast.error("Enter at least one question ID");
      return;
    }
    if (!newStatus) {
      toast.error("Select a target status");
      return;
    }
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsProcessing(false);
    toast.success(`Changed ${ids.length} questions to "${newStatus}"`);
    setQuestionIds("");
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast.error("Select a file first");
      return;
    }
    setIsProcessing(true);
    await new Promise((r) => setTimeout(r, 2000));
    setIsProcessing(false);
    toast.success(`Processed ${selectedFile.name} successfully`);
    setSelectedFile(null);
  };

  return (
    <div className="space-y-6">
      {/* Operation Type Selector */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { key: "assign" as const, label: "Bulk Assign", icon: Users, color: "blue" },
          { key: "reroute" as const, label: "Bulk Re-route", icon: ArrowRightLeft, color: "amber" },
          { key: "status" as const, label: "Status Change", icon: FileText, color: "purple" },
          { key: "upload" as const, label: "CSV Upload", icon: Upload, color: "emerald" },
        ].map(({ key, label, icon: Icon, color }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`p-4 rounded-xl border-2 text-left transition-all ${
              activeTab === key
                ? `border-${color}-500 bg-${color}-500/5`
                : "border-border hover:border-border/80 hover:bg-accent/30"
            }`}
          >
            <Icon className={`w-5 h-5 mb-2 ${activeTab === key ? `text-${color}-600` : "text-muted-foreground"}`} />
            <p className="text-sm font-medium">{label}</p>
          </button>
        ))}
      </div>

      {/* Operation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            {activeTab === "assign" && <><Users className="w-4 h-4" /> Bulk Assign Questions</>}
            {activeTab === "reroute" && <><ArrowRightLeft className="w-4 h-4" /> Bulk Re-route Questions</>}
            {activeTab === "status" && <><FileText className="w-4 h-4" /> Bulk Status Change</>}
            {activeTab === "upload" && <><Upload className="w-4 h-4" /> Upload CSV/Excel</>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {activeTab !== "upload" && (
            <>
              <div>
                <Label className="text-sm">Question IDs</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Enter comma-separated or newline-separated question IDs
                </p>
                <Textarea
                  placeholder="Enter question IDs, one per line or comma-separated...&#10;e.g., q_001, q_002, q_003"
                  value={questionIds}
                  onChange={(e) => setQuestionIds(e.target.value)}
                  className="min-h-[120px] font-mono text-sm"
                />
                {questionIds.trim() && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {questionIds.split(/[,\n]/).filter((id) => id.trim()).length} IDs detected
                  </p>
                )}
              </div>

              {activeTab === "assign" && (
                <div>
                  <Label className="text-sm">Target Expert</Label>
                  <Select value={targetExpert} onValueChange={setTargetExpert}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select expert to assign to" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Dr. Patel">Dr. Patel</SelectItem>
                      <SelectItem value="Prof. Sharma">Prof. Sharma</SelectItem>
                      <SelectItem value="Dr. Kumar">Dr. Kumar</SelectItem>
                      <SelectItem value="Mod. Rajesh">Mod. Rajesh</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {activeTab === "status" && (
                <div>
                  <Label className="text-sm">New Status</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select target status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="closed">Closed</SelectItem>
                      <SelectItem value="on-hold">On Hold</SelectItem>
                      <SelectItem value="duplicate_closed">Duplicate (Closed)</SelectItem>
                      <SelectItem value="re-routed">Re-routed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}

              {(activeTab === "reroute" || activeTab === "assign") && (
                <div>
                  <Label className="text-sm">Reason (optional)</Label>
                  <Input
                    placeholder="e.g., Reassigning due to expert unavailability"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-1"
                  />
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={
                    activeTab === "assign"
                      ? handleBulkAssign
                      : activeTab === "reroute"
                        ? handleBulkReroute
                        : handleBulkStatusChange
                  }
                  disabled={isProcessing}
                  className="gap-2"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : activeTab === "assign" ? (
                    <Users className="w-4 h-4" />
                  ) : activeTab === "reroute" ? (
                    <ArrowRightLeft className="w-4 h-4" />
                  ) : (
                    <FileText className="w-4 h-4" />
                  )}
                  {isProcessing ? "Processing..." : `Execute ${activeTab === "assign" ? "Assign" : activeTab === "reroute" ? "Re-route" : "Status Change"}`}
                </Button>
                <Button variant="outline" onClick={() => setQuestionIds("")} className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Clear
                </Button>
              </div>
            </>
          )}

          {activeTab === "upload" && (
            <>
              <div
                className="border-2 border-dashed rounded-xl p-8 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-all"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                {selectedFile ? (
                  <div className="space-y-2">
                    <FileSpreadsheet className="w-10 h-10 text-emerald-500 mx-auto" />
                    <p className="font-medium">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Remove
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto" />
                    <p className="font-medium text-foreground">
                      Click to upload or drag and drop
                    </p>
                    <p className="text-sm text-muted-foreground">
                      CSV or Excel (.xlsx) files only
                    </p>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-sm">Operation Type</Label>
                <Select>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="What should be done with the data?" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="assign">Bulk Assign to Expert</SelectItem>
                    <SelectItem value="reroute">Bulk Re-route</SelectItem>
                    <SelectItem value="status">Bulk Status Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Button
                onClick={handleFileUpload}
                disabled={!selectedFile || isProcessing}
                className="gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
                {isProcessing ? "Processing..." : "Upload & Process"}
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Operation History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Recent Operations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {MOCK_HISTORY.map((op) => (
              <div
                key={op.id}
                className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-card/50"
              >
                <div className="flex items-center gap-3">
                  {op.status === "completed" ? (
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                  ) : op.status === "failed" ? (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                  )}
                  <div>
                    <p className="text-sm font-medium">{op.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {op.createdAt.toLocaleDateString()} · {op.processedItems}/{op.totalItems} items
                    </p>
                  </div>
                </div>
                <Badge variant={op.status === "completed" ? "default" : "secondary"}>
                  {op.status}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
