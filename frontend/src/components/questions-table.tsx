// import {
//   useEffect,
//   useMemo,
//   useRef,
//   useState,
//   type Dispatch,
//   type SetStateAction,
// } from "react";
// import { Badge } from "./atoms/badge";
// import { Button } from "./atoms/button";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "./atoms/table";
// import { Input } from "./atoms/input";

// import {
//   AlertCircle,
//   Check,
//   CheckCircle,
//   Edit,
//   Eye,
//   File,
//   Flag,
//   FlagTriangleRight,
//   Info,
//   Loader2,
//   MessageSquareText,
//   MoreVertical,
//   MousePointer,
//   PaperclipIcon,
//   PencilLine,
//   Plus,
//   PlusCircle,
//   RefreshCcw,
//   Save,
//   Search,
//   Square,
//   Trash,
//   Upload,
//   X,
// } from "lucide-react";

// import { Pagination } from "./pagination";
// import {
//   AdvanceFilterDialog,
//   type AdvanceFilterValues,
// } from "./advanced-question-filter";
// import type {
//   IDetailedQuestion,
//   IMyPreference,
//   QuestionPriority,
//   QuestionSource,
//   QuestionStatus,
//   UserRole,
// } from "@/types";
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuSeparator,
//   DropdownMenuTrigger,
// } from "./atoms/dropdown-menu";
// import {
//   Dialog,
//   DialogContent,
//   DialogFooter,
//   DialogHeader,
//   DialogTitle,
// } from "./atoms/dialog";
// import { Textarea } from "./atoms/textarea";
// import { useCreateRequest } from "@/hooks/api/request/useCreateRequest";
// import { toast } from "sonner";
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from "./atoms/select";
// import { ScrollArea } from "./atoms/scroll-area";
// import { Separator } from "./atoms/separator";
// import { useDeleteQuestion } from "@/hooks/api/question/useDeleteQuestion";
// import { ConfirmationModal } from "./confirmation-modal";
// import { useUpdateQuestion } from "@/hooks/api/question/useUpdateQuestion";
// import { useAddQuestion } from "@/hooks/api/question/useAddQuestion";
// import { useCountdown } from "@/hooks/ui/useCountdown";
// import { formatDate } from "@/utils/formatDate";
// import { TimerDisplay } from "./timer-display";
// import {
//   Tooltip,
//   TooltipContent,
//   TooltipProvider,
//   TooltipTrigger,
// } from "./atoms/tooltip";

// import { STATES, CROPS, DOMAINS, SEASONS } from "./MetaData";
// import { useBulkDeleteQuestions } from "@/hooks/api/question/useBulkDeleteQuestions";
// import {
//   ContextMenu,
//   ContextMenuContent,
//   ContextMenuItem,
//   ContextMenuSeparator,
//   ContextMenuTrigger,
// } from "./atoms/context-menu";
// import { Checkbox } from "./atoms/checkbox";
// import { TopRightBadge } from "./NewBadge";

// const truncate = (s: string, n = 80) => {
//   if (!s) return "";
//   return s.length > n ? s.slice(0, n - 1) + "…" : s;
// };

// type DetailField = keyof NonNullable<IDetailedQuestion["details"]>;
// const OPTIONS: Partial<Record<DetailField, string[]>> = {
//   state: STATES,

//   crop: CROPS,
//   season: SEASONS,
//   domain: DOMAINS,
// };

// type QuestionsTableProps = {
//   items?: IDetailedQuestion[] | null;
//   onViewMore: (questionId: string) => void;
//   currentPage: number;
//   setCurrentPage: (val: number) => void;
//   isLoading?: boolean;
//   isBulkUpload: boolean;
//   totalPages: number;
//   limit: number;
//   uploadedQuestionsCount: number;
//   userRole?: UserRole;
//   setIsSelectionModeOn: (value: boolean) => void;
//   selectedQuestionIds: string[];
//   setSelectedQuestionIds: Dispatch<SetStateAction<string[]>>;
//   showClosedAt?: boolean;
// };

// export const QuestionsTable = ({
//   items,
//   onViewMore,
//   limit,
//   currentPage,
//   setCurrentPage,
//   userRole,
//   isLoading,
//   totalPages,
//   uploadedQuestionsCount,
//   isBulkUpload,
//   setIsSelectionModeOn,
//   selectedQuestionIds,
//   setSelectedQuestionIds,
//   showClosedAt,
// }: QuestionsTableProps) => {
//   const [editOpen, setEditOpen] = useState(false);
//   const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
//     null,
//   );
//   const [questionIdToDelete, setQuestionIdToDelete] = useState("");
//   const [selectedQuestion, setSelectedQuestion] =
//     useState<IDetailedQuestion | null>(null);

//   const { mutateAsync: createRequest, isPending: creatingRequest } =
//     useCreateRequest();

//   const { mutateAsync: deleteQuestion, isPending: deletingQuestion } =
//     useDeleteQuestion();

//   const { mutateAsync: updateQuestion, isPending: updatingQuestion } =
//     useUpdateQuestion();

//   const handleUpdateQuestion = async (
//     mode: "add" | "edit",
//     entityId?: string,
//     flagReason?: string,
//     status?: QuestionStatus,
//     // formData?: FormData
//   ) => {
//     try {
//       if (!entityId) {
//         toast.error(`Failed to identify and ${mode} the selected question.`);
//         return;
//       }

//       if (!updatedData) {
//         // if just status update is needed then no need updatedData
//         console.error("No data available to update.");
//         return;
//       }

//       if (userRole === "expert" && !status) {
//         if (!flagReason || flagReason.trim().length < 8) {
//           toast.error(
//             "Please provide a valid reason for flagging (minimum 8 characters).",
//           );
//           return;
//         }

//         await createRequest({
//           entityId,
//           requestType: "question_flag",
//           updatedData,
//           reason: flagReason.trim(),
//         });

//         toast.success(
//           "Thank you for your feedback. Your flag request has been submitted successfully.",
//         );
//         setEditOpen(false);
//         return;
//       }

//       if (updatedData) {
//         const payload: IDetailedQuestion = status
//           ? { ...updatedData, status }
//           : updatedData;

//         await updateQuestion(payload);
//       }
//       if (!status) toast.success("Question updated successfully.");
//       setEditOpen(false);
//     } catch (error: any) {
//       console.error("Error in handleUpdateQuestion:", error);
//       if (!status)
//         // if status is there that means, then updating question to delayed
//         toast.error(
//           error?.message || "An error occurred while saving. Please try again.",
//         );
//       setEditOpen(false);
//     }
//   };

//   const handleDelete = async (questionId?: string) => {
//     const idToDelete = questionId ?? questionIdToDelete;

//     if (!idToDelete) {
//       console.warn("No question ID provided for deletion");
//       return;
//     }

//     try {
//       await deleteQuestion(idToDelete);
//     } catch (error) {
//       console.error("Error deleting question:", error);
//     }
//   };

//   const handleQuestionsSelection = (questionId: string) => {
//     setSelectedQuestionIds((prev) => {
//       let next: string[];

//       if (prev.includes(questionId)) {
//         next = prev.filter((id) => id !== questionId);
//       } else {
//         next = [...prev, questionId];
//       }
//       // if (prev.length >= 50) {
//       //   toast.warning("You can select only up to 50 questions");
//       //   return prev;
//       // }
//       setIsSelectionModeOn(next.length > 0);

