// @ts-nocheck
import { useState } from 'react';

const STAGE_LABELS = ['Screen', 'LLM Eval', 'Repair', 'Uniq Q', 'Dedup', 'Corpus', 'Q&A'];

const COMPLETION_PATTERNS = [
  /✓ Phase 1 complete/,
  /✓ Phase 2 complete/,
  /✓ Repair complete/,
  /✓ Unique question extraction complete/,
  /✓ Dedup complete/,
  /✓ Corpus filter complete/,
  /✓ Q&A generation complete/,
];

const AUTO_SKIP_STAGE = [
  [/phase1_results\.pkl/, 0],
  [/phase2_scores\.csv/, 1],
  [/cluster_questions\.csv/, 2],
  [/unique_question_mapping\.csv/, 3],
  [/downstream output exists/, 4],
  [/corpus_filtered_out\.csv/, 5],
];

export function parsePipelineOutput(stdout) {
  if (!stdout) return null;
  const m = stdout.match(/\[INFO\] (?:Filtered to|Found) \d+ unique crop\(s\): (.+)/);
  if (!m) return null;

  const allCrops = m[1].split(', ').map(c => c.trim());
  const data = {};
  allCrops.forEach(crop => {
    data[crop] = {
      name: crop,
      stages: STAGE_LABELS.map(name => ({ name, status: 'pending' })),
      overallStatus: 'pending',
      qaProgress: null,
    };
  });

  let currentCrop = null;
  let currentStageIdx = -1;

  for (const line of stdout.split('\n')) {
    const bannerMatch = line.match(/^\s+KCC FAQ Pipeline\s*—\s*(.+)$/);
    if (bannerMatch) {
      const name = bannerMatch[1].trim();
      const match = allCrops.find(c => c.toLowerCase() === name.toLowerCase());
      if (match) {
        currentCrop = match;
        data[match].overallStatus = 'running';
      }
      continue;
    }

    if (line.includes('[auto-skip]') && currentCrop) {
      for (const [pattern, idx] of AUTO_SKIP_STAGE) {
        if (pattern.test(line)) {
          data[currentCrop].stages[idx].status = 'done';
          break;
        }
      }
    }

    const stageMatch = line.match(/Stage (\d+)\/7/);
    if (stageMatch) {
      currentStageIdx = parseInt(stageMatch[1]) - 1;
      if (currentCrop && data[currentCrop].stages[currentStageIdx].status === 'pending') {
        data[currentCrop].stages[currentStageIdx].status = 'active';
      }
      continue;
    }

    const cropLineMatch = line.match(/^\s+Crop\s+:\s+(.+)$/);
    if (cropLineMatch && !currentCrop) {
      const name = cropLineMatch[1].trim();
      const match = allCrops.find(c => c.toLowerCase() === name.toLowerCase());
      if (match) {
        currentCrop = match;
        data[match].overallStatus = 'running';
        if (currentStageIdx === 0) data[match].stages[0].status = 'active';
      }
    }

    for (let i = 0; i < COMPLETION_PATTERNS.length; i++) {
      if (COMPLETION_PATTERNS[i].test(line) && currentCrop) {
        data[currentCrop].stages[i].status = 'done';
        if (i === 6) data[currentCrop].overallStatus = 'done';
        break;
      }
    }

    const warnMatch = line.match(/\[WARN\] Crop '(.+?)' failed:/);
    if (warnMatch) {
      const match = allCrops.find(c => c.toLowerCase() === warnMatch[1].toLowerCase());
      if (match) {
        const active = data[match].stages.find(s => s.status === 'active');
        if (active) active.status = 'failed';
        data[match].overallStatus = 'skipped';
      }
    }

    const qaMatch = line.match(/Progress:\s+(\d+)\/(\d+)\s+rows/);
    if (qaMatch && currentCrop) {
      data[currentCrop].qaProgress = { done: parseInt(qaMatch[1]), total: parseInt(qaMatch[2]) };
    }
  }

  return allCrops.map(c => data[c]);
}

const DOT = {
  done:    'bg-green-500 border-green-500',
  failed:  'bg-red-500 border-red-500',
  active:  'bg-blue-400 border-blue-400 animate-pulse',
  pending: 'bg-transparent border-muted-foreground/25',
};

