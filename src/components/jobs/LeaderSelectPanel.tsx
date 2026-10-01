'use client';

/**
 * แผงเลือกหัวหน้าทัวร์ (§1/§2) — Compact Filter เพื่อคืนพื้นที่ให้รายชื่อ (≥65% ของ Card)
 *
 * ส่วนหัว (sticky, ≤~200px): ค้นหา · Month Picker · Quick Filter + ปุ่ม "ตัวกรองเพิ่มเติม" · แถว Chip (ถ้ามี)
 * ตัวกรองไม่บ่อย (สถานะ/ภาษา/ประเทศ/จำนวนงาน/ประสบการณ์ตรง/ช่วงวัน-เวลา) ย้ายเข้า Popover
 * การเรียงลำดับอัตโนมัติ (§1): พร้อมรับงาน → งานทับซ้อนน้อย → งานในเดือนน้อย → วันต่อเนื่องน้อย → ชื่อ
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar, Button, cx, StatusBadge } from '@/components/ui/Primitives';
import { SearchBox, SelectInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { TimeField } from '@/components/ui/TimeInput';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { Icon } from '@/components/ui/Icon';
import { LEADER_STATUS } from '@/lib/labels';
import { endOfMonth, formatDate, startOfMonth } from '@/lib/format';
import { isBlockingJob } from '@/lib/logic/conflicts';
import { expertCountries, leaderSearchText, orderedLanguages } from '@/lib/logic/leaderProfile';
import { UNAVAILABLE_LEADER_STATUSES } from '@/lib/logic/leaderJobs';
import { leaderUnavailability, monthFreeInfo } from '@/lib/logic/leaderAvailability';
import { scheduleRunSummary } from '@/lib/logic/tourLeaderMatching';
import { sortByPreference } from '@/lib/logic/preferredGuideOrder';
import { usePreferredGuideOrder } from '@/lib/usePreferredGuideOrder';
import { useExcludedGuides } from '@/lib/useExcludedGuides';
import { useFavoriteGuides } from '@/lib/useFavoriteGuides';
import type { Appointment, Country, LeaderAvailabilityRecord, TourJob, TourLeader } from '@/types';

function windowDT(w: { start: string; end: string; isAllDay: boolean; startTime?: string; endTime?: string }): [string, string] {
  if (w.isAllDay) return [`${w.start}T00:00`, `${w.end}T23:59`];
  return [`${w.start}T${w.startTime ?? '00:00'}`, `${w.end}T${w.endTime ?? '23:59'}`];
}
const dtOverlap = (aS: string, aE: string, bS: string, bE: string) => aS < bE && aE > bS;

type JobCountFilter = 'all' | 'none' | 'low';

export function LeaderSelectPanel({
  leaders,
  jobs,
  appointments,
  records,
  countries,
  today,
  monthCursor,
  onMonthChange,
  selectedId,
  onSelect,
  quickFilter,
}: {
  leaders: TourLeader[];
  jobs: TourJob[];
  appointments: Appointment[];
  records: LeaderAvailabilityRecord[];
  countries: Country[];
  today: string;
  monthCursor: string;
  onMonthChange: (isoFirstOfMonth: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  quickFilter: 'freeThisMonth' | 'noJobs' | 'lowLoad' | null;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { order: preferredOrder } = usePreferredGuideOrder();
  const { excluded } = useExcludedGuides();
  const { favorited } = useFavoriteGuides();
  const [query, setQuery] = useState('');
  // Quick Filter (§5) — แสดงในหน้าหลัก
  const [availableOnly, setAvailableOnly] = useState(false);
  const [freeAllMonth, setFreeAllMonth] = useState(false);
  // ตัวกรองเพิ่มเติม (§6) — อยู่ใน Popover
  const [statusF, setStatusF] = useState('all');
  const [langF, setLangF] = useState('all');
  const [countryF, setCountryF] = useState('all');
  const [jobCountF, setJobCountF] = useState<JobCountFilter>('all');
  const [experienceDirect, setExperienceDirect] = useState(false);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeStartTime, setRangeStartTime] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeEndTime, setRangeEndTime] = useState('');
  const [popoverOpen, setPopoverOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  // §1 โฟกัสช่องค้นหาเมื่อเปิดหน้า
  useEffect(() => {
    containerRef.current?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  }, []);

  // ปิด Popover เมื่อคลิกนอกกรอบ / Escape
  useEffect(() => {
    if (!popoverOpen) return;
    const onDown = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setPopoverOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setPopoverOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [popoverOpen]);

  const monthStart = startOfMonth(monthCursor);
  const monthEnd = endOfMonth(monthCursor);
  const monthKey = monthCursor.slice(0, 7);
  const active = useMemo(
    () => leaders.filter((l) => (l.active || l.usageStatus === 'suspended') && !excluded.has(l.id)),
    [leaders, excluded],
  );

  const monthCount = useCallback(
    (id: string) => jobs.filter((j) => j.leaderId === id && isBlockingJob(j) && j.departDate.slice(0, 7) === monthKey).length,
    [jobs, monthKey],
  );
  const consecutive = useCallback(
    (id: string) => scheduleRunSummary(jobs.filter((j) => j.leaderId === id && isBlockingJob(j))).consecutiveDays,
    [jobs],
  );

  const monthAvailability = useCallback(
    (leader: TourLeader): { text: string; freeDate: string | null; free: boolean } => {
      if (UNAVAILABLE_LEADER_STATUSES.has(leader.status)) return { text: 'ไม่พร้อมรับงาน', freeDate: null, free: false };
      return monthFreeInfo(leaderUnavailability(leader.id, jobs, appointments, records), monthStart, monthEnd, today);
    },
    [jobs, appointments, records, monthStart, monthEnd, today],
  );

  const customActive = !!rangeStart && !!rangeEnd;
  const freeInCustomRange = useCallback(
    (leader: TourLeader): boolean => {
      if (!customActive) return true;
      if (UNAVAILABLE_LEADER_STATUSES.has(leader.status)) return false;
      const s = rangeStart <= rangeEnd ? rangeStart : rangeEnd;
      const e = rangeStart <= rangeEnd ? rangeEnd : rangeStart;
      const aStart = `${s}T${rangeStartTime || '00:00'}`;
      const aEnd = `${e}T${rangeEndTime || '23:59'}`;
      return !leaderUnavailability(leader.id, jobs, appointments, records).some((w) => {
        if (!w.blocksAssignment) return false;
        const [bS, bE] = windowDT(w);
        return dtOverlap(aStart, aEnd, bS, bE);
      });
    },
    [customActive, rangeStart, rangeEnd, rangeStartTime, rangeEndTime, jobs, appointments, records],
  );

  const langOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of active) for (const lang of l.languages) set.add(lang.languageName);
    return [...set].sort((a, b) => a.localeCompare(b, 'th'));
  }, [active]);
  const countryOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of active) for (const e of expertCountries(l, countries)) set.add(e.label);
    return [...set].sort((a, b) => a.localeCompare(b, 'th'));
  }, [active, countries]);

  const searchText = useCallback(
    (l: TourLeader) =>
      [leaderSearchText(l), ...l.languages.map((x) => x.languageName), ...expertCountries(l, countries).map((e) => e.label)]
        .join(' ')
        .toLowerCase(),
    [countries],
  );

  const clearRange = () => {
    setRangeStart('');
    setRangeStartTime('');
    setRangeEnd('');
    setRangeEndTime('');
  };
  const clearAdvanced = () => {
    setStatusF('all');
    setLangF('all');
    setCountryF('all');
    setJobCountF('all');
    setExperienceDirect(false);
    clearRange();
  };
  const clearAll = () => {
    setQuery('');
    setAvailableOnly(false);
    setFreeAllMonth(false);
    clearAdvanced();
  };

  // §7 รายการตัวกรองเพิ่มเติมที่เปิดใช้งาน → Chip + จำนวน
  const advanced = useMemo(() => {
    const list: { key: string; label: string; clear: () => void }[] = [];
    if (statusF !== 'all') list.push({ key: 'status', label: LEADER_STATUS[statusF as keyof typeof LEADER_STATUS]?.label ?? statusF, clear: () => setStatusF('all') });
    if (langF !== 'all') list.push({ key: 'lang', label: `ภาษา${langF}`, clear: () => setLangF('all') });
    if (countryF !== 'all') list.push({ key: 'country', label: `ประเทศ ${countryF}`, clear: () => setCountryF('all') });
    if (jobCountF !== 'all') list.push({ key: 'job', label: jobCountF === 'none' ? 'ยังไม่มีงาน' : 'งานน้อย', clear: () => setJobCountF('all') });
    if (experienceDirect) list.push({ key: 'exp', label: 'มีประสบการณ์ตรง', clear: () => setExperienceDirect(false) });
    if (customActive) list.push({ key: 'range', label: `ช่วง ${formatDate(rangeStart)}–${formatDate(rangeEnd)}`, clear: clearRange });
    return list;
  }, [statusF, langF, countryF, jobCountF, experienceDirect, customActive, rangeStart, rangeEnd]);

  const hasAnyFilter =
    query !== '' || availableOnly || freeAllMonth || advanced.length > 0;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = active.filter((l) => {
      if (q && !searchText(l).includes(q)) return false;
      if (availableOnly && l.status !== 'available') return false;
      if (freeAllMonth && monthAvailability(l).text !== 'ว่างตลอดเดือน') return false;
      if (statusF !== 'all' && l.status !== statusF) return false;
      if (langF !== 'all' && !l.languages.some((x) => x.languageName === langF)) return false;
      if (countryF !== 'all' && !expertCountries(l, countries).some((e) => e.label === countryF)) return false;
      if (jobCountF === 'none' && monthCount(l.id) > 0) return false;
      if (jobCountF === 'low' && monthCount(l.id) > 1) return false;
      if (experienceDirect && expertCountries(l, countries).length === 0) return false;
      if (!freeInCustomRange(l)) return false;
      // §12 Quick Actions จาก workspace
      if (quickFilter === 'freeThisMonth' && monthCount(l.id) > 0) return false;
      if (quickFilter === 'noJobs' && jobs.some((j) => j.leaderId === l.id && isBlockingJob(j))) return false;
      if (quickFilter === 'lowLoad' && monthCount(l.id) > 1) return false;
      return true;
    });
    const availRank = (l: TourLeader) => {
      if (UNAVAILABLE_LEADER_STATUSES.has(l.status)) return 2;
      return l.status === 'available' && monthAvailability(l).free ? 0 : 1;
    };
    const sorted = [...list].sort((a, b) => {
      const ar = availRank(a) - availRank(b);
      if (ar !== 0) return ar;
      const mc = monthCount(a.id) - monthCount(b.id);
      if (mc !== 0) return mc;
      const cd = consecutive(a.id) - consecutive(b.id);
      if (cd !== 0) return cd;
      return `${a.firstName}${a.lastName}`.localeCompare(`${b.firstName}${b.lastName}`, 'th');
    });
    // ปักดาว/ลำดับไกด์ที่ผู้ใช้คนนี้ตั้งไว้เอง (Preferred Guide List) — ใช้เป็นเกณฑ์เรียงหลัก ถ้าตั้งไว้
    return sortByPreference(sorted, favorited, preferredOrder, (l) => l.id);
  }, [active, query, searchText, availableOnly, freeAllMonth, statusF, langF, countryF, jobCountF, experienceDirect, freeInCustomRange, quickFilter, jobs, countries, monthCount, consecutive, monthAvailability, preferredOrder, favorited]);

  const rangeHint = `ตรวจสอบความพร้อมระหว่าง ${formatDate(monthStart)}–${formatDate(monthEnd)}`;
  const shownChips = advanced.slice(0, 2);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-col">
      {/* ---------- ส่วนหัว Compact (sticky) ---------- */}
      <div className="z-10 shrink-0 space-y-1.5 zego-divider-bottom zego-surface-bg px-4 py-2.5">
        <h2 className="text-sm font-semibold zego-text">เลือกหัวหน้าทัวร์</h2>

        {/* แถว 1: ค้นหา (§3) */}
        <SearchBox value={query} onChange={setQuery} placeholder="ค้นหาชื่อ ชื่อเล่น หรือรหัส" label="ค้นหาหัวหน้าทัวร์" />

        {/* แถว 2: Month Picker แบบ compact (§4) — ช่วงวันที่อยู่ใน tooltip */}
        <MonthPicker value={monthCursor} onChange={onMonthChange} ariaLabel="เดือนที่ต้องการจัดสเก็ต" hint={rangeHint} />

        {/* แถว 3: Quick Filter + ตัวกรองเพิ่มเติม (§5/§6) */}
        <div ref={filterRef} className="relative flex flex-wrap items-center gap-2">
          <Chip active={availableOnly} onClick={() => setAvailableOnly((v) => !v)}>พร้อมรับงาน</Chip>
          <Chip active={freeAllMonth} onClick={() => setFreeAllMonth((v) => !v)}>ว่างตลอดเดือน</Chip>
          <button
            type="button"
            onClick={() => setPopoverOpen((v) => !v)}
            aria-haspopup="dialog"
            aria-expanded={popoverOpen}
            className={cx(
              'ml-auto inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
              advanced.length > 0 ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-surface-bg zego-text-secondary zego-hover-surface',
            )}
          >
            <Icon name="filter" className="h-3.5 w-3.5" />
            ตัวกรอง{advanced.length > 0 ? ` (${advanced.length})` : 'เพิ่มเติม'}
          </button>

          {/* Popover ตัวกรองเพิ่มเติม — Desktop = ใต้ปุ่ม · Mobile = Bottom Sheet (§6/§13) */}
          {popoverOpen && (
            <>
              <div className="fixed inset-0 z-30 zego-scrim sm:hidden" onClick={() => setPopoverOpen(false)} aria-hidden="true" />
              <div
                role="dialog"
                aria-label="ตัวกรองเพิ่มเติม"
                className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] space-y-2.5 overflow-y-auto rounded-t-2xl border zego-border-color zego-surface-bg p-4 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-1 sm:w-80 sm:rounded-xl"
              >
                <p className="text-sm font-semibold zego-text sm:hidden">ตัวกรองเพิ่มเติม</p>
                <div className="grid grid-cols-2 gap-2">
                  <SelectInput label="สถานะ" value={statusF} onChange={(e) => setStatusF(e.target.value)} options={[{ value: 'all', label: 'ทุกสถานะ' }, ...Object.entries(LEADER_STATUS).map(([v, m]) => ({ value: v, label: m.label }))]} />
                  <SelectInput label="จำนวนงานในเดือน" value={jobCountF} onChange={(e) => setJobCountF(e.target.value as JobCountFilter)} options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'none', label: 'ยังไม่มีงาน' }, { value: 'low', label: 'งานน้อย (≤1)' }]} />
                  <SelectInput label="ภาษา" value={langF} onChange={(e) => setLangF(e.target.value)} options={[{ value: 'all', label: 'ทุกภาษา' }, ...langOptions.map((l) => ({ value: l, label: l }))]} />
                  <SelectInput label="ประเทศ/เส้นทาง" value={countryF} onChange={(e) => setCountryF(e.target.value)} options={[{ value: 'all', label: 'ทุกประเทศ' }, ...countryOptions.map((c) => ({ value: c, label: c }))]} />
                </div>
                <label className="flex items-center gap-2 text-sm zego-text-secondary">
                  <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={experienceDirect} onChange={(e) => setExperienceDirect(e.target.checked)} />
                  เฉพาะผู้มีประสบการณ์ตรง (มีความเชี่ยวชาญประเทศ/เส้นทาง)
                </label>
                <div className="rounded-lg border zego-border-color zego-surface-soft-bg p-2">
                  <p className="mb-1.5 text-xs font-medium zego-text-tertiary">กำหนดช่วงวัน-เวลาเอง (ตรวจด้วยเวลาจริง)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <DateField label="วันที่เริ่ม" value={rangeStart} onChange={setRangeStart} optional picker />
                    <TimeField label="เวลาเริ่ม" value={rangeStartTime} onChange={setRangeStartTime} optional />
                    <DateField label="วันที่สิ้นสุด" value={rangeEnd} onChange={setRangeEnd} optional picker min={rangeStart || undefined} />
                    <TimeField label="เวลาสิ้นสุด" value={rangeEndTime} onChange={setRangeEndTime} optional />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="ghost" size="sm" onClick={clearAdvanced}>ล้างตัวกรอง</Button>
                  <Button variant="primary" size="sm" onClick={() => setPopoverOpen(false)}>ใช้ตัวกรอง</Button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* §7 Chip ตัวกรองที่เลือก (แสดงเมื่อมีเท่านั้น) */}
        {advanced.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {shownChips.map((f) => (
              <span key={f.key} className="inline-flex items-center gap-1 rounded-full zego-surface-soft-bg py-1 pl-2.5 pr-1 text-xs zego-text-secondary">
                <span className="max-w-[9rem] truncate">{f.label}</span>
                <button type="button" aria-label={`ลบตัวกรอง ${f.label}`} onClick={f.clear} className="rounded-full p-0.5 zego-icon-btn zego-hover-surface">
                  <Icon name="close" className="h-3 w-3" />
                </button>
              </span>
            ))}
            {advanced.length > shownChips.length && (
              <button type="button" onClick={() => setPopoverOpen(true)} className="rounded-full zego-surface-soft-bg px-2.5 py-1 text-xs font-medium zego-text-secondary zego-hover-surface">
                +{advanced.length - shownChips.length} ตัวกรอง
              </button>
            )}
          </div>
        )}
      </div>

      {/* ---------- รายชื่อหัวหน้าทัวร์ (≥65% ของ Card §9/§11) ---------- */}
      <div className="leader-scroll min-h-0 flex-1 overflow-y-auto">
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm zego-text-tertiary">ไม่พบหัวหน้าทัวร์ที่ตรงกับเงื่อนไข</p>
            {hasAnyFilter && (
              <button type="button" onClick={clearAll} className="mt-3 inline-flex items-center gap-1 rounded-lg border zego-border-color px-3 py-1.5 text-xs font-medium zego-text-secondary zego-hover-surface">
                <Icon name="close" className="h-3.5 w-3.5" /> ล้างตัวกรอง
              </button>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {rows.map((leader) => {
              const suspended = leader.usageStatus !== 'active';
              const lang = orderedLanguages(leader)[0];
              const country = expertCountries(leader, countries)[0];
              const avail = monthAvailability(leader);
              const isActive = leader.id === selectedId;
              return (
                <li key={leader.id}>
                  <button
                    type="button"
                    disabled={suspended}
                    aria-pressed={isActive}
                    onClick={() => onSelect(leader.id)}
                    className={cx(
                      'w-full px-4 py-2.5 text-left transition-colors',
                      suspended ? 'cursor-not-allowed opacity-60' : isActive ? 'border zego-selected-border zego-selected-tint' : 'zego-hover-surface',
                    )}
                  >
                    <div className="flex items-start gap-2.5">
                      <Avatar initials={leader.avatarInitials} color={leader.avatarColor} src={leader.photoUrl} alt={`รูปของ ${leader.firstName}`} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium zego-text">{leader.firstName} {leader.lastName}</p>
                          <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs zego-text-tertiary">
                          <span className="zego-text-tertiary">{leader.nickname ? `${leader.nickname} · ` : ''}{leader.id}</span>
                          <span>งาน <strong className="zego-text-secondary">{monthCount(leader.id)}</strong></span>
                          <span className={cx(avail.free ? 'zego-text-tertiary' : 'zego-text-danger')}>{avail.text}</span>
                          {lang && <span className="truncate">{lang.languageName}{country ? ` · ${country.label}` : ''}</span>}
                        </div>
                        {suspended && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium zego-text-danger">
                            <Icon name="warning" className="h-3 w-3" /> ถูกระงับการใช้งาน — เลือกไม่ได้
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Filter Chip ------------------------------ */

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cx(
        'inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium transition-colors',
        active ? 'zego-selected-fill' : 'zego-border-color zego-surface-bg zego-text-secondary zego-hover-surface',
      )}
    >
      {active && <Icon name="check" className="h-3.5 w-3.5" />}
      {children}
    </button>
  );
}
