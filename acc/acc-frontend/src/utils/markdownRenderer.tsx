export const stripMarkdown = (text: string): string => {
  if (!text) return "";
  return text
    .replace(/^#+\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[\s]*[-*+]\s+/gm, "")
    .replace(/^[\s]*\d+\.\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
};

export const renderMarkdown = (text: string, options: RenderMarkdownOptions = {}) => {
  if (!text) return null;

  const { className = "", baseFontSize = "text-sm" } = options;

  const parseInlineMarkdown = (textVal: string) => {
    if (!textVal) return "";
    const boldParts = textVal.split(/\*\*([^*]+)\*\*/g);
    return boldParts.flatMap((boldPart, bIdx) => {
      const isBold = bIdx % 2 === 1;
      const codeParts = boldPart.split(/`([^`]+)`/g);
      const elements = codeParts.flatMap((codePart, cIdx) => {
        const isCode = cIdx % 2 === 1;
        if (isCode) {
          return (
            <code
              key={`c-${bIdx}-${cIdx}`}
              className="px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 font-mono text-[12px] border border-zinc-200/60 dark:border-zinc-700/60"
            >
              {codePart}
            </code>
          );
        }
        const italicParts = codePart.split(/\*([^*]+)\*/g);
        return italicParts.map((italicPart, iIdx) => {
          const isItalic = iIdx % 2 === 1;
          if (isItalic) {
            return (
              <em
                key={`i-${bIdx}-${cIdx}-${iIdx}`}
                className="italic text-zinc-800 dark:text-zinc-200"
              >
                {italicPart}
              </em>
            );
          }
          return italicPart;
        });
      });

      if (isBold) {
        return (
          <strong
            key={`b-${bIdx}`}
            className="font-bold text-zinc-950 dark:text-zinc-50"
          >
            {elements}
          </strong>
        );
      }
      return elements;
    });
  };

  const lines = text.split("\n");
  const blocks: any[] = [];
  let currentList: { type: "bullet" | "number"; items: string[] } | null = null;

  const pushCurrentList = () => {
    if (currentList) {
      blocks.push({
        type: currentList.type === "bullet" ? "unordered-list" : "ordered-list",
        items: currentList.items,
      });
      currentList = null;
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      pushCurrentList();
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.*)$/);
    if (bulletMatch) {
      if (currentList && currentList.type !== "bullet") {
        pushCurrentList();
      }
      if (!currentList) {
        currentList = { type: "bullet", items: [] };
      }
      currentList.items.push(bulletMatch[1]);
      continue;
    }

    const numberMatch = trimmed.match(/^\d+\.\s+(.*)$/);
    if (numberMatch) {
      if (currentList && currentList.type !== "number") {
        pushCurrentList();
      }
      if (!currentList) {
        currentList = { type: "number", items: [] };
      }
      currentList.items.push(numberMatch[1]);
      continue;
    }

    pushCurrentList();

    const h3Match = trimmed.match(/^###\s+(.*)$/);
    if (h3Match) {
      blocks.push({ type: "h3", text: h3Match[1] });
      continue;
    }

    const h2Match = trimmed.match(/^##\s+(.*)$/);
    if (h2Match) {
      blocks.push({ type: "h2", text: h2Match[1] });
      continue;
    }

    const h1Match = trimmed.match(/^#\s+(.*)$/);
    if (h1Match) {
      blocks.push({ type: "h1", text: h1Match[1] });
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s+(.*)$/);
    if (quoteMatch) {
      blocks.push({ type: "quote", text: quoteMatch[1] });
      continue;
    }

    blocks.push({ type: "paragraph", text: trimmed });
  }

  pushCurrentList();

  return (
    <div className={`space-y-1.5 ${baseFontSize} ${className}`}>
      {blocks.map((block, idx) => {
        if (block.type === "h1") {
          return (
            <h1 key={idx} className="text-base font-bold text-zinc-900 dark:text-zinc-100 pt-1 pb-0.5 border-b border-zinc-200 dark:border-zinc-800">
              {parseInlineMarkdown(block.text)}
            </h1>
          );
        }
        if (block.type === "h2") {
          return (
            <h2 key={idx} className="text-sm font-bold text-zinc-900 dark:text-zinc-100 pt-1 pb-0.5">
              {parseInlineMarkdown(block.text)}
            </h2>
          );
        }
        if (block.type === "h3") {
          return (
            <h3 key={idx} className="text-xs font-semibold text-zinc-900 dark:text-zinc-100 pt-0.5">
              {parseInlineMarkdown(block.text)}
            </h3>
          );
        }
        if (block.type === "quote") {
          return (
            <blockquote key={idx} className="pl-3 border-l-2 border-indigo-500 text-zinc-600 dark:text-zinc-400 italic text-xs py-0.5">
              {parseInlineMarkdown(block.text)}
            </blockquote>
          );
        }
        if (block.type === "unordered-list") {
          return (
            <ul key={idx} className="list-disc list-inside space-y-0.5 text-zinc-700 dark:text-zinc-300 pl-1">
              {block.items.map((item: string, itemIdx: number) => (
                <li key={itemIdx}>{parseInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }
        if (block.type === "ordered-list") {
          return (
            <ol key={idx} className="list-decimal list-inside space-y-0.5 text-zinc-700 dark:text-zinc-300 pl-1">
              {block.items.map((item: string, itemIdx: number) => (
                <li key={itemIdx}>{parseInlineMarkdown(item)}</li>
              ))}
            </ol>
          );
        }
        return (
          <p key={idx} className="text-zinc-800 dark:text-zinc-200 leading-relaxed">
            {parseInlineMarkdown(block.text)}
          </p>
        );
      })}
    </div>
  );
};
