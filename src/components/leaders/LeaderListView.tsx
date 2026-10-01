'use client';

/**
 * รายการหัวหน้าทัวร์ — ค้นหา/กรอง/เรียง/แบ่งหน้า ดูรายละเอียด แก้ไข และปิดใช้งาน (ไม่ลบถาวร)
 *
 * ตาราง 8 คอลัมน์ (ดู components/leaders/LeaderTable.tsx) — Desktop ตาราง · Mobile การ์ด
 * ตัวกรองยุบไว้ในปุ่ม "ตัวกรอง (N)" เพื่อคืนพื้นที่ให้ตาราง — ตรรกะการกรองไม่เปลี่ยน
 *
 * ปุ่ม "ไกด์ของฉัน" กรองเฉพาะคนที่ปักดาวไว้ (ส่วนตัวของแต่ละ User) — ปักดาวได้จากแถวในตารางนี้เลย
 *
 * โหมด "ไกด์ของฉัน" + เลขหน้า เก็บไว้ใน URL (?fav=&page=) — กดเข้าไปดูโปรไฟล์แล้วกด "กลับ" (router.back)
 * ต้องเห็นรายการในสภาพเดิมที่ตั้งไว้ก่อนเข้าไป ไม่ใช่รีเซ็ตทุกครั้ง (รูปแบบเดียวกับ /jobs)
 *
 * ใช้จากหน้า /leaders (ดู app/leaders/page.tsx) — ไม่มี PageHeader ของตัวเอง เพราะหน้าหลักเป็นคนคุม
 * ต้องอยู่ใต้ Suspense เพราะใช้ useSearchParams
 */

import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import {
  LEADER_STATUS,
  LEADER_STATUS_ORDER,
  LEADER_TYPE,
  LEADER_TYPE_ORDER,
  READINESS_TERM,
  ROUTE_SKILL_LEVEL,
  ROUTE_SKILL_ORDER,
  USAGE_STATUS_TERM,
} from '@/lib/labels';
import { levelsForStandard, standardForLanguageCode } from '@/data/leaders/languageStandards';
import {
  countActiveFilters,
  EMPTY_LEADER_FILTER,
  filterLeaders,
  isFilterActive,
} from '@/lib/logic/leaderSearch';
import { EXPERIENCE_BAND_LABEL, EXPERIENCE_BAND_ORDER } from '@/lib/logic/leaderAnalytics';
import { expertiseSearchText } from '@/lib/logic/expertiseSummary';
import { getExpertiseScopes } from '@/services/expertiseScopeStore';
import { useFavoriteGuides } from '@/lib/useFavoriteGuides';
import { usePreferredGuideOrder } from '@/lib/usePreferredGuideOrder';
import { fullPreferredOrder, reorderWithinSubset } from '@/lib/logic/preferredGuideOrder';
import { Button, Card, cx } from '@/components/ui/Primitives';
import { SearchBox, SelectInput, TextInput } from '@/components/ui/FormField';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { DateField } from '@/components/ui/DateInput';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { LeaderStatusModal } from '@/components/leaders/LeaderStatusModal';
import { LeaderTable, LeaderTableEmpty } from '@/components/leaders/LeaderTable';
import type {
  ExperienceLevelFilter,
  LeaderFilter,
  LeaderSortKey,
  LeaderStatus,
  LeaderType,
  RouteSkillLevel,
  TourLeader,
} from '@/types';

const PAGE_SIZE = 12;

/** ตัวเลือกเรียงข้อมูล — map เป็น (sortBy, sortDir) */
const SORT_PRESETS: {
  key: string;
  label: string;
  sortBy: LeaderSortKey;
  sortDir: 'asc' | 'desc';
}[] = [
  { key: 'updated', label: 'อัปเดตล่าสุด', sortBy: 'updatedAt', sortDir: 'desc' },
  { key: 'name', label: 'ชื่อ ก–ฮ', sortBy: 'name', sortDir: 'asc' },
  { key: 'exp_desc', label: 'ประสบการณ์มากที่สุด', sortBy: 'experience', sortDir: 'desc' },
  { key: 'exp_asc', label: 'ประสบการณ์น้อยที่สุด', sortBy: 'experience', sortDir: 'asc' },
];

