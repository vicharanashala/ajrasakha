import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { FarmerNameLink } from "./components/FarmerNameLink";
import {
  QuestionListTable,
  type QuestionListColumn,
} from "./components/QuestionListTable";

import {
  useActiveUserDetails,
  useCoordinatorsDetails,
} from "./hooks/useActiveUsersAnalytics";

interface ActiveUserDetailsModalProps {
  source: string;
  userType: string;
  district?: string;
  state?: string;
  onClose: () => void;

  type: "activeUsers" | "moderators";
}

interface ActiveUserEntry {
  userId: string;
  farmerName?: string;
  name?: string;
  email?: string;
  phoneNumber?: string;
  village?: string;
  block?: string;
  district?: string;
  state?: string;
  role?: string;
  lastActiveAt?: string;
  createdAt?: string;
}

const PAGE_SIZE = 10;

export function ActiveUserDetailsModal({
  source,
  userType,
  district,
  state,
  onClose,
  type,
}: ActiveUserDetailsModalProps) {
  const [page, setPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedRole, setSelectedRole] = useState<
    "all" | "district_coordinator" | "block_coordinator" | "village_volunteer"
  >("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // const { data, isLoading, isFetching, isError } =
  //   useActiveUserDetails({
  //     page,
  //     limit: PAGE_SIZE,
  //     source,
  //     userType,
  //     district,
  //     state,
  //     search: debouncedSearch,
  //     enabled: true,
  //   });

  const activeUsersQuery = useActiveUserDetails({
    page,
    limit: PAGE_SIZE,
    source,
    userType,
    district,
    state,
    search: debouncedSearch,
    enabled: type === "activeUsers",
  });

  const moderatorsQuery = useCoordinatorsDetails({
    page,
    limit: PAGE_SIZE,
    source,
    userType,
    district,
    state,
    search: debouncedSearch,
    enabled: type === "moderators",
  });

  const query = type === "activeUsers" ? activeUsersQuery : moderatorsQuery;

  const { data, isLoading, isFetching, isError } = query;

  // const users = data?.users ?? [];
  const total = data?.total ?? 0;

  const users = useMemo(() => {
    const allUsers = data?.users ?? [];

    if (type !== "moderators") {
      return allUsers;
    }

    if (selectedRole === "all") {
      return allUsers;
    }

    return allUsers.filter(
      (user: ActiveUserEntry) => user.role === selectedRole,
    );
  }, [data, selectedRole, type]);

  const roleLabel = (role?: string) => {
    switch (role) {
      case "district_coordinator":
        return "District Coordinator";

      case "block_coordinator":
        return "Block Coordinator";

      case "village_volunteer":
        return "Village Volunteer";

      case "FARMER":
        return "Farmer";

      case "INTERNAL":
        return "Internal";

      default:
        return role ?? "-";
    }
  };

  const columns = useMemo<QuestionListColumn<ActiveUserEntry>[]>(
    () => [
      {
        key: "farmerName",
        label: "Farmer",
        sortable: true,
        sortAccessor: (row) => row.farmerName ?? row.name ?? "",
        className: "w-[16%]",
        render: (row) => (
          <FarmerNameLink userId={row.userId}>
            {row.farmerName ?? row.name ?? "N/A"}
          </FarmerNameLink>
        ),
      },

      {
        key: "email",
        label: "Email",
        sortable: true,
        sortAccessor: (row) => row.email ?? "",
        className: "w-[18%]",
        accessor: (row) => row.email ?? "-",
      },

      {
        key: "phone",
        label: "Phone",
        sortable: true,
        sortAccessor: (row) => row.phoneNumber ?? "",
        className: "w-[12%]",
        accessor: (row) => row.phoneNumber ?? "-",
      },

      {
        key: "village",
        label: "Village",
        sortable: true,
        sortAccessor: (row) => row.village ?? "",
        className: "w-[12%]",
        accessor: (row) => row.village ?? "-",
      },

      {
        key: "block",
        label: "Block",
        sortable: true,
        sortAccessor: (row) => row.block ?? "",
        className: "w-[12%]",
        accessor: (row) => row.block ?? "-",
      },

      {
        key: "district",
        label: "District",
        sortable: true,
        sortAccessor: (row) => row.district ?? "",
        className: "w-[12%]",
        accessor: (row) => row.district ?? "-",
      },

      {
        key: "state",
        label: "State",
        sortable: true,
        sortAccessor: (row) => row.state ?? "",
        className: "w-[12%]",
        accessor: (row) => row.state ?? "-",
      },

      {
        key: "role",
        label: "Role",
        sortable: true,
        sortAccessor: (row) => row.role ?? "",
        className: "w-[220px]",
        accessor: (row) => roleLabel(row.role),
        render: (row) => (
          <span className="inline-flex rounded-full bg-muted px-3 py-1 text-xs font-medium">
            {roleLabel(row.role)}
          </span>
        ),
      },
    ],
    [],
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="flex max-h-[88vh] w-full max-w-[95vw] flex-col rounded-xl bg-white shadow-2xl dark:bg-[#1a1a1a]">
        {/* Header */}

        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2a2a2a]">
          {/* Left */}
          <div>
            <h2 className="text-base font-semibold">
              {type === "activeUsers" ? "Active Users" : "Moderators"}
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {state
                ? district
                  ? `${type === "activeUsers" ? "Active users" : "Moderators"} in ${district}, ${state}`
                  : `${type === "activeUsers" ? "Active users" : "Moderators"} in ${state}`
                : `${type === "activeUsers" ? "Active users" : "Moderators"} across India`}
            </p>
          </div>

          {/* Right */}
          <div className="flex items-center gap-3">
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search name/email..."
              className="w-72 rounded-md border px-3 py-2 text-sm"
            />

            {type === "moderators" && (
              <div className="flex rounded-lg bg-muted p-1">
                {[
                  {
                    label: "All",
                    value: "all",
                  },
                  {
                    label: "District",
                    value: "district_coordinator",
                  },
                  {
                    label: "Block",
                    value: "block_coordinator",
                  },
                  {
                    label: "Village",
                    value: "village_volunteer",
                  },
                ].map((tab) => (
                  <button
                    key={tab.value}
                    onClick={() => setSelectedRole(tab.value as any)}
                    className={`rounded-md px-4 py-2 text-sm font-medium transition-all
            ${
              selectedRole === tab.value
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )}

            <button
              onClick={onClose}
              className="rounded p-2 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Table */}

        <QuestionListTable
          data={users}
          columns={columns}
          loading={isLoading}
          loadingMessage={
            type === "activeUsers"
              ? "Loading active users..."
              : "Loading moderators..."
          }
          emptyMessage={
            type === "activeUsers"
              ? "No active users found."
              : "No moderators found."
          }
          error={
            isError
              ? type === "activeUsers"
                ? "Failed to load active users."
                : "Failed to load moderators."
              : undefined
          }
          getRowKey={(row) => row.userId}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total,
            onPageChange: setPage,
          }}
          initialSortKey="lastActiveAt"
          initialSortDirection="desc"
        />

        {/* Footer */}

        <div className="flex shrink-0 items-center justify-between border-t border-gray-100 px-6 py-3 text-xs text-gray-400 dark:border-[#2a2a2a]">
          <span>
            {isFetching && !isLoading
              ? "Refreshing..."
              : `${total} ${
                  type === "activeUsers" ? "active users" : "moderators"
                }`}
          </span>

          <span>
            Showing {users.length} of {total}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
