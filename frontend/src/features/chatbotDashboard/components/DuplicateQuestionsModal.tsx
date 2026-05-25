import { createPortal } from 'react-dom';
import { useState, useMemo } from 'react';
import { X } from 'lucide-react';
import { Spinner } from '@/components/atoms/spinner';
import { useDuplicateQuestions } from '../hooks/useDuplicateQuestions';
import {
  UserDetailsPreferenceFilter,
  type UserDetailsFilters,
} from './UserDetailsPreferenceFilter';
import WhatsappHistoryLink from './WhatsappHistoryLink';

interface DuplicateQuestionsModalProps {
  onClose: () => void;
  source?: 'vicharanashala' | 'annam' | 'whatsapp';
}

const DEFAULT_FILTERS: UserDetailsFilters = {
  search: '',
  crop: '',
  village: '',
  block: '',
  district: '',
  state: '',
  startTime: undefined,
  endTime: undefined,
  profileCompleted: 'all',
  inactiveOnly: false,
  userType: 'all',
};

export function DuplicateQuestionsModal({ onClose, source = 'annam' }: DuplicateQuestionsModalProps) {
  const { data, isLoading, isError } = useDuplicateQuestions(true, source);
  const [filters, setFilters] = useState<UserDetailsFilters>(DEFAULT_FILTERS);
  const currentOrigin = window.location.origin;
  const filtered = useMemo(() => {
    if (!data) return [];
    return data.filter(row => {
      const q = (s: string) => s.toLowerCase();
      if (filters.userType === 'external' && !row.email.toLowerCase().startsWith('rup')) return false;
      if (filters.userType === 'internal' && row.email.toLowerCase().startsWith('rup')) return false;
      if (filters.search) {
        const s = q(filters.search);
        if (!q(row.farmerName).includes(s) && !q(row.email).includes(s)) return false;
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

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
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
              hideFields={["crop", "inactive", "profile"]}
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
        <div className="flex-1 overflow-auto">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Spinner
                text="Loading duplicate questions..."
                fullScreen={false}
              />
            </div>
          )}

          {isError && (
            <div className="flex items-center justify-center py-20 text-sm text-red-500">
              Failed to load duplicate questions. Please try again.
            </div>
          )}

          {!isLoading && !isError && filtered.length === 0 && (
            <div className="flex items-center justify-center py-20 text-sm text-gray-400 dark:text-gray-500">
              {data && data.length > 0
                ? "No results match your filters."
                : "No duplicate questions found."}
            </div>
          )}

          {!isLoading && !isError && filtered.length > 0 && (
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-[#1f1f1f] border-b border-gray-200 dark:border-[#2a2a2a]">
                <tr>
                  {/* {['#', 'Farmer', 'Email', 'Village / Block', 'District / State', 'Question Asked', 'Similar To', 'Score'].map((h, i) => ( */}
                  {[
                    "#",
                    source === "whatsapp" ? "Mobile Number" : "Farmer",
                    source === "whatsapp" ? "Thread ID" : "Email",
                    source === "whatsapp" ? "Created At" : "Village / Block",
                    "District / State",
                    "Question Asked",
                    "Similar To",
                    "Score",
                  ].map((h, i) => (
                    <th
                      key={h}
                      className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 whitespace-nowrap ${i === 0 || i === 7 ? "text-center" : "text-left"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-[#2a2a2a]">
                {filtered.map((row, idx) => (
                  <tr
                    key={row.questionId}
                    className="hover:bg-gray-50 dark:hover:bg-[#1f1f1f] transition-colors"
                  >
                    <td className="px-4 py-3 text-center text-xs text-gray-400 dark:text-gray-500 w-8 align-top">
                      {idx + 1}
                    </td>
                    {/* <td className="px-4 py-3 align-top whitespace-nowrap">
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {row.farmerName}
                        </span>
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-gray-600 dark:text-gray-300">
                        {row.email}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <div className="text-gray-700 dark:text-gray-300 whitespace-nowrap">{row.village}</div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{row.block}</div>
                      </td> */}

                    <td className="px-4 py-3 align-top whitespace-nowrap">
                      {source === "whatsapp" ? (
                        <WhatsappHistoryLink mobileNumber={row.mobileNumber} />
                      ) : (
                        <span className="font-medium text-gray-800 dark:text-gray-100">
                          {row.farmerName}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top whitespace-nowrap text-gray-600 dark:text-gray-300 max-w-[220px]">
                      {source === "whatsapp" ? row.threadId : row.email}
                    </td>

                    <td className="px-4 py-3 align-top">
                      {source === "whatsapp" ? (
                        <div className="text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {new Date(row.createdAt).toLocaleString()}
                        </div>
                      ) : (
                        <>
                          <div className="text-gray-700 dark:text-gray-300 whitespace-nowrap">
                            {row.village}
                          </div>

                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                            {row.block}
                          </div>
                        </>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {row.district}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {row.state}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top text-gray-700 dark:text-gray-300 max-w-[220px]">
                      {row.question}
                    </td>
                    <td className="px-4 py-3 align-top text-gray-500 dark:text-gray-400 italic max-w-[220px]">
                      {row.referenceQuestion || "—"}
                    </td>
                    <td className="px-4 py-3 align-top text-center">
                      <span
                        className={`inline-flex items-center justify-center px-2.5 py-1 rounded-full text-xs font-semibold ${
                          row.similarityScore >= 90
                            ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400"
                            : row.similarityScore >= 75
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400"
                              : "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400"
                        }`}
                      >
                        {row.similarityScore.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

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