//       return next;
//     });
//   };

//   return (
//     <div className="ps-4 md:ps-0">
//       <AddOrEditQuestionDialog
//         open={editOpen}
//         setOpen={setEditOpen}
//         setUpdatedData={setUpdatedData}
//         updatedData={updatedData}
//         onSave={handleUpdateQuestion}
//         question={selectedQuestion!}
//         userRole={userRole!}
//         isLoadingAction={creatingRequest || updatingQuestion}
//         mode="edit"
//       />

//       <div className="rounded-lg border bg-card min-h-[55vh] ">
//         <div className="hidden md:block overflow-x-auto">
//           <Table className="min-w-[800px]  table-auto">
//             <TableHeader className="bg-card sticky top-0 z-10">
//               <TableRow>
//                 <TableHead className="text-center">Sl.No</TableHead>
//                 <TableHead className="w-[25%] text-center">Question</TableHead>
//                 <TableHead className="text-center">Priority</TableHead>
//                 <TableHead className="text-center">State</TableHead>
//                 <TableHead className="text-center">Crop</TableHead>
//                 <TableHead className="text-center">Domain</TableHead>
//                 <TableHead className="text-center">Source</TableHead>
//                 <TableHead className="text-center">Status</TableHead>
//                 <TableHead className="text-center">Answers</TableHead>
//                 <TableHead className="text-center">Review Level</TableHead>
//                 {!showClosedAt ? (
//                   <TableHead className="text-center">Created</TableHead>
//                 ) : null}
//                 {showClosedAt ? (
//                   <TableHead className="text-center">Closed</TableHead>
//                 ) : null}

//                 {/* <TableHead className="text-center">Action</TableHead> */}
//               </TableRow>
//             </TableHeader>

//             <TableBody>
//               {isLoading ? (
//                 <TableRow>
//                   <TableCell colSpan={10} className="text-center py-10 ">
//                     <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
//                   </TableCell>
//                 </TableRow>
//               ) : items?.length === 0 ? (
//                 <TableRow>
//                   <TableCell
//                     colSpan={10}
//                     rowSpan={10}
//                     className="text-center py-10 text-muted-foreground"
//                   >
//                     No questions found
//                   </TableCell>
//                 </TableRow>
//               ) : (
//                 items?.map((q, idx) => (
//                   <QuestionRow
//                     currentPage={currentPage}
//                     deletingQuestion={deletingQuestion}
//                     handleDelete={handleDelete}
//                     idx={idx}
//                     onViewMore={onViewMore}
//                     q={q}
//                     uploadedQuestionsCount={uploadedQuestionsCount}
//                     isBulkUpload={isBulkUpload}
//                     limit={limit}
//                     setUpdatedData={setUpdatedData}
//                     updateQuestion={handleUpdateQuestion}
//                     setEditOpen={setEditOpen}
//                     setQuestionIdToDelete={setQuestionIdToDelete}
//                     setSelectedQuestion={setSelectedQuestion}
//                     totalPages={totalPages}
//                     updatingQuestion={updatingQuestion}
//                     userRole={userRole!}
//                     key={q._id}
//                     handleQuestionsSelection={handleQuestionsSelection}
//                     isSelected={!!q._id && selectedQuestionIds.includes(q._id)}
//                     setIsSelectionModeOn={setIsSelectionModeOn}
//                     selectedQuestionIds={selectedQuestionIds}
//                     showClosedAt={showClosedAt}
//                   />
//                 ))
//               )}
//             </TableBody>
//           </Table>
//         </div>

//         <div className="md:hidden space-y-4 p-3">
//           {isLoading ? (
//             <div className="text-center py-10">
//               <Loader2 className="animate-spin w-6 h-6 mx-auto text-primary" />
//             </div>
//           ) : items?.length === 0 ? (
//             <p className="text-center py-10 text-muted-foreground">
//               No questions found
//             </p>
//           ) : (
//             items?.map((q, idx) => (
//               <MobileQuestionCard
//                 currentPage={currentPage}
//                 deletingQuestion={deletingQuestion}
//                 handleDelete={handleDelete}
//                 idx={idx}
//                 onViewMore={onViewMore}
//                 q={q}
//                 uploadedQuestionsCount={uploadedQuestionsCount}
//                 isBulkUpload={isBulkUpload}
//                 limit={limit}
//                 setUpdatedData={setUpdatedData}
//                 updateQuestion={handleUpdateQuestion}
//                 setEditOpen={setEditOpen}
//                 setQuestionIdToDelete={setQuestionIdToDelete}
//                 setSelectedQuestion={setSelectedQuestion}
//                 totalPages={totalPages}
//                 updatingQuestion={updatingQuestion}
//                 userRole={userRole!}
//                 key={q._id}
//               />
//             ))
//           )}
//         </div>
//       </div>

//       <Pagination
//         currentPage={currentPage}
//         totalPages={totalPages}
//         onPageChange={(page) => setCurrentPage(page)}
//       />
//     </div>
//   );
// };

// interface QuestionRowProps {
//   q: IDetailedQuestion;
//   idx: number;
//   currentPage: number;
//   limit: number;
//   uploadedQuestionsCount: number;
//   isBulkUpload: boolean;
//   totalPages: number;
//   userRole: UserRole;
//   updatingQuestion: boolean;
//   setIsSelectionModeOn?: (val: boolean) => void;
//   handleQuestionsSelection?: (questionId: string) => void;
//   isSelected?: boolean;
//   deletingQuestion: boolean;
//   setEditOpen: (val: boolean) => void;
//   setSelectedQuestion: (q: any) => void;
//   selectedQuestionIds?: string[];
//   setQuestionIdToDelete: (id: string) => void;
//   handleDelete: (questionId?: string) => Promise<void>;
//   setUpdatedData: React.Dispatch<
//     React.SetStateAction<IDetailedQuestion | null>
//   >;

//   updateQuestion: (
//     mode: "add" | "edit",
//     entityId?: string,
//     flagReason?: string,
//     status?: QuestionStatus,
//   ) => Promise<void>;
//   onViewMore: (id: string) => void;
//   showClosedAt?: boolean;
// }

// const QuestionRow: React.FC<QuestionRowProps> = ({
//   q,
//   idx,
//   currentPage,
//   limit,
//   userRole,
//   updatingQuestion,
//   uploadedQuestionsCount,
//   isBulkUpload,
//   deletingQuestion,
//   setEditOpen,
//   setSelectedQuestion,
//   handleDelete,
//   onViewMore,
//   setIsSelectionModeOn,
//   isSelected,
//   handleQuestionsSelection,
//   selectedQuestionIds,
//   showClosedAt,
// }) => {
//   // To track cont

//   const uploadedCountRef = useRef(uploadedQuestionsCount);

//   const DURATION_HOURS = 4;
//   const timer = useCountdown(q.createdAt, DURATION_HOURS, () => {});

//   const totalSeconds = DURATION_HOURS * 60 * 60;

//   // Parse timer string ("hh:mm:ss") to seconds
//   const [h, m, s] = timer.split(":").map(Number);
//   const remainingSeconds = h * 3600 + m * 60 + s;

