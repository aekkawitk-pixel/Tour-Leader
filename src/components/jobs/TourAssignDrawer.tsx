'use client';

/**
 * "จัดหัวหน้าทัวร์ลงตารางงาน" (Drawer ขนาดใหญ่ · §1/§2/§5–§10)
 *   • ค่าเริ่มต้น: งานเดินทางภายใน 30 วันข้างหน้า · กรองช่วงวัน/ประเทศ/เส้นทาง/ยังไม่ระบุ/รอจัดใหม่
 *   • ต่อ 1 งาน: แนะนำหัวหน้าทัวร์ที่ผ่านเงื่อนไข (เรียงเหมาะสม) + ตารางเปรียบเทียบ + รายชื่อที่ไม่ผ่าน (เหตุผล)
 *   • เลือก = staged (ยังไม่บันทึก) · มีคำเตือนต้องระบุเหตุผล (Manual Override) · ห้ามเลือกผู้ที่ไม่ผ่านเงื่อนไข
 *   • ตรวจสอบอีกครั้ง (recheck รวม §9) → ยืนยันลงตารางงาน (§10) → บันทึกเฉพาะที่ผ่าน → รอคอนเฟิร์ม + Audit
 * ตรรกะทั้งหมดอยู่ใน service (tourLeaderMatching / scheduleAssignment) — component แสดงผล/รับตัวเลือกเท่านั้น
 */

