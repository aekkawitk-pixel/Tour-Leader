'use client';

/**
 * Quick Assign (§8) — กดคอลัมน์ "หัวหน้าทัวร์" ในตาราง /jobs เพื่อจัดหัวหน้าทัวร์เร็ว
 * โดยไม่ต้องเปิดรายละเอียดงาน · แสดงรายชื่อที่ตรวจความพร้อมแล้ว + งานก่อนหน้า/ถัดไป/เดือนนี้/ภาษา/ประเทศ/คำเตือน
 * เลือกแล้ว = staged (ยืนยันก่อนบันทึก) → commitAssignments (สถานะ "รอคอนเฟิร์ม")
 */

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, Callout, EmptyState, cx } from '@/components/ui/Primitives';
import { SelectInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { useDemo } from '@/store/DemoStore';
import { formatDateRange } from '@/lib/format';
import {
  rankLeadersForJob,
  leaderScheduleContext,
  type MatchingContext,
  type LeaderEvaluation,
} from '@/lib/logic/tourLeaderMatching';
import { sortByPreference } from '@/lib/logic/preferredGuideOrder';
import { usePreferredGuideOrder } from '@/lib/usePreferredGuideOrder';
import { useExcludedGuides } from '@/lib/useExcludedGuides';
import { useFavoriteGuides } from '@/lib/useFavoriteGuides';
import { orderedLanguages, expertCountries } from '@/lib/logic/leaderProfile';
import type { TourJob } from '@/types';

const OVERRIDE_REASONS = ['ลูกค้าระบุบุคคล', 'ผู้บริหารอนุมัติ', 'มีประสบการณ์เฉพาะ', 'ต้องการความต่อเนื่องกับกรุ๊ปเดิม', 'เหตุผลอื่น'];

export function QuickAssignPopover({ open, onClose, job }: { open: boolean; onClose: () => void; job: TourJob | null }) {
  if (!open || !job) return null;
  return <QuickAssignForm key={job.id} onClose={onClose} job={job} />;
}

function QuickAssignForm({ onClose, job }: { onClose: () => void; job: TourJob }) {
  const { leaders, countries, routes, jobs, appointments, availabilityRecords, today, commitAssignments, saving } = useDemo();
  const { order: preferredOrder } = usePreferredGuideOrder();
  const { excluded } = useExcludedGuides();
  const { favorited } = useFavoriteGuides();

  const [selected, setSelected] = useState<string | null>(job.leaderId);
  const [reason, setReason] = useState('');
  const [showIneligible, setShowIneligible] = useState(false);

  const ctx: MatchingContext = useMemo(
    () => ({ countries, routes, allJobs: jobs, today, appointments, records: availabilityRecords }),
    [countries, routes, jobs, today, appointments, availabilityRecords],
  );
  const ranking = useMemo(() => rankLeadersForJob(job, leaders, ctx), [job, leaders, ctx]);
  // recommendedIds คงลำดับตามระบบไว้ (ใช้ตัดสินป้าย "แนะนำ/เลือกเอง" ตอนบันทึก) — ไม่ปนกับลำดับที่ผู้ใช้ตั้งเอง
  const recommendedIds = ranking.eligible.map((e) => e.leaderId);
  // รายการที่แสดงบนจอ — ตัดคนที่ผู้ใช้คนนี้ไม่ต้องการออก (ยกเว้นคนที่จัดอยู่แล้วในงานนี้)
  // แล้วเรียงตาม Preferred Guide List ที่ตั้งไว้ ถ้าตั้งไว้
  const displayList = useMemo(() => {
    const filtered = ranking.eligible.filter((e) => !excluded.has(e.leaderId) || e.leaderId === job.leaderId);
    return sortByPreference(filtered, favorited, preferredOrder, (e) => e.leaderId).slice(0, 6);
  }, [ranking.eligible, preferredOrder, excluded, job.leaderId, favorited]);

  const selectedEval = ranking.eligible.find((e) => e.leaderId === selected) ?? null;
  const needsReason = !!selectedEval && selectedEval.warnings.length > 0 && !reason.trim();

  const confirm = async () => {
    if (!selectedEval) return;
    await commitAssignments([
      {
        tourJobId: job.id,
        tourLeaderId: selectedEval.leaderId,
        source: selectedEval.warnings.length > 0 ? 'override' : recommendedIds[0] === selectedEval.leaderId ? 'recommended' : 'manual',
        overrideReason: reason.trim() || undefined,
        recommendedLeaderIds: recommendedIds,
      },
    ]);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="จัดหัวหน้าทัวร์เร็ว"
      description={`${job.id} · ${job.title} · ${formatDateRange(job.departDate, job.returnDate)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={confirm} loading={saving} disabled={!selectedEval || needsReason}>
            ยืนยัน (รอคอนเฟิร์ม)
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {ranking.eligible.length === 0 ? (
          <EmptyState icon="users" title="ไม่มีหัวหน้าทัวร์ที่ผ่านเงื่อนไข" description="ดูรายชื่อที่ไม่ผ่านเงื่อนไขด้านล่างเพื่อดูเหตุผล" />
        ) : (
          <ul className="space-y-2">
            {displayList.map((e) => {
              const leader = leaders.find((l) => l.id === e.leaderId)!;
              const sc = leaderScheduleContext(e.leaderId, job, jobs);
              const lang = orderedLanguages(leader)[0];
              const country = expertCountries(leader, countries)[0];
              const isSel = selected === e.leaderId;
              return (
                <li key={e.leaderId}>
                  <button
                    type="button"
                    onClick={() => { setSelected(e.leaderId); setReason(''); }}
                    aria-pressed={isSel}
                    className={cx(
                      'w-full rounded-xl border p-3 text-left transition-colors',
                      isSel ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-hover-surface',
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium zego-text">{leader.firstName} {leader.lastName}</span>
                      <span className={cx('inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium',
                        e.warnings.length === 0 ? 'zego-badge--success' : 'zego-badge--warning')}>
                        <Icon name={e.warnings.length === 0 ? 'check' : 'warning'} className="h-3 w-3" />
                        {e.warnings.length === 0 ? 'พร้อม' : 'มีคำเตือน'} · {e.scorePct}%
                      </span>
                    </div>
                    <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs zego-text-tertiary">
                      <span>{country ? country.label : 'ไม่ระบุประเทศ'}</span>
                      <span>ภาษา: {lang ? lang.languageName : '—'}</span>
                      <span>งานเดือนนี้ {sc.monthCount}</span>
                      <span>ก่อนหน้า: {sc.prevJob ? sc.prevJob.id : '—'}</span>
                      <span>ถัดไป: {sc.nextJob ? sc.nextJob.id : '—'}</span>
                    </p>
                    {e.warnings.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {e.warnings.map((w) => (
                          <li key={w.code} className="flex items-start gap-1 text-[11px] zego-text-warning">
                            <Icon name="warning" className="mt-0.5 h-3 w-3 shrink-0" />
                            {w.label}{w.detail ? ` — ${w.detail}` : ''}
                          </li>
                        ))}
                      </ul>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedEval && selectedEval.warnings.length > 0 && (
          <SelectInput
            label="เหตุผลการเลือก (จำเป็นเมื่อมีคำเตือน — §12)"
            value={reason}
            placeholder="เลือกเหตุผล"
            error={reason ? undefined : 'กรุณาระบุเหตุผล'}
            options={OVERRIDE_REASONS.map((r) => ({ value: r, label: r }))}
            onChange={(e) => setReason(e.target.value)}
          />
        )}

        {ranking.ineligible.length > 0 && (
          <div>
            <button type="button" onClick={() => setShowIneligible((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium zego-icon-btn">
              <Icon name="chevronDown" className={cx('h-3 w-3 transition-transform', showIneligible && 'rotate-180')} />
              แสดงรายชื่อที่ไม่ผ่านเงื่อนไข ({ranking.ineligible.length})
            </button>
            {showIneligible && (
              <ul className="mt-1.5 space-y-1.5">
                {ranking.ineligible.map((e: LeaderEvaluation) => {
                  const leader = leaders.find((l) => l.id === e.leaderId);
                  return (
                    <li key={e.leaderId} className="zego-warned-tint rounded-lg border zego-warned-border px-2.5 py-1.5">
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

        <Callout tone="blue" title="ระบบแนะนำเท่านั้น">
          เลือกแล้วต้องกดยืนยัน · ระบบจะตรวจวัน–เวลา/งานซ้อน/วันลาอีกครั้งก่อนบันทึก และตั้งสถานะเป็น “รอคอนเฟิร์ม”
        </Callout>
      </div>
    </Modal>
  );
}