//   //  Calculate delay based on uploaded questions
//   // 200 questions → 3 minutes = 180 seconds
//   const delayPerQuestion = 180 / 200; // 0.9 seconds per question
//   let delaySeconds = uploadedCountRef.current * delayPerQuestion;

//   if (userRole === "expert") {
//     delaySeconds = 200;
//   }

//   // For tooltip
//   const delayMinutes = delaySeconds / 60;

//   //  Check if enough time has passed
//   const isClickable =
//     remainingSeconds <= totalSeconds - delaySeconds && !isBulkUpload;

//   const priorityBadge = useMemo(() => {
//     if (!q.priority)
//       return (
//         <Badge variant="outline" className="text-muted-foreground">
//           NIL
//         </Badge>
//       );

//     const colorClass =
//       q.priority === "high"
//         ? "bg-red-500/10 text-red-600 border-red-500/30"
//         : q.priority === "medium"
//           ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
//           : "bg-green-500/10 text-green-600 border-green-500/30";

//     return (
//       <Badge variant="outline" className={colorClass}>
//         {q.priority.charAt(0).toUpperCase() + q.priority.slice(1)}
//       </Badge>
//     );
//   }, [q.priority]);

//   const statusBadge = useMemo(() => {
//     // const status = q.status || "NIL";
//     const effectiveStatus =
//       timer === "00:00:00" && q.status == "open"
//         ? "delayed"
//         : q.status || "NIL";

//     const formatted = effectiveStatus.replace("_", " ");

//     const colorClass =
//       effectiveStatus === "in-review"
//         ? "bg-green-500/10 text-green-600 border-green-500/30"
//         : effectiveStatus === "open"
//           ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
//           : effectiveStatus === "closed"
//             ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
//             : "bg-muted text-foreground";

//     return (
//       <Badge variant="outline" className={colorClass}>
//         {formatted}
//       </Badge>
//     );
//   }, [q.status, timer]);

//   const hasSelectedQuestions =
//     selectedQuestionIds && selectedQuestionIds.length > 0;

//   return (
//     <ContextMenu>
//       <ContextMenuTrigger asChild>
//         <TableRow
//           key={q._id}
//           className={`text-center transition-colors ${
//             isSelected ? "bg-primary/10" : "hover:bg-muted/50"
//           }`}
//           onClick={() => {
//             if (!q._id || !hasSelectedQuestions) return;
//             handleQuestionsSelection?.(q._id);
//           }}
//         >
//           {/* Serial Number */}
//           <TableCell
//             className="align-middle text-center p-4"
//             title={idx.toString()}
//           >
//             {hasSelectedQuestions ? (
//               <Checkbox
//                 checked={q._id ? selectedQuestionIds.includes(q._id) : false}
//                 onCheckedChange={() => {
//                   if (!q._id) return;
//                   handleQuestionsSelection?.(q._id);
//                 }}
//               />
//             ) : (
//               (currentPage - 1) * limit + idx + 1
//             )}
//           </TableCell>

//           {/* Question Text */}
//           <TableCell className="text-start ps-3 " title={q.question}>
//             <div className="flex flex-col gap-1">
//               <TooltipProvider>
//                 <Tooltip>
//                   <TooltipTrigger asChild>
//                     <span
//                       className={`cursor-pointer ${
//                         isClickable
//                           ? hasSelectedQuestions
//                             ? ""
//                             : "hover:underline"
//                           : "opacity-50 cursor-not-allowed"
//                       }`}
//                       onClick={() => {
//                         if (!isClickable || hasSelectedQuestions) return;
//                         onViewMore(q._id?.toString() || "");
//                       }}
//                     >
//                       {truncate(q.question, 50)}
//                     </span>
//                   </TooltipTrigger>
//                   {!isClickable && (
//                     <TooltipContent side="top">
//                       <p>
//                         The question is currently being processed. Expert
//                         allocation is underway and may take{" "}
//                         {delayMinutes < 1
//                           ? "less than 1 minute"
//                           : `up to ${Math.ceil(delayMinutes)} ${
//                               Math.ceil(delayMinutes) === 1
//                                 ? "minute"
//                                 : "minutes"
//                             }`}{" "}
//                         to complete.
//                       </p>
//                     </TooltipContent>
//                   )}
//                 </Tooltip>
//               </TooltipProvider>
//               {q.status !== "delayed" && (
//                 <TimerDisplay timer={timer} status={q.status} />
//               )}
//             </div>
//           </TableCell>

//           {/* Priority */}
//           <TableCell className="align-middle text-center">
//             {priorityBadge}
//           </TableCell>

//           {/* Details */}
//           <TableCell className="align-middle">
//             {" "}
//             {truncate(q.details.state, 10)}
//           </TableCell>

//           <TableCell className="align-middle">
//             {truncate(q.details.crop, 10)}
//           </TableCell>

//           <TableCell className="align-middle">
//             {truncate(q.details.domain, 12)}
//           </TableCell>

//           {/* Source */}
//           <TableCell className="align-middle">
//             <Badge variant="outline">{q.source}</Badge>
//           </TableCell>

//           {/* Status */}
//           <TableCell className="align-middle">{statusBadge}</TableCell>

//           {/* Total Answers */}
//           <TableCell className="align-middle">{q.totalAnswersCount}</TableCell>

//           <TableCell className="align-middle">
//             {q.review_level_number?.toString() == "Author"
//               ? q.review_level_number
//               : `Level ${q.review_level_number}`}
//           </TableCell>
//           {!showClosedAt ? (
//             <TableCell className="align-middle">
//               {formatDate(new Date(q.createdAt!), false)}
//             </TableCell>
//           ) : null}
//           {showClosedAt ? (
//             <TableCell className="align-middle">
//               {q.closedAt ? formatDate(new Date(q.closedAt!), false) : "N/C"}
//             </TableCell>
//           ) : null}
//         </TableRow>
//       </ContextMenuTrigger>

//       {/* RIGHT CLICK MENU */}
//       <ContextMenuContent className="w-56 p-2">
//         {/* Selected Question Number */}
//         <div className="mb-2 px-2 py-1 rounded-md border border-transparent shadow-sm text-sm font-semibold ">
//           Question #{(currentPage - 1) * limit + idx + 1}
//         </div>
//         {userRole !== "expert" && !isSelected && (
//           <>
//             <ContextMenuSeparator />

//             <ContextMenuItem
//               onSelect={(e) => {
//                 e.preventDefault();
//                 if (!q._id) return;

//                 setIsSelectionModeOn?.(true);
//                 handleQuestionsSelection?.(q._id);
//               }}
//             >
//               {/* <div className="flex h-4 w-4 items-center justify-center rounded border-2 border-primary/40 bg-primary/5 mr-2.5"> */}
//               <Square className="h-2.5 w-2.5 text-primary" />
//               {/* </div> */}
//               <span className=" ms-2">Select</span>
//             </ContextMenuItem>
//           </>
//         )}
//         {/* Actions */}
//         <ContextMenuItem onClick={() => onViewMore(q._id?.toString() || "")}>
//           <Eye className="w-4 h-4 mr-2 text-primary" />
//           View
//         </ContextMenuItem>

//         <ContextMenuSeparator />