import { useMemo, useState } from 'react';
import { Drawer } from '@/components/ui/Modal';
import { Button, Callout, EmptyState, StatusBadge, cx } from '@/components/ui/Primitives';
import { SelectInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { addDays, diffDays, formatDateRange, formatTime, relativeDayLabel } from '@/lib/format';
import { rankLeadersForJob, leaderScheduleContext, type MatchingContext, type LeaderEvaluation } from '@/lib/logic/tourLeaderMatching';
import { recheckStaged, type StagedAssignment, type CommitResult } from '@/lib/logic/scheduleAssignment';
import { matchLabel } from '@/lib/logic/matching';
import { scheduleStatus, SCHEDULE_STATUS } from '@/lib/logic/scheduling';
import { expertCountries, orderedLanguages } from '@/lib/logic/leaderProfile';
import { tripOfJob, useDocumentReadiness, type LeaderReadiness } from '@/lib/useDocumentReadiness';
import { DocumentReadinessBadge } from '@/components/jobs/DocumentReadinessBadge';
import type { TourJob, TourLeader } from '@/types';

const OVERRIDE_REASONS = [
  'ลูกค้าระบุบุคคล',
  'ผู้บริหารอนุมัติ',
  'มีประสบการณ์เฉพาะ',
  'ต้องการความต่อเนื่องกับกรุ๊ปเดิม',
  'เหตุผลอื่น',
];

export function TourAssignDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { jobs, leaders, countries, routes, today, appointments, availabilityRecords, commitAssignments, saving } = useDemo();

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(() => addDays(today, 30));
  const [country, setCountry] = useState('all');
  const [route, setRoute] = useState('all');
  const [onlyUnassigned, setOnlyUnassigned] = useState(true);
  const [onlyReassign, setOnlyReassign] = useState(false);

  const [staged, setStaged] = useState<Record<string, StagedAssignment>>({});
  const [showIneligible, setShowIneligible] = useState<Set<string>>(new Set());
  const [recheck, setRecheck] = useState<Record<string, { ok: boolean; reasons: string[] }> | null>(null);
  const [lastCommit, setLastCommit] = useState<CommitResult | null>(null);

  const ctx: MatchingContext = useMemo(
    () => ({ countries, routes, allJobs: jobs, today, appointments, records: availabilityRecords }),
    [countries, routes, jobs, today, appointments, availabilityRecords],
  );

  const routeOptions = useMemo(
    () => Array.from(new Set(jobs.map((j) => j.route).filter(Boolean))).sort((a, b) => a.localeCompare(b, 'th')),
    [jobs],
  );

  const visibleJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.status !== 'closed' && j.status !== 'cancelled')
        .filter((j) => (from ? j.departDate >= from : true))
        .filter((j) => (to ? j.departDate <= to : true))
        .filter((j) => (country === 'all' ? true : j.country === country))
        .filter((j) => (route === 'all' ? true : j.route === route))
        .filter((j) => (onlyUnassigned ? j.leaderId === null : true))
        .filter((j) => (onlyReassign ? j.status === 'rejected' : true))
        .sort((a, b) => a.departDate.localeCompare(b.departDate)),
    [jobs, from, to, country, route, onlyUnassigned, onlyReassign],
  );

  const rankings = useMemo(() => {
    const map = new Map<string, ReturnType<typeof rankLeadersForJob>>();
    for (const job of visibleJobs) map.set(job.id, rankLeadersForJob(job, leaders, ctx));
    return map;
  }, [visibleJobs, leaders, ctx]);

  /* ตรวจความพร้อมเอกสาร — โหลดเอกสารรอบเดียว ใช้ได้ทุกงาน/ทุกแถวในรายการ */
  /**
   * นโยบายตรวจของหน้าจอนี้ — ปิดข้อบังคับบัตรหัวหน้าทัวร์ไว้ก่อน
   * เพราะระบบยังไม่มีข้อมูลบัตรของใครเลย ถ้าเปิดไว้ทุกคนจะขึ้น "ไม่พร้อม" เหมือนกันหมด
   * ซึ่งไม่ได้บอกอะไร และทำให้คนเลิกสนใจคำเตือน — เปิดเมื่อเริ่มบันทึกบัตรเข้าระบบแล้ว
   */
  const checkReadiness = useDocumentReadiness({ tourCardRequired: false });

  const stagedList = Object.values(staged);
  const leadersById = useMemo(() => new Map(leaders.map((l) => [l.id, l])), [leaders]);

  const select = (job: TourJob, evalx: LeaderEvaluation, recommendedIds: string[]) => {
    const hasWarn = evalx.warnings.length > 0;
    const isTop = recommendedIds[0] === evalx.leaderId;
    setStaged((prev) => ({
      ...prev,
      [job.id]: {
        tourJobId: job.id,
        tourLeaderId: evalx.leaderId,
        source: hasWarn ? 'override' : isTop ? 'recommended' : 'manual',
        overrideReason: prev[job.id]?.tourLeaderId === evalx.leaderId ? prev[job.id]?.overrideReason : undefined,
        recommendedLeaderIds: recommendedIds,
      },
    }));
    setRecheck(null);
  };

  const clearSelect = (jobId: string) => {
    setStaged((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
    setRecheck(null);
  };

  const setReason = (jobId: string, reason: string) =>
    setStaged((prev) => (prev[jobId] ? { ...prev, [jobId]: { ...prev[jobId], overrideReason: reason } } : prev));

  /** เลือกตามคำแนะนำอันดับ 1 ให้ทุกงานที่ยังไม่เลือก (เฉพาะที่ไม่มีคำเตือน — §2 ระบบแนะนำ ผู้จัดยืนยันเอง) */
  const autoRecommend = () => {
    setStaged((prev) => {
      const next = { ...prev };
      for (const job of visibleJobs) {
        if (next[job.id]) continue;
        const top = rankings.get(job.id)?.eligible[0];
        if (top && top.warnings.length === 0) {
          next[job.id] = {
            tourJobId: job.id,
            tourLeaderId: top.leaderId,
            source: 'recommended',
            recommendedLeaderIds: rankings.get(job.id)!.eligible.map((e) => e.leaderId),
          };
        }
      }
      return next;
    });
    setRecheck(null);
  };

  const runRecheck = () => {
    const jobsById = new Map(jobs.map((j) => [j.id, j]));
    const items = recheckStaged(stagedList, jobsById, leadersById, ctx);
    const map: Record<string, { ok: boolean; reasons: string[] }> = {};
    for (const it of items) map[it.staged.tourJobId] = { ok: it.ok, reasons: it.blockReasons };
    setRecheck(map);
  };

  const confirm = async () => {
    const result = await commitAssignments(stagedList);
    setLastCommit(result);
    // นำรายการที่บันทึกสำเร็จออกจาก staged, คงเฉพาะที่มีปัญหา
    const passedIds = new Set(result.passed.map((p) => p.staged.tourJobId));
    setStaged((prev) => {
      const next: Record<string, StagedAssignment> = {};
      for (const [id, s] of Object.entries(prev)) if (!passedIds.has(id)) next[id] = s;
      return next;
    });
    setRecheck(null);
  };

  const toggleIneligible = (jobId: string) =>
    setShowIneligible((prev) => {
      const next = new Set(prev);
      if (next.has(jobId)) next.delete(jobId);
      else next.add(jobId);
      return next;
    });

  const needsReason = stagedList.some((s) => s.source === 'override' && !s.overrideReason?.trim());

  return (
    <Drawer
      open={open}
      onClose={onClose}
      size="xl"
      title="จัดหัวหน้าทัวร์ลงตารางงาน"
      description="เลือกงานและมอบหมายหัวหน้าทัวร์จากรายชื่อที่ระบบตรวจความพร้อมแล้ว — ระบบแนะนำเท่านั้น ผู้จัดยืนยันขั้นสุดท้าย"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-xs zego-text-tertiary">เลือกไว้ {stagedList.length} งาน</span>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="ghost" onClick={runRecheck} disabled={saving || stagedList.length === 0}>
              ตรวจสอบอีกครั้ง
            </Button>
            <Button
              variant="primary"
              onClick={confirm}
              loading={saving}
              disabled={stagedList.length === 0 || needsReason}
            >
              ยืนยันลงตารางงาน
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {/* ตัวกรอง */}
        <div className="grid gap-3 rounded-xl border zego-border-color zego-surface-soft-bg p-3 sm:grid-cols-2 lg:grid-cols-4">
          <DateField label="เดินทางตั้งแต่" value={from} onChange={setFrom} />
          <DateField label="ถึงวันที่" value={to} min={from || undefined} onChange={setTo} />
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
          <label className="flex items-center gap-2 text-sm zego-text-secondary">
            <input type="checkbox" checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} className="h-4 w-4" />
            เฉพาะยังไม่ระบุหัวหน้าทัวร์
          </label>
          <label className="flex items-center gap-2 text-sm zego-text-secondary">
            <input type="checkbox" checked={onlyReassign} onChange={(e) => setOnlyReassign(e.target.checked)} className="h-4 w-4" />
            เฉพาะรอจัดใหม่ (ถูกปฏิเสธ)
          </label>
          <div className="flex items-end sm:col-span-2 lg:col-span-2">
            <Button variant="secondary" size="sm" icon="check" onClick={autoRecommend} disabled={visibleJobs.length === 0}>
              เลือกตามคำแนะนำทั้งหมด
            </Button>
          </div>
        </div>

        {lastCommit && (
          <Callout tone={lastCommit.failed.length ? 'amber' : 'green'} title="ผลการยืนยันลงตารางงาน">
            บันทึกสำเร็จ {lastCommit.passed.length} งาน
            {lastCommit.failed.length > 0 && ` · ยังจัดไม่ได้ ${lastCommit.failed.length} งาน (ตรวจสอบเหตุผลด้านล่าง)`}
          </Callout>
        )}

        {/* รายการงาน */}
        {visibleJobs.length === 0 ? (
          <EmptyState icon="calendar" title="ไม่มีงานที่ต้องจัด" description="ปรับช่วงวันหรือตัวกรอง แล้วลองอีกครั้ง — รายการจะแสดงเมื่อมีงานเดินทางในช่วงที่เลือก" />
        ) : (
          <ul className="space-y-3">
            {visibleJobs.map((job) => (
              <JobAssignCard
                key={job.id}
                job={job}
                today={today}
                ranking={rankings.get(job.id)!}
                countries={countries}
                leadersById={leadersById}
                checkReadiness={checkReadiness}
                staged={staged[job.id]}
                recheck={recheck?.[job.id]}
                showIneligible={showIneligible.has(job.id)}
                onToggleIneligible={() => toggleIneligible(job.id)}
                onSelect={(e) => select(job, e, rankings.get(job.id)!.eligible.map((x) => x.leaderId))}
                onClear={() => clearSelect(job.id)}
                onReason={(r) => setReason(job.id, r)}
              />
            ))}
          </ul>
        )}
      </div>
    </Drawer>
  );
}

