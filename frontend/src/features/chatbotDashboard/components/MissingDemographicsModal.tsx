import { useState } from "react";
import { useUserDetails } from "../hooks/useUserDetails";
import { useUpdateUser } from "../hooks/useUpdateUser"; 
import { X, Pencil, Check, Loader2 } from "lucide-react";
import { FarmerNameLink } from "./FarmerNameLink";

interface MissingDemographicsModalProps {
  fieldTitle: string;
  fieldKey: string;
  source: "vicharanashala" | "annam" | "whatsapp";
  userType: "all" | "external" | "internal";
  onClose: () => void;
}

export function MissingDemographicsModal({
  fieldTitle,
  fieldKey,
  source,
  userType,
  onClose,
}: MissingDemographicsModalProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const limit = 10;
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);

  const updateUserMutation = useUpdateUser(); 
  const { data, isLoading, refetch } = useUserDetails(
    undefined, // startDate
    undefined, // endDate
    page,
    limit,
    search,
    source,
    "", // crop
    [], // primaryCrops
    [], // secondaryCrops
    "", // village
    "", // state
    "", // district
    "", // block
    "all", // profileCompleted
    false, // inactiveOnly
    false, // lowFeedbackOnly
    userType,
    [], // roles
    "name", // sortBy
    "asc", // sortOrder
    false, // activeTodayByProfile
    fieldKey, // missingDemographicField
    "verified",
  );

  const users = data?.users || [];
  const totalPages = data?.totalPages || 1;
  const totalUsers = data?.totalUsers || 0;

  const startEdit = (user: any) => {
    setEditingUserId(user.userId);
    setEditValue("");
    setSaveError(null);
  };

  const cancelEdit = () => {
    setEditingUserId(null);
    setEditValue("");
    setSaveError(null);
  };

  const handleSave = async (userId: string) => {
    setSaveError(null);

    let payloadValue: any;

    if (fieldKey === "gender") {
      if (!editValue.trim()) {
        setSaveError("Please select a gender");
        return;
      }
      payloadValue = editValue.trim();
    } else {
      const num = Number(editValue);
      if (isNaN(num) || num < 0) {
        setSaveError("Please enter a valid non-negative number");
        return;
      }
      payloadValue = fieldKey === "landhold" ? parseFloat(num.toFixed(2)) : num;
    }

    try {
      await updateUserMutation.mutateAsync({
        userId,
        source,
        data: {
          farmerProfile: {
            [fieldKey]: payloadValue,
          },
        },
      });
      setEditingUserId(null);
      setEditValue("");
      refetch?.();
    } catch (err: any) {
      setSaveError(err?.message || "Failed to update user");
    }
  };

  const renderEditInput = () => {
    const baseClass =
      "w-full px-2 py-1.5 text-sm border rounded-md dark:bg-gray-800 dark:border-gray-700 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/50";

    if (fieldKey === "gender") {
      return (
        <select
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            setSaveError(null);
          }}
          className={baseClass}
          disabled={updateUserMutation.isPending}
        >
          <option value="">Select gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
          <option value="Others">Others</option>
        </select>
      );
    }

    return (
      <input
        type="number"
        min={0}
        step={fieldKey === "landhold" ? "0.01" : "1"}
        value={editValue}
        onChange={(e) => {
          setEditValue(e.target.value);
          setSaveError(null);
        }}
        className={baseClass}
        placeholder={`Enter ${fieldTitle.toLowerCase()}`}
        disabled={updateUserMutation.isPending}
      />
    );
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-5xl w-full p-6 relative flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          title="Close"
        >
          <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        </button>

        <div className="mb-4 pr-12">
          <h3 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
            Users Missing {fieldTitle}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Total {totalUsers} users have not provided this information.
          </p>
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search users..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full max-w-sm px-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
          />
        </div>

        {saveError && (
          <div className="mb-3 px-3 py-2 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 rounded-md">
            {saveError}
          </div>
        )}

        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Name</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Email</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Phone Number</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 min-w-[160px]">{fieldTitle}</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Created At</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 text-right w-[100px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => {
                  const isEditing = editingUserId === user.userId;

                  return (
                    <tr
                      key={user.userId}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
                    >
                      <td className="px-4 py-3 font-medium">
                        <FarmerNameLink userId={user.userId}>
                          {user.name || user.farmerProfile?.farmerName || "Not provided"}
                        </FarmerNameLink>
                      </td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        {user.farmerProfile?.phoneNo || "-"}
                      </td>
                      <td className="px-4 py-3 min-w-[160px]">
                        {isEditing ? (
                          <div className="space-y-1">{renderEditInput()}</div>
                        ) : (
                          <span className="text-gray-400 italic text-xs">
                            Not provided
                          </span>
                        )}
                      </td>
                    <td className="px-4 py-3">
                      {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString()
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleSave(user.userId)}
                              disabled={updateUserMutation.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-green-50 text-green-700 hover:bg-green-100 dark:bg-green-900/20 dark:text-green-400 dark:hover:bg-green-900/30 transition-colors disabled:opacity-50"
                            >
                              {updateUserMutation.isPending ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Check className="w-3.5 h-3.5" />
                              )}
                              {updateUserMutation.isPending ? "Saving..." : "Save"}
                            </button>
                            <button
                              onClick={cancelEdit}
                              disabled={updateUserMutation.isPending}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                            >
                              <X className="w-3.5 h-3.5" />
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => startEdit(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-primary/5 text-primary hover:bg-primary/10 transition-colors"
                            title={`Edit ${fieldTitle}`}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            Edit
                          </button>
                        )}
                    </td>
                  </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-gray-500">
              Page {page} of {totalPages}
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