//         {userRole === "expert" ? (
//           <ContextMenuItem
//             onSelect={(e) => {
//               // SetTimeout is essential becuase it will resolve the UI Overlay conflicts happening due to edit modal being opened before closing the context menu
//               setTimeout(() => {
//                 e.preventDefault();
//                 setSelectedQuestion(q);
//                 setEditOpen(true);
//               }, 0);
//             }}
//           >
//             <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
//             Raise Flag
//           </ContextMenuItem>
//         ) : (
//           <>
//             <ContextMenuItem
//               // onSelect={(e) => {
//               //   e.preventDefault();
//               //   setSelectedQuestion(q);
//               //   setEditOpen(true);
//               // }}
//               onSelect={(e) => {
//                 // SetTimeout is essential becuase it will resolve the UI Overlay conflicts happening due to edit modal being opened before closing the context menu
//                 setTimeout(() => {
//                   e.preventDefault();
//                   setSelectedQuestion(q);
//                   setEditOpen(true);
//                 }, 0);
//               }}
//             >
//               <Edit className="w-4 h-4 mr-2 text-blue-500" />
//               {updatingQuestion ? "Editing..." : "Edit"}
//             </ContextMenuItem>

//             <ContextMenuSeparator />

//             <ContextMenuItem onSelect={(e) => e.preventDefault()}>
//               <ConfirmationModal
//                 title="Delete Question Permanently?"
//                 description="Are you sure you want to delete this question? This action is irreversible."
//                 confirmText="Delete"
//                 cancelText="Cancel"
//                 isLoading={deletingQuestion}
//                 type="delete"
//                 onConfirm={() => {
//                   if (!q || !q._id) {
//                     toast.error("Question id not founded");
//                     return;
//                   }
//                   handleDelete(q._id!);
//                 }}
//                 trigger={
//                   <div className="flex items-center gap-2 ">
//                     <Trash className="w-4 h-4 text-red-600 mr-2" />
//                     {deletingQuestion ? "Deleting..." : "Delete"}
//                   </div>
//                 }
//               />
//             </ContextMenuItem>
//           </>
//         )}
//       </ContextMenuContent>
//     </ContextMenu>
//   );
// };

// const MobileQuestionCard: React.FC<QuestionRowProps> = ({
//   q,
//   idx,
//   currentPage,
//   limit,
//   uploadedQuestionsCount,
//   isBulkUpload,
//   userRole,
//   // updatingQuestion,
//   deletingQuestion,
//   setEditOpen,
//   setSelectedQuestion,
//   // setQuestionIdToDelete,
//   handleDelete,
//   onViewMore,
// }) => {
//   const uploadedCountRef = useRef(uploadedQuestionsCount);

//   const DURATION_HOURS = 4;
//   const timer = useCountdown(q.createdAt, DURATION_HOURS, () => {});
//   const totalSeconds = DURATION_HOURS * 3600;

//   const [h, m, s] = timer.split(":").map(Number);
//   const remainingSeconds = h * 3600 + m * 60 + s;

//   const delayPerQuestion = 180 / 200;
//   let delaySeconds = uploadedCountRef.current * delayPerQuestion;
//   if (userRole === "expert") delaySeconds = 200;

//   const isClickable =
//     remainingSeconds <= totalSeconds - delaySeconds && !isBulkUpload;

//   const statusBadge = useMemo(() => {
//     // const status = q.status || "NIL";
//     const effectiveStatus =
//       timer === "00:00:00" && q.status == "open"
//         ? "delayed"
//         : q.status || "NIL";

//     const formatted = effectiveStatus.replace("_", " ");

//     const colorClass =
//       effectiveStatus === "in-review"
//         ? "bg-green-500/10 text-green-600 border-green-500/30"
//         : effectiveStatus === "open"
//           ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
//           : effectiveStatus === "closed"
//             ? "bg-gray-500/10 text-gray-600 border-gray-500/30"
//             : "bg-muted text-foreground";

//     return (
//       <Badge variant="outline" className={colorClass}>
//         {formatted}
//       </Badge>
//     );
//   }, [q.status, timer]);

//   const priorityBadge = useMemo(() => {
//     if (!q.priority)
//       return (
//         <Badge variant="outline" className="text-muted-foreground">
//           NIL
//         </Badge>
//       );

//     const colorClass =
//       q.priority === "high"
//         ? "bg-red-500/10 text-red-600 border-red-500/30"
//         : q.priority === "medium"
//           ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/30"
//           : "bg-green-500/10 text-green-600 border-green-500/30";

//     return (
//       <Badge variant="outline" className={colorClass}>
//         {q.priority.charAt(0).toUpperCase() + q.priority.slice(1)}
//       </Badge>
//     );
//   }, [q.priority]);

//   return (
//     <div className="rounded-lg border p-4 bg-card shadow-sm text-sm leading-snug">
//       {/* Line 1 — Serial + Status */}
//       <div className="flex justify-between items-center mb-1">
//         <p className="text-muted-foreground font-medium">
//           #{(currentPage - 1) * limit + idx + 1}
//         </p>
//         <div className="flex-shrink-0">{statusBadge}</div>
//       </div>

//       {/* Question */}
//       <p
//         className={`mt-1 font-medium break-words ${
//           isClickable ? "hover:underline cursor-pointer" : "opacity-50"
//         }`}
//         onClick={() => isClickable && onViewMore(q._id!)}
//       >
//         {truncate(q.question, 80)}
//       </p>

//       {/* Timer */}
//       <div className="mt-1 text-xs text-muted-foreground">
//         <TimerDisplay timer={timer} status={q.status} />
//       </div>

//       {/* Grid of details */}
//       <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 text-xs">
//         <div className="flex gap-1">
//           <span className="text-muted-foreground">Priority:</span>
//           <span className="flex-shrink-0">{priorityBadge}</span>
//         </div>
//         <div className="flex gap-1">
//           <span className="text-muted-foreground">Review Level:</span>
//           <span className="flex-shrink-0">{q.review_level_number}</span>
//         </div>

//         <div className="truncate">
//           <span className="text-muted-foreground">State:</span>
//           <span className="ml-1">{truncate(q.details.state, 10)}</span>
//         </div>

//         <div className="truncate">
//           <span className="text-muted-foreground">Crop:</span>
//           <span className="ml-1">{truncate(q.details.crop, 10)}</span>
//         </div>

//         <div className="truncate flex items-center gap-1">
//           <span className="text-muted-foreground">Source:</span>
//           <Badge variant="outline" className="px-1 py-0 text-[10px]">
//             {q.source}
//           </Badge>
//         </div>

//         <div>
//           <span className="text-muted-foreground">Answers:</span>
//           <span className="ml-1">{q.totalAnswersCount}</span>
//         </div>

//         <div className="truncate">
//           <span className="text-muted-foreground">Created:</span>
//           <span className="ml-1">
//             {formatDate(new Date(q.createdAt!), false)}
//           </span>
//         </div>
//       </div>

//       {/* Actions */}
//       <div className="flex justify-end mt-4">
//         <DropdownMenu>
//           <DropdownMenuTrigger asChild>
//             <Button size="icon" variant="outline" className="w-8 h-8 p-1">
//               <MoreVertical className="w-4 h-4" />
//             </Button>
//           </DropdownMenuTrigger>

//           <DropdownMenuContent align="end" className="w-40 text-sm">
//             <DropdownMenuItem onClick={() => onViewMore(q._id!)}>
//               <Eye className="w-4 h-4 mr-2" />
//               View
//             </DropdownMenuItem>

//             <DropdownMenuSeparator />

