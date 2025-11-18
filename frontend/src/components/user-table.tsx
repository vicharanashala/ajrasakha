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

import { Eye, Loader2, MoreVertical, Trash } from "lucide-react";

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
  const handleBlock = async () => {
    const action =isCurrentlyBlocked ? "Unblocking " : "Blocking"
    alert("blocked" + userIdToBlock + "state " + action);
  };

  return (
    <div>
      <div className="rounded-lg border bg-card overflow-x-auto min-h-[55vh]">
        <Table className="min-w-[800px]">
          <TableHeader className="bg-card sticky top-0 z-10">
            <TableRow>
              <TableHead className="text-center">Sl.No</TableHead>
              <TableHead className="w-[35%] text-center">Full Name</TableHead>
              <TableHead className="text-center">Email</TableHead>
              <TableHead className="text-center">Workload</TableHead>
              <TableHead className="text-center">Incentive</TableHead>
              <TableHead className="text-center">Penalty</TableHead>
              <TableHead className="text-center">Rank</TableHead>
              <TableHead className="text-center">Created</TableHead>
              <TableHead className="text-center">Blocked</TableHead>
              <TableHead className="text-center">Action</TableHead>
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
              // : (
              //   <TableRow>
              //     <TableCell
              //       colSpan={10}
              //       rowSpan={10}
              //       className="text-center py-10 text-muted-foreground"
              //     >
              //       No Users found
              //     </TableCell>
              //   </TableRow>
              // )
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
      <TableCell className="align-middle" title={idx.toString()}>
        {(currentPage - 1) * limit + idx + 1}
      </TableCell>

      {/* User name*/}
      <TableCell className="align-middle" title={q.firstName}>
        {/* <div className="flex flex-col gap-1"> */}
        {truncate(q.firstName, 10)}
        {/* </div> */}
      </TableCell>

      {/* Email */}
      <TableCell className="align-middle">{truncate(q.email, 70)}</TableCell>

      {/* Workload */}
      <TableCell className="align-middle">
        {truncate(q.reputation_score + "", 10)}
      </TableCell>

      {/* Incentive */}
      <TableCell className="align-middle">
        <Badge variant="outline">{q.incentive || 0}</Badge>
      </TableCell>

      {/* Penalty */}
      <TableCell className="align-middle">{q.penalty || 0}</TableCell>

      {/* Total Answers */}
      <TableCell className="align-middle">{q.role}</TableCell>

      <TableCell className="align-middle">
        {formatDate(new Date(q.createdAt!), false)}
      </TableCell>

      <TableCell className="align-middle">
        {" "}
        {truncate(q.isBlocked ? 'True' : 'False', 10)}
      </TableCell>

      {/* Actions */}
      <TableCell className="align-middle">
        <div className="flex justify-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="p-1">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>

            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem
                onClick={() => onViewMore(q._id?.toString() || "")}
                className="hover:bg-primary/10"
              >
                <Eye className="w-4 h-4 mr-2 text-primary" />
                View
              </DropdownMenuItem>

              <DropdownMenuSeparator />

              <DropdownMenuSeparator />

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
                      ? "Are you sure you want to unblock this user?"
                      : "Are you sure you want to block this user?"
                  }
                  confirmText={isBlocked ? "Unblock" : "Block"}
                  cancelText="Cancel"
                  //   isLoading={}
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