const LABEL_COLOR = {
  done:    'text-green-400',
  failed:  'text-red-400',
  active:  'text-blue-400',
  pending: 'text-muted-foreground/35',
};

function StageBar({ stages }) {
  return (
    <div className="flex items-start w-full">
      {stages.map((stage, i) => {
        const isFirst = i === 0;
        const isLast  = i === stages.length - 1;
        const leftFill  = !isFirst && stages[i - 1].status === 'done';
        const rightFill = !isLast  && stage.status === 'done';
        return (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0">
            <div className="flex items-center w-full">
              <div className={`h-px flex-1 transition-colors ${isFirst ? 'invisible' : leftFill ? 'bg-green-500/50' : 'bg-border/40'}`} />
              <div
                className={`w-2 h-2 rounded-full border flex-shrink-0 transition-colors ${DOT[stage.status]}`}
                title={`${stage.name}: ${stage.status}`}
              />
              <div className={`h-px flex-1 transition-colors ${isLast ? 'invisible' : rightFill ? 'bg-green-500/50' : 'bg-border/40'}`} />
            </div>
            <span className={`text-[8px] mt-0.5 text-center leading-none truncate w-full ${LABEL_COLOR[stage.status]}`}>
              {stage.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const BADGE = {
  done:    { label: 'Done',    cls: 'bg-green-500/15 text-green-400 border-green-500/30' },
  skipped: { label: 'Skipped', cls: 'bg-muted/60 text-muted-foreground/55 border-border/60' },
  running: { label: 'Running', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
  pending: { label: 'Pending', cls: 'bg-muted/30 text-muted-foreground/40 border-border/40' },
};

function CropCard({ crop }) {
  const badge = BADGE[crop.overallStatus] || BADGE.pending;
  const qaActive = crop.stages[6]?.status === 'active' && crop.qaProgress;
  const qaPct = qaActive ? Math.round(crop.qaProgress.done / crop.qaProgress.total * 100) : null;
  return (
    <div className="bg-background/35 border border-border/50 rounded-md px-2.5 py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-foreground leading-none">{crop.name}</span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border leading-none ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      <StageBar stages={crop.stages} />
      {qaActive && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <div className="flex-1 h-1 bg-border/30 rounded-full overflow-hidden">
            <div className="h-full bg-blue-400 transition-all" style={{ width: `${qaPct}%` }} />
          </div>
          <span className="text-[10px] text-blue-400 font-medium shrink-0">
            {crop.qaProgress.done}/{crop.qaProgress.total} ({qaPct}%)
          </span>
        </div>
      )}
    </div>
  );
}

export function parsePrePipelineOutput(stdout) {
  if (!stdout) return null;
  if (!stdout.includes('State Filter') && !stdout.includes('Crop Normalization')) return null;

  const result = {
    stage1: { status: 'pending', state: null, inputFile: null, outputFile: null, rowsWritten: null },
    stage2: { status: 'pending', crops: [], outputFile: null, rowsRemoved: null, rowsKept: null },
  };

  let currentStage = 0;

  for (const line of stdout.split('\n')) {
    if (/Stage 1\/2/.test(line)) { currentStage = 1; result.stage1.status = 'active'; }
    if (/Stage 2\/2/.test(line)) { currentStage = 2; result.stage2.status = 'active'; }
    if (/✓ State filter complete/.test(line)) result.stage1.status = 'done';
    if (/✓ Crop normalization complete/.test(line)) result.stage2.status = 'done';

    if (currentStage === 1) {
      const stateM = line.match(/^\s+State\s+:\s+(.+)$/);
      if (stateM) result.stage1.state = stateM[1].trim();
      const inputM = line.match(/^\s+Input\s+:\s+(.+)$/);
      if (inputM) result.stage1.inputFile = inputM[1].trim().split('/').pop();
      const outputM = line.match(/^\s+Output\s+:\s+(.+)$/);
      if (outputM) result.stage1.outputFile = outputM[1].trim().split('/').pop();
      const rowsM = line.match(/([\d,]+) rows written/);
      if (rowsM) result.stage1.rowsWritten = rowsM[1];
    }

    if (currentStage === 2) {
      const cropsM = line.match(/^\s+Primary crops\s+:\s+(.+)$/);
      if (cropsM) result.stage2.crops = cropsM[1].split(',').map(c => c.trim());
      const outputM = line.match(/^\s+Output\s+:\s+(.+)$/);
      if (outputM) result.stage2.outputFile = outputM[1].trim().split('/').pop();
      const removedM = line.match(/([\d,]+) rows removed/);
      if (removedM) result.stage2.rowsRemoved = removedM[1];
      const keptM = line.match(/([\d,]+) rows kept/);
      if (keptM) result.stage2.rowsKept = keptM[1];
    }
  }

  return result.stage1.status === 'pending' ? null : result;
}

export function PrePipelineOutput({ stdout }) {
  const [showRaw, setShowRaw] = useState(false);
  const data = parsePrePipelineOutput(stdout);
  if (!data) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground font-medium">Pre-pipeline</span>
          {data.stage1.state && <span className="text-foreground font-semibold">{data.stage1.state}</span>}
        </div>
        <button
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
          onClick={() => setShowRaw(v => !v)}
        >
          {showRaw ? 'hide log' : 'raw log'}
        </button>
      </div>

      <div className="bg-background/35 border border-border/50 rounded-md px-2.5 py-2">
        <StageBar stages={[
          { name: 'State Filter', status: data.stage1.status },
          { name: 'Crop Norm',    status: data.stage2.status },
        ]} />
      </div>

      <div className="bg-background/35 border border-border/50 rounded-md px-2.5 py-2">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-semibold text-foreground">State Filter</span>
          <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border leading-none ${(BADGE[data.stage1.status] || BADGE.pending).cls}`}>
            {(BADGE[data.stage1.status] || BADGE.pending).label}
          </span>
        </div>
        <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
          {data.stage1.state && <span>State: <span className="text-foreground">{data.stage1.state}</span></span>}
          {data.stage1.rowsWritten && <span>Rows written: <span className="text-green-400 font-medium">{data.stage1.rowsWritten}</span></span>}
          {data.stage1.outputFile && <span className="text-muted-foreground/50 truncate">{data.stage1.outputFile}</span>}
        </div>
      </div>

      {data.stage2.status !== 'pending' && (
        <div className="bg-background/35 border border-border/50 rounded-md px-2.5 py-2">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-semibold text-foreground">Crop Normalization</span>
            <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border leading-none ${(BADGE[data.stage2.status] || BADGE.pending).cls}`}>
              {(BADGE[data.stage2.status] || BADGE.pending).label}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 text-[10px] text-muted-foreground">
            {data.stage2.crops.length > 0 && <span>{data.stage2.crops.length} primary crops</span>}
            {data.stage2.rowsRemoved && data.stage2.rowsKept && (
              <div className="flex items-center gap-1">
                <span className="text-red-400/70">{data.stage2.rowsRemoved} removed</span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-green-400 font-medium">{data.stage2.rowsKept} kept</span>
              </div>
            )}
            {data.stage2.outputFile && <span className="text-muted-foreground/50 truncate">{data.stage2.outputFile}</span>}
          </div>
        </div>
      )}

      {showRaw && (
        <pre className="font-mono text-xs bg-slate-900 text-slate-400 p-2 max-h-60 overflow-y-auto rounded whitespace-pre-wrap mt-0.5">
          {stdout || '(empty)'}
        </pre>
      )}
    </div>
  );
}

export function parsePostPipelineOutput(stdout) {
  if (!stdout) return null;
  if (!stdout.includes('LLM Deduplication')) return null;

  const result = { stage1: 'done', stage2: 'pending', files: [] };
  let cur = null;

  for (const line of stdout.split('\n')) {
    if (/LLM Deduplication/.test(line) && result.stage2 === 'pending') {
      result.stage2 = 'active';
    }
    const pm = line.match(/Processing:\s+(\S+)\//);
    if (pm) {
      cur = { name: pm[1].trim() + '_faq.csv', originalSize: null, cleanedSize: null, status: 'active' };
      result.files.push(cur);
    }
    const om = line.match(/Original Dataset Size:\s*(\d+)/);
    if (om && cur) cur.originalSize = parseInt(om[1]);
    const cm = line.match(/Cleaned Dataset Size:\s*(\d+)/);
    if (cm && cur) cur.cleanedSize = parseInt(cm[1]);
    if (/Saved:.*\/dedup_faq\.csv/.test(line) && cur) cur.status = 'done';
    if (/✓ Deduplication complete/.test(line)) {
      result.stage2 = 'done';
      if (cur?.status === 'active') cur.status = 'done';
    }
  }

  return result;
}

function PostFileCard({ file }) {
  const crop = file.name.replace(/_faq\.csv$/, '').replace(/_/g, ' ');
  const pct = file.originalSize && file.cleanedSize
    ? Math.round((1 - file.cleanedSize / file.originalSize) * 100)
    : null;
  const badge = BADGE[file.status] || BADGE.pending;
  return (
    <div className="bg-background/35 border border-border/50 rounded-md px-2.5 py-2">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-foreground capitalize leading-none">{crop}</span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded-full border leading-none ${badge.cls}`}>
          {badge.label}
        </span>
      </div>
      {file.originalSize != null && file.cleanedSize != null ? (
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>{file.originalSize}</span>
          <span className="text-muted-foreground/40">→</span>
          <span className="text-green-400 font-medium">{file.cleanedSize}</span>
          {pct != null && <span className="text-muted-foreground/50">({pct}% reduced)</span>}
        </div>
      ) : (
        <span className="text-[10px] text-blue-400/70 animate-pulse">processing…</span>
      )}
    </div>
  );
}

export function PostPipelineOutput({ stdout }) {
  const [showRaw, setShowRaw] = useState(false);
  const data = parsePostPipelineOutput(stdout);
  if (!data) return null;

  const doneCount    = data.files.filter(f => f.status === 'done').length;
  const runningCount = data.files.filter(f => f.status === 'active').length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground font-medium">{data.files.length} files</span>
          {doneCount > 0    && <span className="text-green-400 font-semibold">{doneCount} done</span>}
          {runningCount > 0 && <span className="text-blue-400 font-semibold">{runningCount} running</span>}
        </div>
        <button
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
          onClick={() => setShowRaw(v => !v)}
        >
          {showRaw ? 'hide log' : 'raw log'}
        </button>
      </div>

      <div className="bg-background/35 border border-border/50 rounded-md px-2.5 py-2">
        <StageBar stages={[
          { name: 'Collect', status: data.stage1 },
          { name: 'Dedup',   status: data.stage2 },
        ]} />
      </div>

      {data.files.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {data.files.map((file, i) => (
            <PostFileCard key={i} file={file} />
          ))}
        </div>
      )}

      {showRaw && (
        <pre className="font-mono text-xs bg-slate-900 text-slate-400 p-2 max-h-60 overflow-y-auto rounded whitespace-pre-wrap mt-0.5">
          {stdout || '(empty)'}
        </pre>
      )}
    </div>
  );
}

export default function PipelineOutput({ stdout }) {
  const [showRaw, setShowRaw] = useState(false);
  const crops = parsePipelineOutput(stdout);
  if (!crops) return null;

  const doneCount    = crops.filter(c => c.overallStatus === 'done').length;
  const skippedCount = crops.filter(c => c.overallStatus === 'skipped').length;
  const runningCount = crops.filter(c => c.overallStatus === 'running').length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-muted-foreground font-medium">{crops.length} crops</span>
          {doneCount > 0    && <span className="text-green-400 font-semibold">{doneCount} done</span>}
          {runningCount > 0 && <span className="text-blue-400 font-semibold">{runningCount} running</span>}
          {skippedCount > 0 && <span className="text-muted-foreground/55">{skippedCount} skipped</span>}
        </div>
        <button
          className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
          onClick={() => setShowRaw(v => !v)}
        >
          {showRaw ? 'hide log' : 'raw log'}
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {crops.map(crop => (
          <CropCard key={crop.name} crop={crop} />
        ))}
      </div>

      {showRaw && (
        <pre className="font-mono text-xs bg-slate-900 text-slate-400 p-2 max-h-60 overflow-y-auto rounded whitespace-pre-wrap mt-0.5">
          {stdout || '(empty)'}
        </pre>
      )}
    </div>
  );
}
