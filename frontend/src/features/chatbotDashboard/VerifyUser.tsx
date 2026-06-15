// import { useState, useEffect, useRef } from "react";
// import {
//   X,
//   Search,
//   AlertCircle,
//   Inbox,
//   CheckCircle2,
//   UserCheck,
// } from "lucide-react";
// import { Button } from "@/components/atoms/button";
// import {
//   Card,
//   CardContent,
//   CardHeader,
//   CardTitle,
// } from "@/components/atoms/card";
// import { Skeleton } from "@/components/atoms/skeleton";
// import { Pagination } from "@/components/pagination";

// import {
//   ContextMenu,
//   ContextMenuTrigger,
// } from "@/components/atoms/context-menu";

// import { Input } from "@/components/atoms/input";
// import {
//   Table,
//   TableBody,
//   TableCell,
//   TableHead,
//   TableHeader,
//   TableRow,
// } from "@/components/atoms/table";

// import { motion, AnimatePresence } from "framer-motion";
// import { useDebounce } from "@/hooks/ui/useDebounce";
// import { useGetUnverifiedUsers } from "@/hooks/api/user/useGetUnverifiedUsers";
// import { useVerifyUserAnalytics } from "@/hooks/api/user/useVerifyUserAnalytics";
// import type { IUnverifiedUser } from "@/types";

// const EMPTY_VALUE = "Not provided";

// function EmptyValue() {
//   return <span className="text-muted-foreground">{EMPTY_VALUE}</span>;
// }

// interface UserDetailsViewProps {
//   source?: "vicharanashala" | "annam" | undefined;
//   initialFilters?: Partial<{ search: string }>;
//   userType?: "all" | "external" | "internal";
// }

// export function VerifyUser({
//   source: _source = "vicharanashala",
//   initialFilters,
//   userType: _userType = "all",
// }: UserDetailsViewProps) {
//   const [search, setSearch] = useState(initialFilters?.search ?? "");
//   const [currentPage, setCurrentPage] = useState(1);
//   const [pageSize, setPageSize] = useState(12);
//   const tableRef = useRef<HTMLDivElement>(null);
//   const debouncedSearch = useDebounce(search, 500);
//   const verifyUserMutation = useVerifyUserAnalytics();
//   const verifyingUserId = verifyUserMutation.isPending
//     ? verifyUserMutation.variables?.userId
//     : null;

//   const scrollToTable = () => {
//     requestAnimationFrame(() => {
//       setTimeout(() => {
//         tableRef.current?.scrollIntoView({
//           behavior: "smooth",
//           block: "start",
//         });
//       }, 300);
//     });
//   };

//   useEffect(() => {
//     setCurrentPage(1);
//   }, [debouncedSearch]);

//   // Apply initialFilters when they change (e.g. clicking from AlertCard in overview)
//   useEffect(() => {
//     if (initialFilters) {
//       setSearch(initialFilters.search ?? "");
//       setCurrentPage(1);
//       scrollToTable();
//     }
//   }, [initialFilters]);

//   const { data, isLoading, error } = useGetUnverifiedUsers({
//     page: currentPage,
//     limit: pageSize,
//     search: debouncedSearch,
//   });

//   const { users, totalUsers, totalPages } = data ?? {
//     users: [] as IUnverifiedUser[],
//     totalUsers: 0,
//     totalPages: 1,
//   };

//   const isFiltered = Boolean(search.trim());
  
//   const handleVerifyUser = async (userId: string) => {
//     try {
//       const response = await verifyUserMutation.mutateAsync({
//         userId,
//         source: _source,
//       });

//       toast.success(response?.message || "User verified successfully");
//     } catch (error: any) {
//       toast.error(error?.message || "Failed to verify user");
//     }
//   };

