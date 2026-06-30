import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { FarmerNameLink } from "./components/FarmerNameLink";
import {
  QuestionListTable,
  type QuestionListColumn,
} from "./components/QuestionListTable";


import { useActiveUserDetails } from "./hooks/useActiveUsersAnalytics";

interface ActiveUserDetailsModalProps {
  source: string;
  userType: string;
  district?: string;
  state?: string;
  onClose: () => void;
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
}: ActiveUserDetailsModalProps) {
  const [page, setPage] = useState(1);

  const [searchTerm, setSearchTerm] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setPage(1);
    }, 500);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const { data, isLoading, isFetching, isError } =
    useActiveUserDetails({
      page,
      limit: PAGE_SIZE,
      source,
      userType,
      district,
      state,
      search: debouncedSearch,
      enabled: true,
    });

  const users = data?.users ?? [];
  const total = data?.total ?? 0;

  const columns = useMemo<
    QuestionListColumn<ActiveUserEntry>[]
  >(
    () => [
      {
        key: "farmerName",
        label: "Farmer",
        sortable: true,
        sortAccessor: (row) =>
          row.farmerName ?? row.name ?? "",
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
        sortAccessor: (row) =>
          row.phoneNumber ?? "",
        className: "w-[12%]",
        accessor: (row) =>
          row.phoneNumber ?? "-",
      },

      {
        key: "village",
        label: "Village",
        sortable: true,
        sortAccessor: (row) =>
          row.village ?? "",
        className: "w-[12%]",
        accessor: (row) =>
          row.village ?? "-",
      },

      {
        key: "block",
        label: "Block",
        sortable: true,
        sortAccessor: (row) =>
          row.block ?? "",
        className: "w-[12%]",
        accessor: (row) =>
          row.block ?? "-",
      },

      {
        key: "district",
        label: "District",
        sortable: true,
        sortAccessor: (row) =>
          row.district ?? "",
        className: "w-[12%]",
        accessor: (row) =>
          row.district ?? "-",
      },

      {
        key: "state",
        label: "State",
        sortable: true,
        sortAccessor: (row) =>
          row.state ?? "",
        className: "w-[12%]",
        accessor: (row) =>
          row.state ?? "-",
      },

      {
        key: "role",
        label: "Role",
        sortable: true,
        sortAccessor: (row) =>
          row.role ?? "",
        className: "w-[10%]",
        accessor: (row) =>
          row.role ?? "-",
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
      <div className="flex max-h-[88vh] w-full max-w-7xl flex-col rounded-xl bg-white shadow-2xl dark:bg-[#1a1a1a]">
        {/* Header */}

        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-6 py-4 dark:border-[#2a2a2a]">
          <div>
            <h2 className="text-base font-semibold">
              Active Users
            </h2>

            <p className="mt-1 text-xs text-gray-500">
              {state
                ? district
                  ? `Active users in ${district}, ${state}`
                  : `Active users in ${state}`
                : "Active users across India"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <input
              value={searchTerm}
              onChange={(e) =>
                setSearchTerm(e.target.value)
              }
              placeholder="Search name/email..."
              className="w-64 rounded-md border px-3 py-2 text-sm"
            />

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
          loadingMessage="Loading active users..."
          error={
            isError
              ? "Failed to load active users."
              : undefined
          }
          emptyMessage="No active users found."
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
              : `${total} active user${total !== 1 ? "s" : ""}`}
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