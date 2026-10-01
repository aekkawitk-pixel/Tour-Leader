'use client';

/**
 * เมนู "ภาพรวม" (/) — ภาพรวมหัวหน้าทัวร์ · วิเคราะห์ผ่าน KPI + กราฟ แล้วกดกรองตารางด้านล่าง
 *
 * เดิมหน้านี้อยู่ใต้เมนู "หัวหน้าทัวร์" (ปุ่มสลับ ภาพรวม/รายชื่อ ที่ /leaders/overview)
 * ย้ายมาเป็นเมนูของตัวเองแล้ว — /leaders จึงเหลือเฉพาะตารางรายชื่อ ไม่มีปุ่มสลับอีก
 * Dashboard งาน/เบิกจ่ายที่เคยอยู่ที่ / ย้ายไป /dashboard (ยังเปิดได้ ไม่ได้ลบ)
 *
 * ข้อมูลทุกส่วนมาจากแหล่งเดียวกับตาราง (leaders) และคำนวณจาก "ชุดที่กรองแล้ว" ชุดเดียว
 * กด KPI/กราฟ = ตั้งตัวกรอง (toggle) · เลือกหลายกราฟร่วมกันได้ · แสดง Filter Chip + ล้างเฉพาะรายการ
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { can, ownLeaderScope } from '@/lib/permissions';
import { LEADER_STATUS, READINESS_TERM, USAGE_STATUS_TERM } from '@/lib/labels';
import { EMPTY_LEADER_FILTER, filterLeaders } from '@/lib/logic/leaderSearch';
import {
  countryCounts,
  EXPERIENCE_BAND_LABEL,
  EXPERIENCE_BAND_ORDER,
  experienceBandCounts,
  languageCounts,
  leaderKpis,
  statusGroupCounts,
  STATUS_GROUPS,
  type StatusGroupKey,
} from '@/lib/logic/leaderAnalytics';
import { Button, Card, CardHeader, cx, PageHeader } from '@/components/ui/Primitives';
import { StatCard } from '@/components/ui/Charts';
import { SearchBox, SelectInput } from '@/components/ui/FormField';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { ConfirmDialog } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { LeaderStatusModal } from '@/components/leaders/LeaderStatusModal';
import { LeaderTable, LeaderTableEmpty } from '@/components/leaders/LeaderTable';
import { useFavoriteGuides } from '@/lib/useFavoriteGuides';
import { StatusDonut, RankBarChart } from '@/components/leaders/overviewCharts';
import type {
  ExperienceLevelFilter,
  LeaderFilter,
  LeaderStatus,
  TourLeader,
} from '@/types';

const PAGE_SIZE = 12;

/** ตัวกรองเริ่มต้นของหน้าภาพรวม — แสดงทุกสถานะ (รวมพัก/ไม่ใช้) เพื่อให้ KPI/กราฟครบ */
const OVERVIEW_FILTER: LeaderFilter = { ...EMPTY_LEADER_FILTER, showUnavailable: true };

const sameSet = (a: LeaderStatus[], b: LeaderStatus[]) =>
  a.length === b.length && a.every((x) => b.includes(x));

/** ตัวเลือกดรอปดาวน์ “ความพร้อมรับงาน” (สอดคล้องกับ donut) — ไม่ซ้ำกับสถานะการใช้งาน */
const STATUS_SELECT: { value: string; label: string; statuses: LeaderStatus[] }[] = [
  { value: 'all', label: `ทุก${READINESS_TERM}`, statuses: [] },
  ...STATUS_GROUPS.map((g) => ({ value: g.key as string, label: g.label, statuses: g.statuses })),
];

const EXPERIENCE_OPTIONS: { value: ExperienceLevelFilter; label: string }[] = [
  { value: 'any', label: 'ทุกระดับ' },
  ...EXPERIENCE_BAND_ORDER.map((k) => ({ value: k, label: EXPERIENCE_BAND_LABEL[k] })),
];