//             {userRole === "expert" ? (
//               <DropdownMenuItem
//                 onSelect={(e) => {
//                   e.preventDefault();
//                   setSelectedQuestion(q);
//                   setEditOpen(true);
//                 }}
//               >
//                 <AlertCircle className="w-4 h-4 mr-2 text-red-500" />
//                 Raise Flag
//               </DropdownMenuItem>
//             ) : (
//               <>
//                 <DropdownMenuItem
//                   onSelect={(e) => {
//                     e.preventDefault();
//                     setSelectedQuestion(q);
//                     setEditOpen(true);
//                   }}
//                 >
//                   <Edit className="w-4 h-4 mr-2 text-blue-500" />
//                   Edit
//                 </DropdownMenuItem>

//                 <DropdownMenuSeparator />

//                 {/* Delete with confirmation */}
//                 <DropdownMenuItem asChild>
//                   <ConfirmationModal
//                     title="Delete Question Permanently?"
//                     description="Are you sure you want to delete this question?"
//                     confirmText="Delete"
//                     cancelText="Cancel"
//                     isLoading={deletingQuestion}
//                     type="delete"
//                     onConfirm={() => handleDelete()}
//                     trigger={
//                       <button className="flex w-full items-center">
//                         <Trash className="w-4 h-4 mr-2 text-red-500" />
//                         {deletingQuestion ? "Deleting..." : "Delete"}
//                       </button>
//                     }
//                   />
//                 </DropdownMenuItem>
//               </>
//             )}
//           </DropdownMenuContent>
//         </DropdownMenu>
//       </div>
//     </div>
//   );
// };

// interface AddOrEditQuestionDialogProps {
//   open: boolean;
//   setOpen: (open: boolean) => void;
//   updatedData: IDetailedQuestion | null;
//   setUpdatedData: React.Dispatch<
//     React.SetStateAction<IDetailedQuestion | null>
//   >;
//   onSave?: (
//     mode: "add" | "edit",
//     entityId?: string,
//     flagReason?: string,
//     status?: QuestionStatus,
//     formData?: FormData,
//   ) => void;
//   question?: IDetailedQuestion | null;
//   userRole: UserRole;
//   isLoadingAction: boolean;
//   mode: "add" | "edit";
// }

// export const AddOrEditQuestionDialog = ({
//   open,
//   setOpen,
//   updatedData,
//   setUpdatedData,
//   onSave,
//   question,
//   userRole,
//   isLoadingAction,
//   mode,
// }: AddOrEditQuestionDialogProps) => {
//   const [flagReason, setFlagReason] = useState("");
//   const [file, setFile] = useState<File | null>(null);
//   const [error, setError] = useState<string | null>(null);
//   useEffect(() => {
//     if (mode === "edit" && question) {
//       setUpdatedData(question);
//     } else if (mode === "add") {
//       setUpdatedData({
//         question: "",
//         priority: "medium",
//         source: "AGRI_EXPERT",
//         details: {
//           state: "",
//           district: "",
//           crop: "",
//           season: "",
//           domain: "",
//         },
//       } as IDetailedQuestion);
//     }
//   }, [question, mode]);

//   return (
//     <Dialog open={open} onOpenChange={setOpen}>
//       <DialogContent className="sm:max-w-xl">
//         <DialogHeader>
//           <DialogTitle className="flex items-center gap-2">
//             {mode === "add" ? (
//               <>
//                 <PlusCircle
//                   className="h-5 w-5 text-green-500"
//                   aria-hidden="true"
//                 />
//                 <span>Add New Question</span>
//               </>
//             ) : userRole === "expert" ? (
//               <>
//                 <AlertCircle
//                   className="h-5 w-5 text-destructive"
//                   aria-hidden="true"
//                 />
//                 <span>Raise Flag & Suggest Edit</span>
//               </>
//             ) : (
//               <>
//                 <PencilLine
//                   className="h-5 w-5 text-blue-500"
//                   aria-hidden="true"
//                 />
//                 <span>Edit Question</span>
//               </>
//             )}
//           </DialogTitle>
//         </DialogHeader>

//         <div className="h-[420px] ">
//           {file ? (
//             // File preview: center content
//             <div className="flex items-center justify-center h-full p-4">
//               <div className="relative w-full max-w-md">
//                 <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full border-4 border-background flex items-center justify-center bg-green-600 z-10">
//                   <Check className="h-5 w-5 text-white" />
//                 </div>
//                 <TooltipProvider>
//                   <Tooltip>
//                     <TooltipTrigger asChild>
//                       <div className="absolute top-0 left-0 w-10 h-10 rounded-full  flex items-center justify-center  z-10 cursor-pointer transition-colors">
//                         <Info className="h-5 w-5 text-white" />
//                       </div>
//                     </TooltipTrigger>
//                     <TooltipContent
//                       side="bottom"
//                       align="start"
//                       className="max-w-xs text-sm"
//                     >
//                       Before submitting the JSON file, ensure all required
//                       fields are present. Any question already existing in the
//                       database will be skipped automatically.
//                     </TooltipContent>
//                   </Tooltip>
//                 </TooltipProvider>
//                 <div className="relative overflow-hidden rounded-xl border-2 border-border bg-card shadow-lg transition-all hover:shadow-xl">
//                   <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-accent/5 opacity-50" />

//                   <div className="relative p-8 space-y-6">
//                     <div className="flex justify-center">
//                       <div className="relative">
//                         <div className="absolute inset-0 bg-primary/20 rounded-full blur-xl" />
//                         <div className="relative w-20 h-20 rounded-full border-2 border-border bg-background flex items-center justify-center">
//                           <File className="h-10 w-10 text-primary" />
//                         </div>
//                       </div>
//                     </div>

//                     <div className="text-center space-y-2">
//                       <p className="text-lg font-semibold text-foreground truncate px-4">
//                         {file.name}
//                       </p>
//                       {file.size && (
//                         <p className="text-sm text-muted-foreground">
//                           {(file.size / 1024).toFixed(2)} KB
//                         </p>
//                       )}
//                     </div>

//                     <div className="flex justify-center">
//                       <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border border-border bg-background">
//                         {file.name.split(".").pop()?.toUpperCase() || "FILE"}
//                       </span>
//                     </div>

//                     <div className="flex gap-3 pt-2">
//                       <Button
//                         type="button"
//                         variant="outline"
//                         onClick={() => setFile(null)}
//                         className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive dark:text-red-800"
//                       >
//                         <X className="h-4 w-4 mr-2" />
//                         Remove
//                       </Button>
//                     </div>
//                   </div>
//                 </div>
//               </div>
//             </div>
//           ) : (
//             <ScrollArea className="h-full pr-4">
//               <div className="grid gap-4 p-2">
//                 <div className="flex flex-col gap-4">
//                   <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
//                     <MessageSquareText className="h-4 w-4" aria-hidden="true" />
//                     <label>Question Text*</label>
//                   </div>
//                   <Textarea
//                     placeholder="Enter question text"
//                     value={updatedData?.question || ""}
//                     onChange={(e) =>
//                       setUpdatedData((prev) =>
//                         prev ? { ...prev, question: e.target.value } : prev,
//                       )
//                     }
//                     rows={3}
//                   />
//                   {mode === "add" && (
//                     <>
//                       <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
//                         <Info className="h-4 w-4" aria-hidden="true" />
//                         <label>Context</label>
//                       </div>

