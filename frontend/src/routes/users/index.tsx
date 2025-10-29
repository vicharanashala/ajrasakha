import { UsersFilters, UsersTable, type IUserRow } from '@/components/UsersTable';
import type { UserRole } from '@/types';
import { createFileRoute } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react';
import { useMemo, useState } from 'react';

export const Route = createFileRoute('/users/')({
  component: UsersPage,
})





export default function UsersPage() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | UserRole>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const LIMIT = 12;

  const dummyUsers: IUserRow[] = [
    { _id: "1", name: "John Doe", email: "john.doe@example.com", role: "expert", reputationScore: 150, currentRank: "Gold", updatedAt: "2025-10-01" },
    { _id: "2", name: "Jane Smith", email: "jane.smith@example.com", role: "moderator", reputationScore: 200, currentRank: "Platinum", updatedAt: "2025-10-15" },
    { _id: "3", name: "Alice Johnson", email: "alice.j@example.com", role: "expert", reputationScore: 120, currentRank: "Silver", updatedAt: "2025-09-20" },
    { _id: "4", name: "Bob Wilson", email: "bob.wilson@example.com", role: "moderator", reputationScore: 180, currentRank: "Gold", updatedAt: "2025-10-10" },
    { _id: "5", name: "Charlie Brown", email: "charlie.brown@example.com", role: "expert", reputationScore: 90, currentRank: "Bronze", updatedAt: "2025-09-25" },
    { _id: "6", name: "Diana Prince", email: "diana.prince@example.com", role: "expert", reputationScore: 250, currentRank: "Diamond", updatedAt: "2025-10-05" },
    { _id: "7", name: "Eve Davis", email: "eve.davis@example.com", role: "moderator", reputationScore: 110, currentRank: "Silver", updatedAt: "2025-10-12" },
    { _id: "8", name: "Frank Miller", email: "frank.miller@example.com", role: "expert", reputationScore: 300, currentRank: "Platinum", updatedAt: "2025-09-30" },
    { _id: "9", name: "Grace Lee", email: "grace.lee@example.com", role: "moderator", reputationScore: 140, currentRank: "Gold", updatedAt: "2025-10-18" },
    { _id: "10", name: "Henry Ford", email: "henry.ford@example.com", role: "expert", reputationScore: 80, currentRank: "Bronze", updatedAt: "2025-10-02" },
    { _id: "11", name: "Ivy Chen", email: "ivy.chen@example.com", role: "expert", reputationScore: 220, currentRank: "Platinum", updatedAt: "2025-09-28" },
    { _id: "12", name: "Jack Black", email: "jack.black@example.com", role: "moderator", reputationScore: 160, currentRank: "Gold", updatedAt: "2025-10-08" },
    { _id: "13", name: "Kara Danvers", email: "kara.danvers@example.com", role: "expert", reputationScore: 100, currentRank: "Silver", updatedAt: "2025-10-14" },
    { _id: "14", name: "Leo Messi", email: "leo.messi@example.com", role: "moderator", reputationScore: 280, currentRank: "Diamond", updatedAt: "2025-09-22" },
    { _id: "15", name: "Mia Wallace", email: "mia.wallace@example.com", role: "expert", reputationScore: 130, currentRank: "Silver", updatedAt: "2025-10-20" },
    // Add more dummy data to make pagination meaningful (up to ~50 for demo)
    { _id: "16", name: "Noah Gray", email: "noah.gray@example.com", role: "expert", reputationScore: 170, currentRank: "Gold", updatedAt: "2025-10-03" },
    { _id: "17", name: "Olivia Green", email: "olivia.green@example.com", role: "moderator", reputationScore: 210, currentRank: "Platinum", updatedAt: "2025-09-18" },
    { _id: "18", name: "Paul Walker", email: "paul.walker@example.com", role: "expert", reputationScore: 95, currentRank: "Bronze", updatedAt: "2025-10-11" },
    { _id: "19", name: "Quinn Fox", email: "quinn.fox@example.com", role: "moderator", reputationScore: 190, currentRank: "Gold", updatedAt: "2025-10-16" },
    { _id: "20", name: "Riley Rose", email: "riley.rose@example.com", role: "expert", reputationScore: 240, currentRank: "Diamond", updatedAt: "2025-09-26" },
    // ... (imagine more up to 50)
  ].concat(Array.from({ length: 30 }, (_, i) => ({
    _id: `${i + 21}`,
    name: `User ${i + 21}`,
    email: `user${i + 21}@example.com`,
    role: Math.random() > 0.5 ? "expert" : "moderator",
    reputationScore: Math.floor(Math.random() * 300) + 50,
    currentRank: ["Bronze", "Silver", "Gold", "Platinum", "Diamond"][Math.floor(Math.random() * 5)],
    updatedAt: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  })));

  // const filteredUsers = useMemo(() => {
  //   let filtered = dummyUsers;
  //   if (roleFilter !== "all") {
  //     filtered = filtered.filter((u) => u.role === roleFilter);
  //   }
  //   if (search) {
  //     const lowerSearch = search.toLowerCase();
  //     filtered = filtered.filter(
  //       (u) =>
  //         u.name.toLowerCase().includes(lowerSearch) ||
  //         u.email.toLowerCase().includes(lowerSearch)
  //     );
  //   }
  //   return filtered;
  // }, [search, roleFilter]);

  // const totalPages = Math.ceil(filteredUsers.length / LIMIT);
  const totalPages = Math.ceil(dummyUsers.length / LIMIT);
  // const paginatedUsers = filteredUsers.slice((currentPage - 1) * LIMIT, currentPage * LIMIT);
  const paginatedUsers = dummyUsers.slice((currentPage - 1) * LIMIT, currentPage * LIMIT);

  const onReset = () => {
    // Dummy reset logic if needed
  };
const handleBack = () => {
    window.history.back();
  };
  return (
    <main className="mx-auto w-full p-4 md:p-6 space-y-6">
      <div>All Users</div>
      <div
              className="flex items-center gap-2 mb-4 sm:mb-6 group cursor-pointer w-fit"
              onClick={handleBack}
            >
              <div className="flex items-center gap-2">
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="text-xs sm:text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors duration-200">
                  Go Back
                </span>
              </div>
            </div>
      <UsersFilters
        search={search}
        setSearch={setSearch}
        roleFilter={roleFilter}
        setRoleFilter={setRoleFilter}
        // totalUsers={filteredUsers.length}
        totalUsers={dummyUsers.length}
        onReset={onReset}
      />

      <UsersTable
        items={paginatedUsers}
        currentPage={currentPage}
        setCurrentPage={setCurrentPage}
        totalPages={totalPages}
        isLoading={false}
      />
    </main>
  );
}