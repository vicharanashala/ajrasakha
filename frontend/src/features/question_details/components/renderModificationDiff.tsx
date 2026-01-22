import { diffWords } from "@/utils/wordDifference";

export const renderModificationDiff = (modification: any) => {
  const diff = diffWords(modification.oldAnswer, modification.newAnswer);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
      {/* BEFORE */}
      <div className="border rounded-lg p-3 bg-muted/50">
        <p className="text-xs font-semibold mb-1 text-foreground">
          Before modification
        </p>

        <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {diff.map((part, idx) =>
            part.type === "added" ? null : (
              <span
                key={idx}
                className={
                  part.type === "removed"
                    ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    : "text-dark dark:text-white"
                }
              >
                {part.value}
              </span>
            )
          )}
        </div>
      </div>

      {/* AFTER */}
      <div className="border rounded-lg p-3 bg-muted/50">
        <p className="text-xs font-semibold mb-1 text-foreground">
          After modification
        </p>

        <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
          {diff.map((part, idx) =>
            part.type === "removed" ? null : (
              <span
                key={idx}
                className={
                  part.type === "added"
                    ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                    : "text-dark dark:text-white"
                }
              >
                {part.value}
              </span>
            )
          )}
        </div>
      </div>
    </div>
  );
};
