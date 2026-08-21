import React, { useState } from "react";
import { X, Send, ThumbsUp, ThumbsDown, Sparkles } from "lucide-react";
import { useSubmitFeedback } from "../hooks/useFarmerFeedback";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  defaultQuestionId?: string;
}

export const SimulateFeedbackModal: React.FC<Props> = ({
  isOpen,
  onClose,
  defaultQuestionId = "",
}) => {
  const [questionId, setQuestionId] = useState(defaultQuestionId);
  const [rating, setRating] = useState<1 | 2>(1);
  const [queryText, setQueryText] = useState("");
  const [deliveredAnswer, setDeliveredAnswer] = useState("");
  const [domain, setDomain] = useState("Pest & Disease");
  const [crop, setCrop] = useState("Wheat");
  const [state, setState] = useState("Punjab");
  const [language, setLanguage] = useState("hi");
  const [feedbackText, setFeedbackText] = useState("");

  const submitMutation = useSubmitFeedback();

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionId.trim()) return;

    submitMutation.mutate(
      {
        questionId: questionId.trim(),
        rating,
        queryText: queryText.trim() || undefined,
        deliveredAnswer: deliveredAnswer.trim() || undefined,
        domain,
        crop,
        state,
        language,
        feedbackText: feedbackText.trim() || undefined,
      },
      {
        onSuccess: () => {
          onClose();
        },
      }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 shadow-2xl text-slate-200 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Simulate WhatsApp Feedback
              </h2>
              <p className="text-xs text-slate-400">
                Mock farmer response (1 for Helpful, 2 for Not Helpful)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-xs">
          {/* Question ID */}
          <div>
            <label className="font-semibold text-slate-300 block mb-1">
              GDB Question ID *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. 64df8a9b1c2d3e4f5a6b7c8d or 12345"
              value={questionId}
              onChange={(e) => setQuestionId(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Farmer Rating Choice (1 vs 2) */}
          <div>
            <label className="font-semibold text-slate-300 block mb-1.5">
              Farmer Response Selection *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRating(1)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border font-semibold transition-all ${
                  rating === 1
                    ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 shadow-sm"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                <ThumbsUp className="w-4 h-4 text-emerald-400" />
                <span>1 - Yes (Helpful)</span>
              </button>

              <button
                type="button"
                onClick={() => setRating(2)}
                className={`flex items-center justify-center gap-2 py-2.5 rounded-xl border font-semibold transition-all ${
                  rating === 2
                    ? "bg-rose-600/30 border-rose-500 text-rose-300 shadow-sm"
                    : "bg-slate-800/60 border-slate-700 text-slate-400 hover:text-slate-200"
                }`}
              >
                <ThumbsDown className="w-4 h-4 text-rose-400" />
                <span>2 - No (Not Helpful)</span>
              </button>
            </div>
          </div>

          {/* Domain, Crop, State */}
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-medium text-slate-400 block mb-1">Domain</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              >
                <option value="Pest & Disease">Pest & Disease</option>
                <option value="Weather Advisory">Weather</option>
                <option value="Soil Health & Fertilizer">Soil Health</option>
                <option value="Government Schemes">Schemes</option>
                <option value="Market Prices & Mandi">Market Price</option>
                <option value="Package of Practices">PoP</option>
              </select>
            </div>

            <div>
              <label className="font-medium text-slate-400 block mb-1">Crop</label>
              <input
                type="text"
                placeholder="Wheat, Paddy..."
                value={crop}
                onChange={(e) => setCrop(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              />
            </div>

            <div>
              <label className="font-medium text-slate-400 block mb-1">State</label>
              <input
                type="text"
                placeholder="Punjab, UP..."
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-200"
              />
            </div>
          </div>

          {/* Query Text (Optional) */}
          <div>
            <label className="font-medium text-slate-400 block mb-1">
              Simulated Query Question (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. गेहूँ में पीला रतुआ का इलाज क्या है?"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500"
            />
          </div>

          {/* Feedback Comment (Optional) */}
          <div>
            <label className="font-medium text-slate-400 block mb-1">
              Farmer Text Comment (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Dosage of pesticide was not clear for 1 acre."
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              className="w-full px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 placeholder-slate-500"
            />
          </div>

          {/* Submit */}
          <div className="flex items-center justify-end gap-2 mt-2 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitMutation.isPending}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold shadow-md disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitMutation.isPending ? "Sending..." : "Submit Feedback"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
