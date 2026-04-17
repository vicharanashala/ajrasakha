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

import {
  Eye,
  Loader2,
  Lock,
  MoreVertical,
  Trash,
  Unlock,
  Gavel,
  Zap,
  ShieldCheck,
} from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "./atoms/tooltip";

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
import { useToggleRole } from "@/hooks/api/user/useToggleRole";
import { useUpdateActivity } from "@/hooks/api/user/useUpdateActivity";
import AvatarComponent from "./avatar-component";

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
  const { mutate: toggleUserRole } = useToggleRole();
  const handleBlock = async () => {
    const action = isCurrentlyBlocked ? "unblock" : "block";
    blockExpert({ userId: userIdToBlock, action: action });
  };
  const handleToggleRole = (userId: string, userRole: string) => {
    toggleUserRole({ userId, currentUserRole: userRole! });
  };
  const isAdmin = userRole === "admin";

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh]">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="flex justify-start items-center w-52">
                <p className="ml-5">User</p>
              </TableHead>

              <TableHead className="text-center w-52">Email</TableHead>
              {isAdmin && (
                <TableHead className="text-center w-24">Role</TableHead>
              )}

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
              {isAdmin && (
                <TableHead className="text-center w-24">Activity</TableHead>
              )}
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
                  handleToggleRole={handleToggleRole}
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
  handleToggleRole: (userId: string, userRole: string) => void;
  onViewMore: (id: string) => void;
  setSelectExpertId?: (id: string) => void;
  setRankPosition?: (rank: number) => void;
}