const EXPERIENCE_OPTIONS: { value: ExperienceLevelFilter; label: string }[] = [
  { value: 'any', label: 'ทุกระดับ' },
  ...EXPERIENCE_BAND_ORDER.map((k) => ({ value: k, label: EXPERIENCE_BAND_LABEL[k] })),
];

export function LeaderListView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    leaders,
    master,
    countries,
    routes,
    jobs,
    availabilityRecords,
    currentUser,
    today,
    ready,
    loadError,
    reload,
    setLeaderActive,
    saving,
  } = useDemo();

  const [filter, setFilter] = useState<LeaderFilter>(EMPTY_LEADER_FILTER);
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  /*
   * โหมด "ไกด์ของฉัน" + เลขหน้า อ่านค่าเริ่มต้นจาก URL แล้ว sync กลับทุกครั้งที่เปลี่ยน (router.replace
   * ไม่สร้างประวัติใหม่) — กดเข้าไปดูโปรไฟล์แล้วกดกลับ (router.back) จึงเห็นสภาพเดิมแม้หน้านี้จะ mount ใหม่
   */
  const [page, setPageState] = useState(() => Math.max(1, Number(searchParams.get('page')) || 1));
  const [showFavoritesOnly, setShowFavoritesOnlyState] = useState(() => searchParams.get('fav') === '1');

  const syncUrl = (next: { fav: boolean; page: number }) => {
    const q = new URLSearchParams(searchParams.toString());
    if (next.fav) q.set('fav', '1');
    else q.delete('fav');
    if (next.page > 1) q.set('page', String(next.page));
    else q.delete('page');
    const qs = q.toString();
    router.replace(qs ? `/leaders?${qs}` : '/leaders', { scroll: false });
  };

  const goToPage = (next: number) => {
    setPageState(next);
    syncUrl({ fav: showFavoritesOnly, page: next });
  };

  // ปุ่มกรอง "ไกด์ของฉัน" — กดแล้วเหลือเฉพาะคนที่ปักดาวไว้ (ไม่ใช่แค่จัดลำดับ) แยกจากตัวกรองอื่นทั้งหมด
  const toggleFavoritesOnly = () => {
    const next = !showFavoritesOnly;
    setShowFavoritesOnlyState(next);
    setPageState(1);
    syncUrl({ fav: next, page: 1 });
  };

  const { favorited, toggleFavorite } = useFavoriteGuides();
  // ลำดับที่ผู้ใช้คนนี้ลากจัดเองในโหมด "ไกด์ของฉัน" — ใช้เกณฑ์เดียวกับตอนแนะนำ/เลือกไกด์ที่อื่นทั้งระบบ
  const { order, setOrder } = usePreferredGuideOrder();

  const [statusOpen, setStatusOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<TourLeader | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = leaders.find((l) => l.id === targetId) ?? null;

  const set = <K extends keyof LeaderFilter>(key: K, value: LeaderFilter[K]) =>
    setFilter((prev) => ({ ...prev, [key]: value }));

  /** ข้อความค้นหาจากความเชี่ยวชาญ (โซน / ประเทศ / รหัสสนามบิน) — อ่านจาก Expertise Scope Store */
  const expertiseTextOf = useMemo(() => {
    const cache = new Map<string, string>();
    for (const l of leaders) {
      cache.set(l.id, expertiseSearchText(getExpertiseScopes(l.id), countries).toLowerCase());
    }
    return (id: string) => cache.get(id) ?? '';
  }, [leaders, countries]);

  const filtered = useMemo(
    () => filterLeaders(leaders, filter, { countries, routes, jobs, today, expertiseTextOf }),
    [leaders, filter, countries, routes, jobs, today, expertiseTextOf],
  );

  const hasFilter = isFilterActive(filter);
  const activeFilterCount = countActiveFilters(filter);
  const reset = () => setFilter(EMPTY_LEADER_FILTER);

  /*
   * แบ่งหน้า — รีเซ็ตเป็นหน้าแรกทุกครั้งที่ตัวกรองเปลี่ยน (ปรับ state ระหว่าง render)
   * ตั้งค่า state ตรง ๆ โดยไม่ sync URL ที่นี่ — router.replace เป็น side effect ห้ามเรียกระหว่าง render
   * (เลขหน้าใน URL อาจค้างชั่วคราวถ้าตัวกรองเปลี่ยนตอนอยู่หน้า > 1 แต่จะ sync ถูกต้องทันทีที่เปลี่ยนหน้าครั้งถัดไป)
   */
  const [prevFilter, setPrevFilter] = useState(filter);
  if (prevFilter !== filter) {
    setPrevFilter(filter);
    setPageState(1);
  }

  /*
   * ลำดับเต็มของ "ไกด์ของฉัน" ทั้งหมด (ไม่ผ่านค้นหา/ตัวกรองอื่น) — ใช้เป็นฐานอ้างอิงตำแหน่งตอนบันทึก
   * เพื่อไม่ให้คนที่ถูกซ่อนอยู่ตอนค้นหา/กรอง เสียตำแหน่งที่เคยจัดไว้
   */
  const favoritesPoolAll = useMemo(() => leaders.filter((l) => favorited.has(l.id)), [leaders, favorited]);
  const favoritesById = useMemo(() => new Map(favoritesPoolAll.map((l) => [l.id, l])), [favoritesPoolAll]);
  const favoritesFullOrder = useMemo(
    () =>
      fullPreferredOrder(order, favoritesPoolAll.map((l) => l.id), (a, b) => {
        const la = favoritesById.get(a);
        const lb = favoritesById.get(b);
        return `${la?.firstName}${la?.lastName}`.localeCompare(`${lb?.firstName}${lb?.lastName}`, 'th');
      }),
    [order, favoritesPoolAll, favoritesById],
  );

  // กดปุ่ม "ไกด์ของฉัน" แล้วเหลือเฉพาะคนที่ปักดาวไว้ เรียงตามลำดับที่ลากจัดเอง — ไม่ใช่แค่กรอง
  const visibleLeaders = useMemo(() => {
    if (!showFavoritesOnly) return filtered;
    const filteredIds = new Set(filtered.map((l) => l.id));
    return favoritesFullOrder
      .filter((id) => filteredIds.has(id))
      .map((id) => favoritesById.get(id))
      .filter((l): l is TourLeader => !!l);
  }, [filtered, showFavoritesOnly, favoritesFullOrder, favoritesById]);

  const handleReorderFavorites = (next: TourLeader[]) => {
    setOrder(reorderWithinSubset(favoritesFullOrder, next.map((l) => l.id)));
  };

  // โหมด "ไกด์ของฉัน" ลากจัดลำดับข้ามหน้าไม่ได้ — แสดงทั้งหมดในหน้าเดียว ไม่แบ่งหน้า
  const totalPages = showFavoritesOnly ? 1 : Math.max(1, Math.ceil(visibleLeaders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = showFavoritesOnly ? 0 : (currentPage - 1) * PAGE_SIZE;
  const paged = showFavoritesOnly ? visibleLeaders : visibleLeaders.slice(startIndex, startIndex + PAGE_SIZE);

  const provinces = useMemo(
    () =>
      Array.from(
        new Set(leaders.map((l) => l.address.province).filter((p): p is string => Boolean(p))),
      ).sort((a, b) => a.localeCompare(b, 'th')),
    [leaders],
  );

  const routeOptions = useMemo(() => {
    const pool =
      filter.countryIds.length === 0
        ? routes
        : routes.filter((r) => filter.countryIds.includes(r.countryId));
    return pool
      .filter((r) => r.isActive)
      .map((r) => ({ value: r.id, label: `${r.code ? `${r.code} · ` : ''}${r.nameTh}` }));
  }, [routes, filter.countryIds]);

  /**
   * §3 ปุ่ม/เมนู "ดูและจัดการข้อมูล" — เปิดหน้าโปรไฟล์ที่แท็บ "ข้อมูลส่วนตัวและ Passport"
   * ห้ามเปิด Modal แก้ไขแบบหลายแท็บจากหน้ารายการ · ค่าเริ่มต้นยังเป็นโหมดดูข้อมูล
   */
  const openEdit = (leader: TourLeader) => {
    router.push(`/leaders/${leader.id}?tab=identity`);
  };
  const openStatus = (leader: TourLeader) => {
    setTargetId(leader.id);
    setStatusOpen(true);
  };

  const sortPresetKey =
    SORT_PRESETS.find((p) => p.sortBy === filter.sortBy && p.sortDir === filter.sortDir)?.key ??
    'updated';

  return (
    <>
      <Card className="mb-5">
        {/* ค้นหา + ปุ่มเปิดตัวกรอง */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <label className="text-sm font-medium zego-text-secondary">ค้นหา</label>
            <SearchBox
              value={filter.query}
              onChange={(v) => set('query', v)}
              placeholder="รหัส ชื่อ ชื่อเล่น โทรศัพท์ อีเมล หรือเส้นทาง"
              label="ค้นหาหัวหน้าทัวร์"
            />
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                activeFilterCount > 0
                  ? 'zego-badge--info'
                  : 'zego-border-color zego-surface-bg zego-text-secondary zego-hover-surface',
              )}
            >
              <Icon name="filter" className="h-4 w-4" />
              ตัวกรอง{activeFilterCount > 0 && ` (${activeFilterCount})`}
              <Icon
                name="chevronDown"
                className={cx('h-4 w-4 transition-transform', showFilters && 'rotate-180')}
              />
            </button>

            {hasFilter && (
              <Button variant="ghost" size="sm" onClick={reset}>
                ล้างตัวกรอง
              </Button>
            )}
          </div>
        </div>

        {showFilters && (
          <div className="mt-4 zego-divider-top pt-4">
            {/* ตัวกรองพื้นฐาน */}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <SelectInput
                label="ความพร้อมรับงาน"
                value={filter.status}
                onChange={(e) => set('status', e.target.value as 'all' | LeaderStatus)}
                options={[
                  { value: 'all', label: 'ทุกสถานะ' },
                  ...LEADER_STATUS_ORDER.map((s) => ({ value: s, label: LEADER_STATUS[s].label })),
                ]}
              />

              <MultiSelect
                label="ภาษา"
                value={filter.languages}
                onChange={(next) => {
                  set('languages', next);
                  // ระดับขั้นต่ำตีความตามมาตรฐานของภาษาที่เลือกไว้ — เปลี่ยนชุดภาษาแล้วต้องล้างเพื่อไม่ให้ค้างข้ามมาตรฐาน
                  set('minLevelCode', null);
                }}
                allLabel="ทุกภาษา"
                options={master.languages
                  .filter((l) => l.active)
                  .map((l) => ({ value: l.name, label: l.name }))}
              />

              <MultiSelect
                label="ประเทศที่เชี่ยวชาญ"
                value={filter.countryIds}
                onChange={(next) => {
                  set('countryIds', next);
                  // เส้นทางที่เลือกไว้อาจไม่อยู่ในประเทศชุดใหม่ — ล้างทิ้งกันกรองค้างแบบมองไม่เห็น
                  set('routeId', 'all');
                }}
                allLabel="ทุกประเทศ"
                options={countries
                  .filter((c) => c.isActive)
                  .map((c) => ({ value: c.id, label: `${c.nameEn} — ${c.nameTh}` }))}
              />

              <SelectInput
                label="ระดับประสบการณ์"
                value={filter.experienceLevel}
                onChange={(e) => set('experienceLevel', e.target.value as ExperienceLevelFilter)}
                options={EXPERIENCE_OPTIONS}
              />

              <SelectInput
                label="รูปแบบการร่วมงาน"
                value={filter.leaderType}
                onChange={(e) => set('leaderType', e.target.value as 'all' | LeaderType)}
                options={[
                  { value: 'all', label: 'ทุกประเภท' },
                  ...LEADER_TYPE_ORDER.map((t) => ({ value: t, label: LEADER_TYPE[t].label })),
                ]}
              />
            </div>

            {/* ตัวกรองขั้นสูง */}
            <div className="mt-3 zego-divider-top pt-3">
              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                aria-expanded={showAdvanced}
                className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium zego-text-info zego-hover-surface"
              >
                <Icon name="filter" className="h-4 w-4" />
                ตัวกรองขั้นสูง (จังหวัด ระดับภาษา เส้นทาง ใบรับรอง ความถนัด เอกสาร ตารางว่าง)
                <Icon
                  name="chevronDown"
                  className={cx('h-4 w-4 transition-transform', showAdvanced && 'rotate-180')}
                />
              </button>

              {showAdvanced && (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <SelectInput
                      label="จังหวัด"
                      value={filter.province}
                      onChange={(e) => set('province', e.target.value)}
                      options={[
                        { value: 'all', label: 'ทุกจังหวัด' },
                        ...provinces.map((p) => ({ value: p, label: p })),
                      ]}
                    />
                    <SelectInput
                      label="ประเทศประจำ"
                      value={filter.assignedCountryId}
                      onChange={(e) => set('assignedCountryId', e.target.value)}
                      options={[
                        { value: 'all', label: 'ทุกประเทศ' },
                        ...countries
                          .filter((c) => c.isActive)
                          .map((c) => ({ value: c.id, label: `${c.nameEn} — ${c.nameTh}` })),
                      ]}
                    />
                    <SelectInput
                      label="ระดับขั้นต่ำ"
                      value={filter.minLevelCode ?? 'any'}
                      disabled={filter.languages.length !== 1}
                      hint={filter.languages.length !== 1 ? 'เลือกภาษาเดียวก่อนจึงกำหนดระดับขั้นต่ำได้' : undefined}
                      onChange={(e) => set('minLevelCode', e.target.value === 'any' ? null : e.target.value)}
                      options={[
                        { value: 'any', label: 'ไม่กำหนด' },
                        ...(filter.languages.length === 1
                          ? levelsForStandard(
                              standardForLanguageCode(
                                master.languages.find((l) => l.name === filter.languages[0])?.code ?? '',
                              ),
                            ).map((l) => ({ value: l.code, label: `${l.code} — ${l.name}` }))
                          : []),
                      ]}
                    />
                    <SelectInput
                      label="เส้นทาง"
                      value={filter.routeId}
                      onChange={(e) => set('routeId', e.target.value)}
                      options={[{ value: 'all', label: 'ทุกเส้นทาง' }, ...routeOptions]}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <TextInput
                      label="รหัสสนามบิน"
                      placeholder="เช่น NRT หรือ KIX"
                      value={filter.airportCode}
                      hint="“ทุกเส้นทาง” ของประเทศจะนับว่าตรงด้วย"
                      onChange={(e) => set('airportCode', e.target.value.toUpperCase())}
                    />
                    <SelectInput
                      label="ระดับความเชี่ยวชาญขั้นต่ำ"
                      value={filter.minRouteLevel}
                      onChange={(e) => set('minRouteLevel', e.target.value as RouteSkillLevel | 'any')}
                      options={[
                        { value: 'any', label: 'ไม่กำหนด' },
                        ...ROUTE_SKILL_ORDER.map((l) => ({
                          value: l,
                          label: ROUTE_SKILL_LEVEL[l].label,
                        })),
                      ]}
                    />
                    <SelectInput
                      label="ประเภทกลุ่มลูกค้า"
                      value={filter.customerGroupCode}
                      onChange={(e) => set('customerGroupCode', e.target.value)}
                      options={[
                        { value: 'all', label: 'ทุกประเภท' },
                        ...master.customerGroups
                          .filter((g) => g.active)
                          .map((g) => ({ value: g.code, label: g.name })),
                      ]}
                    />
                    <SelectInput
                      label="ทักษะและความถนัด"
                      value={filter.workSkillCode}
                      onChange={(e) => set('workSkillCode', e.target.value)}
                      options={[
                        { value: 'all', label: 'ทุกทักษะ' },
                        ...master.workSkills
                          .filter((s) => s.active)
                          .map((s) => ({ value: s.code, label: s.name })),
                      ]}
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <TextInput
                      label="เคยทำเส้นทางอย่างน้อย (ครั้ง)"
                      inputMode="numeric"
                      value={filter.minTripCount}
                      onChange={(e) => set('minTripCount', e.target.value)}
                    />
                    <TextInput
                      label="คะแนนประเมินขั้นต่ำ"
                      inputMode="decimal"
                      placeholder="เช่น 4.5"
                      value={filter.minRating}
                      onChange={(e) => set('minRating', e.target.value)}
                    />
                    <DateField
                      label="ไม่มีงานซ้อน ตั้งแต่"
                      value={filter.freeFrom}
                      onChange={(v) => set('freeFrom', v)}
                    />
                    <DateField
                      label="ถึงวันที่"
                      value={filter.freeTo}
                      min={filter.freeFrom || undefined}
                      hint="ต้องระบุทั้งสองช่อง"
                      onChange={(v) => set('freeTo', v)}
                    />
                  </div>

                  <div className="flex flex-wrap gap-x-6 gap-y-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm zego-text-secondary">
                      <input
                        type="checkbox"
                        checked={filter.documentsValid}
                        onChange={(e) => set('documentsValid', e.target.checked)}
                        className="h-4 w-4 accent-[var(--zego-primary-500)]"
                      />
                      เฉพาะคนที่เอกสารเดินทางยังไม่หมดอายุ (เหลือ ≥ 6 เดือน)
                    </label>

                    <fieldset className="flex flex-wrap items-center gap-3">
                      <legend className="sr-only">{USAGE_STATUS_TERM}</legend>
                      <span className="text-sm zego-text-tertiary">{USAGE_STATUS_TERM}:</span>
                      <label className="flex cursor-pointer items-center gap-1.5 text-sm zego-text-secondary">
                        <input
                          type="radio"
                          name="data-status"
                          checked={filter.activeOnly}
                          onChange={() => set('activeOnly', true)}
                          className="h-4 w-4 accent-[var(--zego-primary-500)]"
                        />
                        เฉพาะที่ใช้งาน
                      </label>
                      <label className="flex cursor-pointer items-center gap-1.5 text-sm zego-text-secondary">
                        <input
                          type="radio"
                          name="data-status"
                          checked={!filter.activeOnly}
                          onChange={() => set('activeOnly', false)}
                          className="h-4 w-4 accent-[var(--zego-primary-500)]"
                        />
                        แสดงที่ระงับ/สิ้นสุดการใช้งานด้วย
                      </label>
                    </fieldset>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ผลลัพธ์ + ตัวเลือกแสดงคนไม่พร้อม + เรียงลำดับ */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 zego-divider-top pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            <span className="text-sm font-medium zego-text-secondary">
              {ready ? (
                <>
                  พบหัวหน้าทัวร์ {visibleLeaders.length} คน{' '}
                  {(hasFilter || showFavoritesOnly) && <span className="zego-text-tertiary">(กรองแล้ว)</span>}
                </>
              ) : (
                <span className="zego-text-tertiary">กำลังโหลดข้อมูล…</span>
              )}
            </span>
            <label
              className="flex cursor-pointer items-center gap-1.5 text-xs zego-text-secondary"
              title={`${READINESS_TERM} “ไม่พร้อมรับงาน” (รวมผู้ที่ระงับ/สิ้นสุดการใช้งาน) จะถูกซ่อนจากรายการปกติ`}
            >
              <input
                type="checkbox"
                checked={filter.showUnavailable}
                onChange={(e) => set('showUnavailable', e.target.checked)}
                className="h-3.5 w-3.5 accent-[var(--zego-primary-500)]"
              />
              แสดงคนที่ไม่พร้อมรับงานด้วย
            </label>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={toggleFavoritesOnly}
              aria-pressed={showFavoritesOnly}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                showFavoritesOnly
                  ? 'border-amber-400 bg-amber-50 text-amber-700'
                  : 'zego-border-color zego-surface-bg zego-text-secondary zego-hover-surface',
              )}
            >
              <Icon name="star" filled={showFavoritesOnly} className="h-3.5 w-3.5" />
              ไกด์ของฉัน
            </button>
            {showFavoritesOnly ? (
              <span className="text-xs zego-text-tertiary">ลากไอคอน ⠿ เพื่อจัดลำดับ</span>
            ) : (
              <>
                <label htmlFor="leader-sort" className="text-xs zego-text-tertiary">
                  เรียงตาม
                </label>
                <select
                  id="leader-sort"
                  value={sortPresetKey}
                  onChange={(e) => {
                    const preset = SORT_PRESETS.find((p) => p.key === e.target.value);
                    if (preset) {
                      setFilter((prev) => ({ ...prev, sortBy: preset.sortBy, sortDir: preset.sortDir }));
                    }
                  }}
                  className="rounded-lg border zego-border-color zego-surface-bg px-2 py-1.5 text-xs zego-text-secondary focus:border-[var(--zego-primary-500)] focus:outline-none"
                >
                  {SORT_PRESETS.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      </Card>

      {/* ตาราง / การ์ด — พร้อม Skeleton / Error */}
      {loadError ? (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full zego-icon-well--danger">
              <Icon name="warning" className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold zego-text">โหลดข้อมูลไม่สำเร็จ</p>
              <p className="mt-1 text-sm zego-text-tertiary">
                เกิดข้อผิดพลาดระหว่างโหลดรายชื่อหัวหน้าทัวร์
              </p>
            </div>
            <Button variant="primary" onClick={reload}>
              ลองใหม่
            </Button>
          </div>
        </Card>
      ) : (
        <>
          <LeaderTable
            leaders={paged}
            countries={countries}
            jobs={jobs}
            availabilityRecords={availabilityRecords}
            today={today}
            startIndex={startIndex}
            loading={!ready}
            canEdit={can(currentUser.role, 'leader.edit')}
            canChangeStatus={can(currentUser.role, 'leader.changeStatus')}
            onEdit={openEdit}
            onChangeStatus={openStatus}
            onDelete={setDeactivateTarget}
            favorited={favorited}
            onToggleFavorite={toggleFavorite}
            reorderable={showFavoritesOnly}
            onReorder={handleReorderFavorites}
            empty={
              <Card>
                <LeaderTableEmpty
                  hasFilter={hasFilter || showFavoritesOnly}
                  onReset={() => {
                    reset();
                    if (showFavoritesOnly) toggleFavoritesOnly();
                  }}
                  onAdd={
                    can(currentUser.role, 'leader.create')
                      ? () => router.push('/leaders/new')
                      : undefined
                  }
                  onImport={
                    can(currentUser.role, 'leader.create')
                      ? () => router.push('/leaders/new?mode=import')
                      : undefined
                  }
                />
              </Card>
            }
          />

          {ready && !showFavoritesOnly && visibleLeaders.length > PAGE_SIZE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs zego-text-tertiary">
                แสดง {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, visibleLeaders.length)} จาก{' '}
                {visibleLeaders.length} คน
              </span>
              <div className="flex items-center gap-1">
                <PagerButton
                  label="ก่อนหน้า"
                  disabled={currentPage <= 1}
                  onClick={() => goToPage(Math.max(1, currentPage - 1))}
                />
                <span className="px-2 text-xs zego-text-secondary">
                  หน้า {currentPage} / {totalPages}
                </span>
                <PagerButton
                  label="ถัดไป"
                  disabled={currentPage >= totalPages}
                  onClick={() => goToPage(Math.min(totalPages, currentPage + 1))}
                />
              </div>
            </div>
          )}
        </>
      )}

      <LeaderStatusModal open={statusOpen} onClose={() => setStatusOpen(false)} leader={target} />

      <ConfirmDialog
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={async () => {
          if (!deactivateTarget) return;
          const item = deactivateTarget;
          setDeactivateTarget(null);
          await setLeaderActive(item.id, !item.active, 'ดำเนินการจากหน้ารายการหัวหน้าทัวร์');
        }}
        loading={saving}
        tone={deactivateTarget?.active ? 'danger' : 'primary'}
        title={deactivateTarget?.active ? 'ยืนยันการลบข้อมูล (ปิดใช้งาน)' : 'ยืนยันการเปิดใช้งาน'}
        confirmLabel={deactivateTarget?.active ? 'ลบข้อมูล' : 'เปิดใช้งาน'}
        message={
          deactivateTarget?.active
            ? `ลบข้อมูลของ “${deactivateTarget?.firstName} ${deactivateTarget?.lastName}” ออกจากรายการ — ระบบจะปิดใช้งาน (เก็บข้อมูลไว้ทั้งหมด ไม่ลบถาวร) และจะไม่ถูกเสนอให้จัดงานใหม่`
            : `เปิดใช้งานข้อมูลของ “${deactivateTarget?.firstName} ${deactivateTarget?.lastName}” อีกครั้ง`
        }
      />
    </>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed zego-border-color zego-text-disabled'
          : 'zego-border-color zego-text-secondary zego-hover-surface',
      )}
    >
      {label}
    </button>
  );
}