/* ------------------------------- Card ต่อ 1 งาน ------------------------------- */

function JobAssignCard({
  job,
  today,
  ranking,
  countries,
  leadersById,
  checkReadiness,
  staged,
  recheck,
  showIneligible,
  onToggleIneligible,
  onSelect,
  onClear,
  onReason,
}: {
  job: TourJob;
  today: string;
  ranking: ReturnType<typeof rankLeadersForJob>;
  countries: ReturnType<typeof useDemo>['countries'];
  leadersById: Map<string, TourLeader>;
  checkReadiness: (leaderId: string, trip: ReturnType<typeof tripOfJob>) => LeaderReadiness;
  staged?: StagedAssignment;
  recheck?: { ok: boolean; reasons: string[] };
  showIneligible: boolean;
  onToggleIneligible: () => void;
  onSelect: (e: LeaderEvaluation) => void;
  onClear: () => void;
  onReason: (r: string) => void;
}) {
  const st = scheduleStatus(job);
  const meetTime = job.meetingDateTime.split('T')[1]?.slice(0, 5);
  const top = ranking.eligible.slice(0, 5);
  const selectedEval = staged ? ranking.eligible.find((e) => e.leaderId === staged.tourLeaderId) : undefined;

  return (
    <li className="rounded-xl border zego-border-color">
      <div className="flex flex-wrap items-start justify-between gap-2 zego-divider-bottom p-3">
        <div className="min-w-0">
          <p className="font-medium zego-text">{job.title}</p>
          <p className="text-xs zego-text-tertiary">
            {job.id} · {job.country} · {job.route}
          </p>
          <p className="mt-0.5 text-xs zego-text-tertiary">
            {formatDateRange(job.departDate, job.returnDate)}
            {meetTime ? ` · นัดหมาย ${formatTime(job.meetingDateTime)}` : ''} · {diffDays(job.departDate, job.returnDate) + 1} วัน · {job.paxCount} ท่าน · {relativeDayLabel(job.departDate, today)}
          </p>
        </div>
        <StatusBadge meta={SCHEDULE_STATUS[st]} size="sm" />
      </div>

      {/* รายการที่เลือกไว้ (staged) */}
      {staged && (
        <div className="zego-divider-bottom zego-badge--info p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm zego-text-secondary">
              เลือกไว้: <strong>{leaderName(leadersById, staged.tourLeaderId)}</strong>
              {selectedEval && selectedEval.warnings.length > 0 && (
                <span className="ml-2 inline-flex items-center gap-1 rounded border zego-badge--warning px-1.5 py-0.5 text-[11px] font-medium">
                  <Icon name="warning" className="h-3 w-3" /> มีคำเตือน
                </span>
              )}
            </p>
            <Button variant="ghost" size="sm" onClick={onClear}>
              เอาออก
            </Button>
          </div>
          {selectedEval && selectedEval.warnings.length > 0 && (
            <div className="mt-2">
              <ul className="mb-1.5 space-y-0.5">
                {selectedEval.warnings.map((w) => (
                  <li key={w.code} className="flex items-start gap-1 text-xs zego-text-warning">
                    <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />
                    {w.label}{w.detail ? ` — ${w.detail}` : ''}
                  </li>
                ))}
              </ul>
              <SelectInput
                label="เหตุผลการเลือก (จำเป็นเมื่อมีคำเตือน — §12)"
                value={staged.overrideReason ?? ''}
                placeholder="เลือกเหตุผล"
                error={staged.overrideReason ? undefined : 'กรุณาระบุเหตุผล'}
                options={OVERRIDE_REASONS.map((r) => ({ value: r, label: r }))}
                onChange={(e) => onReason(e.target.value)}
              />
            </div>
          )}
          {recheck && !recheck.ok && (
            <ul className="mt-2 space-y-0.5">
              {recheck.reasons.map((r) => (
                <li key={r} className="flex items-start gap-1 text-xs zego-text-danger">
                  <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          )}
          {recheck && recheck.ok && (
            <p className="mt-2 flex items-center gap-1 text-xs zego-text-success">
              <Icon name="check" className="h-3.5 w-3.5" /> ตรวจแล้วพร้อมบันทึก
            </p>
          )}
        </div>
      )}

      {/* ตารางเปรียบเทียบหัวหน้าทัวร์แนะนำ (§7) */}
      <div className="p-3">
        {top.length === 0 ? (
          <p className="rounded-lg zego-surface-soft-bg px-3 py-4 text-center text-sm zego-text-tertiary">
            ไม่มีหัวหน้าทัวร์ที่ผ่านเงื่อนไขสำหรับงานนี้ — ดู “รายชื่อที่ไม่ผ่านเงื่อนไข” ด้านล่าง
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[54rem] text-xs">
              <thead className="text-left text-[11px] zego-text-tertiary">
                <tr>
                  <th className="px-2 py-1.5">เลือก</th>
                  <th className="px-2 py-1.5">หัวหน้าทัวร์</th>
                  <th className="px-2 py-1.5">ความพร้อม</th>
                  <th className="px-2 py-1.5">เอกสาร</th>
                  <th className="px-2 py-1.5">ประเทศ/เส้นทาง</th>
                  <th className="px-2 py-1.5">ภาษา</th>
                  <th className="px-2 py-1.5 text-center">งานเดือนนี้</th>
                  <th className="px-2 py-1.5">งานก่อนหน้า</th>
                  <th className="px-2 py-1.5">งานถัดไป</th>
                  <th className="px-2 py-1.5">เวลาพัก</th>
                  <th className="px-2 py-1.5">คำเตือน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--zego-border-soft)]">
                {top.map((e) => {
                  const leader = leadersById.get(e.leaderId);
                  if (!leader) return null;
                  return (
                    <LeaderCompareRow
                      key={e.leaderId}
                      job={job}
                      evalx={e}
                      leader={leader}
                      countries={countries}
                      readiness={checkReadiness(e.leaderId, tripOfJob(job, countries))}
                      selected={staged?.tourLeaderId === e.leaderId}
                      onSelect={() => onSelect(e)}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* รายชื่อที่ไม่ผ่านเงื่อนไข (§5) */}
        {ranking.ineligible.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={onToggleIneligible}
              className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-xs font-medium zego-text-tertiary hover:text-[var(--zego-text)]"
            >
              <Icon name="chevronDown" className={cx('h-3 w-3 transition-transform', showIneligible && 'rotate-180')} />
              แสดงรายชื่อที่ไม่ผ่านเงื่อนไข ({ranking.ineligible.length})
            </button>
            {showIneligible && (
              <ul className="mt-1.5 space-y-1.5">
                {ranking.ineligible.map((e) => {
                  const leader = leadersById.get(e.leaderId);
                  return (
                    <li key={e.leaderId} className="rounded-lg border zego-badge--danger px-2.5 py-1.5">
                      <p className="text-xs font-medium zego-text-secondary">{leader ? `${leader.firstName} ${leader.lastName}` : e.leaderId}</p>
                      <ul className="mt-0.5 space-y-0.5">
                        {e.failedRequired.map((f) => (
                          <li key={f.code} className="flex items-start gap-1 text-[11px] zego-text-danger">
                            <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />
                            {f.label}{f.detail ? ` — ${f.detail}` : ''}
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </li>
  );
}

function LeaderCompareRow({
  job,
  evalx,
  leader,
  countries,
  readiness,
  selected,
  onSelect,
}: {
  job: TourJob;
  evalx: LeaderEvaluation;
  leader: TourLeader;
  countries: ReturnType<typeof useDemo>['countries'];
  readiness: LeaderReadiness;
  selected: boolean;
  onSelect: () => void;
}) {
  const { jobs } = useDemo();
  const sc = leaderScheduleContext(leader.id, job, jobs);
  const label = matchLabel(evalx.score);
  const country = expertCountries(leader, countries)[0];
  const lang = orderedLanguages(leader)[0];
  const rest =
    sc.restBeforeDays !== null || sc.restAfterDays !== null
      ? `${sc.restBeforeDays !== null ? `ก่อน ${sc.restBeforeDays}ว.` : ''}${sc.restBeforeDays !== null && sc.restAfterDays !== null ? ' · ' : ''}${sc.restAfterDays !== null ? `หลัง ${sc.restAfterDays}ว.` : ''}`
      : '—';

  return (
    <tr className={cx('align-top', selected && 'zego-badge--info')}>
      <td className="px-2 py-2">
        <input type="radio" name={`sel-${job.id}`} checked={selected} onChange={onSelect} className="h-4 w-4" aria-label={`เลือก ${leader.firstName}`} />
      </td>
      <td className="px-2 py-2">
        <p className="font-medium zego-text">{leader.firstName} {leader.lastName}</p>
        <p className="text-[11px] zego-text-tertiary">{leader.id}</p>
      </td>
      <td className="px-2 py-2">
        <span className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium',
          evalx.warnings.length === 0 ? 'zego-badge--success' : 'zego-badge--warning')}>
          <Icon name={evalx.warnings.length === 0 ? 'check' : 'warning'} className="h-3 w-3" />
          {evalx.warnings.length === 0 ? 'พร้อม' : 'มีคำเตือน'}
        </span>
        <span className="ml-1 tabular-nums zego-text-tertiary">{evalx.scorePct}% · {label.label}</span>
      </td>
      <td className="px-2 py-2">
        <DocumentReadinessBadge readiness={readiness} compact />
      </td>
      <td className="px-2 py-2 zego-text-secondary">{country ? country.label : '—'}</td>
      <td className="px-2 py-2 zego-text-secondary">{lang ? lang.languageName : '—'}</td>
      <td className="px-2 py-2 text-center tabular-nums zego-text-secondary">{sc.monthCount}</td>
      <td className="px-2 py-2 zego-text-tertiary">{sc.prevJob ? sc.prevJob.id : '—'}</td>
      <td className="px-2 py-2 zego-text-tertiary">{sc.nextJob ? sc.nextJob.id : '—'}</td>
      <td className="px-2 py-2 zego-text-tertiary">{rest}</td>
      <td className="px-2 py-2">
        {evalx.warnings.length === 0 ? (
          <span className="zego-text-disabled">—</span>
        ) : (
          <ul className="space-y-0.5">
            {evalx.warnings.map((w) => (
              <li key={w.code} className="text-[11px] zego-text-warning">{w.label}</li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

function leaderName(map: Map<string, TourLeader>, id: string): string {
  const l = map.get(id);
  return l ? `${l.firstName} ${l.lastName}` : id;
}
