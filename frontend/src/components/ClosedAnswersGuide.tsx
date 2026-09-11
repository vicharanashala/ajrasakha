import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  BookOpen,
  Search,
  ListChecks,
  FileSearch,
  Building2,
  Save,
  Lock,
  GitCompare,
  Users,
  Flag,
  Filter,
  Keyboard,
  MousePointerClick,
} from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/atoms/dialog";
import { cn } from "@/lib/utils";

type GuideStep = {
  title: string;
  /** Markdown - bold for the words that appear in the UI, lists for sequences. */
  body: string;
};

// Sized for the guide's small type; the page has its own map for answer bodies.
const GUIDE_MARKDOWN_COMPONENTS = {
  p: (props: object) => (
    <p className="my-1.5 first:mt-0 last:mb-0 leading-relaxed" {...props} />
  ),
  ul: (props: object) => <ul className="my-1.5 list-disc space-y-1 pl-4" {...props} />,
  ol: (props: object) => <ol className="my-1.5 list-decimal space-y-1 pl-4" {...props} />,
  strong: (props: object) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  em: (props: object) => <em className="italic" {...props} />,
  code: (props: object) => (
    <code
      className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground"
      {...props}
    />
  ),
  a: (props: object) => (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
      {...props}
    />
  ),
};

type GuideSection = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  steps: GuideStep[];
};

// What an expert does here: record where each closed answer's information came from.
const EXPERT_GUIDE: GuideSection[] = [
  {
    icon: MousePointerClick,
    title: "1. Pick an answer to work on",
    steps: [
      {
        title: "The list shows answers waiting for source work",
        body: "Every row is a closed question's final answer. Under the question you'll see:\n\n- how many **sources** it already carries\n- when the question was **closed**\n- **No sources** in amber when nothing has been recorded yet",
      },
      {
        title: "Finding one",
        body: "- **Search** matches question text, answer text, or a pasted question/answer ID\n- **Filters** narrow by close date, author, source count and question details (state, crop, domain, priority)\n- **Shuffle** reorders the list, so two people rarely start on the same answer",
      },
    ],
  },
  {
    icon: ListChecks,
    title: "2. Open a source and update it",
    steps: [
      {
        title: "Sources are updated, never added",
        body: "Open the **Sources** panel and click the source you want to work on. The form below edits *that one source* - the radio marker and the **Editing** pill show which is active. The arrow button on a row opens the document itself in a new tab.",
      },
      {
        title: "Your edit is logged, the answer is untouched",
        body: "Nothing you do here rewrites the answer's own sources. Everything is recorded as a **review** that a moderator checks afterwards.",
      },
    ],
  },
  {
    icon: FileSearch,
    title: "3. Fetch the source reference",
    steps: [
      {
        title: "Always run the lookup",
        body: "With the link in the **Source** field, click **Fetch source reference**. The lookup fills in **Page** and **Source name** for you - neither is typed by hand.",
      },
      {
        title: "'Not found' is a valid outcome",
        body: "If no matching document exists, the result is recorded as **Not found** and you can still save. Moderators can filter for these, so a not-found source is visible work rather than a dead end.",
      },
    ],
  },
  {
    icon: Building2,
    title: "4. Set the organization",
    steps: [
      {
        title: "Organization decides source type",
        body: "Search and pick the organization that published the document. **Source type** (Hyper Local, State, Central, Other) is set from your choice - it isn't editable on its own.",
      },
    ],
  },
  {
    icon: Save,
    title: "5. Save the answer's sources",
    steps: [
      {
        title: "Step through every source first",
        body: "When an answer has more than one source, the button reads **Next** until you've been through each one. Once the last is confirmed it becomes **Save changes**.",
      },
      {
        title: "What Save does",
        body: "Saving records your review and how long it took, and the answer **leaves your list** - it moves on to the moderators. **Reset** undoes your edits to the source currently open.",
      },
    ],
  },
  {
    icon: Lock,
    title: "6. One answer at a time",
    steps: [
      {
        title: "Editing locks the answer to you",
        body: "The moment you change a field, run the lookup, or open the organization list, the answer becomes **In Progress** under your name and other experts can't edit it.",
      },
      {
        title: "Switching answers",
        body: "If you open another answer while holding one, you'll be asked to confirm:\n\n- confirming sends the first answer back to **Pending** for someone else\n- **nothing is fetched** from the server until you confirm\n- coming back to it later picks it up again as a fresh stint",
      },
    ],
  },
];

