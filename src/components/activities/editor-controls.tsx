"use client";

import { Label } from "@/components/ui/input";
import { ICON_LABEL, PIECE_ICONS, type EditorItem } from "@/lib/activities/editor-model";

export const SELECT_CLASS =
  "min-h-target w-full rounded-[20px] border-2 border-border bg-surface px-4 text-body text-ink disabled:bg-disabled-bg disabled:text-disabled-ink";

export const TEXTAREA_CLASS =
  "w-full rounded-[20px] border-2 border-border bg-surface px-4 py-3 text-body text-ink disabled:bg-disabled-bg disabled:text-disabled-ink";

export function IconSelect({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: EditorItem["supportIcon"];
  onChange: (value: EditorItem["supportIcon"]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} className={SELECT_CLASS} onChange={(e) => onChange(e.target.value as EditorItem["supportIcon"])}>
        <option value="">Sem figura</option>
        {PIECE_ICONS.map((n) => (
          <option key={n} value={n}>{ICON_LABEL[n]}</option>
        ))}
      </select>
    </div>
  );
}
