import React, { useState } from "react";
import {
  ChevronsRight,
  RefreshCw,
  Sparkles,
  FileText,
  Eye,
  Pencil,
  Copy,
  Check,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent } from "@/components/atoms/card";
import { Button } from "@/components/atoms/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/atoms/dialog";
import { toast } from "sonner";
import { PanelControls } from "./PanelControls";

// CHANGE: Define the shape of an individual farmer-friendly version.
interface FarmerFriendlyVersion {
  angle: string;
  question: string;
  answer: string;
}

// CHANGE: Define the shape of the backend response so the mock data
// follows the same structure as the actual API response.
interface FarmerFriendlyVersionsResponse {
  results: {
    domain: string;
    versions: FarmerFriendlyVersion[];
  }[];
  total_versions: number;
}

const MOCK_FFV_RESPONSE: FarmerFriendlyVersionsResponse = {
  results: [
    {
      domain: "Soil Health and Nutrient Management",
      versions: [
        {
          angle: "Safety & Precautions",
          question:
            "What precautions should I take when harvesting my rice field unevenly?",
          answer:
            "Always check which parts of your field are fully ripe before you start harvesting. Harvest the ripe areas first and let the green areas ripen more, and never delay cutting the ready crop as it can cause grain loss. Make sure your harvesting machine is properly set and avoid harvesting wet crops to get better grain quality.",
        },
        {
          angle: "Stage-specific Management",
          question:
            "What nutrients should I give my rice crop when the grains are starting to fill?",
          answer:
            "During grain filling stage, avoid applying nitrogen as it can delay ripening and cause uneven maturity. Make sure your crop had enough potassium earlier, as it helps grains fill properly and strengthens the straw. Focus on maintaining proper water levels at this stage rather than adding more fertilizer.",
        },
        {
          angle: "Expected Benefits",
          question:
            "What will I gain by harvesting my rice at the right time instead of waiting too long?",
          answer:
            "Harvesting at the right time gives you more fully filled grains and better quality rice that mills well. You will also lose fewer grains to shattering and get a better price for your produce.",
        },
        {
          angle: "Post-harvest Handling",
          question:
            "How should I handle and store the harvested rice to maintain its quality?",
          answer:
            "Dry the harvested rice properly before storage. Keep the grains in a clean, dry, well-ventilated place and protect them from moisture, insects, and rodents. Check stored grain regularly to maintain its quality.",
        },
        {
          angle: "Pest & Disease Management",
          question:
            "What pests or diseases should I watch for during rice harvesting?",
          answer:
            "Inspect your rice crop for pest damage and disease symptoms before harvesting. Keep harvested grain clean and follow locally recommended pest and disease management practices to prevent further losses.",
        },
        {
          angle: "Cost Saving Tips",
          question:
            "How can I reduce the cost of harvesting and improve productivity?",
          answer:
            "Plan harvesting when the crop is ready, coordinate labour or machinery in advance, and maintain harvesting equipment properly. Avoid unnecessary delays and handle the crop carefully to reduce grain loss.",
        },
        {
          angle: "Water Management",
          question:
            "How should I manage water in my field before harvesting rice?",
          answer:
            "Manage field water according to crop maturity and local agricultural recommendations. Reduce excess standing water when appropriate to make harvesting easier, while avoiding practices that could damage the crop or soil.",
        },
        {
          angle: "Weather Considerations",
          question:
            "How does weather affect the right time to harvest rice?",
          answer:
            "Check the weather forecast before harvesting. Dry weather helps harvesting and grain drying, while rain and high humidity can increase moisture and affect grain quality. Prepare a suitable drying and storage plan.",
        },
        {
          angle: "Machinery & Tools",
          question:
            "What type of harvesting machine is best for my rice field?",
          answer:
            "Choose harvesting equipment based on field size, terrain, crop condition, and local availability. Check machine settings before use, maintain cutting equipment, and follow the manufacturer's safety instructions.",
        },
        {
          angle: "Market & Price Information",
          question:
            "How can I get a better price for my harvested rice?",
          answer:
            "Harvest at the appropriate maturity, dry and clean the grain properly, and store it safely. Compare local market prices and quality requirements before selling, and check available procurement options in your area.",
        },
      ],
    },
  ],
  total_versions: 10,
};

// CHANGE: Extend the existing panel props without changing the
// collapse, enlarge, or PanelControls interface.
interface FarmerFriendlyVersionsPanelProps {
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isEnlarged?: boolean;
  onToggleEnlarge?: () => void;
  questionText?: string;
  answerText?: string;
  domain?: string[];
}

// CHANGE: Track which version is selected in the View/Edit modal.
type ModalMode = "view" | "edit";