// What a moderator or admin does here: check what the experts recorded.
const REVIEWER_GUIDE: GuideSection[] = [
  {
    icon: MousePointerClick,
    title: "1. Take an answer into moderation",
    steps: [
      {
        title: "Nothing is opened for you",
        body: "The list holds answers whose sources an expert has finished. Clicking one takes it into **In Moderation** under your name and hides it from every other moderator, so pick deliberately. The first time you do this, a note explains what you're taking on.",
      },
      {
        title: "You come back to where you were",
        body: "If you already hold an answer, it **opens automatically** next time you visit the page. You can hold only one at a time - opening another asks you to confirm, and hands the first one back.",
      },
    ],
  },
  {
    icon: GitCompare,
    title: "2. Read the source changes",
    steps: [
      {
        title: "Before and after, side by side",
        body: "- **Before** (red) is what the answer itself carries\n- **After** (green) is what the expert recorded\n\nRows line up by position; **Not on the answer** or **Not in the review** marks a source that exists on only one side.",
      },
      {
        title: "Check the match result",
        body: "Each reviewed source shows its lookup outcome. **Match: Not found** in red means the expert's link had no matching document - the answer also carries a red **Not found** badge in the list.",
      },
    ],
  },
  {
    icon: Users,
    title: "3. Check who worked on it",
    steps: [
      {
        title: "Reviewers is a history, not a roster",
        body: "Each row is one stint - who opened it, **Expert** or **Moderator**, when they started, how long they spent:\n\n- **green** - saved changes\n- **muted** - opened it, saved nothing\n- **amber** - the stint still open right now",
      },
      {
        title: "Moderator actions",
        body: "Every moderator action - **flag**, **unflag**, **move to pending**, **approve**, **release** - is listed **newest first** with who did it and the reason they gave, so nothing that happens to a review is anonymous.",
      },
    ],
  },
  {
    icon: Flag,
    title: "4. Decide what happens next",
    steps: [
      {
        title: "Approve",
        body: "Accepts the expert's sources as the correct set and closes the review. Needs a **reason**, kept on the record.",
      },
      {
        title: "Move to pending",
        body: "Sends the answer back to the **expert list** so an expert can redo the sources. Also needs a reason.",
      },
      {
        title: "Flag",
        body: "Marks the review as needing attention. Flagged answers **drop out of everyone's list** until someone lifts the flag.",
      },
      {
        title: "Open next answer",
        body: "Leave the checkbox ticked and finishing an answer **opens the next one** in the list. Untick it to land back on the empty state instead.",
      },
      {
        title: "Release",
        body: "Hands the answer back without deciding anything. It returns to **Review Completed** and any moderator can pick it up.",
      },
    ],
  },
  {
    icon: Flag,
    title: "5. Working with flagged answers",
    steps: [
      {
        title: "Finding them",
        body: "Flagged answers are hidden by default. Open **Filters** and tick **Review status → Flagged** to bring them into the list.",
      },
      {
        title: "Opening one is read-only",
        body: "A flagged answer is **never** taken into moderation just by opening it - it stays flagged until you act.",
      },
      {
        title: "Unflagging",
        body: "**Unflag** asks where it should go:\n\n- **Send back to the experts** - status becomes **Pending**; it returns to the expert list\n- **Keep it with the moderators** - status becomes **Review Completed**; it stays here, ready to be taken into moderation again\n\nA reason is required either way.",
      },
    ],
  },
  {
    icon: Filter,
    title: "6. Filters and search",
    steps: [
      {
        title: "Search",
        body: "Matches question text and answer text - and a pasted **question or answer ID** jumps straight to that record.",
      },
      {
        title: "Filters",
        body: "Narrow by close date, author, source coverage and count, review status, and question details (state, crop, domain, priority).\n\nAdmins also get **Reference lookup** - answers whose sources came back **Not found**, **Top level match** or **Duplicate match**. Filters apply to the list and the **Full list** dialog together.",
      },
    ],
  },
];

const GUIDE_SHORTCUTS: GuideSection = {
  icon: Keyboard,
  title: "Keyboard",
  steps: [
    {
      title: "Move through the list",
      body: "**Up** and **Down** arrows step through answers without touching the mouse. They're ignored while you're typing in a field.",
    },
    {
      title: "Shuffle",
      body: "Press **S** to reshuffle the list into a different order.",
    },
  ],
};

const stripMarkdown = (text: string) =>
  text.replace(/[*_`>#]|^\s*-\s+/gm, "").replace(/\s+/g, " ");

const matchesQuery = (step: GuideStep, sectionTitle: string, query: string) => {
  const haystack = stripMarkdown(
    `${sectionTitle} ${step.title} ${step.body}`,
  ).toLowerCase();
  return haystack.includes(query);
};

export const ClosedAnswersGuide = ({ isReviewer }: { isReviewer: boolean }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");

  const sections = useMemo(
    () => [...(isReviewer ? REVIEWER_GUIDE : EXPERT_GUIDE), GUIDE_SHORTCUTS],
    [isReviewer],
  );

  const results = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return sections;

    return sections
      .map((section) => ({
        ...section,
        steps: section.steps.filter((step) =>
          matchesQuery(step, section.title, trimmed),
        ),
      }))
      .filter((section) => section.steps.length > 0);
  }, [sections, query]);

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="cursor-pointer gap-2">
          <BookOpen className="h-3.5 w-3.5" />
          Guide
        </Button>
      </DialogTrigger>

      <DialogContent className="flex h-[85vh] w-[95vw] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader className="shrink-0 border-b pb-3">
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <BookOpen className="h-4 w-4" />
            </span>
            {isReviewer ? "Reviewing answer sources" : "Updating answer sources"}
          </DialogTitle>
          <DialogDescription>
            {isReviewer
              ? "How to check what experts recorded, and what each decision does."
              : "How to record where each closed answer's information came from."}
          </DialogDescription>
          <div className="relative pt-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the guide - try 'flag', 'lookup' or 'switch'..."
              className="pl-8"
            />
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {results.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Nothing in the guide matches "{query}".
            </p>
          ) : (
            <div className="grid gap-4 py-1 pr-1">
              {results.map((section) => {
                const Icon = section.icon;

                return (
                  <section key={section.title} className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <h3 className="text-sm font-semibold text-foreground">
                        {section.title}
                      </h3>
                    </div>

                    <div className="grid gap-2 pl-8">
                      {section.steps.map((step) => (
                        <div
                          key={step.title}
                          className={cn(
                            "rounded-lg border border-border/60 bg-muted/20 p-3",
                          )}
                        >
                          <p className="text-xs font-medium text-foreground">
                            {step.title}
                          </p>
                          <div className="mt-1 text-xs text-muted-foreground">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={GUIDE_MARKDOWN_COMPONENTS}
                            >
                              {step.body}
                            </ReactMarkdown>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
