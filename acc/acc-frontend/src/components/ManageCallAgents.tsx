import { useEffect, useState } from "react";
import type { IUser } from "@/types";
import { Button } from "./atoms/button";
import { toast } from "sonner";
import { Search, Plus, Trash2, ToggleLeft, ToggleRight, Check, X, ShieldCheck, UserCheck, Users } from "lucide-react";
import { Input } from "./atoms/input";
import { UserService } from "@/hooks/services/userService";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
const userService = new UserService();

export const ManageCallAgents = () => {
  const [activeTab, setActiveTab] = useState<"agents" | "managers">("agents");

  // Call Agents state
  const [callAgents, setCallAgents] = useState<IUser[]>([]);
  const [allUsers, setAllUsers] = useState<IUser[]>([]);

  // Call Managers state
  const [callManagers, setCallManagers] = useState<IUser[]>([]);
  const [allAdmins, setAllAdmins] = useState<IUser[]>([]);

  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { data: currentUser } = useGetCurrentUser({ enabled: true });

  const canManageCallAgents = currentUser?.role === "admin" && !!currentUser?.Call_centre_manager;

  useEffect(() => {
    refreshData();
  }, []);

  const refreshData = async () => {
    setLoading(true);
    await Promise.all([
      fetchCallAgents(),
      fetchCallManagers(),
      fetchAllUsers(),
      fetchAllAdmins(),
    ]);
    setLoading(false);
  };

  const fetchCallAgents = async () => {
    try {
      const data = await userService.getCallAgents();
      setCallAgents(data || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch call agents");
    }
  };

  const fetchCallManagers = async () => {
    try {
      const data = await userService.getCallCentreManagers();
      setCallManagers(data || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch call managers");
    }
  };

  const fetchAllUsers = async () => {
    try {
      const data = await userService.useGetAllExperts(1, 100, "", "", "");
      setAllUsers(data?.experts || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch users");
    }
  };

  const fetchAllAdmins = async () => {
    try {
      const data = await userService.getAllAdmins();
      setAllAdmins(data || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch admin users");
    }
  };

  const handleToggleActive = async (userId: string) => {
    try {
      await userService.toggleCallAgentActive(userId);
      toast.success("Call agent status toggled successfully");
      fetchCallAgents();
    } catch (error: any) {
      toast.error(error.message || "Failed to toggle call agent status");
    }
  };

  const handleRemoveAgent = async (userId: string) => {
    if (!confirm("Are you sure you want to remove this user as a call agent?")) {
      return;
    }

    try {
      await userService.setCallAgentStatus(userId, false, false);
      toast.success("Call agent removed successfully");
      fetchCallAgents();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove call agent");
    }
  };

  const handleRemoveManager = async (userId: string) => {
    if (userId === String(currentUser?._id)) {
      toast.error("You cannot remove yourself as a Call Centre Manager");
      return;
    }

    if (callManagers.length <= 1) {
      toast.error("Cannot remove the sole remaining Call Centre Manager");
      return;
    }

    if (!confirm("Are you sure you want to remove Call Centre Manager status for this admin?")) {
      return;
    }

    try {
      await userService.setCallCentreManagerStatus(userId, false);
      toast.success("Call Centre Manager removed successfully");
      fetchCallManagers();
      fetchAllAdmins();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove Call Centre Manager");
    }
  };

  const handleToggleSelection = (userId: string) => {
    setSelectedUserId((prev) => (prev === userId ? null : userId));
  };

  const handleConfirmAdd = async () => {
    if (!selectedUserId) {
      toast.error(`Please select a user to add as a ${activeTab === "agents" ? "call agent" : "call centre manager"}`);
      return;
    }

    try {
      setIsSubmitting(true);
      if (activeTab === "agents") {
        await userService.setCallAgentStatus(selectedUserId, true, false);
        toast.success("Call agent added successfully");
        fetchCallAgents();
      } else {
        await userService.setCallCentreManagerStatus(selectedUserId, true);
        toast.success("Call Centre Manager added successfully");
        fetchCallManagers();
        fetchAllAdmins();
      }

      setSelectedUserId(null);
      setShowAddModal(false);
      setSearch("");
    } catch (error: any) {
      toast.error(error.message || `Failed to add ${activeTab === "agents" ? "call agent" : "call manager"}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedUserId(null);
    setShowAddModal(false);
    setSearch("");
  };

  const filteredAgentCandidates = allUsers.filter((u) => {
    const roleLower = (u.role || "").toLowerCase();
    const isValidRole = roleLower === "expert" || roleLower === "moderator" || roleLower === "pae_expert";
    if (!isValidRole) return false;

    if (!search.trim()) return true;

    const searchTerm = search.toLowerCase().trim();
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
    const email = (u.email || "").toLowerCase();

    return fullName.includes(searchTerm) || email.includes(searchTerm);
  });

  const filteredManagerCandidates = allAdmins.filter((u) => {
    const isAlreadyManager = u.Call_centre_manager === true || String(u.Call_centre_manager) === "true";
    if (isAlreadyManager) return false;

    if (!search.trim()) return true;

    const searchTerm = search.toLowerCase().trim();
    const fullName = `${u.firstName || ""} ${u.lastName || ""}`.toLowerCase();
    const email = (u.email || "").toLowerCase();

    return fullName.includes(searchTerm) || email.includes(searchTerm);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground font-medium">Loading call management data...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      {/* Header with Title & Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
            Call Centre User Management
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
            Manage active call agents and authorized call centre managers.
          </p>
        </div>

        {canManageCallAgents && (
          <Button onClick={() => setShowAddModal(true)} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20">
            <Plus className="w-4 h-4" />
            {activeTab === "agents" ? "Add Call Agent" : "Add Call Manager"}
          </Button>
        )}
      </div>

      {/* Sub-Tabs Bar */}
      <div className="flex items-center gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-1">
        <button
          onClick={() => {
            setActiveTab("agents");
            setSearch("");
            setSelectedUserId(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-t-lg transition-all border-b-2 ${
            activeTab === "agents"
              ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Call Agents</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
            {callAgents.length}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab("managers");
            setSearch("");
            setSelectedUserId(null);
          }}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-t-lg transition-all border-b-2 ${
            activeTab === "managers"
              ? "border-indigo-600 dark:border-indigo-400 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30"
              : "border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Call Centre Managers</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-mono">
            {callManagers.length}
          </span>
        </button>
      </div>

      {/* CALL AGENTS TAB CONTENT */}
      {activeTab === "agents" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Active Call Agents</h2>
          </div>

          {callAgents.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-200 dark:border-zinc-800">
              No call agents found. Add experts or moderators to handle incoming call queues.
            </div>
          ) : (
            <div className="grid gap-4">
              {callAgents.map((agent) => (
                <div
                  key={agent._id}
                  className="flex items-center justify-between p-4 bg-white dark:bg-zinc-950/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl shadow-sm hover:shadow-md transition-all"
                >
                  <div className="flex-1">
                    <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {agent.firstName} {agent.lastName}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {agent.email}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          agent.role === "call_agent"
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50"
                            : agent.role === "moderator"
                              ? "bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/50"
                              : "bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50"
                        }`}
                      >
                        {agent.role}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          agent.isCallAgentActive
                            ? "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300"
                            : "bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400"
                        }`}
                      >
                        {agent.isCallAgentActive ? "Active" : "Inactive"}
                      </span>
                      {agent.agent && agent.agent !== "not_available" && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono">
                          {agent.agent}
                        </span>
                      )}
                      {agent.isBusy && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-medium">
                          In Call
                        </span>
                      )}
                      {agent.currentCallUuid && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 font-mono">
                          Call: {agent.currentCallUuid.slice(0, 8)}...
                        </span>
                      )}
                    </div>
                  </div>
                  {canManageCallAgents && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleActive(String(agent._id))}
                        className="gap-1.5 text-xs font-semibold"
                      >
                        {agent.isCallAgentActive ? (
                          <>
                            <ToggleRight className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                            Deactivate
                          </>
                        ) : (
                          <>
                            <ToggleLeft className="w-4 h-4 text-zinc-400" />
                            Activate
                          </>
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAgent(String(agent._id))}
                        className="gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* CALL CENTRE MANAGERS TAB CONTENT */}
      {activeTab === "managers" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-200">Authorized Call Centre Managers</h2>
          </div>

          {callManagers.length === 0 ? (
            <div className="text-center py-12 text-zinc-500 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-900/40 rounded-xl border border-zinc-200 dark:border-zinc-800">
              No Call Centre Managers assigned yet.
            </div>
          ) : (
            <div className="grid gap-4">
              {callManagers.map((manager) => {
                const isSelf = String(manager._id) === String(currentUser?._id);
                return (
                  <div
                    key={manager._id}
                    className="flex items-center justify-between p-4 bg-white dark:bg-zinc-950/60 border border-zinc-200/60 dark:border-zinc-800/60 rounded-xl shadow-sm hover:shadow-md transition-all"
                  >
                    <div className="flex-1">
                      <div className="font-semibold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <span>{manager.firstName} {manager.lastName}</span>
                        {isSelf && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
                            You
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-zinc-500 dark:text-zinc-400">
                        {manager.email}
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 flex items-center gap-1">
                          <ShieldCheck className="w-3 h-3" />
                          Call Centre Manager
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                          Role: {manager.role}
                        </span>
                      </div>
                    </div>

                    {canManageCallAgents && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isSelf || callManagers.length <= 1}
                        onClick={() => handleRemoveManager(String(manager._id))}
                        className="gap-1.5 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-40"
                        title={isSelf ? "You cannot remove yourself as a manager" : callManagers.length <= 1 ? "Cannot remove sole remaining manager" : "Remove Call Manager"}
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove Manager
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ADD AGENT / MANAGER MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in-50">
          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl w-full max-w-lg space-y-4 shadow-2xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {activeTab === "agents" ? (
                  <>
                    <UserCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Add Call Agent
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                    Add Call Centre Manager
                  </>
                )}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseModal}
                className="h-8 w-8 p-0 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {activeTab === "agents"
                ? "Select an expert, moderator, or PAE expert user to grant call agent assignment."
                : "Select an admin user to grant Call Centre Manager authority."}
            </p>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <Input
                placeholder="Search candidates by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 bg-zinc-50 dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
              />
            </div>

            <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
              {(activeTab === "agents" ? filteredAgentCandidates : filteredManagerCandidates).length === 0 ? (
                <div className="text-center py-8 text-zinc-500 dark:text-zinc-400 text-sm">
                  {search ? "No eligible candidates match your search" : "No candidates available for assignment"}
                </div>
              ) : (
                (activeTab === "agents" ? filteredAgentCandidates : filteredManagerCandidates).map((u) => {
                  const isSelected = selectedUserId === String(u._id);
                  return (
                    <div
                      key={u._id}
                      className={`flex items-center justify-between p-3 rounded-xl cursor-pointer transition-all border ${
                        isSelected
                          ? "bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500/50"
                          : "bg-zinc-50/50 dark:bg-zinc-950/40 border-zinc-200/60 dark:border-zinc-800/60 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                      }`}
                      onClick={() => handleToggleSelection(String(u._id))}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className={`flex items-center justify-center w-5 h-5 rounded-full border transition-colors ${
                            isSelected
                              ? "border-indigo-600 bg-indigo-600 text-white"
                              : "border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">
                            {u.firstName} {u.lastName}
                          </div>
                          <div className="text-xs text-zinc-500 dark:text-zinc-400">
                            {u.email}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 font-medium">
                        {u.role}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
              <Button
                variant="outline"
                onClick={handleCloseModal}
                className="flex-1"
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmAdd}
                className="flex-1 gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20"
                disabled={!selectedUserId || isSubmitting}
              >
                {isSubmitting ? (
                  <>Assigning...</>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Confirm Assignment
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