export default function LeadersOverviewPage() {
  const router = useRouter();
  const {
    leaders: allLeaders,
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

  /*
   * หัวหน้าทัวร์เห็นเฉพาะข้อมูลของตัวเอง — กรองที่แหล่งข้อมูลจุดเดียว
   * KPI กราฟ และตารางด้านล่างคำนวณจากชุดนี้ทั้งหมด จึงไม่มีทางหลุดข้อมูลคนอื่นออกทางใดทางหนึ่ง
   */
  const ownScope = ownLeaderScope(currentUser);
  const leaders = useMemo(
    () => (ownScope === null ? allLeaders : allLeaders.filter((l) => l.id === ownScope)),
    [allLeaders, ownScope],
  );

  const [filter, setFilter] = useState<LeaderFilter>(OVERVIEW_FILTER);
  const [page, setPage] = useState(1);
  const { favorited, toggleFavorite } = useFavoriteGuides();

  const [statusOpen, setStatusOpen] = useState(false);
  const [deactivateTarget, setDeactivateTarget] = useState<TourLeader | null>(null);
  const [targetId, setTargetId] = useState<string | null>(null);
  const target = leaders.find((l) => l.id === targetId) ?? null;

  const set = <K extends keyof LeaderFilter>(key: K, value: LeaderFilter[K]) =>
    setFilter((prev) => ({ ...prev, [key]: value }));

  const reset = () => setFilter(OVERVIEW_FILTER);

  /** ประชากรทั้งหมดที่ใช้งานอยู่ (ข้อมูลที่ถูกลบ/ปิดใช้งานไม่นับ) */
  const activeTotal = useMemo(() => leaders.filter((l) => l.active).length, [leaders]);

  /** ชุดที่กรองแล้ว — แหล่งเดียวสำหรับ KPI/กราฟ/ตาราง */
  const filtered = useMemo(
    () => filterLeaders(leaders, filter, { countries, routes, jobs, today }),
    [leaders, filter, countries, routes, jobs, today],
  );

  /* ปรับหน้าเมื่อตัวกรองเปลี่ยน (ปรับ state ระหว่าง render) */
  const [prevFilter, setPrevFilter] = useState(filter);
  if (prevFilter !== filter) {
    setPrevFilter(filter);
    setPage(1);
  }

  const kpis = useMemo(() => leaderKpis(filtered, jobs, today), [filtered, jobs, today]);
  const statusData = useMemo(() => statusGroupCounts(filtered), [filtered]);
  const langData = useMemo(() => languageCounts(filtered), [filtered]);
  const countryData = useMemo(() => countryCounts(filtered, countries), [filtered, countries]);
  const expData = useMemo(() => experienceBandCounts(filtered, today), [filtered, today]);

  /* ------------------------------ cross-filter ----------------------------- */

  const toggleStatus = (statuses: LeaderStatus[]) =>
    set('statusIn', sameSet(filter.statusIn, statuses) ? [] : statuses);
  /** กดแท่งกราฟ = เพิ่ม/เอาออกจากชุดที่เลือก — เลือกพร้อมกันหลายค่าได้เหมือนช่องดรอปดาวน์ */
  const toggleIn = (list: string[], value: string) =>
    (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  const toggleLanguage = (lang: string) => set('languages', toggleIn(filter.languages, lang));
  const toggleCountry = (id: string) => set('countryIds', toggleIn(filter.countryIds, id));
  const toggleExperience = (band: ExperienceLevelFilter) =>
    set('experienceLevel', filter.experienceLevel === band ? 'any' : band);

  const statusSelectValue =
    STATUS_SELECT.find((s) => s.statuses.length > 0 && sameSet(s.statuses, filter.statusIn))?.value ??
    'all';

  /* --------------------------------- chips --------------------------------- */

  const chips: { label: string; onClear: () => void }[] = [];
  if (filter.query.trim())
    chips.push({ label: `ค้นหา: ${filter.query.trim()}`, onClear: () => set('query', '') });
  if (filter.statusIn.length > 0) {
    const label =
      STATUS_SELECT.find((s) => s.statuses.length > 0 && sameSet(s.statuses, filter.statusIn))
        ?.label ?? filter.statusIn.map((s) => LEADER_STATUS[s].label).join(', ');
    chips.push({ label: `สถานะ: ${label}`, onClear: () => set('statusIn', []) });
  }
  if (filter.languages.length > 0)
    chips.push({ label: `ภาษา: ${filter.languages.join(', ')}`, onClear: () => set('languages', []) });
  if (filter.countryIds.length > 0) {
    const names = filter.countryIds.map((id) => countries.find((c) => c.id === id)?.nameEn ?? id);
    chips.push({ label: `ประเทศ: ${names.join(', ')}`, onClear: () => set('countryIds', []) });
  }
  if (filter.experienceLevel !== 'any')
    chips.push({
      label: `ประสบการณ์: ${EXPERIENCE_BAND_LABEL[filter.experienceLevel]}`,
      onClear: () => set('experienceLevel', 'any'),
    });

  /* ------------------------------- pagination ------------------------------ */

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const paged = filtered.slice(startIndex, startIndex + PAGE_SIZE);

  /** §3 เปิดหน้าโปรไฟล์ที่แท็บ "ข้อมูลส่วนตัวและ Passport" — ไม่เปิด Modal แก้ไขหลายแท็บ */
  const openEdit = (leader: TourLeader) => {
    router.push(`/leaders/${leader.id}?tab=identity`);
  };
  const openStatus = (leader: TourLeader) => {
    setTargetId(leader.id);
    setStatusOpen(true);
  };

  const donutSlices = statusData.map((s) => ({
    key: s.key,
    label: s.label,
    value: s.count,
    color: s.color,
  }));
  const selectedStatusGroupKey: StatusGroupKey | null =
    (STATUS_GROUPS.find((g) => sameSet(g.statuses, filter.statusIn))?.key as StatusGroupKey) ?? null;

  const noData = ready && activeTotal === 0;
  const noResult = ready && activeTotal > 0 && filtered.length === 0;

  return (
    <>
      <PageHeader
        title="ภาพรวมหัวหน้าทัวร์"
        description="วิเคราะห์ผ่าน KPI และกราฟ · กดการ์ดหรือกราฟเพื่อกรองรายชื่อด้านล่าง"
        actions={
          /* ภาพรวมกับรายชื่อเป็นคนละเมนูแล้ว — สลับที่เมนูด้านซ้าย ไม่ต้องมีปุ่มสลับในหน้า */
          <div className="flex items-center gap-2">
            {can(currentUser.role, 'leader.create') && (
              <Button variant="primary" icon="plus" onClick={() => router.push('/leaders/new')}>
                เพิ่มหัวหน้าทัวร์
              </Button>
            )}
          </div>
        }
      />

      {loadError ? (
        <ErrorCard onRetry={reload} />
      ) : noData ? (
        <Card>
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <span className="zego-icon-well flex h-12 w-12 items-center justify-center rounded-full">
              <Icon name="chart" className="h-6 w-6" />
            </span>
            <p className="zego-text text-sm font-semibold">
              ยังไม่มีข้อมูลหัวหน้าทัวร์สำหรับวิเคราะห์
            </p>
            {can(currentUser.role, 'leader.create') && (
              <Button variant="primary" icon="plus" onClick={() => router.push('/leaders/new')}>
                เพิ่มหัวหน้าทัวร์ใหม่
              </Button>
            )}
          </div>
        </Card>
      ) : (
        <>
          {/* ------------------------------ 1. ตัวกรอง ------------------------------ */}
          <Card className="mb-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
                <label className="zego-text-secondary text-sm font-medium">ค้นหา</label>
                <SearchBox
                  value={filter.query}
                  onChange={(v) => set('query', v)}
                  placeholder="รหัส ชื่อ ชื่อเล่น โทรศัพท์ อีเมล"
                  label="ค้นหาหัวหน้าทัวร์"
                />
              </div>
              <SelectInput
                label="สถานะ"
                value={statusSelectValue}
                onChange={(e) =>
                  set('statusIn', STATUS_SELECT.find((s) => s.value === e.target.value)?.statuses ?? [])
                }
                options={STATUS_SELECT.map((s) => ({ value: s.value, label: s.label }))}
              />
              <MultiSelect
                label="ภาษา"
                value={filter.languages}
                onChange={(next) => set('languages', next)}
                allLabel="ทุกภาษา"
                options={master.languages.filter((l) => l.active).map((l) => ({ value: l.name, label: l.name }))}
              />
              <MultiSelect
                label="ประเทศที่เชี่ยวชาญ"
                value={filter.countryIds}
                onChange={(next) => set('countryIds', next)}
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
            </div>

            <div className="zego-divider-top mt-3 flex flex-wrap items-center justify-between gap-2 pt-3">
              <span className="zego-text-secondary text-sm font-medium">
                {ready ? (
                  <>
                    กำลังแสดงหัวหน้าทัวร์ {filtered.length} คน จากทั้งหมด {activeTotal} คน
                  </>
                ) : (
                  <span className="zego-text-tertiary">กำลังโหลดข้อมูล…</span>
                )}
              </span>
              {chips.length > 0 && (
                <Button variant="ghost" size="sm" onClick={reset}>
                  ล้างตัวกรอง
                </Button>
              )}
            </div>

            {/* Filter chips */}
            {chips.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {chips.map((chip) => (
                  <span
                    key={chip.label}
                    className="zego-badge--info inline-flex items-center gap-1 rounded-full border py-1 pl-2.5 pr-1 text-xs font-medium"
                  >
                    {chip.label}
                    <button
                      type="button"
                      onClick={chip.onClear}
                      aria-label={`ล้าง ${chip.label}`}
                      className="zego-hover-surface rounded-full p-0.5"
                    >
                      <Icon name="close" className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Card>

          {/* ------------------------------ 2. KPI ------------------------------ */}
          {!ready ? (
            <SkeletonKpis />
          ) : (
            <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard
                label="หัวหน้าทัวร์ทั้งหมด"
                value={`${activeTotal} คน`}
                hint={`กำลังแสดง ${filtered.length} คน`}
                tone="slate"
                onClick={reset}
              />
              <StatCard
                label="พร้อมรับงาน"
                value={`${kpis.available} คน`}
                tone="green"
                onClick={() => toggleStatus(['available'])}
              />
              {/* “ติดงาน” เป็นสถานะประกอบ — คำนวณจากงานที่มอบหมายในเมนูการจัดสเก็ต ไม่ใช่สถานะที่กรองได้ */}
              <StatCard
                label="ติดงาน"
                value={`${kpis.onJob} คน`}
                hint="คำนวณจากงานที่มอบหมาย ณ วันนี้ — จัดการที่เมนูการจัดสเก็ต"
                tone="blue"
              />
              {/* มิติ “สถานะการใช้งาน” — คนละเรื่องกับความพร้อมรับงาน */}
              <StatCard
                label="ระงับ / สิ้นสุดการใช้งาน"
                value={`${kpis.usageBlocked} คน`}
                hint={`${USAGE_STATUS_TERM} — ปรับที่หน้าโปรไฟล์`}
                tone="amber"
              />
            </div>
          )}

          {/* ------------------------------ 3. กราฟ ------------------------------ */}
          {!ready ? (
            <SkeletonCharts />
          ) : (
            <div className="mb-5 grid gap-4 lg:grid-cols-2">
              <ChartCard title="สถานะหัวหน้าทัวร์" description="กดส่วนของกราฟเพื่อกรองตามสถานะ">
                <StatusDonut
                  slices={donutSlices}
                  selectedKey={selectedStatusGroupKey}
                  onSelect={(slice) =>
                    toggleStatus(STATUS_GROUPS.find((g) => g.key === slice.key)?.statuses ?? [])
                  }
                />
              </ChartCard>

              <ChartCard title="ความสามารถด้านภาษา" description="จำนวนคนต่อภาษา (หนึ่งคนมีได้หลายภาษา)">
                <RankBarChart
                  items={langData.map((l) => ({ key: l.language, label: l.language, value: l.count }))}
                  selectedKeys={filter.languages}
                  onSelect={(item) => toggleLanguage(item.key)}
                  emptyLabel="ไม่มีข้อมูลภาษา"
                />
              </ChartCard>

              <ChartCard
                title="ประเทศที่หัวหน้าทัวร์เชี่ยวชาญ"
                description="จำนวนคนต่อประเทศ (หนึ่งคนเชี่ยวชาญได้หลายประเทศ)"
              >
                <RankBarChart
                  items={countryData.map((c) => ({ key: c.countryId, label: c.name, value: c.count }))}
                  selectedKeys={filter.countryIds}
                  onSelect={(item) => toggleCountry(item.key)}
                  emptyLabel="ไม่มีข้อมูลประเทศ"
                />
              </ChartCard>

              <ChartCard title="ระดับประสบการณ์ของหัวหน้าทัวร์" description="แบ่งตามประสบการณ์รวม">
                <RankBarChart
                  items={expData.map((b) => ({ key: b.key, label: b.label, value: b.count }))}
                  selectedKeys={filter.experienceLevel !== 'any' ? [filter.experienceLevel] : []}
                  onSelect={(item) => toggleExperience(item.key as ExperienceLevelFilter)}
                  initialLimit={0}
                />
              </ChartCard>
            </div>
          )}

          {/* ------------------------------ 4. ตาราง ------------------------------ */}
          <CardHeader title="รายชื่อหัวหน้าทัวร์" description={`พบ ${filtered.length} คน`} />
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
            empty={
              <Card>
                <LeaderTableEmpty
                  hasFilter={chips.length > 0 || noResult}
                  onReset={reset}
                  onAdd={
                    can(currentUser.role, 'leader.create')
                      ? () => router.push('/leaders/new')
                      : undefined
                  }
                />
              </Card>
            }
          />

          {ready && filtered.length > PAGE_SIZE && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <span className="zego-text-tertiary text-xs">
                แสดง {startIndex + 1}–{Math.min(startIndex + PAGE_SIZE, filtered.length)} จาก{' '}
                {filtered.length} คน
              </span>
              <div className="flex items-center gap-1">
                <PagerButton
                  label="ก่อนหน้า"
                  disabled={currentPage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                />
                <span className="zego-text-secondary px-2 text-xs">
                  หน้า {currentPage} / {totalPages}
                </span>
                <PagerButton
                  label="ถัดไป"
                  disabled={currentPage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
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
          await setLeaderActive(item.id, !item.active, 'ดำเนินการจากหน้าภาพรวมหัวหน้าทัวร์');
        }}
        loading={saving}
        tone={deactivateTarget?.active ? 'danger' : 'primary'}
        title={deactivateTarget?.active ? 'ยืนยันการลบข้อมูล (ปิดใช้งาน)' : 'ยืนยันการเปิดใช้งาน'}
        confirmLabel={deactivateTarget?.active ? 'ลบข้อมูล' : 'เปิดใช้งาน'}
        message={
          deactivateTarget?.active
            ? `ลบข้อมูลของ “${deactivateTarget?.firstName} ${deactivateTarget?.lastName}” ออกจากรายการ — ระบบจะปิดใช้งาน (เก็บข้อมูลไว้ ไม่ลบถาวร)`
            : `เปิดใช้งานข้อมูลของ “${deactivateTarget?.firstName} ${deactivateTarget?.lastName}” อีกครั้ง`
        }
      />
    </>
  );
}

/* -------------------------------- ส่วนย่อย -------------------------------- */

function ChartCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  // overflow-visible เพื่อไม่ให้ tooltip ถูกตัด · ไม่มี scroll ภายใน
  return (
    <Card className="overflow-visible">
      <CardHeader title={title} description={description} />
      {children}
    </Card>
  );
}

function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="zego-icon-well--danger flex h-12 w-12 items-center justify-center rounded-full">
          <Icon name="warning" className="h-6 w-6" />
        </span>
        <p className="zego-text text-sm font-semibold">โหลดข้อมูลไม่สำเร็จ</p>
        <Button variant="primary" onClick={onRetry}>
          ลองใหม่
        </Button>
      </div>
    </Card>
  );
}

function SkeletonKpis() {
  return (
    <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="zego-card-surface border-l-4 p-4">
          <span className="zego-skeleton block h-3 w-24 animate-pulse rounded" />
          <span className="zego-skeleton mt-2 block h-7 w-16 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

function SkeletonCharts() {
  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="zego-card-surface p-5">
          <span className="zego-skeleton block h-4 w-40 animate-pulse rounded" />
          <div className="mt-4 space-y-2.5">
            {Array.from({ length: 5 }).map((_, j) => (
              <span key={j} className="zego-skeleton block h-4 w-full animate-pulse rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
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
        'zego-border-color rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
        disabled
          ? 'cursor-not-allowed zego-text-disabled'
          : 'zego-text-secondary zego-hover-surface',
      )}
    >
      {label}
    </button>
  );
}
