interface Props { lastSync: string; datasetVersion: string; llmVersion: string; p0Bugs: number; }

function Sep() {
  return <span className="w-px h-3 bg-[var(--border)] inline-block" />;
}

export function StatusBar({ lastSync, datasetVersion, llmVersion, p0Bugs }: Props) {
  return (
    <div className="bg-[var(--card)] border-t border-[var(--border)] flex items-center gap-4 px-5 py-2 text-[11px] text-[var(--muted-foreground)] shrink-0 flex-wrap">
      <span className="w-1.5 h-1.5 rounded-full bg-[#3AAA5A] inline-block" />
      <span>All systems operational</span>
      <Sep /><span>Last sync: {lastSync}</span>
      <Sep /><span>Dataset: {datasetVersion}</span>
      <Sep /><span>Agri-LLM: {llmVersion}</span>
      <Sep /><span className="text-[#A32D2D] font-medium">{p0Bugs} P0 bugs open · action required</span>
    </div>
  );
}
