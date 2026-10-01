'use client';

/**
 * Drawer "เพิ่มโปรแกรมให้หัวหน้าทัวร์" — เลือกงานที่ยังไม่มีหัวหน้าทัวร์ทีละหลายรายการ
 *
 * ตรวจ "ช่วงเวลาที่หัวหน้าทัวร์รับงานไม่ได้" จากปฏิทินกลาง (leaderUnavailability):
 * งานทัวร์ที่จองตัว · นัดหมายที่ปิดช่วงรับงาน · สถานะพักการใช้งาน/ไม่ใช้งาน · ระยะพักขั้นต่ำ
 * แบ่ง 3 สถานะ: พร้อมมอบหมาย / ต้องตรวจสอบ / ไม่ว่าง — และตรวจซ้ำอีกครั้งก่อนบันทึก
 *
 * มอบหมายด้วย assignLeader(jobId, leaderId) — ข้อมูลชุดเดียวกับหน้ารายละเอียดงาน (ไม่ซ้ำซ้อน)
 */

import { useMemo, useState } from 'react';
import { Drawer, Modal } from '@/components/ui/Modal';
import { Button, cx, StatusBadge } from '@/components/ui/Primitives';
import { SearchBox, SelectInput, TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { JOB_STATUS, LEADER_STATUS } from '@/lib/labels';
import { diffDays, formatDateRange } from '@/lib/format';
import { jobsOverlap } from '@/lib/logic/conflicts';
import {
  assignableJobsFrom,
  backdatedAssignmentError,
  UNAVAILABLE_LEADER_STATUSES,
} from '@/lib/logic/leaderJobs';
import {
  checkProgramAvailability,
  DEFAULT_AVAILABILITY_OPTIONS,
  leaderUnavailability,
  type AvailabilityResult,
} from '@/lib/logic/leaderAvailability';
import type { TourJob, TourLeader } from '@/types';

const VERDICT_TAG: Record<AvailabilityResult['verdict'], { label: string; className: string }> = {
  ok: { label: 'พร้อมมอบหมาย', className: 'zego-badge--success' },
  warn: { label: 'ควรตรวจสอบ', className: 'zego-badge--warning' },
  blocked: { label: 'ไม่สามารถมอบหมาย', className: 'zego-badge--danger' },
};

export function AddProgramsDrawer({
  open,
  onClose,
  leader,
}: {
  open: boolean;
  onClose: () => void;
  leader: TourLeader | null;
}) {
  if (!open || !leader) return null;
  return <AddProgramsBody key={leader.id} onClose={onClose} leader={leader} />;
}

function AddProgramsBody({ onClose, leader }: { onClose: () => void; leader: TourLeader }) {
  const { jobs, appointments, availabilityRecords, countries, today, assignLeader, saving, pushToast } =
    useDemo();

  const [query, setQuery] = useState('');
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState('');
  const [country, setCountry] = useState('all');
  const [status, setStatus] = useState('all');
  const [onlyAssignable, setOnlyAssignable] = useState(true); // §6 ค่าเริ่มต้น: แสดงเฉพาะที่มอบหมายได้
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // §8 หน้าต่างยืนยันสำหรับโปรแกรมระดับ "ควรตรวจสอบ"
  const [confirm, setConfirm] = useState<{ ids: string[]; warnLines: string[] } | null>(null);
  const [confirmChecked, setConfirmChecked] = useState(false);

  // §9 พักการใช้งาน / ไม่ใช้งาน → มอบหมายงานใหม่ไม่ได้ทั้งหมด (สถานะติดงานไม่บล็อกทั้งหมด — ตรวจตามวัน)
  const leaderBlocked = UNAVAILABLE_LEADER_STATUSES.has(leader.status);
  const options = DEFAULT_AVAILABILITY_OPTIONS;

  // §3 เฉพาะงานที่ยังไม่มีหัวหน้าทัวร์ และออกเดินทางวันนี้/อนาคต
  const candidates = useMemo(() => assignableJobsFrom(jobs, today), [jobs, today]);

  // §12 ปฏิทินช่วงไม่ว่างของหัวหน้าทัวร์ (แหล่งข้อมูลกลาง จาก jobs + appointments)
  const windows = useMemo(
    () => leaderUnavailability(leader.id, jobs, appointments, availabilityRecords),
    [leader.id, jobs, appointments, availabilityRecords],
  );

  // ตรวจพื้นฐานต่อรายการ (ไม่ขึ้นกับ selection)
  const baseChecks = useMemo(() => {
    const map = new Map<string, AvailabilityResult>();
    for (const job of candidates) {
      map.set(
        job.id,
        leaderBlocked
          ? {
              verdict: 'blocked',
              reason: `ไม่ว่าง — หัวหน้าทัวร์อยู่ในสถานะ “${LEADER_STATUS[leader.status].label}”`,
              detail: 'ต้องเปลี่ยนสถานะกลับมาใช้งานก่อนจึงจะมอบหมายงานใหม่ได้',
            }
          : checkProgramAvailability(job, windows, options),
      );
    }
    return map;
  }, [candidates, leaderBlocked, leader.status, windows, options]);

  const candidateById = useMemo(() => {
    const m = new Map<string, TourJob>();
    for (const job of candidates) m.set(job.id, job);
    return m;
  }, [candidates]);

  // ผลตรวจที่รวมการทับกับ "งานที่เลือกด้วยกันเอง" แล้ว (§7)
  const effectiveCheck = (job: TourJob): AvailabilityResult => {
    const base = baseChecks.get(job.id) ?? { verdict: 'ok' as const };
    if (base.verdict === 'blocked') return base;
    for (const sid of selected) {
      if (sid === job.id) continue;
      const other = candidateById.get(sid);
      if (other && jobsOverlap(job, other)) {
        return {
          verdict: 'blocked',
          reason: 'ไม่ว่าง — ทับกับโปรแกรมที่เลือกไว้',
          detail: `ทับกับโปรแกรมที่เลือกไว้ ${sid}`,
        };
      }
    }
    return base;
  };

  const statusOptions = useMemo(() => {
    const set = new Set(candidates.map((j) => j.status));
    return [...set].map((s) => ({ value: s, label: JOB_STATUS[s].label }));
  }, [candidates]);

  // ตัวกรอง ค้นหา/วันที่/ประเทศ/สถานะ
  const searchFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return candidates.filter((job) => {
      if (country !== 'all' && job.country !== country) return false;
      if (status !== 'all' && job.status !== status) return false;
      if (fromDate && job.departDate < fromDate) return false;
      if (toDate && job.departDate > toDate) return false;
      if (!q) return true;
      return [job.id, job.title, job.customer, job.country, job.route]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [candidates, query, country, status, fromDate, toDate]);

  const blockedCount = useMemo(
    () => searchFiltered.filter((j) => baseChecks.get(j.id)?.verdict === 'blocked').length,
    [searchFiltered, baseChecks],
  );

  // §6 filter "แสดงเฉพาะที่มอบหมายได้" ซ่อนเฉพาะรายการที่ "ไม่ว่าง" ตามตาราง (base blocked)
  const visible = useMemo(
    () =>
      onlyAssignable
        ? searchFiltered.filter((j) => baseChecks.get(j.id)?.verdict !== 'blocked')
        : searchFiltered,
    [searchFiltered, onlyAssignable, baseChecks],
  );

  const toggle = (job: TourJob) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(job.id)) next.delete(job.id);
      else if (effectiveCheck(job).verdict !== 'blocked') next.add(job.id);
      return next;
    });
  };

  const clearFilters = () => {
    setQuery('');
    setFromDate(today);
    setToDate('');
    setCountry('all');
    setStatus('all');
  };
  const hasFilter =
    query.trim() !== '' || fromDate !== today || toDate !== '' || country !== 'all' || status !== 'all';

  const handleFromChange = (val: string) => {
    const next = !val || val < today ? today : val;
    setFromDate(next);
    if (toDate && toDate < next) {
      setToDate('');
      pushToast('info', 'ปรับช่วงวันที่', 'ล้างวันสิ้นสุดแล้ว กรุณาเลือกใหม่ให้ไม่ก่อนวันเริ่มต้น');
    }
  };
  const handleToChange = (val: string) => {
    const floor = fromDate || today;
    if (val && val < floor) {
      setToDate('');
      return;
    }
    setToDate(val);
  };

  const doAssign = async (ids: string[], droppedCount: number) => {
    for (const id of ids) {
      await assignLeader(id, leader.id, 'เพิ่มโปรแกรมจากมุมมองดูตามหัวหน้าทัวร์');
    }
    pushToast(
      'success',
      `เพิ่ม ${ids.length} โปรแกรมให้ ${leader.firstName} ${leader.lastName}`,
      droppedCount > 0
        ? `ข้าม ${droppedCount} โปรแกรมที่ติดช่วงเวลาทับซ้อน`
        : 'สถานะเริ่มต้น: รอการตอบรับ',
    );
    onClose();
  };

  // §11/§12 ตรวจซ้ำจากข้อมูลล่าสุดก่อนบันทึก (ชั้นหน้าจอ) — service ตรวจซ้ำอีกชั้นใน assignLeader
  const submit = () => {
    const freshWindows = leaderUnavailability(leader.id, jobs, appointments, availabilityRecords);
    const chosen = [...selected];
    const accepted: string[] = [];
    const rejected: string[] = [];
    const warnLines: string[] = [];

    for (const id of chosen) {
      const job = candidateById.get(id);
      if (!job) continue;
      let reason: string | null = null;
      if (leaderBlocked) reason = `สถานะ “${LEADER_STATUS[leader.status].label}”`;
      else if (backdatedAssignmentError(job, today)) reason = 'เริ่มเดินทางไปแล้ว';
      else {
        const check = checkProgramAvailability(job, freshWindows, options);
        if (check.verdict === 'blocked') reason = check.detail ?? check.reason ?? 'ช่วงเวลาทับซ้อน';
        else if (accepted.some((aid) => jobsOverlap(job, candidateById.get(aid)!))) {
          reason = 'ทับกับโปรแกรมอื่นที่เลือก';
        } else if (check.verdict === 'warn') {
          warnLines.push(`${id} ${job.title} — ${check.reason}${check.detail ? ` · ${check.detail}` : ''}`);
        }
      }
      if (reason) rejected.push(`${id}: ${reason}`);
      else accepted.push(id);
    }

    if (accepted.length === 0) {
      pushToast(
        'error',
        'ไม่สามารถมอบหมายโปรแกรมได้',
        rejected.length
          ? `เนื่องจากช่วงเวลาของโปรแกรมทับซ้อนกับช่วงที่หัวหน้าทัวร์ไม่พร้อมรับงาน — ${rejected.join(' · ')}`
          : 'ไม่มีโปรแกรมที่เลือกได้',
      );
      return;
    }

    // §8 มีโปรแกรมระดับ "ควรตรวจสอบ" → ต้องให้ผู้จัดยืนยันก่อน
    if (warnLines.length > 0) {
      setConfirmChecked(false);
      setConfirm({ ids: accepted, warnLines });
      return;
    }

    void doAssign(accepted, rejected.length);
  };

  const calendarHref = `/calendar?leader=${leader.id}`;

  return (
    <>
    <Drawer
      open
      onClose={onClose}
      title={`เพิ่มโปรแกรมให้ ${leader.firstName} ${leader.lastName}`}
      description={`${leader.nickname ? `${leader.nickname} · ` : ''}${leader.id} · เลือกได้หลายโปรแกรมพร้อมกัน`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-3">
          <span className="text-sm font-medium zego-text-secondary">
            เลือกแล้ว {selected.size} โปรแกรม
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button
              variant="primary"
              icon="plus"
              onClick={submit}
              loading={saving}
              disabled={selected.size === 0}
            >
              เพิ่มโปรแกรมที่เลือก
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {leaderBlocked && (
          <div className="flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm zego-badge--danger">
            <Icon name="warning" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              หัวหน้าทัวร์อยู่ในสถานะ “{LEADER_STATUS[leader.status].label}” — ยังมอบหมายงานใหม่ไม่ได้
              จนกว่าจะเปลี่ยนสถานะกลับมาใช้งาน
            </span>
          </div>
        )}

        {/* ตัวกรอง */}
        <div className="grid gap-3 sm:grid-cols-2">
          <SearchBox
            className="sm:col-span-2"
            value={query}
            onChange={setQuery}
            placeholder="ค้นหารหัสงาน ชื่อโปรแกรม หรือประเทศ"
            label="ค้นหาโปรแกรม"
          />
          <TextInput
            label="เดินทางตั้งแต่"
            type="date"
            min={today}
            value={fromDate}
            onChange={(e) => handleFromChange(e.target.value)}
            hint="ตั้งแต่วันปัจจุบันเป็นต้นไป (มอบหมายย้อนหลังไม่ได้)"
          />
          <TextInput
            label="ถึงวันที่"
            type="date"
            min={fromDate || today}
            value={toDate}
            onChange={(e) => handleToChange(e.target.value)}
            hint="เว้นว่างได้ = ไม่จำกัดวันสิ้นสุด"
          />
          <SelectInput
            label="ประเทศ"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            options={[
              { value: 'all', label: 'ทุกประเทศ' },
              ...countries.filter((c) => c.isActive).map((c) => ({ value: c.nameTh, label: c.nameTh })),
            ]}
          />
          <SelectInput
            label="สถานะงาน"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[{ value: 'all', label: 'ทุกสถานะ' }, ...statusOptions]}
          />
        </div>

        {/* แถวควบคุม: filter แสดงเฉพาะที่มอบหมายได้ + ดูปฏิทิน */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm zego-text-secondary">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue-600"
              checked={onlyAssignable}
              onChange={(e) => setOnlyAssignable(e.target.checked)}
            />
            แสดงเฉพาะโปรแกรมที่สามารถมอบหมายได้
            {blockedCount > 0 && (
              <span className="text-xs zego-text-tertiary">(ติดเงื่อนไข {blockedCount})</span>
            )}
          </label>
          <a
            href={calendarHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium zego-badge--info"
          >
            <Icon name="calendar" className="h-3.5 w-3.5" />
            ดูปฏิทินหัวหน้าทัวร์
          </a>
        </div>

        <div className="flex items-center justify-between">
          <p className="text-xs zego-text-tertiary">
            แสดง {visible.length} รายการ · งานที่ยังไม่มีหัวหน้าทัวร์ {candidates.length}
          </p>
          {hasFilter && (
            <button
              type="button"
              onClick={clearFilters}
              className="text-xs font-medium zego-text-info hover:underline"
            >
              ล้างตัวกรอง
            </button>
          )}
        </div>

        {/* รายการโปรแกรม */}
        {visible.length === 0 ? (
          <EmptyPrograms
            noCandidates={candidates.length === 0}
            hiddenBlocked={onlyAssignable && blockedCount > 0}
            onShowBlocked={() => setOnlyAssignable(false)}
            onClose={onClose}
            calendarHref={calendarHref}
          />
        ) : (
          <ul className="space-y-2">
            {visible.map((job) => (
              <ProgramCandidate
                key={job.id}
                job={job}
                check={effectiveCheck(job)}
                selected={selected.has(job.id)}
                onToggle={() => toggle(job)}
              />
            ))}
          </ul>
        )}
      </div>
    </Drawer>

    {/* §8 หน้าต่างยืนยันโปรแกรมระดับ "ควรตรวจสอบ" */}
    <Modal
      open={confirm !== null}
      onClose={() => setConfirm(null)}
      size="md"
      title="ยืนยันการมอบหมาย (มีรายการที่ควรตรวจสอบ)"
      description={`${leader.firstName} ${leader.lastName} · ${leader.id}`}
      footer={
        <>
          <Button variant="secondary" onClick={() => setConfirm(null)} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            icon="check"
            loading={saving}
            disabled={!confirmChecked}
            onClick={() => {
              if (!confirm) return;
              const dropped = selected.size - confirm.ids.length;
              const ids = confirm.ids;
              setConfirm(null);
              void doAssign(ids, dropped);
            }}
          >
            ยืนยันการมอบหมาย
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm zego-text-secondary">
          โปรแกรมต่อไปนี้อยู่ในวันเดียวกับช่วงไม่พร้อมของหัวหน้าทัวร์ แต่เวลาไม่ทับซ้อนกัน
          โปรดตรวจสอบก่อนยืนยัน:
        </p>
        <ul className="space-y-2">
          {confirm?.warnLines.map((line) => (
            <li
              key={line}
              className="rounded-lg border px-3 py-2 text-xs zego-badge--warning"
            >
              {line}
            </li>
          ))}
        </ul>
        <label className="flex cursor-pointer items-start gap-2 rounded-lg border zego-border-color p-3 text-sm zego-text-secondary">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 accent-blue-600"
            checked={confirmChecked}
            onChange={(e) => setConfirmChecked(e.target.checked)}
          />
          ผู้จัดตรวจสอบช่วงเวลาแล้วและยืนยันว่าหัวหน้าทัวร์สามารถรับงานได้
        </label>
      </div>
    </Modal>
    </>
  );
}

/* ------------------------------ การ์ดโปรแกรม ------------------------------ */

function ProgramCandidate({
  job,
  check,
  selected,
  onToggle,
}: {
  job: TourJob;
  check: AvailabilityResult;
  selected: boolean;
  onToggle: () => void;
}) {
  const disabled = check.verdict === 'blocked' && !selected;
  const days = diffDays(job.departDate, job.returnDate) + 1;
  const tag = VERDICT_TAG[check.verdict];

  return (
    <li>
      <label
        className={cx(
          'flex items-start gap-3 rounded-xl border p-3 transition-colors',
          disabled
            ? 'cursor-not-allowed zego-border-color zego-surface-soft-bg opacity-60'
            : selected
              ? 'cursor-pointer zego-badge--info'
              : 'cursor-pointer zego-border-color zego-hover-surface',
        )}
      >
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-blue-600"
          checked={selected}
          disabled={disabled}
          onChange={onToggle}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono text-xs zego-text-tertiary">{job.id}</span>
            <StatusBadge meta={JOB_STATUS[job.status]} size="sm" />
            <span
              className={cx(
                'rounded-md border px-1.5 py-0.5 text-[11px] font-medium',
                tag.className,
              )}
            >
              {tag.label}
            </span>
          </div>
          <p className="mt-0.5 truncate font-medium zego-text">{job.title}</p>
          <p className="text-xs zego-text-tertiary">
            {job.country} · {formatDateRange(job.departDate, job.returnDate)} · {days} วัน
          </p>

          {check.verdict !== 'ok' && (check.reason || check.detail) && (
            <div
              className={cx(
                'mt-1 space-y-0.5 text-xs',
                check.verdict === 'blocked' ? 'zego-text-danger' : 'zego-text-warning',
              )}
            >
              {check.reason && (
                <p className="flex items-start gap-1 font-medium">
                  <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />
                  {check.reason}
                </p>
              )}
              {check.detail && <p className="pl-4">{check.detail}</p>}
              {check.conflictJobId && (
                <a
                  href={`/jobs/${check.conflictJobId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="ml-4 inline-flex items-center gap-1 font-medium zego-text-info hover:underline"
                >
                  <Icon name="eye" className="h-3 w-3" />
                  ดูโปรแกรมที่ทับซ้อน
                </a>
              )}
            </div>
          )}
        </div>
      </label>
    </li>
  );
}

/* ------------------------------ Empty State ------------------------------ */

function EmptyPrograms({
  noCandidates,
  hiddenBlocked,
  onShowBlocked,
  onClose,
  calendarHref,
}: {
  noCandidates: boolean;
  hiddenBlocked: boolean;
  onShowBlocked: () => void;
  onClose: () => void;
  calendarHref: string;
}) {
  return (
    <div className="rounded-lg border border-dashed zego-border-color px-4 py-8 text-center">
      <p className="text-sm zego-text-tertiary">
        {noCandidates
          ? 'ไม่พบโปรแกรมที่สามารถมอบหมายได้ตั้งแต่วันที่ปัจจุบันเป็นต้นไป'
          : 'ไม่มีโปรแกรมที่ตรงกับช่วงเวลาว่างของหัวหน้าทัวร์คนนี้'}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
        {hiddenBlocked && (
          <Button variant="secondary" size="sm" onClick={onShowBlocked}>
            ดูโปรแกรมที่ติดเงื่อนไข
          </Button>
        )}
        <a href={calendarHref} target="_blank" rel="noopener noreferrer">
          <Button variant="secondary" size="sm" icon="calendar">
            ดูปฏิทินหัวหน้าทัวร์
          </Button>
        </a>
        <Button variant="ghost" size="sm" onClick={onClose}>
          เลือกหัวหน้าทัวร์คนอื่น
        </Button>
      </div>
    </div>
  );
}
