
import { Badge } from "./atoms/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";
import { Input } from "./atoms/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./atoms/select";
import { Search, RefreshCw, X, RefreshCcw } from "lucide-react";
import { Pagination } from "./pagination";
import type { UserRole } from "@/types";
import { Button } from "./atoms/button";

const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

const formatDate = (d?: string | Date) => {
  const date = typeof d === "string" ? new Date(d) : d;
  return date
    ? new Intl.DateTimeFormat(undefined, {
        year: "numeric",
        month: "short",
        day: "2-digit",
      }).format(date)
    : "";
};

export type IUserRow = {
  _id: string;
  name: string;
  email: string;
  // role: UserRole;
  role:string;
  reputationScore: number;
  currentRank: string;
  updatedAt: string;
};

type UsersTableProps = {
  items?: IUserRow[] | null;
  currentPage: number;
  setCurrentPage: (val: number) => void;
  isLoading?: boolean;
  totalPages: number;
};

export const UsersTable = ({
  items,
  currentPage,
  setCurrentPage,
  isLoading,
  totalPages,
}: UsersTableProps) => {
  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh]">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-center">Sl.No</TableHead>
              <TableHead className="w-[20%] text-center">Name</TableHead>
              <TableHead className="w-[25%] text-center">Email</TableHead>
              <TableHead className="text-center">Role</TableHead>
              <TableHead className="text-center">Reputation Score</TableHead>
              <TableHead className="text-center">Current Rank</TableHead>
              <TableHead className="text-center">Updated At</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10">
                  <RefreshCcw className="animate-spin w-6 h-6 mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : items?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={7}
                  rowSpan={7}
                  className="text-center py-10 text-muted-foreground"
                >
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              items?.map((u, idx) => (
                <TableRow key={u._id} className="text-center">
                  <TableCell
                    className="align-middle text-center"
                    title={idx.toString()}
                  >
                    {(currentPage - 1) * 12 + idx + 1}
                  </TableCell>
                  <TableCell className="text-start ps-3 w-[20%] align-middle" title={u.name}>
                    {truncate(u.name, 40)}
                  </TableCell>
                  <TableCell className="text-start ps-3 w-[25%] align-middle" title={u.email}>
                    {truncate(u.email, 50)}
                  </TableCell>
                  <TableCell className="align-middle">
                    <Badge variant="outline">
                      {u.role.charAt(0).toUpperCase() + u.role.slice(1)}
                    </Badge>
                  </TableCell>
                  <TableCell className="align-middle">
                    {u.reputationScore}
                  </TableCell>
                  <TableCell className="align-middle">
                    <Badge variant="secondary">{u.currentRank}</Badge>
                  </TableCell>
                  <TableCell className="align-middle">
                    {formatDate(u.updatedAt)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        onPageChange={(page) => setCurrentPage(page)}
      />
    </div>
  );
};

type UsersFiltersProps = {
  search: string;
  setSearch: (val: string) => void;
  roleFilter: "all" | UserRole;
  setRoleFilter: (val: "all" | UserRole) => void;
  totalUsers: number;
  onReset: () => void;
};

export const UsersFilters = ({
  search,
  setSearch,
  roleFilter,
  setRoleFilter,
  totalUsers,
  onReset,
}: UsersFiltersProps) => {
  const handleReset = () => {
    setSearch("");
    setRoleFilter("all");
    onReset();
  };

  return (
    <div className="flex flex-wrap items-center justify-between w-full p-4 gap-3 border-b bg-card rounded">
      <div className="flex-1 min-w-[200px] max-w-[400px]">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users by name, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 pr-9 bg-background"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-end w-full sm:w-auto">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-muted-foreground">Role:</label>
          <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v as "all" | UserRole)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="expert">Expert</SelectItem>
              <SelectItem value="moderator">Moderator</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="icon"
          className="flex-none w-12 p-3 sm:w-auto"
          onClick={handleReset}
        >
          <RefreshCw className="h-4 w-4" />
        </Button>

        <span className="ml-4 text-sm text-muted-foreground">
          Total Users: {totalUsers}
        </span>
      </div>
    </div>
  );
};