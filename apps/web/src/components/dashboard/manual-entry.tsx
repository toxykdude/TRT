'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Row = { biomarkerKey: string; value: string; unit: string; refLow: string; refHigh: string };

const COMMON = [
  'total_testosterone',
  'free_testosterone',
  'shbg',
  'lh',
  'fsh',
  'estradiol_sensitive',
  'hematocrit',
  'hemoglobin',
  'psa',
  'ldl',
  'hdl',
  'triglycerides',
  'a1c',
  'glucose',
  'alt',
  'egfr',
];

export function ManualEntry() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [lab, setLab] = useState('');
  const [rows, setRows] = useState<Row[]>([
    { biomarkerKey: 'total_testosterone', value: '', unit: 'ng/dL', refLow: '', refHigh: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const addRow = () =>
    setRows((r) => [
      ...r,
      { biomarkerKey: COMMON[r.length % COMMON.length]!, value: '', unit: '', refLow: '', refHigh: '' },
    ]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const update = (i: number, patch: Partial<Row>) =>
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));

  const save = async () => {
    setSaving(true);
    setErr(null);
    const results = rows
      .filter((r) => r.biomarkerKey && r.value)
      .map((r) => ({
        biomarkerKey: r.biomarkerKey,
        value: Number(r.value),
        unit: r.unit || undefined,
        refLow: r.refLow ? Number(r.refLow) : undefined,
        refHigh: r.refHigh ? Number(r.refHigh) : undefined,
      }));
    if (results.length === 0) {
      setErr('Add at least one value.');
      setSaving(false);
      return;
    }
    try {
      const res = await fetch('/dashboard/labs/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collectedAt: date, laboratory: lab, results }),
      });
      if (!res.ok) throw new Error(await res.text());
      setOpen(false);
      router.push('/dashboard/labs/results');
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed');
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Plus className="mr-1 h-4 w-4" /> Enter values manually
      </Button>
    );
  }

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Manual entry</h3>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="me-date">Collected date</Label>
          <Input id="me-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="me-lab">Laboratory (optional)</Label>
          <Input id="me-lab" value={lab} onChange={(e) => setLab(e.target.value)} placeholder="e.g. Quest" />
        </div>
      </div>

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="grid grid-cols-12 items-end gap-2">
            <div className="col-span-4 space-y-1">
              <Label className="text-xs">Biomarker key</Label>
              <Input
                list="biomarker-keys"
                value={row.biomarkerKey}
                onChange={(e) => update(i, { biomarkerKey: e.target.value })}
                placeholder="total_testosterone"
              />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Value</Label>
              <Input value={row.value} onChange={(e) => update(i, { value: e.target.value })} type="number" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Unit</Label>
              <Input value={row.unit} onChange={(e) => update(i, { unit: e.target.value })} placeholder="ng/dL" />
            </div>
            <div className="col-span-1 space-y-1">
              <Label className="text-xs">Low</Label>
              <Input value={row.refLow} onChange={(e) => update(i, { refLow: e.target.value })} />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">High</Label>
              <Input value={row.refHigh} onChange={(e) => update(i, { refHigh: e.target.value })} />
            </div>
            <Button variant="ghost" size="icon" onClick={() => removeRow(i)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        ))}
        <datalist id="biomarker-keys">
          {COMMON.map((k) => (
            <option key={k} value={k} />
          ))}
        </datalist>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={addRow}>
          <Plus className="mr-1 h-3 w-3" /> Add row
        </Button>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save {rows.length} value
          {rows.length === 1 ? '' : 's'}
        </Button>
        {err && <span className="text-xs text-destructive">{err}</span>}
      </div>
    </div>
  );
}