//   return (
//     <div className="flex-1 overflow-y-auto  min-w-0 bg-gradient-to-b from-background to-muted/30 mt-4">
//       <div ref={tableRef}>
//         <Card className="bg-gradient-to-br from-card to-card/50 backdrop-blur-sm border-border/60 shadow-sm hover:shadow-md transition-shadow duration-300">
//           {/* ─────────── Header ─────────── */}
//           <CardHeader className="pb-4 border-b border-border/60">
//             <motion.div
//               initial={{ opacity: 0, y: -8 }}
//               animate={{ opacity: 1, y: 0 }}
//               transition={{ duration: 0.35, ease: "easeOut" }}
//               className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"
//             >
//               {/* Title */}
//               <div className="min-w-0 flex items-start gap-3">
//                 <motion.div
//                   whileHover={{ rotate: -6, scale: 1.05 }}
//                   transition={{ type: "spring", stiffness: 300, damping: 18 }}
//                   className="p-2 rounded-lg bg-primary/10 ring-1 ring-primary/15 shrink-0"
//                 >
//                   <UserCheck className="h-4 w-4 text-primary" />
//                 </motion.div>
//                 <div className="min-w-0">
//                   <CardTitle className="text-base font-semibold tracking-tight truncate">
//                     User Verfication
//                   </CardTitle>
//                   <p className="text-sm text-muted-foreground mt-0.5">
//                     Approve registered farmers before chatbot access.
//                   </p>
//                 </div>
//               </div>

//               {/* Search */}
//               <div className="relative w-full lg:max-w-xs lg:flex-1">
//                 <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
//                 <Input
//                   type="text"
//                   placeholder="Search by name or email..."
//                   value={search}
//                   onChange={(e) => setSearch(e.target.value)}
//                   className="h-10 pl-9 pr-9 bg-background focus-visible:ring-primary/30 focus-visible:border-primary transition-all"
//                 />
//                 <AnimatePresence>
//                   {search && (
//                     <motion.button
//                       initial={{ opacity: 0, scale: 0.8 }}
//                       animate={{ opacity: 1, scale: 1 }}
//                       exit={{ opacity: 0, scale: 0.8 }}
//                       onClick={() => setSearch("")}
//                       className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
//                       aria-label="Clear search"
//                     >
//                       <X className="h-3.5 w-3.5" />
//                     </motion.button>
//                   )}
//                 </AnimatePresence>
//               </div>
//             </motion.div>
//           </CardHeader>

//           {/* ─────────── Content ─────────── */}
//           <CardContent className="p-0">
//             {/* Loading */}
//             {isLoading && (
//               <div className="space-y-2 p-4">
//                 {Array.from({ length: 6 }).map((_, i) => (
//                   <Skeleton key={i} className="h-12 w-full rounded-md" />
//                 ))}
//               </div>
//             )}

//             {/* Error */}
//             {error && (
//               <motion.div
//                 initial={{ opacity: 0, y: 8 }}
//                 animate={{ opacity: 1, y: 0 }}
//                 className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center"
//               >
//                 <div className="p-3 rounded-full bg-destructive/10">
//                   <AlertCircle className="h-5 w-5 text-destructive" />
//                 </div>
//                 <p className="text-sm font-medium text-foreground">
//                   Something went wrong
//                 </p>
//                 <p className="text-xs text-muted-foreground">
//                   Failed to load user details. Please try again.
//                 </p>
//               </motion.div>
//             )}

//             {/* Table */}
//             {!isLoading && !error && (
//               <div className="overflow-x-auto">
//                 <Table className="min-w-[720px]">
//                   <TableHeader className="bg-muted/40 sticky top-0 z-10 backdrop-blur">
//                     <TableRow className="hover:bg-transparent border-border/60">
//                       <TableHead className="text-center w-12 text-xs font-medium text-muted-foreground uppercase tracking-wide">
//                         S.No
//                       </TableHead>
//                       <TableHead className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
//                         Name
//                       </TableHead>
//                       <TableHead className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
//                         Email
//                       </TableHead>
//                       <TableHead className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
//                         User Role
//                       </TableHead>
//                       <TableHead className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
//                         Joined At
//                       </TableHead>
//                       <TableHead className="text-center text-xs font-medium text-muted-foreground uppercase tracking-wide">
//                         Action
//                       </TableHead>
//                     </TableRow>
//                   </TableHeader>