const UserRow: React.FC<UserRowProps> = ({
  u,
  handleBlock,
  handleToggleRole,
  setUserIdToBlock,
  setIsCurrentlyBlocked,
  setSelectExpertId,
  setRankPosition,
  userRole,
}) => {
  const isBlocked = u.isBlocked || false;
  const { mutate: updateActivity } = useUpdateActivity();

  //expert block/unblock modal state
  type ConfirmAction = "block" | "unblock" | "switch-role" | null;

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actionUserId, setActionUserId] = useState<string>("");
  const [actionRole, setActionRole] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = userRole === "admin";
  const handleExpertClick = async (userdetails: any) => {
    if (userdetails) {
      setSelectExpertId?.(userdetails._id);
      setRankPosition?.(userdetails.rankPosition); // ✅ safe call
      return;
    }
  };

  const handleActivityToggle = () => {
    const nextStatus = u.status === 'in-active' ? 'active' : 'in-active';
    setIsOpen(false);
    updateActivity({ userId: u._id!, status: nextStatus });
  };
  return (
    <TableRow key={String(u._id)} className="text-center">

      <TableCell className="align-middle w-36" title={u.firstName}>
        <div className="flex items-center gap-2">
          <AvatarComponent u={u} showRankBadge/>

          <div className="flex items-center gap-1 min-w-0">
            <span
              className={"hover:underline hover:cursor-pointer"}
              onClick={() => {
                handleExpertClick(u);
              }}
            >
              {truncate(u.firstName + " " + u.lastName, 60)}
            </span>

            <div className="flex items-center gap-1 flex-shrink-0">
              {u?.special_task_force && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 border-indigo-200 text-[9px] h-5 px-1.5 rounded-full flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      <Zap className="w-2.5 h-2.5 fill-indigo-500" />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Special Task Force
                  </TooltipContent>
                </Tooltip>
              )}

              {u?.special_task_force_moderator && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge
                      variant="outline"
                      className="bg-purple-50/50 hover:bg-purple-50 text-purple-700 border-purple-200 text-[9px] h-5 px-1.5 rounded-full flex items-center gap-1 transition-colors whitespace-nowrap"
                    >
                      <ShieldCheck className="w-2.5 h-2.5 fill-purple-500" />
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    Special Task Force Moderator
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </TableCell>

      {/* Email */}
      <TableCell className="align-middle w-64">
        {truncate(u.email, 60)}
      </TableCell>

      {/* Role */}
      {isAdmin && (
        <TableCell className="align-middle w-32">
          <Badge variant="outline">{u.role}</Badge>
        </TableCell>
      )}

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
        <Badge variant="outline">{u.penaltyPercentage?.toFixed(0) || 0}%</Badge>
      </TableCell>

      {/* total_answers_creted */}
      <TableCell className="align-middle w-32">
        <Badge variant="outline">{u.totalAnswers_Created || 0}</Badge>
      </TableCell>

      {/* Created At */}
      <TableCell className="align-middle w-32">
        {formatDate(new Date(u.createdAt!), false)}
      </TableCell>

      {isAdmin && (
        <TableCell className="align-middle w-32">
          <Badge
            variant="outline"
            className={u.status === 'in-active' ? "text-red-500 border-red-200 bg-red-50" : "text-green-700 border-green-200 bg-green-50"}
          >
            {u.status === 'in-active' ? 'Inactive' : 'Active'}
          </Badge>
        </TableCell>
      )}

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

              {isAdmin && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    handleActivityToggle();
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Eye className="w-4 h-4 mr-2" />
                    Mark as {u.status === 'in-active' ? 'Active' : 'Inactive'}
                  </div>
                </DropdownMenuItem>
              )}

              <DropdownMenuItem
                disabled={u.status === 'in-active' && isBlocked}
                onSelect={(e) => {
                  e.preventDefault();
                  setUserIdToBlock(u._id!);
                  setIsCurrentlyBlocked(isBlocked!);
                  setActionUserId(u._id!);
                  setActionRole(u.role);
                  setConfirmAction(isBlocked ? "unblock" : "block");
                  setIsOpen(false);

                }}
              >
                <button className="flex justify-center items-center gap-2">
                  <Trash className="w-4 h-4 mr-2 text-red-500" />
                  {isBlocked ? "Unblock" : "Block"}
                </button>
              </DropdownMenuItem>
              {/* Switch role from expert to moderator */}
              {isAdmin && u.role !== "admin" && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setIsOpen(false);
                    setActionUserId(u._id!);
                    setActionRole(u.role);
                    setConfirmAction("switch-role");
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Gavel className="w-4 h-4 text-blue-500" />
                    Switch Role
                  </div>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ConfirmationModal
            open={!!confirmAction}
            onOpenChange={() => setConfirmAction(null)}
            title={
              confirmAction === "switch-role"
                ? "Switch User Role?"
                : confirmAction === "block"
                  ? "Block the User?"
                  : "Unblock the User?"
            }
            description={
              confirmAction === "switch-role"
                ? actionRole === "expert"
                  ? "This will promote the expert to a moderator. Are you sure you want to continue?"
                  : "This will demote the moderator to an expert. Are you sure you want to continue?"
                : confirmAction === "block"
                  ? actionRole === "expert"
                    ? "Blocking this expert will restrict their access to the review system until they are unblocked. Once blocked, they will no longer be able to review, submit answers, or perform any actions within the platform. They will also be excluded from all current and future allocations. Are you sure you want to proceed?"
                    : "Blocking this moderator will restrict their access to the platform until they are unblocked. They will not be able to manage reviews, moderate content, or perform any administrative actions. Are you sure you want to proceed?"
                  : actionRole === "expert"
                    ? "This will restore the expert’s access to the review system and allow them to participate in reviews again. Are you sure you want to unblock this user?"
                    : "This will restore the moderator’s access and administrative permissions on the platform. Are you sure you want to unblock this user?"
            }
            confirmText={
              confirmAction === "switch-role"
                ? "Switch Role"
                : confirmAction === "block"
                  ? "Block"
                  : "Unblock"
            }
            cancelText="Cancel"
            type={confirmAction === "block" ? "delete" : "default"}
            onConfirm={() => {
              if (confirmAction === "switch-role") {
                handleToggleRole(actionUserId, actionRole);
              } else {
                handleBlock();
              }
              setConfirmAction(null);
            }}
          />

        </div>
      </TableCell>
    </TableRow>
  );
};
