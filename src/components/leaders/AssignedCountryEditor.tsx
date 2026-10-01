'use client';

/**
 * Section 5 — ประเทศประจำ
 * ประเทศที่บริษัทเรียกใช้ทำงานเป็นหลัก (แยกจากประเทศที่เชี่ยวชาญ)
 * — ประเทศประจำหลักได้หนึ่งประเทศ · เพิ่มเติมได้หลายประเทศ · ห้ามซ้ำ · เว้นว่างได้
 */

import { useMemo, useState } from 'react';
import { Button, Callout, cx, Pill } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Combobox } from '@/components/ui/Combobox';
import { Icon } from '@/components/ui/Icon';
import {
  hasDuplicateAssignedCountry,
  newChildId,
  removeAssignedCountry,
  setPrimaryAssignedCountry,
} from '@/modules/tour-leaders/utils';
import type { AssignedCountry, Country } from '@/types';

export function AssignedCountryEditor({
  items,
  countries,
  errors,
  onChange,
}: {
  items: AssignedCountry[];
  countries: Country[];
  errors: Record<string, string>;
  onChange: (next: AssignedCountry[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [addError, setAddError] = useState<string>();

  /** เลือกเพิ่มได้เฉพาะประเทศที่ยังใช้งานอยู่ (Master ที่ปิดใช้งานไม่ปรากฏ) */
  const available = countries.filter(
    (c) => c.isActive && !hasDuplicateAssignedCountry(items, c.id),
  );

  /** กรองตามคำค้น: ชื่อไทย / อังกฤษ / รหัส alpha-2 / alpha-3 */
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return available;
    return available.filter((c) =>
      `${c.nameTh} ${c.nameEn} ${c.code} ${c.alpha3 ?? ''}`.toLowerCase().includes(q),
    );
  }, [available, query]);

  const add = (countryId: string) => {
    if (hasDuplicateAssignedCountry(items, countryId)) {
      setAddError('ประเทศนี้ถูกเพิ่มไว้แล้ว');
      return;
    }
    onChange([
      ...items,
      {
        id: newChildId('AC'),
        countryId,
        isPrimary: items.length === 0, // ประเทศแรกเป็นประเทศหลักอัตโนมัติ
        active: true,
      },
    ]);
    setQuery('');
    setAddError(undefined);
  };

  const update = (id: string, patch: Partial<AssignedCountry>) =>
    onChange(items.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  return (
    <div className="space-y-3">
      <Callout tone="blue" title="ประเทศประจำ ≠ ประเทศที่เชี่ยวชาญ">
        “ประเทศประจำ” คือประเทศที่บริษัทเรียกใช้บุคคลนี้ทำงานเป็นหลัก
        ส่วน “ประเทศที่เชี่ยวชาญ” (Section ถัดไป) คือความสามารถที่ใช้จับคู่งาน —
        เว้นว่างได้ถ้ายังไม่มีประเทศประจำ
      </Callout>

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-56 flex-1">
          <Combobox
            label="เพิ่มประเทศประจำ"
            value=""
            items={matches}
            getKey={(c) => c.id}
            getLabel={(c) => `${c.nameTh} — ${c.nameEn}`}
            getSubLabel={(c) => (c.callingCode ? `${c.code} · ${c.callingCode}` : c.code)}
            onSelect={(c) => c && add(c.id)}
            onSearch={(q) => {
              setQuery(q);
              setAddError(undefined);
            }}
            placeholder={
              available.length === 0 ? 'เพิ่มครบทุกประเทศแล้ว' : 'ค้นหาชื่อ/รหัสประเทศ แล้วเลือก'
            }
            disabled={available.length === 0}
            error={addError}
            hint="พิมพ์ชื่อไทย/อังกฤษ หรือรหัสประเทศ (เช่น JP, JPN) เพื่อค้นหา"
            emptyMessage="ไม่พบประเทศที่ค้นหา"
          />
        </div>
      </div>

      {errors.assignedCountries && (
        <p className="rounded-lg border zego-warned-border zego-warned-tint px-3 py-2 text-xs font-medium zego-text-danger">
          {errors.assignedCountries}
        </p>
      )}

      {items.length === 0 ? (
        <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
          ยังไม่มีประเทศประจำ (เว้นว่างได้)
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => {
            const country = countries.find((c) => c.id === item.countryId);
            const inactive = country && !country.isActive;
            return (
              <li
                key={item.id}
                className={cx(
                  'rounded-xl border p-3',
                  item.isPrimary
                    ? 'zego-selected-border zego-selected-tint'
                    : 'zego-border-color zego-surface-soft-bg',
                )}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold zego-text">
                      {country ? `${country.nameEn} (${country.nameTh})` : item.countryId}
                    </span>
                    {item.isPrimary && <Pill tone="blue">ประเทศประจำหลัก</Pill>}
                    {inactive && <Pill tone="red">Master ปิดใช้งานแล้ว</Pill>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!item.isPrimary && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onChange(setPrimaryAssignedCountry(items, item.id))}
                      >
                        ตั้งเป็นประเทศหลัก
                      </Button>
                    )}
                    <button
                      type="button"
                      onClick={() => onChange(removeAssignedCountry(items, item.id))}
                      aria-label={`นำ ${country?.nameTh ?? ''} ออก`}
                      className="rounded p-1 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {errors[item.id] && (
                  <p className="mb-2 text-xs font-medium zego-text-danger">{errors[item.id]}</p>
                )}

                <div className="grid gap-3 sm:grid-cols-3">
                  <TextInput
                    label="ภูมิภาคหรือเมืองประจำ"
                    placeholder="เช่น คันโต / โตเกียว"
                    value={item.regionOrCity ?? ''}
                    onChange={(e) => update(item.id, { regionOrCity: e.target.value })}
                  />
                  <DateField
                    label="วันที่เริ่ม"
                    value={item.startDate ?? ''}
                    onChange={(v) => update(item.id, { startDate: v || undefined })}
                  />
                  <TextInput
                    label="หมายเหตุ"
                    value={item.note ?? ''}
                    onChange={(e) => update(item.id, { note: e.target.value })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