//                   <TableBody>
//                     {users.length === 0 ? (
//                       <TableRow className="hover:bg-transparent">
//                         <TableCell colSpan={6} className="text-center py-16">
//                           <div className="flex flex-col items-center gap-2 text-muted-foreground">
//                             <div className="p-3 rounded-full bg-muted">
//                               <Inbox className="h-5 w-5" />
//                             </div>
//                             <p className="text-sm font-medium text-foreground">
//                               {isFiltered
//                                 ? "No matches found"
//                                 : "No farmers yet"}
//                             </p>
//                             <p className="text-xs">
//                               {isFiltered
//                                 ? "Try adjusting your filters or search."
//                                 : "Farmers you add will appear here."}
//                             </p>
//                           </div>
//                         </TableCell>
//                       </TableRow>
//                     ) : (
//                       users.map((user, idx) => {
//                         const isVerifyingThisUser = verifyingUserId === user._id;

//                         return (
//                         <ContextMenu
//                           key={user._id ?? user.email ?? idx}
//                           modal={false}
//                         >
//                           <ContextMenuTrigger asChild>
//                             <motion.tr
//                               initial={{ opacity: 0, y: 4 }}
//                               animate={{ opacity: 1, y: 0 }}
//                               transition={{
//                                 duration: 0.18,
//                                 delay: Math.min(idx * 0.02, 0.2),
//                               }}
//                               className="group text-center border-b border-border/40 hover:bg-muted/40 transition-colors duration-150"
//                             >
//                               <TableCell className="align-middle text-xs text-muted-foreground tabular-nums">
//                                 {(currentPage - 1) * pageSize + idx + 1}
//                               </TableCell>

//                               <TableCell className="align-middle font-medium whitespace-nowrap">
//                                 {user.username || user.name ? (
//                                   user.name || user.username
//                                 ) : (
//                                   <EmptyValue />
//                                 )}
//                               </TableCell>

//                               <TableCell className="align-middle whitespace-nowrap text-xs text-muted-foreground">
//                                 {user.email || <EmptyValue />}
//                               </TableCell>

//                               <TableCell className="align-middle whitespace-nowrap text-xs text-muted-foreground">
//                                 {user.role || <EmptyValue />}
//                               </TableCell>

//                               <TableCell className="align-middle whitespace-nowrap text-xs text-muted-foreground">
//                                 {user.createdAt ? (
//                                   new Date(user.createdAt).toLocaleDateString(
//                                     "en-IN",
//                                   )
//                                 ) : (
//                                   <EmptyValue />
//                                 )}
//                               </TableCell>

//                               <TableCell className="align-middle">
//                                 <Button
//                                   size="sm"
//                                   onClick={() => user._id && void handleVerifyUser(user._id)}
//                                   disabled={isVerifyingThisUser}
//                                   className="h-8 gap-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-emerald-400"
//                                 >
//                                   <CheckCircle2 className="h-3.5 w-3.5" />
//                                   {isVerifyingThisUser ? "Verifying..." : "Verify"}
//                                 </Button>
//                               </TableCell>
//                             </motion.tr>
//                           </ContextMenuTrigger>
//                         </ContextMenu>
//                         );
//                       })
//                     )}
//                   </TableBody>
//                 </Table>

//                 {/* Pagination */}
//                 {totalPages > 0 && (
//                   <div className="px-4 py-3 border-t border-border/60 bg-muted/20">
//                     <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
//                       <span className="text-xs text-muted-foreground">
//                         Showing{" "}
//                         <span className="font-medium text-foreground">
//                           {users.length > 0
//                             ? (currentPage - 1) * pageSize + 1
//                             : 0}
//                           –{(currentPage - 1) * pageSize + users.length}
//                         </span>{" "}
//                         of{" "}
//                         <span className="font-medium text-foreground">
//                           {totalUsers}
//                         </span>{" "}
//                         users
//                       </span>
//                       <Pagination
//                         currentPage={currentPage}
//                         totalPages={totalPages}
//                         onPageChange={setCurrentPage}
//                         limit={pageSize}
//                         onLimitChange={setPageSize}
//                       />
//                     </div>
//                   </div>
//                 )}
//               </div>
//             )}
//           </CardContent>
//         </Card>
//       </div>
//     </div>
//   );
// }
