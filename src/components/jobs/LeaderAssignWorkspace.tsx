'use client';

/**
 * Workspace "การจัดสเก็ต" แบบเลือกหัวหน้าทัวร์ก่อน (§1/§3/§11)
 * ซ้าย: เลือกหัวหน้าทัวร์ · กลาง: สรุป + ปฏิทินความพร้อม · ขวา: เลือกโปรแกรมทัวร์ + ยืนยัน
 * ก่อนเลือกคน = Empty State · Desktop 3 คอลัมน์ · จอแคบ = เรียงลงมา (โปรแกรมอยู่ใต้ปฏิทิน)
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { useWideContent } from '@/components/layout/AppShell';
import { Avatar, Button, cx, EmptyState, PageHeader, StatusBadge } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { SegmentedControl } from '@/components/ui/Tabs';
import { LEADER_STATUS } from '@/lib/labels';
import { addMonths, endOfMonth, formatDateRange, startOfMonth } from '@/lib/format';
import { isBlockingJob } from '@/lib/logic/conflicts';
import { UNAVAILABLE_LEADER_STATUSES } from '@/lib/logic/leaderJobs';
import { leaderUnavailability, monthFreeInfo } from '@/lib/logic/leaderAvailability';
import { expertCountries, leaderPhone, orderedLanguages } from '@/lib/logic/leaderProfile';
import { scheduleRunSummary } from '@/lib/logic/tourLeaderMatching';
import { LeaderSelectPanel } from './LeaderSelectPanel';
import { LeaderScheduleCalendar } from './LeaderScheduleCalendar';
import { ProgramAssignPanel } from './ProgramAssignPanel';
import { ScheduleEditModal } from './ScheduleEditModal';
import type { TourJob, TourLeader } from '@/types';

const PANEL_H = 'lg:h-[calc(100dvh-12rem)] lg:min-h-[36rem]';
const CARD = 'flex min-h-0 flex-col zego-card-surface';

type QuickFilter = 'freeThisMonth' | 'noJobs' | 'lowLoad' | null;

export function LeaderAssignWorkspace() {
  useWideContent(); // ใช้พื้นที่เต็มจอสำหรับ 3 คอลัมน์
  const router = useRouter();
  const { leaders, jobs, appointments, countries, availabilityRecords, today } = useDemo();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // §3 ค่าเริ่มต้น = เดือนถัดจากเดือนปัจจุบัน 1 เดือน (state กลางควบคุมเดือนของทั้งหน้า §10)
  const [monthCursor, setMonthCursor] = useState(() => startOfMonth(addMonths(today, 1)));
  const [quickFilter, setQuickFilter] = useState<QuickFilter>(null);
  const [focusUnassigned, setFocusUnassigned] = useState(false);
  const [editJob, setEditJob] = useState<TourJob | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false); // §10 ย่อแผงซ้าย

  // §11 ยกสถานะการเลือกโปรแกรมขึ้นมาไว้ที่ workspace เพื่อคงไว้ตอนเปลี่ยนหัวหน้าทัวร์
  const [selectedPrograms, setSelectedPrograms] = useState<Set<string>>(new Set());
  const [note, setNote] = useState('');
  const [pendingLeaderId, setPendingLeaderId] = useState<string | null>(null); // คนใหม่ที่รอยืนยันการเปลี่ยน

  const leader = leaders.find((l) => l.id === selectedId) ?? null;
  const pendingLeader = leaders.find((l) => l.id === pendingLeaderId) ?? null;

  // §11 เลือกหัวหน้าทัวร์ — ถ้ามีโปรแกรมค้างอยู่ ต้องถามก่อน ห้ามล้างเงียบ ๆ
  const handleSelectLeader = (id: string) => {
    if (id === selectedId) return;
    if (selectedId && selectedPrograms.size > 0) {
      setPendingLeaderId(id);
      return;
    }
    setSelectedId(id);
  };

  // ตัวเลือกในกล่องเตือน §11
  const reviewWithNew = () => { if (pendingLeaderId) setSelectedId(pendingLeaderId); setPendingLeaderId(null); }; // คงรายการไว้ตรวจกับคนใหม่
  const clearAndSwitch = () => { if (pendingLeaderId) setSelectedId(pendingLeaderId); setSelectedPrograms(new Set()); setNote(''); setPendingLeaderId(null); };
  const cancelSwitch = () => setPendingLeaderId(null); // ยกเลิกการเปลี่ยน — คงคนเดิม + รายการเดิม

  return (
    <>
      <PageHeader
        title="การจัดสเก็ต"
        description="เลือกหัวหน้าทัวร์ → ตรวจความพร้อม → เลือกโปรแกรมทัวร์ → ยืนยันการจัดงาน"
        actions={
          <SegmentedControl
            label="มุมมองการจัดสเก็ต"
            value="leader"
            onChange={(v) => {
              if (v === 'program') router.push('/jobs/programs');
            }}
            options={[
              { value: 'leader', label: 'จัดตามหัวหน้าทัวร์' },
              { value: 'program', label: 'ดูตามโปรแกรมทัวร์' },
            ]}
          />
        }
      />

      {/* Quick Actions (§12) — ตัวช่วยกรองเท่านั้น ไม่มอบหมายเอง */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium zego-text-tertiary">ทางลัด:</span>
        <QuickBtn active={quickFilter === 'freeThisMonth'} onClick={() => setQuickFilter((q) => (q === 'freeThisMonth' ? null : 'freeThisMonth'))}>คนว่างเดือนนี้</QuickBtn>
        <QuickBtn active={quickFilter === 'noJobs'} onClick={() => setQuickFilter((q) => (q === 'noJobs' ? null : 'noJobs'))}>คนที่ยังไม่มีงาน</QuickBtn>
        <QuickBtn active={quickFilter === 'lowLoad'} onClick={() => setQuickFilter((q) => (q === 'lowLoad' ? null : 'lowLoad'))}>ภาระงานน้อย</QuickBtn>
        <QuickBtn active={focusUnassigned} onClick={() => setFocusUnassigned((v) => !v)}>โปรแกรมที่ยังไม่มีหัวหน้าทัวร์</QuickBtn>
      </div>

      <div
        className={cx(
          'grid gap-4',
          leftCollapsed
            ? 'lg:grid-cols-[3rem_minmax(0,1fr)_minmax(320px,400px)]'
            : 'lg:grid-cols-[minmax(290px,320px)_minmax(0,1fr)_minmax(320px,400px)]',
          PANEL_H,
        )}
      >
        {/* ---------- ซ้าย: เลือกหัวหน้าทัวร์ (§10 ย่อได้) ---------- */}
        {leftCollapsed ? (
          <section className={cx(CARD, 'hidden items-center gap-3 py-3 lg:flex lg:h-full lg:flex-col')}>
            <button
              type="button"
              onClick={() => setLeftCollapsed(false)}
              aria-label="ขยายแผงเลือกหัวหน้าทัวร์"
              className="zego-icon-btn zego-hover-surface rounded-lg p-1.5"
            >
              <Icon name="chevronRight" className="h-5 w-5" />
            </button>
            <span className="text-xs font-medium zego-text-tertiary [writing-mode:vertical-rl]">หัวหน้าทัวร์</span>
            {leader && <Avatar initials={leader.avatarInitials} color={leader.avatarColor} src={leader.photoUrl} alt={`รูปของ ${leader.firstName}`} />}
          </section>
        ) : (
          <section className={cx(CARD, 'relative h-[62vh] lg:h-full')}>
            <button
              type="button"
              onClick={() => setLeftCollapsed(true)}
              aria-label="ย่อแผงเลือกหัวหน้าทัวร์"
              className="absolute right-2 top-2 z-10 hidden rounded-lg p-1 zego-icon-btn zego-hover-surface lg:block"
            >
              <Icon name="chevronLeft" className="h-4 w-4" />
            </button>
            <LeaderSelectPanel
              leaders={leaders}
              jobs={jobs}
              appointments={appointments}
              records={availabilityRecords}
              countries={countries}
              today={today}
              monthCursor={monthCursor}
              onMonthChange={setMonthCursor}
              selectedId={selectedId}
              onSelect={handleSelectLeader}
              quickFilter={quickFilter}
            />
          </section>
        )}

        {/* ---------- กลาง: สรุป + ปฏิทิน ---------- */}
        <section className={cx(CARD, 'lg:h-full')}>
          {leader ? (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              <CompactLeaderHeader leader={leader} jobs={jobs} appointments={appointments} records={availabilityRecords} countries={countries} today={today} monthCursor={monthCursor} />
              <LeaderScheduleCalendar
                leaderId={leader.id}
                jobs={jobs}
                records={availabilityRecords}
                today={today}
                cursor={monthCursor}
                onCursorChange={setMonthCursor}
                onSelectJob={(job) => setEditJob(job)}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState icon="users" title="กรุณาเลือกหัวหน้าทัวร์เพื่อดูตารางงานและเลือกโปรแกรมทัวร์" description="เลือกชื่อจากรายการด้านซ้าย — ระบบจะแสดงปฏิทิน งานเดิม วันลา และสถานะทันที" />
            </div>
          )}
        </section>

        {/* ---------- ขวา: เลือกโปรแกรมทัวร์ ---------- */}
        <section className={cx(CARD, 'lg:h-full')}>
          {leader ? (
            <ProgramAssignPanel
              leader={leader}
              monthCursor={monthCursor}
              focusOnlyUnassigned={focusUnassigned}
              selected={selectedPrograms}
              onSelectedChange={setSelectedPrograms}
              note={note}
              onNoteChange={setNote}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <EmptyState icon="briefcase" title="ยังเลือกโปรแกรมไม่ได้" description="กรุณาเลือกหัวหน้าทัวร์ก่อน จึงจะเลือกโปรแกรมทัวร์เพื่อมอบหมายได้" />
            </div>
          )}
        </section>
      </div>

      {/* §10 แก้ไขงานที่จัดแล้ว (คลิกจากปฏิทิน) */}
      <ScheduleEditModal open={editJob !== null} onClose={() => setEditJob(null)} job={editJob} />

      {/* §11 เปลี่ยนหัวหน้าทัวร์ขณะมีโปรแกรมค้าง — ถามก่อนเสมอ ห้ามล้างเงียบ ๆ */}
      <Modal
        open={pendingLeaderId !== null}
        onClose={cancelSwitch}
        size="sm"
        title="เปลี่ยนหัวหน้าทัวร์?"
        description={leader && pendingLeader ? `จาก ${leader.firstName} ${leader.lastName} → ${pendingLeader.firstName} ${pendingLeader.lastName}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={cancelSwitch}>ยกเลิกการเปลี่ยนหัวหน้าทัวร์</Button>
            <Button variant="secondary" onClick={clearAndSwitch}>ล้างรายการที่เลือก</Button>
            <Button variant="primary" onClick={reviewWithNew}>ตรวจสอบกับคนใหม่</Button>
          </>
        }
      >
        <p className="text-sm leading-relaxed zego-text-secondary">
          คุณเลือกโปรแกรมทัวร์ไว้ <strong className="zego-text">{selectedPrograms.size}</strong> รายการ
          ต้องการนำโปรแกรมทัวร์ที่เลือกไว้ไปตรวจสอบกับหัวหน้าทัวร์คนใหม่หรือไม่
        </p>
      </Modal>
    </>
  );
}

function QuickBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
        active ? 'zego-selected-fill' : 'zego-surface-bg zego-text-secondary zego-border-color zego-hover-surface',
      )}
    >
      {children}
    </button>
  );
}

/* --------------------- Compact Profile Header หัวหน้าทัวร์ --------------------- */

function CompactLeaderHeader({ leader, jobs, appointments, records, countries, today, monthCursor }: { leader: TourLeader; jobs: TourJob[]; appointments: ReturnType<typeof useDemo>['appointments']; records: ReturnType<typeof useDemo>['availabilityRecords']; countries: ReturnType<typeof useDemo>['countries']; today: string; monthCursor: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const monthKey = monthCursor.slice(0, 7);
  const monthLabelShort = `${['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'][Number(monthKey.slice(5)) - 1]} ${Number(monthKey.slice(0, 4)) + 543}`;

  const info = useMemo(() => {
    const mine = jobs.filter((j) => j.leaderId === leader.id && isBlockingJob(j));
    const monthJobs = mine.filter((j) => j.departDate.slice(0, 7) === monthKey);
    const run = scheduleRunSummary(mine);
    const avail = UNAVAILABLE_LEADER_STATUSES.has(leader.status)
      ? { text: 'ไม่พร้อมรับงาน', free: false }
      : monthFreeInfo(leaderUnavailability(leader.id, jobs, appointments, records), startOfMonth(monthCursor), endOfMonth(monthCursor), today);
    // §8 ช่วงวันที่ของสถานะ (ถ้ามี) — แสดงเป็น tooltip
    const win = leaderUnavailability(leader.id, jobs, appointments, records)
      .filter((w) => w.blocksAssignment && w.start <= endOfMonth(monthCursor) && w.end >= startOfMonth(monthCursor) && w.eventType !== 'TOUR_ASSIGNMENT')
      .sort((a, b) => a.start.localeCompare(b.start))[0];
    return { monthJobs, consecutiveDays: run.consecutiveDays, availText: avail.text, statusRange: win ? formatDateRange(win.start, win.end) : null };
  }, [jobs, appointments, records, leader.id, leader.status, monthKey, monthCursor, today]);

  const lang = orderedLanguages(leader)[0];
  const country = expertCountries(leader, countries)[0];
  const statusMeta = LEADER_STATUS[leader.status];
  const statusTitle = info.statusRange ? `${statusMeta.label} ${info.statusRange}` : statusMeta.label;

  return (
    <div ref={ref} className="relative flex items-center gap-3 rounded-xl zego-surface-soft-bg p-3">
      <Avatar initials={leader.avatarInitials} color={leader.avatarColor} src={leader.photoUrl} alt={`รูปของ ${leader.firstName}`} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-base font-semibold leading-tight zego-text">{leader.firstName} {leader.lastName}</p>
        <p className="truncate text-xs zego-text-tertiary">
          {leader.id}
          {info.monthJobs.length > 0 && <span title={`${monthLabelShort} มี ${info.monthJobs.length} งาน`}> · {monthLabelShort} · {info.monthJobs.length} งาน</span>}
        </p>
      </div>
      <span title={statusTitle} className="shrink-0">
        <StatusBadge meta={statusMeta} size="sm" />
      </span>
      <button
        type="button"
        aria-label="ดูรายละเอียดหัวหน้าทัวร์"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx('shrink-0 rounded-lg border p-1.5 transition-colors', open ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-surface-bg zego-icon-btn zego-hover-surface')}
      >
        <Icon name="more" className="h-4 w-4" />
      </button>

      {/* §4/§7 รายละเอียดเพิ่มเติม — Popover (Desktop) / Bottom Sheet (Mobile) ไม่ใช่ Modal ใหญ่ */}
      {open && (
        <>
          <div className="fixed inset-0 z-30 zego-scrim sm:hidden" onClick={() => setOpen(false)} aria-hidden="true" />
          <div role="dialog" aria-label="รายละเอียดหัวหน้าทัวร์" className="fixed inset-x-0 bottom-0 z-40 max-h-[80vh] space-y-2.5 overflow-y-auto rounded-t-2xl border zego-border-color zego-surface-bg p-4 text-sm shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-2 sm:top-full sm:mt-1 sm:w-80 sm:rounded-xl">
            <div className="flex items-center justify-between">
              <p className="font-semibold zego-text">{leader.firstName} {leader.lastName}</p>
              <StatusBadge meta={statusMeta} size="sm" />
            </div>
            <dl className="grid grid-cols-1 gap-y-1.5">
              <DetailRow label="ภาษา" value={lang ? orderedLanguages(leader).map((l) => l.languageName).join(', ') : '—'} />
              <DetailRow label="ความเชี่ยวชาญ" value={country ? expertCountries(leader, countries).map((c) => c.label).slice(0, 4).join(', ') : '—'} />
              <DetailRow label={`งานในเดือน ${monthLabelShort}`} value={`${info.monthJobs.length} งาน`} />
              <DetailRow label="ทำงานต่อเนื่องสูงสุด" value={`${info.consecutiveDays} วัน`} />
              <DetailRow label="ความว่าง" value={info.availText} />
              <DetailRow label="เบอร์โทร" value={leaderPhone(leader)} />
              {leader.generalNote && <DetailRow label="หมายเหตุ" value={leader.generalNote} />}
            </dl>
            {info.monthJobs.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold zego-text-tertiary">งานในเดือนนี้</p>
                <ul className="space-y-1">
                  {info.monthJobs.slice(0, 5).map((j) => (
                    <li key={j.id} className="truncate rounded zego-surface-soft-bg px-2 py-1 text-xs zego-text-secondary">
                      <span className="font-mono zego-text-tertiary">{j.id}</span> {j.title} · {formatDateRange(j.departDate, j.returnDate)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-xs zego-text-tertiary">{label}</dt>
      <dd className="min-w-0 text-right text-xs font-medium zego-text-secondary">{value}</dd>
    </div>
  );
}
