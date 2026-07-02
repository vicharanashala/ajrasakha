import { useState, useMemo } from "react";
import { useUserDetails, UserDetail } from "../hooks/useUserDetails";
import { X, Search, Filter } from "lucide-react";
import { FarmerNameLink } from "./FarmerNameLink";

interface UsersListModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  source: "vicharanashala" | "annam" | "whatsapp";
  userType: "all" | "external" | "internal";
  
  // Dynamic field configuration
  dynamicFieldLabel: string;
  dynamicFieldKey: string;
  filterOptions?: string[];
  initialFilterValue?: string;
}

export function UsersListModal({
  isOpen,
  onClose,
  title,
  source,
  userType,
  dynamicFieldLabel,
  dynamicFieldKey,
  filterOptions = [],
  initialFilterValue = "",
}: UsersListModalProps) {
  const [page, setPage] = useState(1);
  const limit = 10;
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "createdAt" | "email">("name");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [filterValue, setFilterValue] = useState(initialFilterValue);

  // We fetch users from the backend
  // Note: the backend might need to be updated to support demographic filters directly.
  // For now, we fetch all and can optionally apply frontend filtering if needed, 
  // though pagination makes frontend filtering tricky. 
  // We'll pass the standard parameters.
  const { data, isLoading } = useUserDetails(
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
    sortBy,
    sortOrder,
  );

  const rawUsers = data?.users || [];
  const totalPages = data?.totalPages || 1;
  const totalUsers = data?.totalUsers || 0;

  // Frontend fallback filtering for the dynamic field, in case backend doesn't filter it yet
  const users = useMemo(() => {
    if (!filterValue) return rawUsers;
    return rawUsers.filter((u) => {
      let val: any = undefined;
      if (dynamicFieldKey === 'platform') {
        val = u.farmerProfile?.platform;
      } else {
        val = (u.farmerProfile as any)?.[dynamicFieldKey];
      }
      return String(val).toLowerCase() === filterValue.toLowerCase();
    });
  }, [rawUsers, filterValue, dynamicFieldKey]);

  if (!isOpen) return null;

  const handleSort = (field: "name" | "createdAt" | "email") => {
    if (sortBy === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortBy(field);
      setSortOrder("asc");
    }
  };

  const renderSortIndicator = (field: string) => {
    if (sortBy !== field) return null;
    return <span className="ml-1">{sortOrder === "asc" ? "↑" : "↓"}</span>;
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
            {title}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Showing users matching the criteria (Total: {totalUsers})
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white"
            />
          </div>

          {filterOptions.length > 0 && (
            <div className="relative min-w-[200px]">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <select
                value={filterValue}
                onChange={(e) => {
                  setFilterValue(e.target.value);
                  setPage(1);
                }}
                className="w-full pl-9 pr-3 py-2 border rounded-md text-sm dark:bg-gray-800 dark:border-gray-700 dark:text-white appearance-none"
              >
                <option value="">All {dynamicFieldLabel}s</option>
                {filterOptions.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto border rounded-md">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 dark:bg-gray-800/50 sticky top-0 z-10">
              <tr>
                <th
                  className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => handleSort("name")}
                >
                  Name {renderSortIndicator("name")}
                </th>
                <th
                  className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => handleSort("email")}
                >
                  Email {renderSortIndicator("email")}
                </th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400">
                  Phone Number
                </th>
                <th className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 min-w-[120px]">
                  {dynamicFieldLabel}
                </th>
                <th
                  className="px-4 py-3 font-medium text-gray-500 dark:text-gray-400 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  onClick={() => handleSort("createdAt")}
                >
                  Created At {renderSortIndicator("createdAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y dark:divide-gray-800">
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    Loading users...
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                    No users found matching the criteria.
                  </td>
                </tr>
              ) : (
                users.map((user: UserDetail) => {
                  let dynamicValue: any = "-";
                  if (dynamicFieldKey === 'platform') {
                    dynamicValue = user.farmerProfile?.platform || "-";
                  } else {
                    dynamicValue = (user.farmerProfile as any)?.[dynamicFieldKey] ?? "-";
                  }

                  return (
                    <tr
                      key={user.userId}
                      className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20"
                    >
                      <td className="px-4 py-3 font-medium">
                        <FarmerNameLink userId={user.userId}>
                          {user.name || user.farmerProfile?.farmerName || "Unknown"}
                        </FarmerNameLink>
                      </td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        {user.farmerProfile?.phoneNo || "-"}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-700 dark:text-gray-300">
                        {dynamicValue}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                        {user.createdAt
                          ? new Date(user.createdAt).toLocaleDateString()
                          : "-"}
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
