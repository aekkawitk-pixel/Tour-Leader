'use client';

import { useEffect, useRef, useState } from 'react';
import { Button, cx } from '@/components/ui/Primitives';
import { SearchBox, baseControl } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { SEARCH_THRESHOLD } from '@/components/ui/MultiSelect';

/**
 * §1 ตัวเลือกประเทศแบบเลือกได้หลายรายการ
 *
 * รายการประเทศมาจากข้อมูลจริงใน Tour Period Master (ไม่ Hardcode)
 * ว่าง = ทุกประเทศ · เลือกหลายประเทศ = แสดงงานที่อยู่ในประเทศใดประเทศหนึ่ง
 */
/**
 * ช่องเลือกหลายค่าแบบมี Tag — ใช้ทั้งตัวกรองประเทศและเส้นทางในหน้าต่างจัดงาน
 * (สูงเท่าช่องวันที่ข้าง ๆ — ใช้ baseControl ร่วมกัน จึงไม่ใช้ MultiSelect กลางที่เป็นทรงฟอร์ม)
 */
export function TagMultiSelect({ ariaLabel, summary, searchPlaceholder, emptyText, options, groups, counts, showTags = true, selected, onChange }: {
  ariaLabel: string;
  summary: string;
  searchPlaceholder: string;
  emptyText: string;
  options: string[];
  /** แบ่งตัวเลือกเป็นหมวดพร้อมหัวข้อ (เช่นเส้นทางแยกตามประเทศ) — ไม่ส่ง = รายการเรียงเดี่ยว */
  groups?: { label: string; options: string[] }[];
  /** จำนวนงานที่จะได้ถ้าเลือกตัวนี้ (นับภายใต้ตัวกรองอื่นที่ตั้งอยู่) — 0 = หรี่ไว้แต่ยังกดได้ */
  counts?: Map<string, number>;
  /**
   * แสดงแท็กของค่าที่เลือกใต้ปุ่มหรือไม่
   * ในฟอร์มแนวตั้งมีที่ให้แท็กห้อย แต่ในแถบเครื่องมือแนวนอนแท็กจะดันความสูงจนแถวเสียแนว
   */
  showTags?: boolean;
  selected: string[]; onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  /* รายการสั้นไม่ต้องมีช่องค้นหา — ใช้เกณฑ์เดียวกับ MultiSelect กลาง กล่องจึงไม่สูงเกินจำเป็นจนบังตาราง */
  const searchable = options.length >= SEARCH_THRESHOLD;
  const shown = options.filter((c) => c.toLowerCase().includes(q));
  /* หมวดที่ไม่เหลือรายการหลังค้นหาให้หายไปทั้งหัวข้อ — ไม่ทิ้งหัวข้อเปล่าไว้ */
  const shownGroups = (groups ?? [])
    .map((g) => ({ label: g.label, options: g.options.filter((c) => c.toLowerCase().includes(q)) }))
    .filter((g) => g.options.length > 0);
  const toggle = (c: string) => onChange(selected.includes(c) ? selected.filter((x) => x !== c) : [...selected, c]);
  /** 1 บรรทัดตัวเลือก — จำนวนงานต่อท้ายให้เห็นตั้งแต่ยังไม่กดว่ามีงานตรงไหน */
  const optionRow = (c: string, indent = false) => {
    const n = counts?.get(c);
    return (
      <label key={c} className={cx(
        'flex cursor-pointer items-center gap-2 py-1.5 pr-3 text-sm zego-hover-surface',
        indent ? 'pl-8' : 'pl-3',
        n === 0 ? 'zego-text-disabled' : 'zego-text-secondary',
      )}>
        <input type="checkbox" checked={selected.includes(c)} onChange={() => toggle(c)} className="h-4 w-4 rounded border-[var(--zego-border-strong)]" />
        <span className="min-w-0 flex-1 truncate">{c}</span>
        {n !== undefined && <span className="shrink-0 text-[11px] tabular-nums zego-text-disabled">{n}</span>}
      </label>
    );
  };

  /** ติ๊ก/เอาออกทั้งหมวดในครั้งเดียว — เลือกทั้งประเทศได้โดยไม่ต้องไล่ทีละเส้นทาง */
  const toggleGroup = (list: string[]) => {
    const allOn = list.every((c) => selected.includes(c));
    onChange(allOn ? selected.filter((c) => !list.includes(c)) : [...new Set([...selected, ...list])]);
  };

  return (
    <div ref={boxRef} className="relative">
      <button type="button" aria-label={ariaLabel} aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={cx(baseControl, 'flex w-full items-center justify-between gap-2 px-3 text-sm')}>
        <span className="min-w-0 truncate">{summary}</span>
        <Icon name="chevronDown" className="h-4 w-4 shrink-0 zego-text-tertiary" />
      </button>

      {/* Tag ของค่าที่เลือก — กดกากบาทเพื่อเอาออกทีละรายการ */}
      {showTags && selected.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {selected.map((c) => (
            <span key={c} className="zego-badge--info inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium">
              {c}
              <button type="button" aria-label={`นำ ${c} ออก`} onClick={() => toggle(c)} className="zego-text-info opacity-70 hover:opacity-100">×</button>
            </span>
          ))}
        </div>
      )}

      {/*
        z-40 — ต้องสูงกว่าหัวตารางวันที่เป็น sticky z-30 (z เท่ากันแล้วตัวที่อยู่หลังใน DOM จะทับ
        ทำให้รายการถูกบังครึ่งกล่อง) และต้องต่ำกว่า Modal/Drawer ที่เป็น z-50
      */}
      {open && (
        <div className="absolute z-40 mt-1 w-full min-w-[13rem] zego-card-surface">
          {searchable && (
            <div className="zego-divider-bottom p-2">
              <SearchBox autoFocus value={query} onChange={setQuery} label={`ค้นหา${ariaLabel}`} placeholder={searchPlaceholder} />
            </div>
          )}
          <div className="zego-divider-bottom flex gap-2 px-2 py-1.5">
            <Button size="sm" variant="ghost" onClick={() => onChange([...options])}>เลือกทั้งหมด</Button>
            <Button size="sm" variant="ghost" onClick={() => onChange([])}>ล้างทั้งหมด</Button>
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {(groups ? shownGroups.length === 0 : shown.length === 0) && (
              <li className="px-3 py-4 text-center text-xs zego-text-disabled">{emptyText}</li>
            )}

            {groups
              ? shownGroups.map((g) => (
                <li key={g.label}>
                  {/*
                    หัวข้อ = ชื่อประเทศ · ติ๊กที่ประเทศ = เลือกทุกเส้นทางของประเทศนั้น
                    (เดิมเป็นปุ่มข้อความ "เลือกทั้งหมวด" ซึ่งแย่งที่จนชื่อประเทศถูกตัดเหลือ 1–2 ตัว
                     และคำว่า "หมวด" ก็ไม่ได้บอกว่าหมายถึงประเทศ)
                  */}
                  <label className="zego-surface-soft-bg flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:brightness-95">
                    <input
                      type="checkbox"
                      aria-label={`เลือกทุกเส้นทางของ ${g.label}`}
                      checked={g.options.every((c) => selected.includes(c))}
                      ref={(el) => {
                        if (el) el.indeterminate = !g.options.every((c) => selected.includes(c)) && g.options.some((c) => selected.includes(c));
                      }}
                      onChange={() => toggleGroup(g.options)}
                      className="h-4 w-4 rounded border-[var(--zego-border-strong)]"
                    />
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold zego-text-secondary">{g.label}</span>
                    {counts && (
                      <span className="shrink-0 text-[11px] tabular-nums zego-text-tertiary">
                        {g.options.reduce((sum, c) => sum + (counts.get(c) ?? 0), 0)}
                      </span>
                    )}
                  </label>
                  <ul>
                    {g.options.map((c) => <li key={c}>{optionRow(c, true)}</li>)}
                  </ul>
                </li>
              ))
              : shown.map((c) => <li key={c}>{optionRow(c)}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
