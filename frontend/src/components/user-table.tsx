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
  History,
  Loader2,
  Lock,
  MoreVertical,
  Trash,
  Unlock,
  Gavel,
  Zap,
  ShieldCheck,
  UserCheck,
  BadgeCheck,
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
import { useNavigate } from "@tanstack/react-router";
import { useBlockUser } from "@/hooks/api/user/useBlockUser";
import { useToggleRole } from "@/hooks/api/user/useToggleRole";
import { useUpdateActivity } from "@/hooks/api/user/useUpdateActivity";
import { useVerifyUser } from "@/hooks/api/user/useVerifyUser";
import { useToggleSTF } from "@/hooks/api/user/useToggleSTF";
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
  setLimit: (val: number) => void;
  showSensitive?: boolean;
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
  setLimit,
  showSensitive = false,
}: UserTableProps) => {
  const [userIdToBlock, setUserIdToBlock] = useState<string>("");
  const [isCurrentlyBlocked, setIsCurrentlyBlocked] = useState<boolean>(false);
  const { mutate: blockExpert } = useBlockUser();
  const { mutate: toggleUserRole } = useToggleRole();
  const handleBlock = async () => {
    const action = isCurrentlyBlocked ? "unblock" : "block";
    blockExpert({ userId: userIdToBlock, action: action });
  };
  const handleToggleRole = (userId: string, userRole: string, selectedRole?: string) => {
    console.log("Users data is", { userId, userRole, selectedRole })
    toggleUserRole({ userId, currentUserRole: userRole!, selectedRole: selectedRole });
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

              {showSensitive && <TableHead className="text-center w-36">Phone</TableHead>}
              {showSensitive && <TableHead className="text-center w-40">University</TableHead>}
              {showSensitive && <TableHead className="text-center w-44">Domain</TableHead>}

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
              {/* <TableHead className="text-center w-24">Total Answered</TableHead> */}
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
                <TableCell colSpan={13} className="text-center py-10">
                  <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
                </TableCell>
              </TableRow>
            ) : items?.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={13}
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
                  showSensitive={showSensitive}
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
        limit={limit}
        onLimitChange={setLimit}
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
  handleToggleRole: (userId: string, userRole: string, selectedRole?: string) => void;
  onViewMore: (id: string) => void;
  setSelectExpertId?: (id: string) => void;
  setRankPosition?: (rank: number) => void;
  showSensitive?: boolean;
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
  showSensitive = false,
}) => {
  const isBlocked = u.isBlocked || false;
  const navigate = useNavigate();
  const { mutate: updateActivity } = useUpdateActivity();
  const { mutate: verifyUser } = useVerifyUser();
  const { mutate: toggleSTF } = useToggleSTF();

  //expert block/unblock modal state
  type ConfirmAction = "block" | "unblock" | "switch-role" | "verify" | "make-stf" | "remove-stf" | null;

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);
  const [actionUserId, setActionUserId] = useState<string>("");
  const [actionRole, setActionRole] = useState<string>("");
  const [isOpen, setIsOpen] = useState(false);
  const isAdmin = userRole === "admin";
  const [selectRole, setSelectRole] = useState("")
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

  const ROLE_LABELS: Record<string, string> = {
    admin: "Admin",
    moderator: "Moderator",
    expert: "Expert",
    pae_expert: "PAE Expert",
    tester: "Tester",
  };

  return (
    <TableRow
      key={String(u._id)}
      className="text-center"
    >

      {/* <TableCell className={`align-middle w-36 border-l-1 ${u.isVerified ? 'border-l-blue-500' : 'border-l-red-500'}`} title={u.firstName}>
        <div className="flex items-center gap-2">
          <AvatarComponent
            u={u}
            showRankBadge={u.role === "expert"}
            rankPosition={u.expertRank}
          />

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
      </TableCell> */}

      <TableCell
        className="align-middle w-36"
        title={u.firstName}
      >
        <div
          className={`flex items-center gap-2 rounded-lg px-2 py-2 border-l-4 ${u.isVerified
              ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/10"
              : "border-l-rose-500 bg-rose-50/40 dark:bg-rose-950/10"
            }`}
        >
          <AvatarComponent
            u={u}
            showRankBadge={u.role === "expert"}
            rankPosition={u.expertRank}
          />

          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span
              className="truncate hover:underline hover:cursor-pointer text-sm font-medium"
              onClick={() => {
                handleExpertClick(u);
              }}
            >
              {truncate(u.firstName + " " + u.lastName, 60)}
            </span>

            {/* Minimal Verification Badge */}
            {/* <Badge
              variant="secondary"
              className={`h-5 px-1.5 text-[10px] rounded-md font-medium border ${u.isVerified
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-rose-100 text-rose-700 border-rose-200"
                }`}
            >
              {u.isVerified ? "Verified" : "Pending"}
            </Badge> */}

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
          <Badge variant="outline"> {ROLE_LABELS[u.role] || u.role}</Badge>
        </TableCell>
      )}
      {/* Phone */}
      {showSensitive && (
        <TableCell className="align-middle w-36">
          {u.mobile ? u.mobile : <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>
      )}

      {/* University */}
      {showSensitive && (
        <TableCell className="align-middle w-40">
          {u.university ? truncate(u.university, 40) : <span className="text-muted-foreground text-xs">—</span>}
        </TableCell>
      )}

      {/* Domain */}
      {showSensitive && (
        <TableCell className="align-middle w-44">
          {(() => {
            const raw = u.preference?.domain;
            if (!raw || (Array.isArray(raw) && raw.length === 0)) {
              return <span className="text-muted-foreground text-xs">—</span>;
            }
            const domains: string[] = Array.isArray(raw) ? raw : [raw];
            const visible = domains.slice(0, 1);
            const rest = domains.slice(1);
            return (
              <div className="flex flex-wrap items-center justify-center gap-1">
                {visible.map((d, i) => (
                  <span key={i} className="text-xs text-foreground">{d}</span>
                ))}
                {rest.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="secondary" className="text-xs px-1.5 py-0 h-5 cursor-default">
                        +{rest.length}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[200px]">
                      <div className="flex flex-col gap-1">
                        {rest.map((d, i) => (
                          <span key={i} className="text-xs">{d}</span>
                        ))}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            );
          })()}
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
      {/* <TableCell className="align-middle w-32">
        <Badge variant="outline">{u.totalAnswers_Created || 0}</Badge>
      </TableCell> */}

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
                onSelect={(e) => {
                  e.preventDefault();
                  setIsOpen(false);
                  if (!u._id) return;
                  navigate({
                    to: "/user-history/$userId",
                    params: { userId: u._id },
                  });
                }}
              >
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 mr-2 text-blue-500" />
                  History
                  <Badge
                    variant="default"
                    className="h-4 text-[9px] px-1.5 py-0 ml-auto bg-red-500 text-white hover:bg-red-600 border-0 font-medium"
                  >New</Badge>
                </div>
              </DropdownMenuItem>

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
                  <div className="flex items-center gap-2 w-full">
                    <Gavel className="w-4 h-4 text-blue-500" />
                    <span>Switch Role</span>
                    <Badge
                      variant="default"
                      className="h-4 text-[9px] px-1.5 py-0 ml-auto bg-red-500 text-white hover:bg-red-600 border-0 font-medium"
                    >
                      New
                    </Badge>
                  </div>
                </DropdownMenuItem>
              )}
              {isAdmin && u.isVerified === false && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setIsOpen(false);
                    setActionUserId(u._id!);
                    setConfirmAction("verify");
                  }}
                >
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-green-600" />
                    Verify User
                  </div>
                </DropdownMenuItem>
              )}
              {isAdmin && u.role === 'expert' && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setIsOpen(false);
                    setConfirmAction(u.special_task_force ? 'remove-stf' : 'make-stf');
                  }}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Zap className="w-4 h-4 text-indigo-500" />
                    <span>{u.special_task_force ? 'Remove STF' : 'Make STF'}</span>
                    <Badge
                      variant="default"
                      className="h-4 text-[9px] px-1.5 py-0 ml-auto bg-red-500 text-white hover:bg-red-600 border-0 font-medium"
                    >
                      New
                    </Badge>
                  </div>
                </DropdownMenuItem>
              )}
              {isAdmin && u.role === 'moderator' && (
                <DropdownMenuItem
                  onSelect={(e) => {
                    e.preventDefault();
                    setIsOpen(false);
                    setConfirmAction(u.special_task_force ? 'remove-stf' : 'make-stf');
                  }}
                >
                  <div className="flex items-center gap-2 w-full">
                    <Zap className="w-4 h-4 text-indigo-500" />
                    <span>{u.special_task_force ? 'Remove STF' : 'Make STF'}</span>
                    <Badge
                      variant="default"
                      className="h-4 text-[9px] px-1.5 py-0 ml-auto bg-red-500 text-white hover:bg-red-600 border-0 font-medium"
                    >
                      New
                    </Badge>
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
                ? "Switch User Role To"
                : confirmAction === "block"
                  ? "Block the User?"
                  : confirmAction === "verify"
                    ? "Verify User?"
                    : confirmAction === "make-stf"
                      ? "Assign STF Status?"
                      : confirmAction === "remove-stf"
                        ? "Remove STF Status?"
                        : "Unblock the User?"
            }
            description={
              confirmAction === "switch-role"
                ? actionRole === "expert"
                  ? "Please select the new user role"
                  : "Please select the new user role"
                : confirmAction === "block"
                  ? actionRole === "expert"
                    ? "Blocking this expert will restrict their access to the review system until they are unblocked. Once blocked, they will no longer be able to review, submit answers, or perform any actions within the platform. They will also be excluded from all current and future allocations. Are you sure you want to proceed?"
                    : `Blocking this ${actionRole} will restrict their access to the platform until they are unblocked. They will not be able to manage reviews, moderate content, or perform any administrative actions. Are you sure you want to proceed?`
                  : confirmAction === "verify"
                    ? "This action will verify the user's account, granting them full access to the platform's features. Are you sure you want to proceed?"
                    : actionRole === "expert"
                      ? "This will restore the expert’s access to the review system and allow them to participate in reviews again. Are you sure you want to unblock this user?"
                      : confirmAction === "make-stf"
                        ? "This user will receive the highest priority for allocation of time-bound questions in the system. Are you sure you want to assign STF status?"
                        : confirmAction === "remove-stf"
                          ? "Are you sure you want to remove STF status from this user?"
                          : `This will restore the ${actionRole} access and administrative permissions on the platform. Are you sure you want to unblock this user?`
            }
            confirmText={
              confirmAction === "switch-role"
                ? "Switch Role"
                : confirmAction === "block"
                  ? "Block"
                  : confirmAction === "verify"
                    ? "Verify"
                    : confirmAction === "make-stf"
                      ? "Assign STF"
                      : confirmAction === "remove-stf"
                        ? "Remove STF"
                        : "Unblock"
            }
            cancelText="Cancel"
            type={confirmAction === "block" ? "delete" : "default"}
            onConfirm={() => {
              if (confirmAction === "switch-role") {
                handleToggleRole(actionUserId, actionRole, selectRole);
                setSelectRole("");
              } else if (confirmAction === "verify") {
                verifyUser({ userId: actionUserId, isVerified: true });
              } else if (confirmAction === "make-stf") {
                toggleSTF({ userId: u._id!, action: 'assign' });
              } else if (confirmAction === "remove-stf") {
                toggleSTF({ userId: u._id!, action: 'remove' });
              } else {
                handleBlock();
              }
              setConfirmAction(null);
            }}
            currentRole={actionRole}
            selectedRole={selectRole}
            onRoleChange={setSelectRole}
            confirmAction={confirmAction || undefined}
          />

        </div>
      </TableCell>
    </TableRow>
  );
};
