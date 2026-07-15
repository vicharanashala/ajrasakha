import { useEffect, useState } from "react";
import type { IUser } from "@/types";
import { Button } from "./atoms/button";
import { toast } from "sonner";
import { Search, Plus, Trash2, ToggleLeft, ToggleRight, Check, X, PhoneOff } from "lucide-react";
import { Input } from "./atoms/input";
import { UserService } from "@/hooks/services/userService";
import { useGetCurrentUser } from "@/hooks/api/user/useGetCurrentUser";
import { EmptyState } from "./EmptyState";

const userService = new UserService();

export const ManageCallAgents = () => {
  const [callAgents, setCallAgents] = useState<IUser[]>([]);
  const [allUsers, setAllUsers] = useState<IUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [addingAgents, setAddingAgents] = useState(false);

  const { data: currentUser } = useGetCurrentUser({ enabled: true });

  const canManageCallAgents = currentUser?.role === "admin" && !!currentUser?.Call_centre_manager;

  useEffect(() => {
    fetchCallAgents();
    fetchAllUsers();
  }, []);

  const fetchCallAgents = async () => {
    try {
      setLoading(true);
      const data = await userService.getCallAgents();
      setCallAgents(data || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch call agents");
    } finally {
      setLoading(false);
    }
  };

  const fetchAllUsers = async () => {
    try {
      const data = await userService.useGetAllExperts(1, 100, '', '', '');
      setAllUsers(data?.experts || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to fetch users");
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

  const handleToggleSelection = (userId: string) => {
    setSelectedUserId((prev) => (prev === userId ? null : userId));
  };

  const handleConfirmAddAgents = async () => {
    if (!selectedUserId) {
      toast.error("Please select a user to add as a call agent");
      return;
    }

    try {
      setAddingAgents(true);
      await userService.setCallAgentStatus(selectedUserId, true, false);
      toast.success("Call agent added successfully");

      setSelectedUserId(null);
      setShowAddModal(false);
      fetchCallAgents();
    } catch (error: any) {
      toast.error(error.message || "Failed to add call agent");
    } finally {
      setAddingAgents(false);
    }
  };

  const handleCloseModal = () => {
    setSelectedUserId(null);
    setShowAddModal(false);
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      u.role === "expert" &&
      (u.firstName?.toLowerCase().includes(search.toLowerCase()) ||
        u.lastName?.toLowerCase().includes(search.toLowerCase()) ||
        u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-muted-foreground">Loading call agents...</div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Manage Call Agents</h1>
        {canManageCallAgents && (
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Call Agent
          </Button>
        )}
      </div>

      {/* Call Agents List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Active Call Agents</h2>
        {callAgents.length === 0 ? (
          <EmptyState
            title="No call agents found"
            description="Add users to manage incoming calls."
            icon={PhoneOff}
            compact
          />
        ) : (
          <div className="grid gap-4">
            {callAgents.map((agent) => (
              <div
                key={agent._id}
                className="flex items-center justify-between p-4 bg-card border rounded-lg"
              >
                <div className="flex-1">
                  <div className="font-medium">
                    {agent.firstName} {agent.lastName}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {agent.email}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        agent.role === "call_agent"
                          ? "bg-green-100 text-green-700"
                          : agent.role === "moderator"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                        }`}
                    >
                      {agent.role}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${agent.isCallAgentActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                        }`}
                    >
                      {agent.isCallAgentActive ? "Active" : "Inactive"}
                    </span>
                    {agent.agent && agent.agent !== "not_available" && (
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                        {agent.agent}
                      </span>
                    )}
                    {agent.isBusy && (
                      <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">
                        In Call
                      </span>
                    )}
                    {agent.currentCallUuid && (
                      <span className="text-xs px-2 py-1 rounded-full bg-orange-100 text-orange-700">
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
                      className="gap-2"
                    >
                      {agent.isCallAgentActive ? (
                        <>
                          <ToggleRight className="w-4 h-4" />
                          Deactivate
                        </>
                      ) : (
                        <>
                          <ToggleLeft className="w-4 h-4" />
                          Activate
                        </>
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveAgent(String(agent._id))}
                      className="gap-2 text-destructive hover:text-destructive"
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

      {/* Add Agent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-card p-6 rounded-lg w-full max-w-lg space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold">Add Call Agents</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleCloseModal}
                className="h-8 w-8 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users by name or email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-80 overflow-y-auto space-y-2">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {search ? "No users match your search" : "No users available to add"}
                </div>
              ) : (
                filteredUsers.map((u) => {
                  const isSelected = selectedUserId === String(u._id);
                  return (
                    <div
                      key={u._id}
                      className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-all border ${isSelected
                          ? "bg-primary/10 border-primary/30 hover:bg-primary/15"
                          : "bg-card border-border hover:bg-accent hover:border-accent"
                        }`}
                      onClick={() => handleToggleSelection(String(u._id))}
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <div
                          className={`flex items-center justify-center w-5 h-5 rounded-full border transition-colors ${isSelected
                              ? "border-primary bg-background"
                              : "border-input bg-background hover:border-primary"
                            }`}
                        >
                          {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-primary" />}
                        </div>
                        <div className="flex-1">
                          <div className="font-medium">
                            {u.firstName} {u.lastName}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {u.email}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {u.role}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                onClick={handleCloseModal}
                className="flex-1"
                disabled={addingAgents}
              >
                Cancel
              </Button>
              <Button
                onClick={handleConfirmAddAgents}
                className="flex-1 gap-2"
                disabled={!selectedUserId || addingAgents}
              >
                {addingAgents ? (
                  <>Adding...</>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    Confirm
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
