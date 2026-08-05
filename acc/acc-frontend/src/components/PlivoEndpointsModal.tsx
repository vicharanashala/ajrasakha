import { useState, useEffect } from "react";
import { Button } from "./atoms/button";
import { Input } from "./atoms/input";
import { toast } from "sonner";
import {
  X,
  Plus,
  Trash2,
  Edit3,
  Check,
  Key,
  User,
  RefreshCw,
  Server,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
import { plivoApi, type PlivoAgentCredential } from "@/hooks/api/plivo/api";

interface PlivoEndpointsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PlivoEndpointsModal = ({ isOpen, onClose }: PlivoEndpointsModalProps) => {
  const [credentials, setCredentials] = useState<PlivoAgentCredential[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingAgentNumber, setEditingAgentNumber] = useState<string | null>(null);

  // New endpoint state - agent number is auto-assigned
  const [newAgentNumber, setNewAgentNumber] = useState("agent_1");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [isAdding, setIsAdding] = useState(false);

  // Edit endpoint state
  const [editUsername, setEditUsername] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Password visibility state for list items (default hidden)
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});

  const toggleShowPassword = (agentNumber: string) => {
    setShowPasswords((prev) => ({
      ...prev,
      [agentNumber]: !prev[agentNumber],
    }));
  };

  useEffect(() => {
    if (isOpen) {
      fetchCredentials();
    }
  }, [isOpen]);

  const computeNextAgentNumber = (credsList: PlivoAgentCredential[]): string => {
    let maxNum = 0;
    for (const c of credsList) {
      if (c.agentNumber && c.agentNumber.startsWith("agent_")) {
        const num = parseInt(c.agentNumber.replace("agent_", ""), 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
        }
      }
    }
    return `agent_${maxNum + 1}`;
  };

  const fetchCredentials = async () => {
    setLoading(true);
    try {
      const data = await plivoApi.getAllCredentials();
      const list = data || [];
      setCredentials(list);
      
      // Auto assign next agent number
      const nextAgent = computeNextAgentNumber(list);
      setNewAgentNumber(nextAgent);
    } catch (err: any) {
      toast.error(err.message || "Failed to fetch Plivo credentials");
    } finally {
      setLoading(false);
    }
  };

  const cleanSipUsername = (input: string): string => {
    let clean = input.trim();
    if (clean.startsWith("sip:")) clean = clean.substring(4);
    if (clean.includes("@")) clean = clean.split("@")[0];
    return clean;
  };

  const handleAddCredential = async () => {
    if (!newUsername.trim()) {
      toast.error("Please enter a Plivo SIP endpoint username");
      return;
    }
    if (!newPassword.trim()) {
      toast.error("Please enter a Plivo SIP endpoint password");
      return;
    }

    try {
      setIsAdding(true);
      const assignedAgent = newAgentNumber || computeNextAgentNumber(credentials);

      await plivoApi.upsertCredential(assignedAgent, newUsername.trim(), newPassword.trim());
      toast.success(`Plivo Endpoint for ${assignedAgent} saved successfully!`);
      setNewUsername("");
      setNewPassword("");
      fetchCredentials();
    } catch (err: any) {
      toast.error(err.message || "Failed to create endpoint credential");
    } finally {
      setIsAdding(false);
    }
  };

  const handleStartEdit = (cred: PlivoAgentCredential) => {
    setEditingAgentNumber(cred.agentNumber);
    setEditUsername(cred.username);
    setEditPassword(cred.password);
  };

  const handleCancelEdit = () => {
    setEditingAgentNumber(null);
    setEditUsername("");
    setEditPassword("");
  };

  const handleSaveEdit = async (agentNumber: string) => {
    if (!editUsername.trim() || !editPassword.trim()) {
      toast.error("Username and password cannot be empty");
      return;
    }
    try {
      setIsSavingEdit(true);
      await plivoApi.updateCredential(agentNumber, editUsername.trim(), editPassword.trim());
      toast.success(`Updated endpoint ${agentNumber}`);
      setEditingAgentNumber(null);
      fetchCredentials();
    } catch (err: any) {
      toast.error(err.message || "Failed to update endpoint credential");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteCredential = async (agentNumber: string) => {
    if (!confirm(`Are you sure you want to delete Plivo endpoint ${agentNumber}?`)) {
      return;
    }
    try {
      await plivoApi.deleteCredential(agentNumber);
      toast.success(`Deleted endpoint ${agentNumber}`);
      fetchCredentials();
    } catch (err: any) {
      toast.error(err.message || "Failed to delete endpoint credential");
    }
  };

  const toggleHidePassword = (agentNumber: string) => {
    setHidePasswords((prev) => ({
      ...prev,
      [agentNumber]: !prev[agentNumber],
    }));
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in-50">
      <div className="bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-3xl space-y-6 p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Plivo SIP Endpoints Management
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                Configure SIP endpoints for call agents. Agent numbers are auto-assigned sequentially.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchCredentials}
              disabled={loading}
              className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              title="Refresh Endpoints"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content - Scrollable List & Add Form */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {/* Add New Endpoint Form */}
          <div className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center gap-2">
              <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Add New Plivo Endpoint
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Auto Assigned Agent ID (Read Only) */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 flex items-center gap-1 mb-1">
                  <span>Agent ID</span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-normal flex items-center gap-0.5">
                    <Sparkles className="w-3 h-3" /> Auto-assigned
                  </span>
                </label>
                <Input
                  value={newAgentNumber}
                  readOnly
                  disabled
                  className="bg-indigo-50/70 dark:bg-indigo-950/40 text-xs h-9 font-mono font-bold text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 cursor-not-allowed"
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
                  Username (or SIP URI)
                </label>
                <Input
                  placeholder="e.g. agent1annam65584..."
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="bg-white dark:bg-zinc-900 text-xs h-9 font-mono"
                />
                {newUsername.trim() && (
                  <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 truncate">
                    Target: sip:{cleanSipUsername(newUsername)}@phone.plivo.com
                  </p>
                )}
              </div>

              {/* Password Field - VISIBLE TYPING (type="text") */}
              <div>
                <label className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 block mb-1">
                  Password
                </label>
                <Input
                  type="text"
                  placeholder="SIP Password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-white dark:bg-zinc-900 text-xs h-9 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end pt-1">
              <Button
                onClick={handleAddCredential}
                disabled={isAdding}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                {isAdding ? "Adding Endpoint..." : `Add Endpoint (${newAgentNumber})`}
              </Button>
            </div>
          </div>

          {/* Existing Endpoints List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400 flex items-center justify-between">
              <span>Configured Endpoints ({credentials.length})</span>
            </h3>

            {loading && credentials.length === 0 ? (
              <div className="text-center py-8 text-sm text-zinc-500">
                Loading endpoints...
              </div>
            ) : credentials.length === 0 ? (
              <div className="text-center py-8 text-sm text-zinc-500 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                No Plivo credentials found. Add an endpoint above.
              </div>
            ) : (
              <div className="space-y-3">
                {credentials.map((cred) => {
                  const isEditing = editingAgentNumber === cred.agentNumber;
                  const isVisible = !!showPasswords[cred.agentNumber];

                  return (
                    <div
                      key={cred.agentNumber}
                      className="p-4 bg-white dark:bg-zinc-950/80 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-sm space-y-3 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-md bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 font-mono text-xs font-bold border border-indigo-200 dark:border-indigo-800">
                            {cred.agentNumber}
                          </span>
                          {cred.sipUri && (
                            <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline truncate max-w-xs">
                              {cred.sipUri}
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-1.5">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() => handleSaveEdit(cred.agentNumber)}
                                disabled={isSavingEdit}
                                className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                              >
                                <Check className="w-3 h-3" /> Save
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleCancelEdit}
                                className="h-7 px-2 text-xs text-zinc-500"
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleStartEdit(cred)}
                                className="h-7 px-2 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 gap-1"
                              >
                                <Edit3 className="w-3 h-3" /> Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteCredential(cred.agentNumber)}
                                className="h-7 px-2 text-xs text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 gap-1"
                              >
                                <Trash2 className="w-3 h-3" /> Delete
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Side-by-side Username & Password Fields */}
                      {isEditing ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                              Username / SIP URI
                            </label>
                            <Input
                              value={editUsername}
                              onChange={(e) => setEditUsername(e.target.value)}
                              className="text-xs font-mono h-8 bg-zinc-50 dark:bg-zinc-900"
                            />
                            {editUsername && (
                              <span className="text-[10px] text-indigo-500 font-mono block mt-0.5">
                                converted: sip:{cleanSipUsername(editUsername)}@phone.plivo.com
                              </span>
                            )}
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                              Password
                            </label>
                            <Input
                              type="text"
                              value={editPassword}
                              onChange={(e) => setEditPassword(e.target.value)}
                              className="text-xs font-mono h-8 bg-zinc-50 dark:bg-zinc-900"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-zinc-50/60 dark:bg-zinc-900/40 p-2.5 rounded-lg border border-zinc-100 dark:border-zinc-850">
                          <div className="flex items-center gap-2 text-xs min-w-0">
                            <User className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                            <span className="text-zinc-500 dark:text-zinc-400 shrink-0">
                              Username:
                            </span>
                            <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">
                              {cred.username}
                            </span>
                          </div>

                          <div className="flex items-center justify-between gap-2 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              <Key className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                              <span className="text-zinc-500 dark:text-zinc-400 shrink-0">
                                Password:
                              </span>
                              <span className="font-mono text-zinc-800 dark:text-zinc-200 truncate">
                                {isVisible ? cred.password : "••••••••••••"}
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleShowPassword(cred.agentNumber)}
                              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 p-0.5"
                              title={isVisible ? "Hide Password" : "Show Password"}
                            >
                              {isVisible ? (
                                <EyeOff className="w-3.5 h-3.5" />
                              ) : (
                                <Eye className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end pt-3 border-t border-zinc-200 dark:border-zinc-800 shrink-0">
          <Button variant="outline" onClick={onClose} className="text-xs">
            Close
          </Button>
        </div>
      </div>
    </div>
  );
};
