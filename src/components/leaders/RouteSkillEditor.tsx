'use client';

/**
 * แก้ไข "ประเทศ/สนามบิน/จุดหมายปลายทางที่เชี่ยวชาญ"
 *
 * ขั้นตอน: เพิ่มประเทศ → เลือก "ทุกสนามบิน/ทุกเส้นทางในประเทศ" หรือ "เลือกเฉพาะสนามบิน/จุดหมายปลายทาง"
 *          → ถ้าเลือกเฉพาะ จะแสดง Searchable Dropdown ของสนามบิน/เส้นทางของประเทศนั้น
 *            (ค้นหา · เลือกหลายรายการด้วย Checkbox · จัดกลุ่มยอดนิยม/ตามเมือง/เส้นทาง)
 *
 * ข้อมูลสนามบิน/เส้นทางมาจาก Airport & Route Master (กรองด้วย country_code — ไม่ hardcode)
 * เงื่อนไข: ห้ามเพิ่มประเทศซ้ำ · เลือก "เฉพาะ" ต้องเลือกอย่างน้อย 1 รายการ · แต่ละประเทศเก็บรายการแยกกัน
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Callout, cx, Pill } from '@/components/ui/Primitives';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Combobox } from '@/components/ui/Combobox';
import { Icon } from '@/components/ui/Icon';
import { ROUTE_SKILL_LEVEL, ROUTE_SKILL_ORDER, ROUTE_TYPE } from '@/lib/labels';
import { airportByIata } from '@/data';
import {
  hasDuplicateRouteCountry,
  newChildId,
  normalizeRouteSkill,
} from '@/modules/tour-leaders/utils';
import type {
  Country,
  RouteCoverage,
  RouteSkillLevel,
  RouteType,
  TourLeaderRouteSkill,
  TourRoute,
} from '@/types';

const POPULAR_GROUP = '__popular';
const ROUTE_GROUP = '__routes';

/** รายการเลือกได้หนึ่งรายการ (สนามบินหรือเส้นทาง) พร้อมข้อมูลแสดงผล/ค้นหา/จัดกลุ่ม */
interface PickItem {
  id: string;
  type: RouteType;
  isActive: boolean;
  popular: boolean;
  /** คีย์จัดกลุ่ม: ยอดนิยม / ชื่อเมือง / เส้นทาง */
  groupKey: string;
  /** ข้อความค้นหารวม (ไทย+อังกฤษ, ตัวพิมพ์เล็ก) */
  searchText: string;
  // สนามบิน
  iata?: string;
  cityTh?: string;
  cityEn?: string;
  airportTh?: string;
  airportEn?: string;
  // เส้นทาง/ภูมิภาค/เมือง
  nameTh?: string;
  nameEn?: string;
}

/** แปลง TourRoute (join Airport Master สำหรับสนามบิน) → PickItem */
function toPickItem(r: TourRoute): PickItem {
  if (r.routeType === 'airport') {
    const m = airportByIata(r.code);
    const iata = r.code ?? m?.iata ?? '';
    const airportTh = m?.nameTh ?? r.nameTh;
    const airportEn = m?.nameEn ?? r.nameEn ?? '';
    const cityTh = m?.cityTh ?? '';
    const cityEn = m?.cityEn ?? '';
    const popular = m?.popular ?? false;
    return {
      id: r.id,
      type: 'airport',
      isActive: r.isActive,
      popular,
      groupKey: popular ? POPULAR_GROUP : cityTh || 'สนามบินอื่น ๆ',
      searchText: `${iata} ${airportTh} ${airportEn} ${cityTh} ${cityEn}`.toLowerCase(),
      iata,
      cityTh,
      cityEn,
      airportTh,
      airportEn,
    };
  }
  return {
    id: r.id,
    type: r.routeType,
    isActive: r.isActive,
    popular: false,
    groupKey: ROUTE_GROUP,
    searchText: `${r.nameTh} ${r.nameEn ?? ''} ${r.code ?? ''}`.toLowerCase(),
    nameTh: r.nameTh,
    nameEn: r.nameEn,
  };
}

/** ป้ายย่อของรายการ (ใช้บน Tag) */
const shortLabel = (i: PickItem) => (i.type === 'airport' ? i.iata || i.airportTh || '' : i.nameTh || '');