//                       <Textarea
//                         placeholder="Mention the context for this question...."
//                         value={updatedData?.context || ""}
//                         onChange={(e) =>
//                           setUpdatedData((prev) =>
//                             prev ? { ...prev, context: e.target.value } : prev,
//                           )
//                         }
//                         className="h-32 resize-none overflow-y-auto"
//                       />
//                     </>
//                   )}
//                   <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
//                     <FlagTriangleRight className="h-4 w-4" aria-hidden="true" />
//                     <label>Priority*</label>
//                   </div>
//                   <Select
//                     value={updatedData?.priority || "medium"}
//                     onValueChange={(v) =>
//                       setUpdatedData((prev) =>
//                         prev
//                           ? { ...prev, priority: v as QuestionPriority }
//                           : prev,
//                       )
//                     }
//                   >
//                     <SelectTrigger className="w-full">
//                       <SelectValue placeholder="Select priority" />
//                     </SelectTrigger>
//                     <SelectContent>
//                       <SelectItem value="low">Low</SelectItem>
//                       <SelectItem value="medium">Medium</SelectItem>
//                       <SelectItem value="high">High</SelectItem>
//                     </SelectContent>
//                   </Select>
//                   {userRole !== "expert" &&
//                     mode == "edit" &&
//                     question?.status !== "closed" && (
//                       <>
//                         <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
//                           <CheckCircle className="h-4 w-4" aria-hidden="true" />
//                           <label>Status*</label>
//                         </div>
//                         <Select
//                           value={updatedData?.status || "open"}
//                           onValueChange={(v) =>
//                             setUpdatedData((prev) =>
//                               prev
//                                 ? { ...prev, status: v as QuestionStatus }
//                                 : prev,
//                             )
//                           }
//                         >
//                           <SelectTrigger className="w-full">
//                             <SelectValue placeholder="Select priority" />
//                           </SelectTrigger>
//                           <SelectContent>
//                             <SelectItem value="open">Open</SelectItem>
//                             <SelectItem value="in-review">In review</SelectItem>
//                             <SelectItem value="delayed">Delayed</SelectItem>
//                             <SelectItem value="closed">Closed</SelectItem>
//                           </SelectContent>
//                         </Select>
//                       </>
//                     )}
//                   {/* <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
//                   <Globe className="h-4 w-4" aria-hidden="true" />
//                   <label>Source*</label>
//                 </div> */}
//                   {/* <Select
//                   value={updatedData?.source || "AJRASAKHA"}
//                   onValueChange={(v) =>
//                     setUpdatedData((prev) =>
//                       prev ? { ...prev, source: v as QuestionSource } : prev
//                     )
//                   }
//                 >
//                   <SelectTrigger className="w-full">
//                     <SelectValue placeholder="Select source" />
//                   </SelectTrigger>
//                   <SelectContent>
//                     <SelectItem value="AJRASAKHA">AJRASAKHA</SelectItem>
//                     <SelectItem value="AGRI_EXPERT">AGRI_EXPERT</SelectItem>
//                   </SelectContent>
//                 </Select> */}

//                   {(
//                     [
//                       "state",
//                       "district",
//                       "crop",
//                       "season",
//                       "domain",
//                     ] as DetailField[]
//                   ).map((field) => {
//                     return (
//                       <div key={field} className="flex flex-col gap-2">
//                         <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
//                           <label>
//                             {field.charAt(0).toUpperCase() + field.slice(1)}*
//                           </label>
//                         </div>
//                         {/* <Input
//                         type="text"
//                         value={updatedData?.details?.[field] || ""}
//                         onChange={(e) =>
//                           setUpdatedData((prev) =>
//                             prev
//                               ? {
//                                   ...prev,
//                                   details: {
//                                     ...prev.details,
//                                     [field]: e.target.value,
//                                   },
//                                 }
//                               : prev
//                           )
//                         }
//                       />*/}
//                         {OPTIONS[field] ? (
//                           <Select
//                             value={
//                               updatedData?.details?.[field]?.trim()
//                                 ? updatedData.details[field]
//                                 : undefined
//                             }
//                             onValueChange={(val) =>
//                               setUpdatedData((prev) =>
//                                 prev
//                                   ? {
//                                       ...prev,
//                                       details: {
//                                         ...prev.details,
//                                         [field]: val,
//                                       },
//                                     }
//                                   : prev,
//                               )
//                             }
//                           >
//                             <SelectTrigger className="w-full">
//                               <SelectValue placeholder={`Select ${field}`} />
//                             </SelectTrigger>

//                             <SelectContent>
//                               {OPTIONS[field]?.map((option) => (
//                                 <SelectItem key={option} value={option}>
//                                   {option}
//                                 </SelectItem>
//                               ))}
//                             </SelectContent>
//                           </Select>
//                         ) : (
//                           <Input
//                             type="text"
//                             value={updatedData?.details?.district || ""}
//                             onChange={(e) =>
//                               setUpdatedData((prev) =>
//                                 prev
//                                   ? {
//                                       ...prev,
//                                       details: {
//                                         ...prev.details,
//                                         district: e.target.value,
//                                       },
//                                     }
//                                   : prev,
//                               )
//                             }
//                           />
//                         )}
//                       </div>
//                     );
//                   })}
//                 </div>

//                 {userRole === "expert" && mode === "edit" && (
//                   <>
//                     <Separator className="my-4" />
//                     <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
//                       <AlertCircle
//                         className="h-4 w-4 text-destructive"
//                         aria-hidden="true"
//                       />
//                       <label>Reason for Flagging*</label>
//                     </div>
//                     <div className="border rounded-md overflow-hidden">
//                       <Textarea
//                         placeholder="Enter your reason for flagging..."
//                         value={flagReason}
//                         onChange={(e) => setFlagReason(e.target.value)}
//                         className="h-32 resize-none overflow-y-auto"
//                       />
//                     </div>
//                   </>
//                 )}
//               </div>
//             </ScrollArea>
//           )}
//         </div>

//         <DialogFooter className="flex justify-end gap-2">
//           {/* <X className="mr-2 h-4 w-4" aria-hidden="true" />  */}
//           {mode === "add" ? (
//             <>
//               <input
//                 type="file"
//                 id="upload-json"
//                 accept=".json,.xls, .xlsx, application/json, application/vnd.ms-excel, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
//                 className="hidden"
//                 onChange={(e) => {
//                   let input = e.target;
//                   const selected = e.target.files?.[0];
//                   if (selected) setFile(selected);
//                   setError(null);
//                   const allowedTypes = [
//                     "application/json",
//                     "application/vnd.ms-excel",
//                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
//                   ];

//                   if (!selected || !allowedTypes.includes(selected.type)) {
//                     setError("Only JSON And EXCEL files are allowed.");
//                     setFile(null);
//                     setTimeout(() => {
//                       setError(null);
//                     }, 2000);
//                     input.value = "";
//                     return;
//                   }
//                   const maxSize = 5 * 1024 * 1024;
//                   if (selected.size > maxSize) {
//                     setError("File size must be less than 5MB.");
//                     setFile(null);
//                     setTimeout(() => {
//                       setError(null);
//                     }, 2000);
//                     input.value = "";
//                     return;
//                   }
//                   setFile(selected);
//                   input.value = "";
//                 }}
//               />

