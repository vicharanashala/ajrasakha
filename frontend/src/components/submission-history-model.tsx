import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/atoms/button";
import CompactAnswerTimeline from "./CompactAnswer";
import SelectedAnswerPanel from "./SelectedPannel";
// import CompactAnswerTimeline from "./CompactAnswerTimeline";
// import SelectedAnswerPanel from "./SelectedAnswerPanel";

export const SubmissionHistoryModal = ({
  open,
  onClose,
  answers,
  question,
  rerouteQuestion,
  currentUser,
  userRole
}) => {
  const reversedAnswers = answers.toReversed();

  const [selected, setSelected] = useState(
    reversedAnswers[reversedAnswers.length - 1] || null,
  );

  useEffect(() => {
    console.log("Selected answer is ->", selected);
  }, [selected]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="w-full h-full bg-background flex flex-col"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3 }}
          >
            {/* HEADER */}
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-lg font-semibold">
                Moderator Submission Management
              </h2>

              <Button variant="ghost" onClick={onClose}>
                <X />
              </Button>
            </div>

            {/* TIMELINE */}
            <div className="p-4 border-b overflow-x-auto">
              <CompactAnswerTimeline
                answers={reversedAnswers}
                onSelect={setSelected}
                selected={selected}
              />
            </div>

            {/* DETAILS + ACTIONS */}
            <div className="flex-1 overflow-y-auto p-6">
              {selected ? (
                <SelectedAnswerPanel answer={selected} question={question} rerouteQuestion={rerouteQuestion} currentUser={currentUser} lastAnswerId={answers[0]?._id} userRole={userRole}/>
              ) : (
                <p className="text-muted-foreground">
                  Select an entry from timeline
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