/**
 * Searchable Dropdown เลือกสนามบิน/เส้นทางของประเทศหนึ่ง (หลายรายการ)
 *  - คลิกช่อง → เปิดรายการทั้งหมดทันที (ไม่ต้องพิมพ์) · พิมพ์ = กรองทันที (ไทย/อังกฤษ)
 *  - จัดกลุ่ม: ยอดนิยม → ตามเมือง → เส้นทาง/จุดหมายปลายทาง
 *  - เลือกด้วย Checkbox · Tag ที่เลือกกดนำออกได้ · เลือกทั้งหมด/ล้างทั้งหมด · นับจำนวน
 *  - รายการที่เลือกยังคงอยู่เมื่อค้นหาคำใหม่ (เก็บใน selectedIds ไม่ขึ้นกับคำค้น)
 */
function RouteMultiSelectDropdown({
  countryNameEn,
  countryRoutes,
  selectedIds,
  error,
  onChange,
}: {
  countryNameEn: string;
  /** TourRoute ทุกประเภทของประเทศนี้ (จาก store — กรองด้วย country_code แล้ว) */
  countryRoutes: TourRoute[];
  selectedIds: string[];
  error?: string;
  onChange: (nextRouteIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  /* ปิดรายการเมื่อคลิกนอกกรอบ */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = useMemo(() => countryRoutes.map(toPickItem), [countryRoutes]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const activeIds = useMemo(() => items.filter((i) => i.isActive).map((i) => i.id), [items]);

  /** กรองด้วยคำค้น (รายการที่เลือกไม่หาย — เก็บใน selectedIds ต่างหาก) */
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = items.filter((i) => i.isActive || selectedSet.has(i.id));
    if (!q) return base;
    return base.filter((i) => i.searchText.includes(q));
  }, [items, query, selectedSet]);

  /** จัดกลุ่ม: ยอดนิยม → เมือง (เรียงไทย) → เส้นทาง/จุดหมายปลายทาง */
  const groups = useMemo(() => {
    const out: { key: string; label: string; items: PickItem[] }[] = [];
    const popular = filtered.filter((i) => i.groupKey === POPULAR_GROUP);
    if (popular.length) out.push({ key: POPULAR_GROUP, label: '⭐ สนามบิน/เส้นทางยอดนิยม', items: popular });

    const cityKeys = Array.from(
      new Set(
        filtered
          .filter((i) => i.groupKey !== POPULAR_GROUP && i.groupKey !== ROUTE_GROUP)
          .map((i) => i.groupKey),
      ),
    ).sort((a, b) => a.localeCompare(b, 'th'));
    for (const city of cityKeys) {
      out.push({ key: city, label: city, items: filtered.filter((i) => i.groupKey === city) });
    }

    const routeItems = filtered.filter((i) => i.groupKey === ROUTE_GROUP);
    if (routeItems.length)
      out.push({ key: ROUTE_GROUP, label: 'เส้นทาง/จุดหมายปลายทาง', items: routeItems });

    // เรียงในแต่ละกลุ่ม: สนามบินตาม IATA · เส้นทางตามชื่อไทย
    for (const g of out) {
      g.items.sort((a, b) =>
        (a.iata || a.nameTh || '').localeCompare(b.iata || b.nameTh || '', 'th'),
      );
    }
    return out;
  }, [filtered]);

  const setSelected = (next: string[]) => onChange(Array.from(new Set(next)));
  const toggle = (id: string) =>
    setSelected(selectedSet.has(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);
  const selectAll = () => setSelected([...selectedIds, ...activeIds]);
  const clearAll = () => setSelected([]);

  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
        ไม่พบสนามบินหรือเส้นทางในประเทศนี้
      </p>
    );
  }

  const allActiveSelected = activeIds.length > 0 && activeIds.every((id) => selectedSet.has(id));

  return (
    <div className="space-y-2" ref={rootRef}>
      {/* กล่องควบคุม: Tag ที่เลือก + ช่องค้นหา (คลิกเพื่อเปิดรายการทั้งหมด) */}
      <div className="relative">
        <div
          className={cx(
            'flex flex-wrap items-center gap-1.5 rounded-lg border zego-surface-bg px-2 py-1.5 shadow-sm',
            'focus-within:ring-2 focus-within:ring-[var(--zego-focus)]',
            error ? 'border-rose-400' : 'zego-border-color focus-within:border-[var(--zego-primary-500)]',
          )}
          onClick={() => setOpen(true)}
        >
          {selectedIds.map((id) => {
            const it = byId.get(id);
            if (!it) return null;
            return (
              <span
                key={id}
                title={it.type === 'airport' ? `${it.airportEn ?? ''}${it.cityEn ? ` · ${it.cityEn}` : ''}` : it.nameEn}
                className="inline-flex items-center gap-1 rounded-md zego-badge--info border px-2 py-0.5 text-xs font-medium"
              >
                <span className="font-mono font-bold">{shortLabel(it)}</span>
                {it.type === 'airport' && it.cityTh && <span className="zego-text-info">{it.cityTh}</span>}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(id);
                  }}
                  aria-label={`นำออก ${shortLabel(it)}`}
                  className="zego-text-info hover:text-rose-600"
                >
                  ×
                </button>
              </span>
            );
          })}
          <input
            aria-label="ค้นหาสนามบินหรือเส้นทาง"
            type="search"
            autoComplete="off"
            value={query}
            placeholder={selectedIds.length ? 'ค้นหาเพิ่ม…' : 'ค้นหาด้วยรหัส IATA เมือง ชื่อสนามบิน หรือชื่อเส้นทาง'}
            onFocus={() => setOpen(true)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && open) {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation();
                setOpen(false);
              }
            }}
            className="min-w-[10rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none"
          />
          <Icon name="chevronDown" className="h-4 w-4 shrink-0 zego-text-tertiary" />
        </div>

        {/* รายการแบบ dropdown (เปิดทันทีเมื่อคลิก แม้ยังไม่พิมพ์) */}
        {open && (
          <div className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border zego-border-color zego-surface-bg shadow-lg">
            {/* แถบเครื่องมือ: เลือกทั้งหมด/ล้างทั้งหมด */}
            <div className="sticky top-0 flex items-center justify-between gap-2 zego-divider-bottom zego-surface-soft-bg px-2 py-1.5 backdrop-blur">
              <span className="text-xs font-medium zego-text-secondary">
                เลือกแล้ว {selectedIds.length} เส้นทาง
              </span>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" onClick={selectAll} disabled={allActiveSelected}>
                  เลือกทั้งหมด
                </Button>
                <Button size="sm" variant="ghost" onClick={clearAll} disabled={selectedIds.length === 0}>
                  ล้างทั้งหมด
                </Button>
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="px-3 py-4 text-center text-sm zego-text-tertiary">ไม่พบรายการที่ค้นหา</p>
            ) : (
              groups.map((g) => (
                <div key={g.key} role="group" aria-label={g.label}>
                  <p className="sticky top-9 zego-surface-bg px-3 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide zego-text-tertiary">
                    {g.label}
                  </p>
                  <ul className="pb-1">
                    {g.items.map((it) => {
                      const checked = selectedSet.has(it.id);
                      return (
                        <li key={it.id}>
                          <label
                            className={cx(
                              'flex cursor-pointer items-start gap-2.5 px-3 py-1.5 text-sm transition-colors',
                              checked ? 'zego-selected-tint' : 'zego-hover-surface',
                              !it.isActive && 'opacity-70',
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggle(it.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--zego-primary-500)]"
                            />
                            <span className="min-w-0 flex-1">
                              {it.type === 'airport' ? (
                                <>
                                  <span className="flex flex-wrap items-baseline gap-1.5">
                                    <span className="font-mono text-xs font-bold zego-text">
                                      {it.iata}
                                    </span>
                                    <span className="font-medium zego-text">
                                      {it.cityTh ? `${it.cityTh} (สนามบิน${it.airportTh})` : `สนามบิน${it.airportTh}`}
                                    </span>
                                    {it.popular && (
                                      <span className="rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-800">
                                        ยอดนิยม
                                      </span>
                                    )}
                                    {!it.isActive && (
                                      <span className="text-[10px] zego-text-tertiary">ปิดใช้งานแล้ว</span>
                                    )}
                                  </span>
                                  {(it.airportEn || it.cityEn) && (
                                    <span className="block text-xs zego-text-tertiary">
                                      {[it.airportEn, it.cityEn].filter(Boolean).join(' · ')}
                                    </span>
                                  )}
                                </>
                              ) : (
                                <>
                                  <span className="flex flex-wrap items-baseline gap-1.5">
                                    <span className="font-medium zego-text">{it.nameTh}</span>
                                    <span className="rounded zego-badge--slate px-1 text-[10px] font-medium">
                                      {ROUTE_TYPE[it.type].label}
                                    </span>
                                    {!it.isActive && (
                                      <span className="text-[10px] zego-text-tertiary">ปิดใช้งานแล้ว</span>
                                    )}
                                  </span>
                                  {it.nameEn && (
                                    <span className="block text-xs zego-text-tertiary">{it.nameEn}</span>
                                  )}
                                </>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {selectedIds.length === 0 && (
        <p className="text-xs font-medium text-amber-700">
          ⚠ ยังไม่ได้เลือกสนามบิน/เส้นทาง — ต้องเลือกอย่างน้อย 1 รายการจึงจะบันทึกได้
        </p>
      )}
      {error && <p className="text-xs font-medium text-rose-600">{error}</p>}
      <p className="sr-only">รายการสนามบิน/เส้นทางของ {countryNameEn}</p>
    </div>
  );
}

export function RouteSkillEditor({
  skills,
  countries,
  routes,
  errors,
  onChange,
}: {
  skills: TourLeaderRouteSkill[];
  countries: Country[];
  routes: TourRoute[];
  errors: Record<string, string>;
  onChange: (next: TourLeaderRouteSkill[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [addError, setAddError] = useState<string>();

  /** เลือกเพิ่มได้เฉพาะประเทศที่ยังใช้งานอยู่และยังไม่ถูกเลือก (กันซ้ำด้วย alpha-2 ผ่าน id) */
  const available = countries.filter(
    (c) => c.isActive && !hasDuplicateRouteCountry(skills, c.id),
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
    if (hasDuplicateRouteCountry(skills, countryId)) {
      setAddError('ประเทศนี้ถูกเพิ่มไว้แล้ว — ไม่สามารถเพิ่มซ้ำได้');
      return;
    }
    onChange([
      ...skills,
      {
        id: newChildId('RS'),
        countryId,
        coverage: 'all_routes',
        routeIds: [],
        skillLevel: 'can_lead',
      },
    ]);
    setQuery('');
    setAddError(undefined);
  };

  /** อัปเดตแล้ว normalize ทันที — เปลี่ยนประเทศ/ความครอบคลุมจะล้างรายการที่ไม่เข้าพวกเอง */
  const update = (id: string, patch: Partial<TourLeaderRouteSkill>) => {
    onChange(
      skills.map((s) => (s.id === id ? normalizeRouteSkill({ ...s, ...patch }, routes) : s)),
    );
  };

  return (
    <div className="space-y-3">
      <Callout tone="blue" title="กติกาการครอบคลุมสนามบิน/จุดหมายปลายทาง">
        เลือก <strong>“ทุกสนามบิน/ทุกเส้นทางในประเทศ”</strong> = ถือว่าเชี่ยวชาญทุกสนามบินและเส้นทางของประเทศนั้น
        (เช่น JAPAN จะตรงกับ NRT, KIX และทุกรายการ) ส่วน{' '}
        <strong>“เลือกเฉพาะสนามบิน/จุดหมายปลายทาง”</strong> จะตรงเฉพาะรายการที่เลือกเท่านั้น
        (เลือกแค่ NRT จะไม่ถือว่าเชี่ยวชาญ KIX)
      </Callout>

      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-56 flex-1">
          <Combobox
            label="เพิ่มประเทศที่เชี่ยวชาญ"
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
            hint="พิมพ์ชื่อไทย/อังกฤษ หรือรหัสประเทศ (เช่น JP, JPN) เพื่อค้นหา · เลือกเพิ่มได้หลายประเทศ"
            emptyMessage="ไม่พบประเทศที่ค้นหา"
          />
        </div>
        {skills.length > 0 && (
          <div className="mt-8">
            <Pill tone="blue">เลือกแล้ว {skills.length} ประเทศ</Pill>
          </div>
        )}
      </div>

      {skills.length === 0 ? (
        <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
          ยังไม่ได้ระบุประเทศที่เชี่ยวชาญ
        </p>
      ) : (
        <ul className="space-y-3">
          {skills.map((skill) => {
            const country = countries.find((c) => c.id === skill.countryId);
            /** เส้นทาง/สนามบินทุกประเภทของประเทศนี้ (กรองด้วย country_code) */
            const countryRoutes = routes.filter((r) => r.countryId === skill.countryId);

            return (
              <li key={skill.id} className="rounded-xl border zego-border-color zego-surface-soft-bg p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold zego-text">
                      {country ? `${country.nameEn} (${country.nameTh})` : skill.countryId}
                    </span>
                    {skill.coverage === 'all_routes' ? (
                      <Pill tone="green">ทุกสนามบิน/เส้นทาง</Pill>
                    ) : (
                      <Pill tone="amber">เลือกแล้ว {skill.routeIds.length} เส้นทาง</Pill>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(skills.filter((s) => s.id !== skill.id))}
                    aria-label={`นำประเทศ ${country?.nameTh ?? ''} ออก`}
                    className="rounded p-1 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-500"
                  >
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                </div>

                {/* เลือกความครอบคลุม */}
                <fieldset className="mb-3">
                  <legend className="mb-1.5 text-xs font-medium zego-text-secondary">
                    ความครอบคลุม
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ['all_routes', 'ทุกสนามบิน/ทุกเส้นทางในประเทศ'],
                        ['selected_routes', 'เลือกเฉพาะสนามบิน/จุดหมายปลายทาง'],
                      ] as [RouteCoverage, string][]
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className={cx(
                          'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                          skill.coverage === value
                            ? 'zego-badge--info'
                            : 'zego-border-color zego-surface-bg zego-text-secondary zego-hover-surface',
                        )}
                      >
                        <input
                          type="radio"
                          name={`coverage-${skill.id}`}
                          checked={skill.coverage === value}
                          onChange={() => update(skill.id, { coverage: value })}
                          className="h-3.5 w-3.5 accent-[var(--zego-primary-500)]"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>

                {/* Searchable Dropdown (เฉพาะกรณี selected_routes — ถ้า all_routes จะซ่อนช่องค้นหา) */}
                {skill.coverage === 'selected_routes' && (
                  <fieldset className="mb-3">
                    <legend className="mb-1.5 text-xs font-medium zego-text-secondary">
                      สนามบิน/จุดหมายปลายทางของ {country?.nameEn ?? ''} (เลือกได้หลายรายการ)
                    </legend>
                    <RouteMultiSelectDropdown
                      key={country?.code ?? skill.countryId}
                      countryNameEn={country?.nameEn ?? ''}
                      countryRoutes={countryRoutes}
                      selectedIds={skill.routeIds}
                      error={errors[skill.id]}
                      onChange={(nextRouteIds) => update(skill.id, { routeIds: nextRouteIds })}
                    />
                  </fieldset>
                )}

                {/* ข้อมูลความเชี่ยวชาญเพิ่มเติม */}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <SelectInput
                    label="ระดับความเชี่ยวชาญ"
                    required
                    value={skill.skillLevel}
                    onChange={(e) =>
                      update(skill.id, { skillLevel: e.target.value as RouteSkillLevel })
                    }
                    options={ROUTE_SKILL_ORDER.map((l) => ({
                      value: l,
                      label: ROUTE_SKILL_LEVEL[l].label,
                    }))}
                  />
                  <TextInput
                    label="จำนวนครั้งที่เคยนำทัวร์"
                    inputMode="numeric"
                    value={skill.tripCount === undefined ? '' : String(skill.tripCount)}
                    onChange={(e) =>
                      update(skill.id, {
                        tripCount: e.target.value ? Number(e.target.value) : undefined,
                      })
                    }
                  />
                  <DateField
                    label="ทำงานล่าสุด"
                    value={skill.lastWorkedAt ?? ''}
                    onChange={(v) => update(skill.id, { lastWorkedAt: v || undefined })}
                  />
                  <TextInput
                    label="หมายเหตุ"
                    value={skill.note ?? ''}
                    onChange={(e) => update(skill.id, { note: e.target.value })}
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
