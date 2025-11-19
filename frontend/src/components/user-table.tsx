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
  DropdownMenuSeparator,
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

type QuestionsTableProps = {
  items?: IUser[] | null;
  onViewMore: (questionId: string) => void;
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
}: QuestionsTableProps) => {
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
            ) : (
              items?.map((q, idx) => (
                <QuestionRow
                  currentPage={currentPage}
                  handleBlock={handleBlock}
                  idx={idx}
                  onViewMore={onViewMore}
                  q={q}
                  limit={limit}
                  totalPages={totalPages}
                  setQuestionIdToBlock={setUserIdToBlock}
                  setIsCurrentlyBlocked={setIsCurrentlyBlocked}
                  userRole={userRole!}
                  key={String(q._id)}
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
  q: IUser;
  idx: number;
  currentPage: number;
  limit: number;
  totalPages: number;
  userRole: UserRole;
  setQuestionIdToBlock: (id: string) => void;
  setIsCurrentlyBlocked: (value: boolean) => void;
  handleBlock: () => Promise<void>;
  onViewMore: (id: string) => void;
}

const QuestionRow: React.FC<UserRowProps> = ({
  q,
  idx,
  currentPage,
  limit,
  handleBlock,
  setQuestionIdToBlock,
  setIsCurrentlyBlocked,
  onViewMore,
}) => {
  const isBlocked = q.isBlocked || false;
  return (
    <TableRow key={String(q._id)} className="text-center">
      {/* Serial Number */}
      <TableCell className="align-middle w-12" title={idx.toString()}>
        {(currentPage - 1) * limit + idx + 1}
      </TableCell>

      {/* User name */}
      <TableCell className="align-middle w-36" title={q.firstName}>
        {truncate(q.firstName + " " + q.lastName, 60)}
      </TableCell>

      {/* Email */}
      <TableCell className="align-middle w-64">
        {truncate(q.email, 60)}
      </TableCell>

      {/* State */}
      <TableCell className="align-middle w-32">
        {q.preference?.state && q.preference?.state == "all"
          ? "Not Specified"
          : truncate(q.preference?.state!, 20)}
      </TableCell>

      {/* Workload */}
      <TableCell className="align-middle w-32">
        <Badge variant="outline">{q.reputation_score + ""}</Badge>
      </TableCell>

      {/* Incentive */}
      <TableCell className="align-middle w-32">
        <Badge variant="outline">{q.incentive || 0}</Badge>
      </TableCell>

      {/* Penalty */}
      <TableCell className="align-middle w-32">
        {/* {q.penalty || 0} */}
        <Badge variant="outline">{q.penalty || 0}</Badge>
      </TableCell>

      {/* Created At */}
      <TableCell className="align-middle w-32">
        {formatDate(new Date(q.createdAt!), false)}
      </TableCell>

      {/* Blocked Status */}
      <TableCell className="align-middle w-32">
        <div className="flex justify-center items-center">
          {q.isBlocked ? (
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
                onClick={() => onViewMore(q._id?.toString() || "")}
                className="hover:bg-primary/10"
              >
                <Eye className="w-4 h-4 mr-2 text-primary" />
                View
              </DropdownMenuItem> */}

              {/* <DropdownMenuSeparator /> */}

              <DropdownMenuItem
                onSelect={(e) => {
                  e.preventDefault();
                  setQuestionIdToBlock(q._id!);
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
