import { useState } from "react";
import { useUserDetails } from "../hooks/useUserDetails";
import { useDashboardData } from "../hooks/useDashboardData"
import { X } from "lucide-react";

interface MissingDemographicsModalProps {
  fieldTitle: string;
  fieldKey: string;
  onClose: () => void;
}

export function MissingDemographicsModal({
  fieldTitle,
  fieldKey,
  onClose,
}: MissingDemographicsModalProps) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const limit = 10;
  
  const { source, userType } = useDashboardData();

  const { data, isLoading } = useUserDetails(
    undefined, // startDate
    undefined, // endDate
    page,
    limit,
    search,
    source,
    "", // crop
    "", // village
    "all", // profileCompleted
    false, // inactiveOnly
    false, // lowFeedbackOnly
    userType,
    "name", // sortBy
    "asc", // sortOrder
    false, // activeTodayByProfile
    fieldKey // missingDemographicField
  );

  const users = data?.users || [];
  const totalPages = data?.totalPages || 1;
  const totalUsers = data?.totalUsers || 0;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-lg shadow-2xl max-w-4xl w-full p-6 relative flex flex-col max-h-[90vh]"
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

        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Username</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Phone Number</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Role</th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">Created At</th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No users found.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.userId} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20">
                    <td className="px-4 py-3">
                      {user.name}
                    </td>
                    <td className="px-4 py-3">{user.farmerProfile?.phoneNo || "-"}</td>
                    <td className="px-4 py-3 capitalize">{user.role}</td>
                    <td className="px-4 py-3">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "-"}
                    </td>
                  </tr>
                ))
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
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-800"
              >
                Previous
              </button>
              <button
                disabled={page === totalPages}
                onClick={() => setPage(p => p + 1)}
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
