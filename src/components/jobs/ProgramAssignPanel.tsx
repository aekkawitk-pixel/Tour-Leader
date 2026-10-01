'use client';

/**
 * แผงเลือกโปรแกรมทัวร์ให้หัวหน้าทัวร์ที่เลือก (§4–§9) — โครงสร้าง Program → Period
 *   • โปรแกรมหนึ่งมีได้หลายพีเรียด (จัดกลุ่มด้วย programCode) · เลือกจัดเป็น "รายพีเรียด"
 *   • หัวกลุ่ม = ชื่อโปรแกรม 1 ครั้ง (ไม่ซ้ำทุกพีเรียด) · ใต้กลุ่ม = พีเรียดทั้งหมด
 *   • แต่ละพีเรียด: รหัส · วัน · บัส · สถานะขาย/ที่นั่ง/จอง/คงเหลือ (+ เตือนยอดจองเกิน) · สถานะหัวหน้าทัวร์
 *   • วิเคราะห์ 3 ระดับ + เหตุผล · ตรวจข้ามเดือน · ราคา/การชำระเงินซ่อนใน "ดูรายละเอียด"
 */

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, cx } from '@/components/ui/Primitives';
import { SearchBox, SelectInput, TextArea } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { formatDate, formatDateTime, formatThaiMonthYear, startOfMonth, endOfMonth } from '@/lib/format';
import { jobsOverlap } from '@/lib/logic/conflicts';
import { assignableJobsFrom } from '@/lib/logic/leaderJobs';
import {
  evaluateLeaderForJob,
  assignabilityLevel,
  scheduleRunSummary,
  ASSIGNABILITY,
  type MatchingContext,
  type LeaderEvaluation,
} from '@/lib/logic/tourLeaderMatching';
import {
  groupPeriodsByProgram,
  periodInMonth,
  periodCodeOf,
  periodSeats,
  assignmentStatusOf,
} from '@/lib/logic/tourPrograms';
import type { TourJob, TourLeader } from '@/types';