//               <label htmlFor="upload-json">
//                 <Button
//                   asChild
//                   variant="default"
//                   className="bg-dark hover:bg-dark  cursor-pointer flex items-center gap-2"
//                 >
//                   <span className="flex items-center gap-2">
//                     {file ? (
//                       <>
//                         {/* <Attachment className="h-4 w-4" /> Show attachment icon */}
//                         <PaperclipIcon className="h-4 w-4" />
//                         <span
//                           className="truncate text-sm text-muted-foreground"
//                           title={file.name}
//                         >
//                           {truncate(file.name, 20)}
//                         </span>
//                         <button
//                           type="button"
//                           onClick={(e) => {
//                             e.stopPropagation();
//                             e.preventDefault();
//                             setFile(null); // Remove file
//                           }}
//                           className="ml-2 text-dark "
//                         >
//                           <X className="h-4 w-4 text-dark dark:text-white" />
//                         </button>
//                       </>
//                     ) : (
//                       <>
//                         <Upload className="h-4 w-4" /> Upload FILE
//                       </>
//                     )}
//                   </span>
//                 </Button>
//               </label>

//               {error && <p className="text-red-500 text-sm mt-1">{error}</p>}

//               <Button variant="outline" onClick={() => setOpen(false)}>
//                 <X className="mr-2 h-4 w-4" aria-hidden="true" />
//                 Cancel
//               </Button>

//               <Button
//                 variant="default"
//                 onClick={() => {
//                   if (file) {
//                     const formData = new FormData();
//                     formData.append("file", file);
//                     onSave?.("add", undefined, undefined, undefined, formData);
//                     setFile(null);
//                   } else {
//                     onSave?.("add");
//                   }
//                 }}
//               >
//                 <Save className="mr-2 h-4 w-4" aria-hidden="true" />
//                 {isLoadingAction ? "Adding..." : "Add Question"}
//               </Button>
//             </>
//           ) : userRole === "expert" ? (
//             <Button
//               variant="destructive"
//               disabled={isLoadingAction}
//               onClick={() => {
//                 onSave?.("edit", question?._id!, flagReason);
//               }}
//             >
//               <Flag className="mr-2 h-4 w-4" aria-hidden="true" />
//               {isLoadingAction ? "Submitting..." : "Submit"}
//             </Button>
//           ) : (
//             <Button
//               variant="default"
//               onClick={() => {
//                 onSave?.("edit", question?._id!);
//               }}
//             >
//               <Save className="mr-2 h-4 w-4" aria-hidden="true" />
//               {isLoadingAction ? "Saving..." : "Save"}
//             </Button>
//           )}
//         </DialogFooter>
//       </DialogContent>
//     </Dialog>
//   );
// };

// type QuestionsFiltersProps = {
//   search: string;
//   states: string[];
//   onChange: (next: AdvanceFilterValues) => void;
//   crops: string[];
//   onReset: () => void;
//   setSearch: (val: string) => void;
//   setUploadedQuestionsCount: (val: number) => void;
//   setIsBulkUpload: (val: boolean) => void;
//   refetch: () => void;
//   totalQuestions: number;
//   userRole: UserRole;
//   isSelectionModeOn: boolean;
//   bulkDeletingQuestions: boolean;
//   handleBulkDelete: () => void;
//   selectedQuestionIds: string[];
//   setIsSelectionModeOn: (value: boolean) => void;
//   setSelectedQuestionIds: (value: string[]) => void;
//   viewMode: "all" | "review-level";
//   setViewMode: (v: "all" | "review-level") => void;
// };

// export const QuestionsFilters = ({
//   search,
//   setSearch,
//   setUploadedQuestionsCount,
//   setIsBulkUpload,
//   crops,
//   states,
//   onChange,
//   onReset,
//   refetch,
//   totalQuestions,
//   userRole,
//   isSelectionModeOn,
//   handleBulkDelete,
//   selectedQuestionIds,
//   setSelectedQuestionIds,
//   setIsSelectionModeOn,
//   bulkDeletingQuestions,
//   viewMode,
//   setViewMode,
// }: QuestionsFiltersProps) => {
//   const [advanceFilter, setAdvanceFilterValues] = useState<AdvanceFilterValues>(
//     {
//       status: "all",
//       source: "all",
//       state: "all",
//       answersCount: [0, 100],
//       dateRange: "all",
//       crop: "all",
//       priority: "all",
//       domain: "all",
//       user: "all",
//       endTime: undefined,
//       startTime: undefined,
//       review_level: "all",
//       closedAtStart: undefined,
//       closedAtEnd: undefined,
//     },
//   );
//   const [addOpen, setAddOpen] = useState(false);
//   const [updatedData, setUpdatedData] = useState<IDetailedQuestion | null>(
//     null,
//   );

//   const { mutateAsync: addQuestion, isPending: addingQuestion } =
//     useAddQuestion((count, isBulkUpload) => {
//       setUploadedQuestionsCount(count);
//       setIsBulkUpload(isBulkUpload);
//     });

//   const handleAddQuestion = async (
//     mode: "add" | "edit",
//     entityId?: string,
//     flagReason?: string,
//     status?: QuestionStatus,
//     formData?: FormData,
//   ) => {
//     try {
//       if (mode !== "add") return;
//       if (formData) {
//         await addQuestion(formData as any);
//         // toast.success('File Uploaded succesfully')
//         setAddOpen(false);
//         return;
//       }
//       if (!updatedData) {
//         toast.error("No data found to add. Please try again!");
//         return;
//       }

//       const payload = {
//         question: updatedData.question?.trim() ?? "",
//         priority: updatedData.priority ?? "medium",
//         source: "AGRI_EXPERT" as QuestionSource,
//         details: updatedData.details,
//         context: updatedData.context || "",
//       };

//       if (!payload.question) {
//         toast.error("Please enter a question before submitting.");
//         return;
//       }
//       if (payload.question.length < 10) {
//         toast.error("Question must be at least 10 characters long.");
//         return;
//       }

//       if (!payload.priority) {
//         toast.error("Please select a priority (Low, Medium, or High).");
//         return;
//       }
//       if (!["low", "medium", "high"].includes(payload.priority)) {
//         toast.error(
//           "Invalid priority value. Please reselect from the options.",
//         );
//         return;
//       }

//       if (!payload.source) {
//         toast.error("Please select a source (AJRASAKHA or AGRI_EXPERT).");
//         return;
//       }
//       if (!["AJRASAKHA", "AGRI_EXPERT"].includes(payload.source)) {
//         toast.error(
//           "Invalid source selected. Please reselect from the options.",
//         );
//         return;
//       }

//       if (!payload.details) {
//         toast.error("Please fill in the question details.");
//         return;
//       }

//       const { state, district, crop, season, domain } = payload.details;

//       if (!state?.trim()) {
//         toast.error("Please Select the State field.");
//         return;
//       }

//       if (!district?.trim()) {
//         toast.error("Please enter the District field.");
//         return;
//       }

//       if (!crop?.trim()) {
//         toast.error("Please Select the Crop field.");
//         return;
//       }

//       if (!season?.trim()) {
//         toast.error("Please Select the Season field.");
//         return;
//       }

//       if (!domain?.trim()) {
//         toast.error("Please Select the Domain field.");
//         return;
//       }

