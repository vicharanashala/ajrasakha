import { createPortal } from 'react-dom';
import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import {
  useDuplicateQuestions,
  type DuplicateQuestionEntry,
} from '../hooks/useDuplicateQuestions';
import {
  UserDetailsPreferenceFilter,
  type UserDetailsFilters,
} from './UserDetailsPreferenceFilter';
import {
  FarmerInfoCell,
  QuestionListTable,
  type QuestionListColumn,
} from './QuestionListTable';
import WhatsappHistoryLink from './WhatsappHistoryLink';
import { TranslatableText } from './TranslatableText';
import { FarmerNameLink } from './FarmerNameLink';
import { useSelectedQuestion } from '@/hooks/api/question/useSelectedQuestion';

interface DuplicateQuestionsModalProps {
  onClose: () => void;
  source?: 'annam' | 'whatsapp';
  userType: string;
}

const DEFAULT_FILTERS: UserDetailsFilters = {
  search: '',
  crop: '',
  primaryCrops: [],
  secondaryCrops: [],
  roles: [],
  village: '',
  block: '',
  district: '',
  state: '',
  startTime: undefined,
  endTime: undefined,
  profileCompleted: 'all',
  inactiveOnly: false,
  lowFeedbackOnly: false,
  userType: 'all',
  verificationStatus: 'all',
  loginStatus: 'all',
};

