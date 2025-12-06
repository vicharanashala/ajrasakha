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

import { Eye, Loader2, Lock, MoreVertical, Trash, Unlock } from "lucide-react";

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
  userRole?: UserRole;
};

export const UsersTable = ({
  items,
  onViewMore,
  limit,
  currentPage,
  setCurrentPage,
  userRole,
  isLoading,
  totalPages,
}: UserTableProps) => {
  const [userIdToBlock, setUserIdToBlock] = useState<string>("");
  const [isCurrentlyBlocked, setIsCurrentlyBlocked] = useState<boolean>(false);
  const { mutate: blockExpert } = useBlockUser();
  const handleBlock = async () => {
    console.log("reacej block");
    const action = isCurrentlyBlocked ? "unblock " : "block";
    blockExpert({ userId: userIdToBlock, action: action });
  };

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh]">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-center w-12">Sl.No</TableHead>
              <TableHead className="w-[35%] text-center w-52">
                Full Name
              </TableHead>
              <TableHead className="text-center w-52">Email</TableHead>
              <TableHead className="text-center w-32">State</TableHead>
              <TableHead className="text-center w-24">
                Reputation Score
              </TableHead>
              <TableHead className="text-center w-24">Incentive</TableHead>
              <TableHead className="text-center w-24">Penalty</TableHead>
              <TableHead className="text-center w-24">Total Answered</TableHead>
              <TableHead className="text-center w-24">Rank</TableHead>
              <TableHead className="text-center w-24">Joined At</TableHead>
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
                  idx={idx}
                  onViewMore={onViewMore}
                  u={u}
                  limit={limit}
                  totalPages={totalPages}
                  setUserIdToBlock={setUserIdToBlock}
                  setIsCurrentlyBlocked={setIsCurrentlyBlocked}
                  userRole={userRole!}
                  key={String(u._id)}
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
  onViewMore: (id: string) => void;
}

const UserRow: React.FC<UserRowProps> = ({
  u,
  idx,
  currentPage,
  limit,
  handleBlock,
  setUserIdToBlock,
  setIsCurrentlyBlocked,
}) => {
  const isBlocked = u.isBlocked || false;
  return (
    <TableRow key={String(u._id)} className="text-center">
      {/* Serial Number */}
      <TableCell className="align-middle w-12" title={idx.toString()}>
        {(currentPage - 1) * limit + idx + 1}
      </TableCell>

      {/* User name */}
      <TableCell className="align-middle w-36" title={u.firstName}>
        {truncate(u.firstName + " " + u.lastName, 60)}
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
       <TableCell className="align-middle w-32">
        {/* {u.totalAnswers_Created || 0} */}
        <Badge variant="outline">{u.rankPosition || 0}</Badge>
      </TableCell>

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
          <DropdownMenu>
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
                }}
              >
                <ConfirmationModal
                  title={isBlocked ? "Unblock the User?" : "Block the User?"}
                  description={
                    isBlocked
                      ? "This will restore the expert’s access to the review system and allow them to participate in reviews again. Are you sure you want to unblock this user?"
                      : "Blocking this expert will restrict their access to the review system until they are unblocked. Once blocked, they will no longer be able to review, submit answers, or perform any actions within the platform. They will also be excluded from all current and future allocations. Are you sure you want to proceed?"
                  }
                  confirmText={isBlocked ? "Unblock" : "Block"}
                  cancelText="Cancel"
                  type={isBlocked ? "default" : "delete"}
                  onConfirm={handleBlock}
                  trigger={
                    <button className="flex justify-center items-center gap-2">
                      <Trash className="w-4 h-4 mr-2 text-red-500" />
                      {isBlocked ? "Unblock" : "Block"}
                    </button>
                  }
                />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  );
};
