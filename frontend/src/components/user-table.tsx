import { Badge } from "./atoms/badge";
import { Button } from "./atoms/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./atoms/table";

import { Eye, Loader2, Lock, MoreVertical, Trash, Unlock, Gavel } from "lucide-react";

import { Pagination } from "./pagination";
import type { IUser, UserRole } from "@/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./atoms/dropdown-menu";
import { ConfirmationModal } from "./confirmation-modal";
import { formatDate } from "@/utils/formatDate";
import { useState } from "react";
import { useBlockUser } from "@/hooks/api/user/useBlockUser";
import { useSwitchRoleToModerator } from "@/hooks/api/user/useSwitchRoleToModerator";

import { useNavigateToExpertDashboard } from "@/hooks/api/question/useNavigateToQuestion";

const truncate = (s: string, n = 80) => {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
};

type UserTableProps = {
  items?: IUser[] | null;
  onViewMore: (userId: string) => void;
  currentPage: number;
  setCurrentPage: (val: number) => void;
  isLoading?: boolean;
  totalPages: number;
  limit: number;
  sort: string;
  onSort: (key: string) => void;
  userRole?: UserRole;
  setSelectExpertId?: (userId: string) => void;
  setRankPosition?: (rank: number) => void;
};

export const UsersTable = ({
  items,
  onViewMore,
  limit,
  sort,
  onSort,
  currentPage,
  setCurrentPage,
  userRole,
  isLoading,
  totalPages,
  setSelectExpertId,
  setRankPosition,
}: UserTableProps) => {
  const [userIdToBlock, setUserIdToBlock] = useState<string>("");
  const [isCurrentlyBlocked, setIsCurrentlyBlocked] = useState<boolean>(false);
  const { mutate: blockExpert } = useBlockUser();
  const { mutate: switchRoleToModerator } = useSwitchRoleToModerator();
  const handleBlock = async () => {
    console.log("reacej block");
    const action = isCurrentlyBlocked ? "unblock " : "block";
    blockExpert({ userId: userIdToBlock, action: action });
  };
  const handleSwitchRole = (userId: string) => {
  switchRoleToModerator(userId);
};

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh]">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-center w-12">Rank</TableHead>
              <TableHead className="w-[35%] text-center w-52">
                Full Name
              </TableHead>
              <TableHead className="text-center w-52">Email</TableHead>
              <TableHead className="text-center w-32">State</TableHead>
              <TableHead className="text-center w-24">
                <button
                  onClick={() => onSort("workload")}
                  className="flex items-center gap-1 mx-auto select-none"
                >
                  Pending Workload
                  {sort === "workload_asc" && (
                    <span className="text-sm font-medium">↑</span>
                  )}
                  {sort === "workload_desc" && (
                    <span className="text-sm font-medium">↓</span>
                  )}
                </button>
              </TableHead>
              <TableHead className="text-center w-24">
                <button
                  onClick={() => onSort("incentive")}
                  className="flex items-center gap-1 mx-auto select-none"
                >
                  Incentive
                  {sort === "incentive_asc" && (
                    <span className="text-sm font-medium">↑</span>
                  )}
                  {sort === "incentive_desc" && (
                    <span className="text-sm font-medium">↓</span>
                  )}
                </button>
              </TableHead>
              <TableHead className="text-center w-24">
                <button
                  onClick={() => onSort("penalty")}
                  className="flex items-center gap-1 mx-auto select-none"
                >
                  Penalty
                  {sort === "penalty_asc" && (
                    <span className="text-sm font-medium">↑</span>
                  )}
                  {sort === "penalty_desc" && (
                    <span className="text-sm font-medium">↓</span>
                  )}
                </button>
              </TableHead>
              <TableHead className="text-center w-24">Total Answered</TableHead>
              {/* <TableHead className="text-center w-24">Rank</TableHead> */}
              <TableHead className="text-center w-24">
                <button
                  onClick={() => onSort("joined")}
                  className="flex items-center gap-1 mx-auto select-none"
                >
                  Joined At
                  {sort === "joined_asc" && (
                    <span className="text-sm font-medium">↑</span>
                  )}
                  {sort === "joined_desc" && (
                    <span className="text-sm font-medium">↓</span>
                  )}
                </button>
              </TableHead>
              <TableHead className="text-center w-24">Status</TableHead>
              <TableHead className="text-center w-24">Action</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={10} className="text-center py-10">
                  <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : items?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  rowSpan={10}
                  className="text-center py-10 text-muted-foreground"
                >
                  No users found
                </TableCell>
              </TableRow>
            ) : (
              items?.map((u, idx) => (
                <UserRow
                  currentPage={currentPage}
                  handleBlock={handleBlock}
                  handleSwitchRole={handleSwitchRole}
                  idx={idx}
                  onViewMore={onViewMore}
                  u={u}
                  limit={limit}
                  totalPages={totalPages}
                  setUserIdToBlock={setUserIdToBlock}
                  setIsCurrentlyBlocked={setIsCurrentlyBlocked}
                  userRole={userRole!}
                  key={String(u._id)}
                  setSelectExpertId={setSelectExpertId}
                  setRankPosition={setRankPosition}
                />
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

interface UserRowProps {
  u: IUser;
  idx: number;
  currentPage: number;
  limit: number;
  totalPages: number;
  userRole: UserRole;
  setUserIdToBlock: (id: string) => void;
  setIsCurrentlyBlocked: (value: boolean) => void;
  handleBlock: () => Promise<void>;
  handleSwitchRole: (userId: string) => void;
  onViewMore: (id: string) => void;
  setSelectExpertId?: (id: string) => void;
  setRankPosition?: (rank: number) => void;
}

const UserRow: React.FC<UserRowProps> = ({
  u,
  idx,
  currentPage,
  limit,
  handleBlock,
  handleSwitchRole,
  setUserIdToBlock,
  setIsCurrentlyBlocked,
  setSelectExpertId,
  setRankPosition,
}) => {
  const isBlocked = u.isBlocked || false;

  //expert block/unblock modal state
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const { goToExpertDashboard } = useNavigateToExpertDashboard();
  const handleExpertClick = async (userdetails: any) => {
    if (userdetails) {
      setSelectExpertId?.(userdetails._id);
      setRankPosition?.(userdetails.rankPosition); // ✅ safe call
      return;

      // goToExpertDashboard(userId); // enitity_id is questionId
      return;
    }
  };
  return (
    <TableRow key={String(u._id)} className="text-center">
      {/* Serial Number */}
      {/* <TableCell className="align-middle w-12" title={idx.toString()}>
        {(currentPage - 1) * limit + idx + 1}
      </TableCell> */}

      <TableCell className="align-middle w-12" title={idx.toString()}>
        {u.rankPosition && u.rankPosition <= 3 ? (
          <span
            className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm border-2 ${
              u.rankPosition === 1
                ? `
    relative overflow-hidden
    bg-yellow-50 dark:bg-yellow-950
    border-yellow-400 dark:border-yellow-600
    text-yellow-900 dark:text-yellow-100

    shadow-[0_0_12px_rgba(250,204,21,0.35)]

    before:absolute before:inset-0 before:rounded-full
    before:bg-gradient-to-t
    before:from-white/10
    before:via-white/30
    before:to-transparent
    before:pointer-events-none
    `
                : u.rankPosition === 2
                ? "bg-slate-50 dark:bg-slate-900 border-slate-400 dark:border-slate-500 text-slate-900 dark:text-slate-100"
                : "bg-orange-50 dark:bg-amber-900/40 border-orange-400 dark:border-amber-500 text-orange-900 dark:text-amber-200"
            }`}
          >
            {u.rankPosition}
          </span>
        ) : (
          <span className="inline-flex items-center justify-center w-8 h-8 text-sm text-muted-foreground">
            #{u.rankPosition || "—"}
          </span>
        )}
      </TableCell>

      {/* User name */}
      <TableCell className="align-middle w-36" title={u.firstName}>
        <div>
          <span
            className={"hover:underline hover:cursor-pointer"}
            onClick={() => {
              handleExpertClick(u);
            }}
          >
            {truncate(u.firstName + " " + u.lastName, 60)}
          </span>
        </div>
      </TableCell>

      {/* Email */}
      <TableCell className="align-middle w-64">
        {truncate(u.email, 60)}
      </TableCell>

      {/* State */}
      <TableCell className="align-middle w-32">
        {u.preference?.state && u.preference?.state == "all"
          ? "Not Specified"
          : truncate(u.preference?.state!, 20)}
      </TableCell>

      {/* Workload */}
      <TableCell className="align-middle w-32">
        <Badge variant="outline">{u.reputation_score + ""}</Badge>
      </TableCell>

      {/* Incentive */}
      <TableCell className="align-middle w-32">
        <Badge variant="outline">{u.incentive || 0}</Badge>
      </TableCell>

      {/* Penalty */}
      <TableCell className="align-middle w-32">
        {/* {u.penalty || 0}} */}
        <Badge variant="outline">{u.penaltyPercentage?.toFixed(0) || 0}%</Badge>
      </TableCell>

      {/* total_answers_creted */}
      <TableCell className="align-middle w-32">
        {/* {u.totalAnswers_Created || 0} */}
        <Badge variant="outline">{u.totalAnswers_Created || 0}</Badge>
      </TableCell>
      {/* Rank */}
      {/* <TableCell className="align-middle w-32"> */}
      {/* {u.totalAnswers_Created || 0} */}
      {/* <Badge variant="outline">{u.rankPosition || 0}</Badge> */}
      {/* </TableCell> */}

      {/* Created At */}
      <TableCell className="align-middle w-32">
        {formatDate(new Date(u.createdAt!), false)}
      </TableCell>

      {/* Blocked Status */}
      <TableCell className="align-middle w-32">
        <div className="flex justify-center items-center">
          {u.isBlocked ? (
            <Lock className="text-red-500 w-5 h-5" />
          ) : (
            <Unlock className="text-green-500 w-5 h-5" />
          )}
        </div>
      </TableCell>

      {/* Actions */}
      <TableCell className="align-middle w-32">
        <div className="flex justify-center">
          <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="p-1">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-44">
              {/* <DropdownMenuItem
                onClick={() => onViewMore(u._id?.toString() || "")}
                className="hover:bg-primary/10"
              >
                <Eye className="w-4 h-4 mr-2 text-primary" />
                View
              </DropdownMenuItem> */}

              {/* <DropdownMenuSeparator /> */}

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setUserIdToBlock(u._id!);
                  setIsCurrentlyBlocked(isBlocked!);
                  setIsOpen(false);
                  setIsConfirmOpen(true);
                }}
              >
                <button className="flex justify-center items-center gap-2">
                  <Trash className="w-4 h-4 mr-2 text-red-500" />
                  {isBlocked ? "Unblock" : "Block"}
                </button>
              </DropdownMenuItem>
              {/* Switch role from expert to moderator */}
              <DropdownMenuItem
    onSelect={(e) => {
      e.preventDefault();
      setIsOpen(false);
      handleSwitchRole(u._id!);
    }}
  >
    <div className="flex items-center gap-2">
      <Gavel className="w-4 h-4 text-blue-500" />
      Switch Role
    </div>
  </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmationModal
            open={isConfirmOpen}
            onOpenChange={setIsConfirmOpen}
            title={isBlocked ? "Unblock the User?" : "Block the User?"}
            description={
              isBlocked
                ? "This will restore the expert’s access to the review system and allow them to participate in reviews again. Are you sure you want to unblock this user?"
                : "Blocking this expert will restrict their access to the review system until they are unblocked. Once blocked, they will no longer be able to review, submit answers, or perform any actions within the platform. They will also be excluded from all current and future allocations. Are you sure you want to proceed?"
            }
            confirmText={isBlocked ? "Unblock" : "Block"}
            cancelText="Cancel"
            type={isBlocked ? "default" : "delete"}
            onConfirm={() => {
              handleBlock();
              setIsConfirmOpen(false);
            }}
          />
        </div>
      </TableCell>
    </TableRow>
  );
};
