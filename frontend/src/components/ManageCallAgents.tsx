import { useEffect, useState } from "react";
import type { IUser } from "@/types";
import { Button } from "./atoms/button";
import { toast } from "sonner";
import { Search, Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { Input } from "./atoms/input";
import { UserService } from "@/hooks/services/userService";

const userService = new UserService();

export const ManageCallAgents = () => {
  const [callAgents, setCallAgents] = useState<IUser[]>([]);
  const [allUsers, setAllUsers] = useState<IUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

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
    // try {
    //   // Use admin endpoint to get full user objects with all fields
    //   const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/users/admin/all?page=1&limit=100&role=ALL`, {
    //     headers: {
    //       'Authorization': `Bearer ${localStorage.getItem('token')}`,
    //     },
    //   });
    //   const data = await response.json();
    //   setAllUsers(data.users || []);
    // } catch (error: any) {
    //   toast.error(error.message || "Failed to fetch users");
    // }
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

  const handleAddAgent = async (userId: string) => {
    try {
      await userService.setCallAgentStatus(userId, true, true);
      toast.success("Call agent added successfully");
      setShowAddModal(false);
      fetchCallAgents();
    } catch (error: any) {
      toast.error(error.message || "Failed to add call agent");
    }
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      (u.role === "expert" || u.role === "moderator") &&
      !u.isCallAgent &&
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
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <Plus className="w-4 h-4" />
          Add Call Agent
        </Button>
      </div>

      {/* Call Agents List */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Active Call Agents</h2>
        {callAgents.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No call agents found. Add users to manage incoming calls.
          </div>
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
                        agent.role === "moderator"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {agent.role}
                    </span>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        agent.isCallAgentActive
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {agent.isCallAgentActive ? "Active" : "Inactive"}
                    </span>
                  </div>
                </div>
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Agent Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card p-6 rounded-lg w-full max-w-md space-y-4">
            <h2 className="text-xl font-bold">Add Call Agent</h2>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto space-y-2">
              {filteredUsers.length === 0 ? (
                <div className="text-center py-4 text-muted-foreground">
                  No users found
                </div>
              ) : (
                filteredUsers.map((u) => (
                  <div
                    key={u._id}
                    className="flex items-center justify-between p-3 hover:bg-accent rounded cursor-pointer"
                    onClick={() => handleAddAgent(String(u._id))}
                  >
                    <div>
                      <div className="font-medium">
                        {u.firstName} {u.lastName}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {u.email}
                      </div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full ${
                        u.role === "moderator"
                          ? "bg-purple-100 text-purple-700"
                          : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {u.role}
                    </span>
                  </div>
                ))
              )}
            </div>
            <Button
              variant="outline"
              onClick={() => setShowAddModal(false)}
              className="w-full"
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