export const FarmerFriendlyVersionsPanel: React.FC<
  FarmerFriendlyVersionsPanelProps
> = ({
  isCollapsed = false,
  onToggleCollapse,
  isEnlarged = false,
  onToggleEnlarge,
  questionText,
  answerText,
  domain,
}) => {
  // CHANGE: Console log the question, answer, and domain passed from the parent
  console.log("[FarmerFriendlyVersionsPanel] question:", questionText);
  console.log("[FarmerFriendlyVersionsPanel] answer:", answerText);
  console.log("[FarmerFriendlyVersionsPanel] domain:", domain);
  // CHANGE: Store the generated versions locally so editing a version
  // updates the displayed data without requiring a backend connection.
  const [versions, setVersions] = useState<FarmerFriendlyVersion[]>([]);

  // CHANGE: Track whether the Generate FFVs button has been clicked.
  // Before generation, the component displays the empty state.
  const [hasGenerated, setHasGenerated] = useState(false);

  // CHANGE: Track the selected version, modal visibility, and view/edit mode.
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<
    number | null
  >(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("view");

  // CHANGE: Keep editable question and answer values separate from the
  // saved version until the user clicks Save Changes.
  const [editedQuestion, setEditedQuestion] = useState("");
  const [editedAnswer, setEditedAnswer] = useState("");

  // CHANGE: Use the first domain's versions from the mock API response.
  // The component can later replace this with the actual API response.
  const totalVersions = hasGenerated ? versions.length : 0;

  // CHANGE: Generate the mock versions when the user clicks Generate FFVs.
  // Clicking Regenerate FFVs reloads the mock response for now.
  const handleGenerateVersions = () => {
    const response = MOCK_FFV_RESPONSE;
    const generatedVersions = response.results.flatMap(
      (result) => result.versions
    );

    setVersions(generatedVersions);
    setHasGenerated(true);

    // CHANGE: Clear any previously selected version when regenerating.
    setSelectedVersionIndex(null);
    setIsModalOpen(false);
  };

  // CHANGE: Open the shared modal in view or edit mode and initialize
  // its fields from the currently saved version.
  const handleOpenVersion = (index: number, mode: ModalMode) => {
    const version = versions[index];

    setSelectedVersionIndex(index);
    setEditedQuestion(version.question);
    setEditedAnswer(version.answer);
    setModalMode(mode);
    setIsModalOpen(true);
  };

  // CHANGE: Save edited content into local component state.
  // This is a mock save until an update API is connected.
  const handleSaveChanges = () => {
    if (selectedVersionIndex === null) return;

    if (!editedQuestion.trim() || !editedAnswer.trim()) {
      toast.error("Question and answer cannot be empty.");
      return;
    }

    setVersions((currentVersions) =>
      currentVersions.map((version, index) =>
        index === selectedVersionIndex
          ? {
              ...version,
              question: editedQuestion.trim(),
              answer: editedAnswer.trim(),
            }
          : version
      )
    );

    // CHANGE: Return to view mode after saving the local changes.
    setModalMode("view");
    toast.success("Version updated successfully.");
  };

  // CHANGE: Provide separate copy actions for question and answer.
  // Clipboard errors are handled instead of showing a false success message.
  const handleCopyText = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard.`);
    } catch {
      toast.error(`Unable to copy ${label.toLowerCase()}.`);
    }
  };

  // CHANGE: Preserve the existing collapsed-panel appearance and behavior.
  if (isCollapsed && !isEnlarged) {
    return (
      <div className="h-full min-h-[260px] flex flex-col items-center justify-between py-4 px-2 bg-card border border-border rounded-xl shadow-xs transition-all duration-300 w-12">
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-lg hover:bg-muted"
          title="Expand Farmer-Friendly Versions"
        >
          <ChevronsRight className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        </Button>

        <div className="flex items-center gap-2 [writing-mode:vertical-rl] rotate-180 select-none py-4">
          <span className="text-xs font-semibold tracking-wide text-foreground">
            Farmer-Friendly Versions
          </span>
        </div>

        {/* CHANGE: Show a neutral indicator when no versions exist,
            and a green indicator after versions have been generated. */}
        <div
          className={`w-2 h-2 rounded-full ${
            hasGenerated ? "bg-emerald-500" : "bg-muted-foreground/40"
          }`}
        />
      </div>
    );
  }

  return (
    // CHANGE: Match the card, border, background, rounded corners,
    // and flex layout used by ChecksPipelinePanel.
    <Card className="flex flex-col h-full border border-border bg-card shadow-xs rounded-xl overflow-hidden relative">
      {/* CHANGE: Match the existing panel header and place the Generate/
          Regenerate action beside the existing PanelControls. */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2 border-b border-border shrink-0">
        <p className="text-xs font-semibold text-foreground">
          Farmer-Friendly Versions (FFV)
        </p>

        <div className="flex items-center gap-2 shrink-0">
          {/* CHANGE: Show Generate FFVs initially and Regenerate FFVs
              once the versions have been generated. */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateVersions}
            className="h-8 px-2.5 text-xs font-medium rounded-lg border-border/80 hover:bg-muted text-foreground flex items-center gap-1.5 shadow-2xs"
          >
            {hasGenerated ? (
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            ) : (
              <Sparkles className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            )}
            <span>
              {hasGenerated ? "Regenerate FFVs" : "Generate FFVs"}
            </span>
          </Button>

          {/* CHANGE: Retain the existing collapse and enlarge controls. */}
          <PanelControls
            isEnlarged={isEnlarged}
            onToggleEnlarge={onToggleEnlarge}
            onToggleCollapse={onToggleCollapse}
          />
        </div>
      </div>

      {/* CHANGE: Use the same compact padding and flexible body layout
          as the ChecksPipelinePanel. */}
      <CardContent className="p-3.5 sm:p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
        {!hasGenerated ? (
          // CHANGE: Replace the old "Upcoming feature" placeholder with
          // a useful empty state, similar to the checks panel's idle state.
          <div className="py-8 flex flex-col items-center justify-center text-center space-y-3 my-auto">
            <div className="w-12 h-12 rounded-full bg-muted/60 border border-border flex items-center justify-center text-muted-foreground">
              <ClipboardList className="w-6 h-6" />
            </div>

            <div className="space-y-1 max-w-sm">
              <p className="text-sm font-semibold text-foreground">
                No Farmer-Friendly Versions Yet
              </p>
              <p className="text-xs text-muted-foreground">
                Generate short, simple versions of the comprehensive answer
                for farmers. Each version presents the information from a
                different angle.
              </p>
            </div>

            {/* CHANGE: Keep a prominent empty-state action as well as
                the Generate FFVs button in the header. */}
            <Button
              size="sm"
              onClick={handleGenerateVersions}
              className="text-xs h-8 bg-blue-600 hover:bg-blue-700 text-white font-semibold"
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" />
              Generate FFVs
            </Button>
          </div>
        ) : (
          // CHANGE: Display the generated version summary and version rows,
          // replacing approval statuses and the Approve All FFVs button.
          <div className="space-y-3.5 my-auto py-2 overflow-y-auto scrollbar-hiding">
            {/* CHANGE: Add a summary card showing the total number of versions. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
              <div className="rounded-xl p-2.5 sm:p-3 bg-blue-50/70 dark:bg-blue-950/25 border border-blue-200/70 dark:border-blue-800/40 flex items-center gap-2.5 sm:gap-3 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-blue-900 dark:text-blue-100 leading-none">
                    {totalVersions}
                  </div>
                  <div className="text-[11px] sm:text-xs font-semibold text-blue-700 dark:text-blue-400 mt-1">
                    Total Versions
                  </div>
                </div>
              </div>

              {/* CHANGE: Show the source domain from the mock response,
                  without introducing any approval or review status. */}
              <div className="rounded-xl p-2.5 sm:p-3 bg-muted/30 border border-border/70 flex items-center gap-2.5 sm:gap-3 shadow-xs">
                <div className="w-8 h-8 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
                  <ClipboardList className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-foreground truncate">
                    {MOCK_FFV_RESPONSE.results[0]?.domain ?? "Generated FFVs"}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    Source domain
                  </div>
                </div>
              </div>
            </div>

            {/* CHANGE: Render a scrollable list of FFV rows that adapts
                to the available panel height. */}
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto scrollbar-hiding pr-0.5">
              {versions.map((version, index) => (
                <div
                  key={`ffv-${index}`}
                  className="p-2 sm:p-2.5 rounded-xl border border-border/70 bg-card hover:bg-muted/15 transition-colors flex items-center justify-between gap-2 sm:gap-3"
                >
                  {/* CHANGE: Use an FFV identifier and the version angle
                      instead of the previous status labels. */}
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="shrink-0 px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-950/50 border border-blue-200/70 dark:border-blue-800/50 text-blue-700 dark:text-blue-300 text-[10px] sm:text-xs font-bold">
                      FFV-{index + 1}
                    </div>

                    <div className="min-w-0">
                      <p
                        className="text-xs font-semibold text-foreground truncate"
                        title={version.angle}
                      >
                        {version.angle}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                        {version.question}
                      </p>
                    </div>
                  </div>

                  {/* CHANGE: Keep View and Edit actions. Both open the
                      shared modal in the appropriate mode. */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenVersion(index, "view")}
                      className="h-7 px-2 sm:px-2.5 text-[11px] rounded-md gap-1 border-border/80"
                      title={`View FFV-${index + 1}`}
                    >
                      <Eye className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      <span>View</span>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>

      {/* CHANGE: Add one reusable dialog for viewing and editing the
          selected version's question and answer. */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="w-[95vw] sm:max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden bg-background border-border shadow-xl">
          {/* CHANGE: Match the heading and header styling of the
              existing detailed-report dialog. */}
          <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border/60 bg-muted/20 shrink-0 pr-10">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                {modalMode === "edit" ? (
                  <Pencil className="w-4 h-4" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
              </div>
              <div className="min-w-0">
                <DialogTitle className="text-sm sm:text-base font-bold text-foreground">
                  {selectedVersionIndex !== null
                    ? `FFV-${selectedVersionIndex + 1}: ${
                        versions[selectedVersionIndex]?.angle ?? ""
                      }`
                    : "Farmer-Friendly Version"}
                </DialogTitle>
                <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                  {modalMode === "edit"
                    ? "Edit the question and answer"
                    : "Question and answer"}
                </p>
              </div>
            </div>
          </div>

          {/* CHANGE: Make the dialog body independently scrollable so
              long questions and answers remain usable on small screens. */}
          <div className="p-4 sm:p-6 overflow-y-auto scrollbar-hiding space-y-5 flex-1 min-h-0">
            {/* CHANGE: Add the angle as contextual information in the modal. */}
            {selectedVersionIndex !== null && (
              <div>
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Version Angle
                </p>
                <p className="text-sm font-medium text-foreground">
                  {versions[selectedVersionIndex]?.angle}
                </p>
              </div>
            )}

            {/* CHANGE: Render the question as read-only text in View mode
                and as a textarea in Edit mode. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ffv-question"
                  className="text-xs font-bold text-foreground"
                >
                  Question
                </label>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleCopyText(
                      modalMode === "edit"
                        ? editedQuestion
                        : versions[selectedVersionIndex!]?.question ?? "",
                      "Question"
                    )
                  }
                  className="h-7 px-2.5 text-[11px] gap-1.5 rounded-md"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </Button>
              </div>

              {modalMode === "edit" ? (
                <textarea
                  id="ffv-question"
                  value={editedQuestion}
                  onChange={(event) => setEditedQuestion(event.target.value)}
                  rows={3}
                  className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  placeholder="Enter the farmer-friendly question"
                />
              ) : (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {selectedVersionIndex !== null
                    ? versions[selectedVersionIndex]?.question
                    : ""}
                </div>
              )}
            </div>

            {/* CHANGE: Render the answer with its own independent copy
                button and editing field. */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="ffv-answer"
                  className="text-xs font-bold text-foreground"
                >
                  Answer
                </label>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    handleCopyText(
                      modalMode === "edit"
                        ? editedAnswer
                        : versions[selectedVersionIndex!]?.answer ?? "",
                      "Answer"
                    )
                  }
                  className="h-7 px-2.5 text-[11px] gap-1.5 rounded-md"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </Button>
              </div>

              {modalMode === "edit" ? (
                <textarea
                  id="ffv-answer"
                  value={editedAnswer}
                  onChange={(event) => setEditedAnswer(event.target.value)}
                  rows={7}
                  className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm text-foreground outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
                  placeholder="Enter the farmer-friendly answer"
                />
              ) : (
                <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-sm text-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {selectedVersionIndex !== null
                    ? versions[selectedVersionIndex]?.answer
                    : ""}
                </div>
              )}
            </div>
          </div>

          {/* CHANGE: Provide mode-specific footer actions. Edit mode
              supports saving or cancelling; View mode supports editing
              the selected version or closing the dialog. */}
          <div className="px-4 sm:px-6 py-3 border-t border-border/60 flex items-center justify-end gap-2 shrink-0">
            {modalMode === "edit" ? (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    // CHANGE: Discard unsaved edits and return to View mode.
                    if (selectedVersionIndex !== null) {
                      const version = versions[selectedVersionIndex];
                      setEditedQuestion(version.question);
                      setEditedAnswer(version.answer);
                    }
                    setModalMode("view");
                  }}
                  className="h-8 text-xs"
                >
                  Cancel
                </Button>

                <Button
                  size="sm"
                  onClick={handleSaveChanges}
                  className="h-8 text-xs bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Check className="w-3.5 h-3.5 mr-1.5" />
                  Save Changes
                </Button>
              </>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="h-8 text-xs"
              >
                Close
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

