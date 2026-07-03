import { Loader2 } from "lucide-react";
import { useUserDetails } from "../hooks/useUserDetails";
import { FarmerNameLink } from "./FarmerNameLink";

interface ActiveFarmersTableProps {
  source: string;
  userType: string;
}

export function ActiveFarmersTable({
  source = "vicharanashala",
  userType = "all",
}: ActiveFarmersTableProps) {
  // Get today's start and end date
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const { data, isLoading, error } = useUserDetails(
    todayStart,
    todayEnd,
    1,
    100, // Fetch up to 100 users for today
    '',
    source as any,
    '',
    [],
    [],
    '',
    '',
    '',
    '',
    'all',
    false,
    false,
    userType as any,
    [],
    'totalQuestions',
    'desc',
    true // activeTodayByProfile
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-24 border border-gray-200 dark:border-gray-700 rounded-lg">
        <Loader2 className="w-4 h-4 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-xs text-red-500 dark:text-red-400 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-gray-200 dark:border-gray-700">
        {error.message}
      </div>
    );
  }

  const activeUsersToday = data?.users.filter((u) => u.totalQuestions > 0) || [];

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-48 overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0 z-10">
          <tr>
            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Active Farmer Name (Today)
            </th>
            <th className="px-3 py-2 text-left font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Email
            </th>
            <th className="px-3 py-2 text-right font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
              Total Queries Today
            </th>
          </tr>
        </thead>
        <tbody>
          {activeUsersToday.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-3 py-2 text-center text-gray-500">
                No active farmers today
              </td>
            </tr>
          ) : (
            activeUsersToday.map((user) => (
              <tr
                key={user.userId}
                className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td className="px-3 py-2 whitespace-nowrap truncate max-w-[150px]" title={user.name}>
                  <FarmerNameLink
                    userId={user.userId}
                    className="font-medium"
                  >
                    {user.name}
                  </FarmerNameLink>
                </td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 whitespace-nowrap truncate max-w-[150px]" title={user.email}>
                  {user.email || 'N/A'}
                </td>
                <td className="px-3 py-2 text-right font-medium text-gray-900 dark:text-gray-100">
                  {user.totalQuestions.toLocaleString()}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
