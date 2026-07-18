import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, GripVertical, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { Button } from "@/components/atoms/button";
import { Input } from "@/components/atoms/input";
import {
  useGetDashboardContent,
  useUpdateDashboardContent,
} from "@/hooks/api/dashboard/useDashboardContent";
import type {
  DashboardBlock,
  DashboardStat,
} from "@/hooks/services/dashboardContentService";
import { defaultBlocks, defaultStats } from "../data/contentDefaults";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `blk-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const emptyBlock = (order: number): DashboardBlock => ({
  id: newId(),
  heading: "",
  body: "",
  figures: [],
  order,
});

/**
 * Admin/moderator editor for the public dashboard's narrative content. Freeform blocks:
 * add / edit / reorder / remove; each block has a heading, a plain-text body, and any
 * number of optional key figures (label + value).
 */
export const DashboardContentEditor = () => {
  const { data, isLoading } = useGetDashboardContent();
  const { mutateAsync: save, isPending: saving } = useUpdateDashboardContent();
  const [blocks, setBlocks] = useState<DashboardBlock[]>([]);
  const [stats, setStats] = useState<DashboardStat[]>([]);
  // Empty string = "not set" (falls back to the server default); otherwise a number string.
  const [saturationThreshold, setSaturationThreshold] = useState<string>("");

  useEffect(() => {
    if (!data) return;
    setBlocks(data.blocks?.length ? data.blocks : []);
    setStats(data.stats?.length ? data.stats : []);
    setSaturationThreshold(
      data.saturationThreshold != null ? String(data.saturationThreshold) : "",
    );
  }, [data]);

  // ── Headline stats (the snapshot grid) ────────────────────────────────────
  const patchStat = (i: number, p: Partial<DashboardStat>) =>
    setStats((s) => s.map((st, idx) => (idx === i ? { ...st, ...p } : st)));
  const moveStat = (i: number, dir: -1 | 1) =>
    setStats((s) => {
      const j = i + dir;
      if (j < 0 || j >= s.length) return s;
      const copy = [...s];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const removeStat = (i: number) => setStats((s) => s.filter((_, idx) => idx !== i));
  const addStat = () =>
    setStats((s) => [...s, { id: newId(), label: "", value: "", order: s.length }]);

  const patch = (i: number, p: Partial<DashboardBlock>) =>
    setBlocks((b) => b.map((blk, idx) => (idx === i ? { ...blk, ...p } : blk)));

  const move = (i: number, dir: -1 | 1) =>
    setBlocks((b) => {
      const j = i + dir;
      if (j < 0 || j >= b.length) return b;
      const copy = [...b];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });

  const remove = (i: number) => setBlocks((b) => b.filter((_, idx) => idx !== i));
  const add = () => setBlocks((b) => [...b, emptyBlock(b.length)]);
  const loadDefaults = () => {
    setBlocks(defaultBlocks.map((b) => ({ ...b, id: newId() })));
    setStats(defaultStats.map((s) => ({ ...s, id: newId() })));
  };

  const setFigure = (bi: number, fi: number, p: Partial<{ label: string; value: string }>) =>
    patch(bi, {
      figures: blocks[bi].figures.map((f, idx) => (idx === fi ? { ...f, ...p } : f)),
    });
  const addFigure = (bi: number) =>
    patch(bi, { figures: [...blocks[bi].figures, { label: "", value: "" }] });
  const removeFigure = (bi: number, fi: number) =>
    patch(bi, { figures: blocks[bi].figures.filter((_, idx) => idx !== fi) });

  const onSave = () =>
    save({
      blocks: blocks.map((b, i) => ({ ...b, order: i })),
      stats: stats.map((s, i) => ({ ...s, order: i })),
      saturationThreshold:
        saturationThreshold.trim() === "" ? undefined : Number(saturationThreshold),
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading content…
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Public Dashboard Content</h1>
          <p className="text-sm text-muted-foreground">
            Edit the narrative blocks shown on the public dashboard. Changes are live once saved.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadDefaults}>
            Load defaults
          </Button>
          <Button size="sm" onClick={onSave} disabled={saving} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </div>

      {/* ── Saturation threshold for the "Saturated Crops" grouping ── */}
      <section className="mb-8 rounded-lg border bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Saturation threshold</h2>
            <p className="text-xs text-muted-foreground">
              A crop counts as “saturated” in a state once its question count exceeds this
              number. Leave blank to use the server default.
            </p>
          </div>
          <Input
            type="number"
            min={0}
            value={saturationThreshold}
            onChange={(e) => setSaturationThreshold(e.target.value)}
            placeholder="e.g. 50"
            className="w-32"
          />
        </div>
      </section>

      {/* ── Headline figures shown in the dashboard's snapshot grid ── */}
      <section className="mb-8 rounded-lg border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold">Headline Stats</h2>
            <p className="text-xs text-muted-foreground">
              The figures in the snapshot grid (e.g. Total Agricultural Questions Processed,
              Total Languages Supported, Total Outreach Events Conducted). A plain number
              counts up; text like “18.6M” is shown as-is.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={addStat} className="h-8 gap-1 text-xs">
            <Plus className="h-3.5 w-3.5" /> Add stat
          </Button>
        </div>

        {stats.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-center text-xs text-muted-foreground">
            No stats yet — “Load defaults” seeds the full set, or add one.
          </p>
        ) : (
          <div className="space-y-2">
            {stats.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <Input
                  value={s.value}
                  onChange={(e) => patchStat(i, { value: e.target.value })}
                  placeholder="Value (e.g. 18600000)"
                  className="w-44"
                />
                <Input
                  value={s.label}
                  onChange={(e) => patchStat(i, { label: e.target.value })}
                  placeholder="Label (e.g. Total Agricultural Questions Processed)"
                  className="flex-1"
                />
                <Button variant="ghost" size="icon" onClick={() => moveStat(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => moveStat(i, 1)} disabled={i === stats.length - 1} aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => removeStat(i)} aria-label="Remove stat" className="text-destructive">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </section>

      {blocks.length === 0 && (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No content yet. <button className="text-primary underline" onClick={loadDefaults}>Load the default template</button> or add a block.
        </div>
      )}

      <div className="space-y-4">
        {blocks.map((b, i) => (
          <div key={b.id} className="rounded-lg border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <GripVertical className="h-4 w-4" />
                Block {i + 1}
              </div>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === blocks.length - 1} aria-label="Move down">
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => remove(i)} aria-label="Delete block" className="text-destructive">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Heading</label>
            <Input
              value={b.heading}
              onChange={(e) => patch(i, { heading: e.target.value })}
              placeholder="e.g. What ACE is"
              className="mb-3"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Body</label>
            <textarea
              value={b.body}
              onChange={(e) => patch(i, { body: e.target.value })}
              placeholder="Write the content for this section…"
              rows={4}
              className="mb-3 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />

            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Key figures (optional)</label>
              <Button variant="ghost" size="sm" onClick={() => addFigure(i)} className="h-7 gap-1 text-xs">
                <Plus className="h-3.5 w-3.5" /> Add figure
              </Button>
            </div>
            {b.figures.length > 0 && (
              <div className="space-y-2">
                {b.figures.map((f, fi) => (
                  <div key={fi} className="flex items-center gap-2">
                    <Input
                      value={f.value}
                      onChange={(e) => setFigure(i, fi, { value: e.target.value })}
                      placeholder="Value (e.g. 18.6M)"
                      className="w-40"
                    />
                    <Input
                      value={f.label}
                      onChange={(e) => setFigure(i, fi, { label: e.target.value })}
                      placeholder="Label (e.g. Questions)"
                      className="flex-1"
                    />
                    <Button variant="ghost" size="icon" onClick={() => removeFigure(i, fi)} aria-label="Remove figure">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <Button variant="outline" onClick={add} className="mt-4 w-full gap-2">
        <Plus className="h-4 w-4" /> Add block
      </Button>
    </div>
  );
};