//       await addQuestion(payload);
//       // toast.success("Question added successfully.");
//       setAddOpen(false);
//     } catch (error) {
//       console.error("Error in handleAddQuestion:", error);
//       // toast.error("An unexpected error occurred. Please try again.");
//       setAddOpen(false);
//     }
//   };

//   const handleDialogChange = (key: string, value: any) => {
//     setAdvanceFilterValues((prev) => ({ ...prev, [key]: value }));
//   };

//   const handleApplyFilters = (myPreference?: IMyPreference) => {
//     onChange({
//       status: advanceFilter.status,
//       source: advanceFilter.source,
//       state: myPreference?.state || advanceFilter.state,
//       crop: myPreference?.crop || advanceFilter.crop,
//       answersCount: advanceFilter.answersCount,
//       dateRange: advanceFilter.dateRange,
//       priority: advanceFilter.priority,
//       domain: myPreference?.domain || advanceFilter.domain,
//       user: advanceFilter.user,
//       endTime: advanceFilter.endTime ?? null,
//       startTime: advanceFilter.startTime ?? null,
//       review_level: advanceFilter?.review_level,
//       closedAtStart: advanceFilter?.closedAtStart ?? null,
//       closedAtEnd: advanceFilter?.closedAtEnd ?? null,
//     });
//   };

//   /*const activeFiltersCount = Object.values(advanceFilter).filter(
//     (v) =>
//       v !== undefined &&
//       v !== "all" &&
//       !(Array.isArray(v) && v[0] === 0 && v[1] === 100)
//   ).length;*/
//   const activeFiltersCount =
//     Object.entries(advanceFilter).filter(([key, value]) => {
//       // ❌ exclude date range internal fields
//       if (
//         key === "startTime" ||
//         key === "endTime" ||
//         key === "closedAtStart" ||
//         key === "closedAtEnd"
//       ) {
//         return false;
//       }

//       // ignore defaults
//       if (value === undefined || value === "all") return false;

//       //  ignore default slider range
//       if (Array.isArray(value) && value[0] === 0 && value[1] === 100) {
//         return false;
//       }

//       return true;
//     }).length +
//     // ✅ Created date range counts as ONE
//     (advanceFilter.startTime || advanceFilter.endTime ? 1 : 0) +
//     // ✅ ClosedAt date range counts as ONE
//     (advanceFilter.closedAtStart || advanceFilter.closedAtEnd ? 1 : 0);

//   return (
//     <div className="w-full p-4 border-b bg-card ms-2 md:ms-0  rounded flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
//       {/* Add Dialog (No change) */}
//       <AddOrEditQuestionDialog
//         open={addOpen}
//         setOpen={setAddOpen}
//         setUpdatedData={setUpdatedData}
//         updatedData={updatedData}
//         onSave={handleAddQuestion}
//         userRole={userRole!}
//         isLoadingAction={addingQuestion}
//         mode="add"
//       />

//       {/* SEARCH BAR – full width on mobile, fixed width on desktop */}
//       <div className="w-full sm:flex-1 sm:min-w-[250px] sm:max-w-[400px]">
//         <div className="relative w-full">
//           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />

//           <Input
//             placeholder="Search questions by id, state, crops..."
//             value={search}
//             onChange={(e) => {
//               if (userRole !== "expert") onReset();
//               setSearch(e.target.value);
//             }}
//             className="pl-9 pr-9 bg-background"
//           />

//           {search && (
//             <button
//               onClick={() => setSearch("")}
//               className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
//             >
//               <X className="h-4 w-4" />
//             </button>
//           )}
//         </div>
//       </div>

//       <div className="w-full sm:w-auto flex flex-wrap items-center gap-3 justify-between sm:justify-end">
//         <div className="relative inline-block">
//           <TopRightBadge label="New" />
//           <div className="flex gap-2 border rounded-md p-1 bg-muted/40">
//             <button
//               className={`px-3 py-1 rounded-md text-sm ${
//                 viewMode === "all"
//                   ? "bg-primary text-white"
//                   : "text-muted-foreground"
//               }`}
//               onClick={() => setViewMode("all")}
//             >
//               Normal
//             </button>

//             <button
//               className={`px-3 py-1 rounded-md text-sm ${
//                 viewMode === "review-level"
//                   ? "bg-primary text-white"
//                   : "text-muted-foreground"
//               }`}
//               onClick={() => setViewMode("review-level")}
//             >
//               Turn Around
//             </button>
//           </div>
//         </div>

//         <AdvanceFilterDialog
//           advanceFilter={advanceFilter}
//           setAdvanceFilterValues={setAdvanceFilterValues}
//           handleDialogChange={handleDialogChange}
//           handleApplyFilters={handleApplyFilters}
//           normalizedStates={states}
//           crops={crops}
//           activeFiltersCount={activeFiltersCount}
//           onReset={onReset}
//           isForQA={false}
//         />

//         <Button
//           variant="outline"
//           size="icon"
//           className="w-10 h-10 sm:w-12 sm:h-10 flex-none hidden md:flex"
//           onClick={refetch}
//         >
//           <RefreshCcw className="h-4 w-4" />
//         </Button>

//         {userRole !== "expert" && (
//           <Button
//             variant="default"
//             size="sm"
//             className="flex items-center gap-2 w-full md:w-fit"
//             onClick={() => setAddOpen(true)}
//           >
//             <Plus className="h-4 w-4" />
//             Add Question
//           </Button>
//         )}

//         {
//           isSelectionModeOn && (
//             <div className="hidden md:flex items-center gap-4 whitespace-nowrap">
//               {/* Bulk delete with count */}
//               <ConfirmationModal
//                 title="Delete Selected Questions?"
//                 description={`Are you sure you want to delete ${
//                   selectedQuestionIds.length
//                 } selected question${
//                   selectedQuestionIds.length > 1 ? "s" : ""
//                 }? This action is irreversible.`}
//                 confirmText="Delete"
//                 cancelText="Cancel"
//                 isLoading={bulkDeletingQuestions}
//                 type="delete"
//                 onConfirm={handleBulkDelete}
//                 trigger={
//                   <Button
//                     variant="destructive"
//                     size="sm"
//                     disabled={
//                       selectedQuestionIds.length === 0 || bulkDeletingQuestions
//                     }
//                     className="flex items-center gap-2 transition-all"
//                   >
//                     <Trash className="h-4 w-4" />
//                     {bulkDeletingQuestions
//                       ? `Deleting (${selectedQuestionIds.length})...`
//                       : `Delete (${selectedQuestionIds.length})`}
//                   </Button>
//                 }
//               />

//               {/* Cancel selection */}
//               <Button
//                 variant="outline"
//                 size="sm"
//                 onClick={() => {
//                   setIsSelectionModeOn(false);
//                   setSelectedQuestionIds([]);
//                 }}
//                 className="flex items-center gap-2 transition-all"
//               >
//                 Cancel
//               </Button>
//             </div>
//           )
//           // ) : (
//           //   <span className="hidden md:block text-sm text-muted-foreground whitespace-nowrap">
//           //     Total: {totalQuestions}
//           //   </span>
//           // )
//         }
//         <span className="hidden md:block text-sm text-muted-foreground whitespace-nowrap">
//           Total: {totalQuestions}
//         </span>
//       </div>
//     </div>
//   );
// };