export function DuplicateQuestionsModal({ onClose, source = 'annam', userType }: DuplicateQuestionsModalProps) {
  const {
    setSelectedQuestionId,
    setView,
  } = useSelectedQuestion();
  const { data, isLoading, isError } = useDuplicateQuestions(true, source, userType);
  const [filters, setFilters] = useState<UserDetailsFilters>(DEFAULT_FILTERS);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(row => {
      const q = (s?: string | null) => (s ?? '').toLowerCase();
      if (filters.userType === 'external' && !q(row.email).startsWith('rup')) return false;
      if (filters.userType === 'internal' && q(row.email).startsWith('rup')) return false;
      if (filters.search) {
        const s = q(filters.search);
        if (
          !q(row.farmerName).includes(s) &&
          !q(row.email).includes(s) &&
          !q(row.mobileNumber).includes(s) &&
          !q(row.question).includes(s)
        ) {
          return false;
        }
      }
      if (filters.village && !q(row.village).includes(q(filters.village))) return false;
      if (filters.block && !q(row.block).includes(q(filters.block))) return false;
      if (filters.district && !q(row.district).includes(q(filters.district))) return false;
      if (filters.state && !q(row.state).includes(q(filters.state))) return false;
      if (filters.startTime) {
        const created = new Date(row.createdAt);
        if (created < filters.startTime) return false;
      }
      if (filters.endTime) {
        const created = new Date(row.createdAt);
        const endOfDay = new Date(filters.endTime.getTime() + 24 * 60 * 60 * 1000 - 1);
        if (created > endOfDay) return false;
      }
      return true;
    });
  }, [data, filters]);

  const columns = useMemo<QuestionListColumn<DuplicateQuestionEntry>[]>(() => {
    const formatDate = (value?: string | null) =>
      value ? new Date(value).toLocaleString() : undefined;

    const scoreBadge = (score: number) => (
      <span
        className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold ${
          score >= 90
            ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
            : score >= 75
              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
              : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
        }`}
      >
        {score.toFixed(1)}%
      </span>
    );

    return [
      {
        key: "index",
        label: "#",
        align: "center",
        className: "w-10",
        cellClassName: "text-xs text-gray-400 dark:text-gray-500",
        render: (_row, index) => index + 1,
      },
      {
        key: "farmer",
        label: source === "whatsapp" ? "Mobile Number" : "Farmer",
        sortable: true,
        tooltip: "Farmer identity or WhatsApp contact when available",
        sortAccessor: (row) =>
          source === "whatsapp" ? row.mobileNumber : row.farmerName,
        className: "w-[13%]",
        cellClassName: "overflow-hidden",
        render: (row) =>
          source === "whatsapp" ? (
            <WhatsappHistoryLink mobileNumber={row.mobileNumber} />
          ) : (
            <FarmerNameLink userId={row.userId} className="block w-full">
              <FarmerInfoCell primary={row.farmerName} />
            </FarmerNameLink>
          ),
      },
      {
        key: "username",
        label: source === "whatsapp" ? "Thread ID" : "Username",
        sortable: true,
        sortAccessor: (row) => (source === "whatsapp" ? row.threadId : row.email),
        className: "w-[15%]",
        cellClassName: "truncate text-gray-600 dark:text-gray-300",
        render: (row) => {
          const value = source === "whatsapp" ? row.threadId : row.email;
          return value;
        },
      },
      {
        key: "location",
        label: "Village / Block",
        visible: source !== "whatsapp",
        sortable: true,
        sortAccessor: (row) => `${row.village ?? ""} ${row.block ?? ""}`,
        className: "w-[12%]",
        cellClassName: "overflow-hidden",
        render: (row) => (
          <FarmerInfoCell primary={row.village} secondary={row.block} />
        ),
      },
      {
        key: "districtState",
        label: "District / State",
        sortable: true,
        sortAccessor: (row) => `${row.district ?? ""} ${row.state ?? ""}`,
        className: "w-[13%]",
        cellClassName: "overflow-hidden",
        render: (row) => (
          <FarmerInfoCell primary={row.district} secondary={row.state} />
        ),
      },
      {
        key: "source",
        label: "Source",
        visible: source === "whatsapp",
        sortable: true,
        sortAccessor: () => source,
        className: "w-[7%]",
        cellClassName: "truncate",
        render: () => source,
      },
      {
        key: "createdAt",
        label: "Created At",
        sortable: true,
        sortAccessor: (row) => new Date(row.createdAt),
        className: "w-[14%]",
        cellClassName: "truncate",
        render: (row) => formatDate(row.createdAt),
      },
      {
        key: "question",
        label: "Question",
        sortable: true,
        tooltip: "Question asked by the farmer",
        sortAccessor: (row) => row.question,
        className: "w-[18%]",
        cellClassName: "overflow-hidden",
        render: (row) => (
          <TranslatableText
            text={row.question ?? ""}
            showTooltip
            textClassName="text-xs line-clamp-2"
          />
        ),
      },
      {
        key: "referenceQuestion",
        label: "Similar To",
        sortable: true,
        tooltip: "Reference question matched by duplicate detection",
        sortAccessor: (row) => row.referenceQuestion,
        className: "w-[18%]",
        cellClassName: "overflow-hidden text-gray-500 dark:text-gray-400 italic",
        render: (row) => (
          <TranslatableText
            text={row.referenceQuestion ?? ""}
            showTooltip
            textClassName="text-xs line-clamp-2"
          />
        ),
      },
      {
        key: "similarityScore",
        label: "Score",
        align: "center",
        sortable: true,
        sortAccessor: (row) => row.similarityScore,
        className: "w-[7%]",
        render: (row) => scoreBadge(row.similarityScore),
      },
    ];
  }, [source]);

  return createPortal(
    <div
      className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-2xl w-full max-w-6xl max-h-[88vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-[#2a2a2a] shrink-0">
          <div>
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Duplicate Questions
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Questions flagged as duplicates based on similarity score
            </p>
          </div>
          <div className="flex items-center gap-3">
            <UserDetailsPreferenceFilter
              filters={filters}
              onApply={setFilters}
              hideFields={["crop", "inactive", "profile", "roles", "loginStatus"]}
            />
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        <QuestionListTable
          data={filtered}
          columns={columns}
          loading={isLoading}
          loadingMessage="Loading duplicate questions..."
          error={
            isError
              ? "Failed to load duplicate questions. Please try again."
              : undefined
          }
          emptyMessage={
            data && data.length > 0
              ? "No results match your filters."
              : "No duplicate questions found."
          }
          getRowKey={(row) => row.questionId}
          enableInternalPagination
          initialPageSize={12}
          initialSortKey="similarityScore"
          initialSortDirection="desc"
          search={{
            value: filters.search,
            placeholder: "Search...",
            onChange: (search) =>
              setFilters((current) => ({
                ...current,
                search,
              })),
          }}
          onRowClick={(row) => {
            setSelectedQuestionId(row.questionId);
            setView("lifecycle");
          }}
        />

        {/* Footer */}
        {!isLoading && data && (
          <div className="px-6 py-3 border-t border-gray-100 dark:border-[#2a2a2a] flex items-center justify-between text-xs text-gray-400 dark:text-gray-500 shrink-0">
            <span>
              {filtered.length !== data.length
                ? `${filtered.length} of ${data.length} results`
                : `${data.length} duplicate question${data.length !== 1 ? "s" : ""}`}
            </span>
            {filtered.length !== data.length && (
              <button
                onClick={() => setFilters(DEFAULT_FILTERS)}
                className="text-[#3AAA5A] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