export function ProgramAssignPanel({
  leader,
  monthCursor,
  focusOnlyUnassigned,
  selected,
  onSelectedChange,
  note,
  onNoteChange,
}: {
  leader: TourLeader;
  monthCursor: string;
  focusOnlyUnassigned?: boolean;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  note: string;
  onNoteChange: (note: string) => void;
}) {
  const { jobs, leaders, appointments, availabilityRecords, countries, routes, today, assignLeader, saving, pushToast } = useDemo();

  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('all');
  const [route, setRoute] = useState('all');
  const [inMonthOnly, setInMonthOnly] = useState(true);
  const [onlyAssignable, setOnlyAssignable] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const monthStart = startOfMonth(monthCursor);
  const monthEnd = endOfMonth(monthCursor);
  const monthLabel = formatThaiMonthYear(monthCursor);

  const ctx: MatchingContext = useMemo(
    () => ({ countries, routes, allJobs: jobs, today, appointments, records: availabilityRecords }),
    [countries, routes, jobs, today, appointments, availabilityRecords],
  );

  // งานที่ยังจัดได้ (unassigned + อนาคต) — ใช้ประเมิน + ระบุพีเรียดที่เลือกได้
  const candidates = useMemo(() => assignableJobsFrom(jobs, today), [jobs, today]);
  const assignableSet = useMemo(() => new Set(candidates.map((j) => j.id)), [candidates]);
  const jobById = useMemo(() => new Map(jobs.map((j) => [j.id, j])), [jobs]);

  const evalById = useMemo(() => {
    const m = new Map<string, LeaderEvaluation>();
    for (const j of candidates) m.set(j.id, evaluateLeaderForJob(leader, j, ctx));
    return m;
  }, [candidates, leader, ctx]);

  const routeOptions = useMemo(
    () => Array.from(new Set(candidates.map((j) => j.route).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th')),
    [candidates],
  );

  const leaderName = (id: string | null): string => {
    if (!id) return 'ยังไม่ระบุ';
    const l = leaders.find((x) => x.id === id);
    return l ? (l.nickname || `${l.firstName} ${l.lastName}`) : id;
  };

  // ตรวจทับซ้อนกับพีเรียดอื่นที่เลือก (§8) → blocked
  const crossBlocked = (job: TourJob): string | null => {
    for (const sid of selected) {
      if (sid === job.id) continue;
      const other = jobById.get(sid);
      if (other && jobsOverlap(job, other)) return periodCodeOf(other);
    }
    return null;
  };

  // พีเรียดที่แสดง = ไม่ draft/closed · ยังไม่จบ · คาบเกี่ยวเดือน (รวมข้ามเดือน) · ผ่านตัวกรอง
  const shownPeriods = useMemo(() => {
    const q = query.trim().toLowerCase();
    const monthScope = inMonthOnly || focusOnlyUnassigned;
    return jobs.filter((j) => {
      if (j.status === 'draft' || j.status === 'closed' || j.status === 'cancelled') return false;
      if (j.returnDate < today) return false; // ตัดพีเรียดที่จบไปแล้ว
      if (monthScope && !periodInMonth(j, monthStart, monthEnd)) return false;
      if (country !== 'all' && j.country !== country) return false;
      if (route !== 'all' && j.route !== route) return false;
      if (onlyAssignable && !(assignableSet.has(j.id) && evalById.get(j.id)?.eligible !== false)) return false;
      if (q) {
        const text = [j.programCode ?? '', periodCodeOf(j), j.title, j.country, j.route].join(' ').toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [jobs, query, country, route, inMonthOnly, focusOnlyUnassigned, onlyAssignable, assignableSet, evalById, monthStart, monthEnd, today]);

  // จัดกลุ่มเป็นโปรแกรม → คงเฉพาะโปรแกรมที่ยังมีพีเรียดรอจัดหัวหน้าทัวร์
  const programs = useMemo(
    () => groupPeriodsByProgram(shownPeriods).filter((g) => g.periods.some((p) => assignableSet.has(p.id))),
    [shownPeriods, assignableSet],
  );

  const toggle = (job: TourJob) => {
    if (!assignableSet.has(job.id)) return;
    const e = evalById.get(job.id);
    if (!e?.eligible || crossBlocked(job)) return;
    const next = new Set(selected);
    if (next.has(job.id)) next.delete(job.id);
    else next.add(job.id);
    onSelectedChange(next);
  };

  const selectedJobs = [...selected].map((id) => jobById.get(id)).filter((j): j is TourJob => !!j);
  const warnSelected = selectedJobs.filter((j) => (evalById.get(j.id)?.warnings.length ?? 0) > 0);

  const existing = jobs.filter((j) => j.leaderId === leader.id && j.status !== 'draft' && j.status !== 'closed' && j.status !== 'cancelled');
  const runSummary = scheduleRunSummary([...existing, ...selectedJobs]);

  const doConfirm = async () => {
    for (const j of selectedJobs) {
      await assignLeader(j.id, leader.id, note.trim() ? `จัดจากหน้าเลือกหัวหน้าทัวร์ · ${note.trim()}` : 'จัดจากหน้าเลือกหัวหน้าทัวร์');
    }
    pushToast('success', 'จัดหัวหน้าทัวร์ลงตารางงานเรียบร้อยแล้ว', `${leader.firstName} ${leader.lastName} · ${selectedJobs.length} พีเรียด`);
    onSelectedChange(new Set());
    onNoteChange('');
    setConfirmOpen(false);
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="shrink-0 space-y-2 zego-divider-bottom p-3">
        <h2 className="text-sm font-semibold zego-text">เลือกโปรแกรมทัวร์</h2>
        <SearchBox value={query} onChange={setQuery} placeholder="รหัสโปรแกรม/พีเรียด ชื่อ หรือประเทศ" label="ค้นหาโปรแกรม" />
        <div className="grid grid-cols-2 gap-2">
          <SelectInput
            label="ประเทศ"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={[{ value: 'all', label: 'ทุกประเทศ' }, ...countries.filter((c) => c.isActive).map((c) => ({ value: c.nameTh, label: c.nameTh }))]}
          />
          <SelectInput
            label="เส้นทาง"
            value={route}
            onChange={(e) => setRoute(e.target.value)}
            options={[{ value: 'all', label: 'ทุกเส้นทาง' }, ...routeOptions.map((r) => ({ value: r, label: r }))]}
          />
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm zego-text-secondary">
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={inMonthOnly} onChange={(e) => setInMonthOnly(e.target.checked)} />
            เฉพาะเดือนจัดสเก็ต
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-blue-600" checked={onlyAssignable} onChange={(e) => setOnlyAssignable(e.target.checked)} />
            เฉพาะที่จัดได้
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {programs.length === 0 ? (
          <p className="rounded-lg border border-dashed zego-border-color px-4 py-8 text-center text-sm zego-text-tertiary">
            {inMonthOnly && !query && country === 'all' && route === 'all'
              ? `ไม่มีโปรแกรมทัวร์ที่รอจัดหัวหน้าทัวร์ในเดือน${monthLabel}`
              : 'ไม่มีโปรแกรมที่ตรงเงื่อนไข — ลองปรับตัวกรองหรือเปลี่ยนเดือน'}
          </p>
        ) : (
          <ul className="space-y-3">
            {programs.map((g) => {
              const pendingCount = g.periods.filter((p) => assignableSet.has(p.id)).length;
              return (
                <li key={g.meta.code} className="rounded-xl border zego-border-color">
                  {/* หัวกลุ่มโปรแกรม (ชื่อครั้งเดียว §3) */}
                  <div className="zego-divider-bottom zego-surface-soft-bg px-3 py-2">
                    <p className="font-mono text-xs zego-text-tertiary">{g.meta.code}</p>
                    <p className="truncate text-sm font-semibold zego-text" title={g.meta.name}>{g.meta.name}</p>
                    <p className="text-xs zego-text-tertiary">{g.meta.country} · {g.meta.days} วัน {g.meta.nights} คืน · <span className="zego-text-warning">{pendingCount} พีเรียดที่รอจัดหัวหน้าทัวร์</span></p>
                  </div>
                  {/* พีเรียด */}
                  <ul className="divide-y divide-[var(--zego-border-soft)]">
                    {g.periods.map((p) => (
                      <PeriodRow
                        key={p.id}
                        period={p}
                        assignable={assignableSet.has(p.id)}
                        evalx={assignableSet.has(p.id) ? evalById.get(p.id) : undefined}
                        crossWith={assignableSet.has(p.id) ? crossBlocked(p) : null}
                        selected={selected.has(p.id)}
                        leaderName={leaderName}
                        monthStart={monthStart}
                        monthEnd={monthEnd}
                        onToggle={() => toggle(p)}
                      />
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* งานที่กำลังจัด + สรุป + ยืนยัน (§8/§9) */}
      <div className="shrink-0 zego-divider-top zego-surface-soft-bg p-3">
        {selectedJobs.length > 0 && (
          <div className="mb-2 max-h-24 space-y-1 overflow-y-auto">
            <p className="text-[11px] font-semibold zego-text-tertiary">พีเรียดที่กำลังจัด</p>
            {selectedJobs.map((j) => (
              <div key={j.id} className="flex items-center justify-between gap-2 rounded zego-surface-bg px-2 py-1 text-xs border zego-border-color">
                <span className="min-w-0 truncate zego-text-secondary"><span className="font-mono zego-text-tertiary">{periodCodeOf(j)}</span> {formatDate(j.departDate)}</span>
                <button type="button" aria-label={`นำ ${periodCodeOf(j)} ออก`} onClick={() => { const n = new Set(selected); n.delete(j.id); onSelectedChange(n); }} className="shrink-0 zego-text-tertiary hover:text-rose-600">
                  <Icon name="close" className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs zego-text-secondary">
          <span>เลือก <strong className="zego-text">{selectedJobs.length}</strong> พีเรียด</span>
          {selectedJobs.length > 0 && <span>ทำงานต่อเนื่องสูงสุด <strong className="zego-text">{runSummary.consecutiveDays}</strong> วัน</span>}
          {warnSelected.length > 0 && (
            <span className="inline-flex items-center gap-1 zego-text-warning"><Icon name="warning" className="h-3 w-3" /> มีคำเตือน {warnSelected.length}</span>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" disabled={selectedJobs.length === 0 || saving} onClick={() => onSelectedChange(new Set())}>
            ยกเลิกการเลือก
          </Button>
          <Button variant="primary" icon="check" disabled={selectedJobs.length === 0 || saving} onClick={() => setConfirmOpen(true)}>
            ยืนยันการจัดหัวหน้าทัวร์
          </Button>
        </div>
      </div>

      {/* หน้าต่างสรุปก่อนยืนยัน (§9) */}
      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        size="md"
        title="ยืนยันการจัดหัวหน้าทัวร์"
        description={`${leader.firstName} ${leader.lastName} · ${leader.id}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmOpen(false)} disabled={saving}>ยกเลิก</Button>
            <Button variant="primary" icon="check" loading={saving} onClick={doConfirm}>ยืนยันการจัดหัวหน้าทัวร์</Button>
          </>
        }
      >
        <div className="space-y-3 text-sm">
          <ul className="space-y-1.5">
            {selectedJobs.map((j) => (
              <li key={j.id} className="rounded-lg border zego-border-color px-3 py-2">
                <p className="font-medium zego-text"><span className="font-mono zego-text-tertiary">{periodCodeOf(j)}</span> · {j.title}</p>
                <p className="text-xs zego-text-tertiary">{j.country} · {formatDateTime(j.meetingDateTime)} – {formatDate(j.returnDate)}{j.bus ? ` · บัส ${j.bus}` : ''}</p>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs zego-text-secondary">
            <span>จำนวนพีเรียด: <strong>{selectedJobs.length}</strong></span>
            <span>วันทำงานต่อเนื่องสูงสุด: <strong>{runSummary.consecutiveDays} วัน</strong></span>
          </div>
          {runSummary.restGaps.length > 0 && (
            <p className="text-xs zego-text-tertiary">ช่วงพักระหว่างงาน: {runSummary.restGaps.map((gg) => `${gg.from}→${gg.to} ${gg.days} วัน`).join(' · ')}</p>
          )}
          {warnSelected.length > 0 && (
            <div className="rounded-lg border zego-badge--warning p-2.5">
              <p className="mb-1 flex items-center gap-1 text-xs font-medium zego-text-warning"><Icon name="warning" className="h-3.5 w-3.5" /> คำเตือน — โปรดตรวจสอบก่อนยืนยัน</p>
              <ul className="space-y-0.5">
                {warnSelected.map((j) => (
                  <li key={j.id} className="text-[11px] zego-text-warning">{periodCodeOf(j)}: {evalById.get(j.id)!.warnings.map((w) => w.label).join(' · ')}</li>
                ))}
              </ul>
            </div>
          )}
          <TextArea label="หมายเหตุจากผู้จัด" rows={2} value={note} onChange={(e) => onNoteChange(e.target.value)} optional />
        </div>
      </Modal>
    </div>
  );
}

/* ------------------------------ พีเรียดเดินทาง ------------------------------ */

const SALE_STYLE: Record<string, string> = {
  SELL: 'zego-badge--success',
  CLOSE: 'zego-badge--slate',
  FULL: 'zego-badge--warning',
};

function PeriodRow({
  period: p,
  assignable,
  evalx,
  crossWith,
  selected,
  leaderName,
  monthStart,
  monthEnd,
  onToggle,
}: {
  period: TourJob;
  assignable: boolean;
  evalx: LeaderEvaluation | undefined;
  crossWith: string | null;
  selected: boolean;
  leaderName: (id: string | null) => string;
  monthStart: string;
  monthEnd: string;
  onToggle: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const seats = periodSeats(p);
  const status = assignmentStatusOf(p);
  const code = periodCodeOf(p);
  // ข้ามเดือน = ช่วงเดินทางเลยขอบเดือนที่ดู (เริ่มก่อน/สิ้นสุดหลัง) แต่ยังคาบเกี่ยวเดือนนี้
  const crossMonth = periodInMonth(p, monthStart, monthEnd) && (p.departDate < monthStart || p.returnDate > monthEnd);

  // ระดับการเลือก (เฉพาะพีเรียดที่จัดได้)
  const level = !assignable ? null : crossWith && !selected ? 'blocked' : evalx ? assignabilityLevel(evalx) : 'blocked';
  const blocked = level === 'blocked';
  const meta = level ? ASSIGNABILITY[level] : null;
  const reasons = evalx?.matchedReasons.slice(0, 2) ?? [];
  const blockDetail = crossWith
    ? `ทับซ้อนกับพีเรียดที่เลือกไว้ ${crossWith}`
    : evalx?.failedRequired.map((f) => (f.detail ? `${f.label} — ${f.detail}` : f.label)).join(' · ') ?? '';

  return (
    <li>
      <label
        className={cx(
          'flex items-start gap-2.5 p-3 transition-colors',
          !assignable ? 'zego-surface-bg'
            : blocked ? 'cursor-not-allowed zego-surface-soft-bg opacity-80'
              : selected ? 'cursor-pointer border zego-badge--info'
                : 'cursor-pointer zego-hover-surface',
        )}
      >
        {assignable ? (
          <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-blue-600" checked={selected} disabled={blocked} onChange={onToggle} />
        ) : (
          <span className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs font-medium zego-text-secondary">{code}</span>
            {p.saleStatus && <span className={cx('rounded border px-1.5 py-0.5 text-[10px] font-medium', SALE_STYLE[p.saleStatus] ?? SALE_STYLE.CLOSE)}>{p.saleStatus}</span>}
            {meta && <span className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', meta.className)}>{meta.label}</span>}
            {crossMonth && <span className="rounded border px-1.5 py-0.5 text-[10px] font-medium zego-badge--indigo">ข้ามเดือน</span>}
          </div>
          <p className="mt-0.5 text-xs zego-text-secondary">
            {formatDate(p.departDate)}–{formatDate(p.returnDate)}{p.bus ? ` · บัส ${p.bus}` : ''}
          </p>
          {/* §ที่นั่ง — SELL · 20 ที่นั่ง · จอง 18 · เหลือ 2 (หรือ เกิน 7) */}
          {seats.total != null && (
            <p className="text-xs zego-text-tertiary">
              {seats.total} ที่นั่ง · จอง {seats.booked}
              {seats.remaining != null && seats.overbook === 0 && ` · เหลือ ${seats.remaining}`}
              {seats.overbook > 0 && <span className="font-medium zego-text-danger"> · เกิน {seats.overbook}</span>}
            </p>
          )}
          {/* ยอดจองเกินที่นั่ง — คำเตือน (§ตัวอย่างพีเรียด) */}
          {seats.overbook > 0 && (
            <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium zego-text-danger">
              <Icon name="warning" className="h-3 w-3" /> ยอดจองเกินที่นั่ง {seats.overbook} ที่
            </p>
          )}
          {/* สถานะหัวหน้าทัวร์ (§5) — แสดงชื่อถ้ามี */}
          <p className="mt-0.5 text-xs zego-text-tertiary">
            หัวหน้าทัวร์: <span className={cx('font-medium', status.key === 'unassigned' ? 'zego-text-secondary' : 'zego-text')}>{status.key === 'assigned' || status.key === 'offered' ? leaderName(p.leaderId) : status.label}</span>
            {status.key === 'offered' && ' (รอคอนเฟิร์ม)'}
          </p>

          {/* เหตุผลบวก / คำเตือน / เหตุผลที่จัดไม่ได้ (เฉพาะพีเรียดที่จัดได้) */}
          {assignable && !blocked && reasons.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
              {reasons.map((r) => (
                <li key={r} className="flex items-center gap-1 text-[11px] zego-text-success"><Icon name="check" className="h-3 w-3" />{r}</li>
              ))}
            </ul>
          )}
          {assignable && !blocked && evalx && evalx.warnings.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {evalx.warnings.map((w) => (
                <li key={w.code} className="flex items-start gap-1 text-[11px] zego-text-warning"><Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />{w.label}{w.detail ? ` — ${w.detail}` : ''}</li>
              ))}
            </ul>
          )}
          {assignable && blocked && blockDetail && (
            <p className="mt-1 flex items-start gap-1 text-[11px] font-medium zego-text-danger">
              <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" /> ไม่สามารถเลือกได้: {blockDetail}
            </p>
          )}

          {/* ดูรายละเอียด (ราคา/การชำระเงิน/ตั๋ว ซ่อนไว้ §ข้อมูลที่ไม่ควรแสดง) */}
          {(p.sellPrice != null || p.ticketDeadline || p.paymentInfo || p.promotionStatus || p.periodRemark) && (
            <button
              type="button"
              onClick={(e) => { e.preventDefault(); setShowDetail((v) => !v); }}
              className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium zego-text-info hover:underline"
            >
              <Icon name={showDetail ? 'chevronDown' : 'chevronRight'} className="h-3 w-3" /> ดูรายละเอียด
            </button>
          )}
          {showDetail && (
            <dl className="mt-1 space-y-0.5 rounded-lg zego-surface-soft-bg border zego-border-color p-2 text-[11px] zego-text-secondary">
              {p.confirmStatus && <DetailLine label="สถานะยืนยัน" value={p.confirmStatus} />}
              {p.sellPrice != null && <DetailLine label="ราคาขาย" value={`${p.sellPrice.toLocaleString('th-TH')} บาท`} />}
              {p.promotionStatus && <DetailLine label="โปรโมชัน" value={p.promotionStatus} />}
              {p.ticketDeadline && <DetailLine label="เส้นตายออกตั๋ว" value={formatDate(p.ticketDeadline)} />}
              {p.paymentInfo && <DetailLine label="การชำระเงิน" value={p.paymentInfo} />}
              {p.periodRemark && <DetailLine label="หมายเหตุ" value={p.periodRemark} />}
            </dl>
          )}
        </div>
      </label>
    </li>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 zego-text-tertiary">{label}</dt>
      <dd className="min-w-0 text-right font-medium zego-text-secondary">{value}</dd>
    </div>
  );
}
