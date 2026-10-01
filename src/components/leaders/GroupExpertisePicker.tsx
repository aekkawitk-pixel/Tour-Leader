'use client';

/**
 * เลือกประเภทกรุ๊ปที่ถนัด (§3/§4/§5) — Checkbox Card เห็นตัวเลือกทั้งหมด (ไม่ใช้ Dropdown)
 * Logic §3: ALL ↔ เฉพาะ · ครบสองประเภท → ALL อัตโนมัติ (จัดการใน toggleGroupExpertise)
 */

import { cx } from '@/components/ui/Primitives';
import {
  GROUP_EXPERTISE_TYPES, normalizeGroupExpertise, toggleGroupExpertise,
  type GroupExpertiseCode,
} from '@/lib/logic/groupExpertise';

export function GroupExpertisePicker({
  value,
  onChange,
}: {
  value: GroupExpertiseCode[];
  onChange: (next: GroupExpertiseCode[]) => void;
}) {
  const norm = normalizeGroupExpertise(value);
  return (
    <div className="space-y-2">
      {GROUP_EXPERTISE_TYPES.map((t) => {
        const on = norm.includes(t.code);
        return (
          <label
            key={t.code}
            className={cx(
              'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
              on ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-hover-selected',
            )}
          >
            <input
              type="checkbox"
              checked={on}
              onChange={() => onChange(toggleGroupExpertise(value, t.code))}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--zego-primary-500)]"
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium zego-text">{t.nameTh}</span>
              <span className="block text-xs zego-text-tertiary">{t.descTh}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
