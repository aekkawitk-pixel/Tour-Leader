'use client';

/**
 * แก้ไข "การจัดสเก็ต" ของทัวร์ (§6/§7)
 *   • ข้อมูลหลักทัวร์ = Read-only (ดึงสดจาก store) — แก้ที่โมดูลทัวร์ต้นทางเท่านั้น
 *   • แก้ได้เฉพาะข้อมูลมอบหมาย: หัวหน้าทัวร์ · เจ้าหน้าที่ส่งกรุ๊ป · จุดนัดหมาย · เวลานัดหมาย · หมายเหตุปฏิบัติงาน
 *   • เลือกเจ้าหน้าที่ส่งกรุ๊ปได้หลายคน + ตรวจงานซ้อนช่วงเดินทางก่อนบันทึก (เหมือนหัวหน้าทัวร์)
 *   • ปุ่ม "ดูข้อมูลต้นทาง" → หน้ารายละเอียดทัวร์ · เตือนเมื่อหัวหน้าทัวร์ที่จัดไว้มีตารางซ้อน
 */

import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { Button, Callout, StatusBadge, cx } from '@/components/ui/Primitives';
import { TextInput, TextArea, SelectInput } from '@/components/ui/FormField';
import { TimeField } from '@/components/ui/TimeInput';
import { Icon } from '@/components/ui/Icon';
import { AssignLeaderModal } from './AssignLeaderModal';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { formatDate, formatDateTime, formatDateRange, diffDays } from '@/lib/format';
import { conflictJobIds, findConflictsForLeader } from '@/lib/logic/conflicts';
import { scheduleStatus, SCHEDULE_STATUS } from '@/lib/logic/scheduling';
import { JOB_STATUS } from '@/lib/labels';
import type { TourJob } from '@/types';

function ReadonlyRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
      <dt className="w-32 shrink-0 zego-text-tertiary">{label}</dt>
      <dd className="min-w-0 flex-1 zego-text-secondary">{value}</dd>
    </div>
  );
}

export function ScheduleEditModal({
  open,
  onClose,
  job,
}: {
  open: boolean;
  onClose: () => void;
  job: TourJob | null;
}) {
  if (!open || !job) return null;
  return <ScheduleEditForm key={job.id} onClose={onClose} jobId={job.id} />;
}

function ScheduleEditForm({ onClose, jobId }: { onClose: () => void; jobId: string }) {
  const router = useRouter();
  const { jobs, leaders, currentUser, saveJob, saving } = useDemo();

  // อ่านทัวร์สดจาก store เสมอ เพื่อสะท้อนผลหลังมอบหมาย/อัปเดตต้นทาง (ไม่คัดลอกเก็บแยก §7)
  const job = jobs.find((j) => j.id === jobId);

  const canUpdate = can(currentUser.role, 'schedule.update');
  const canAssign = can(currentUser.role, 'schedule.assign');

  const [assignOpen, setAssignOpen] = useState(false);
  const [meetingPoint, setMeetingPoint] = useState(job?.meetingPoint ?? '');
  const [meetingTime, setMeetingTime] = useState(job?.meetingDateTime.split('T')[1]?.slice(0, 5) ?? '');
  const [note, setNote] = useState(job?.note ?? '');
  const [assistants, setAssistants] = useState<string[]>(job?.assistantLeaderIds ?? []);
  const [addAssistant, setAddAssistant] = useState('');
  const [confirmConflict, setConfirmConflict] = useState(false);

  const conflicts = useMemo(() => conflictJobIds(jobs), [jobs]);

  // ตรวจงานซ้อนของเจ้าหน้าที่ส่งกรุ๊ปแต่ละคนกับช่วงเดินทางของทัวร์นี้ (เหมือนหัวหน้าทัวร์)
  const assistantConflicts = useMemo(() => {
    const map = new Map<string, TourJob[]>();
    if (!job) return map;
    for (const id of assistants) {
      const clashing = findConflictsForLeader(id, job, jobs);
      if (clashing.length) map.set(id, clashing);
    }
    return map;
  }, [assistants, job, jobs]);

  if (!job) {
    // ทัวร์ถูกลบ/ไม่พบ (เช่น ยกเลิกจากต้นทาง) — ปิดอย่างปลอดภัย
    return (
      <Modal open onClose={onClose} title="ไม่พบทัวร์" size="sm" footer={<Button variant="secondary" onClick={onClose}>ปิด</Button>}>
        <p className="text-sm zego-text-secondary">ทัวร์นี้ไม่อยู่ในระบบแล้ว</p>
      </Modal>
    );
  }

  const mainLeader = leaders.find((l) => l.id === job.leaderId) ?? null;
  const days = diffDays(job.departDate, job.returnDate) + 1;
  const st = scheduleStatus(job);
  const hasConflict = job.leaderId != null && conflicts.has(job.id);

  const assistantOptions = leaders
    .filter((l) => l.active && l.id !== job.leaderId && !assistants.includes(l.id))
    .map((l) => ({ value: l.id, label: `${l.firstName} ${l.lastName}` }));

  const leaderName = (id: string) => {
    const l = leaders.find((x) => x.id === id);
    return l ? `${l.firstName} ${l.lastName}` : id;
  };

  const doSave = async () => {
    const datePart = job.meetingDateTime.split('T')[0] || job.departDate;
    await saveJob({
      ...job, // คงข้อมูลหลักทัวร์เดิมครบ — แก้เฉพาะฟิลด์การจัดสเก็ต
      meetingDateTime: `${datePart}T${meetingTime || '00:00'}`,
      meetingPoint: meetingPoint.trim(),
      note,
      assistantLeaderIds: assistants,
    });
    setConfirmConflict(false);
    onClose();
  };

  // ตรวจงานซ้อนของเจ้าหน้าที่ส่งกรุ๊ปก่อนบันทึก — มีซ้อนให้ยืนยันก่อน (เหมือนหัวหน้าทัวร์)
  const submit = () => {
    if (assistantConflicts.size > 0) {
      setConfirmConflict(true);
      return;
    }
    void doSave();
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={`จัดสเก็ต · ${job.title}`}
        description={`${job.id} · ${formatDateRange(job.departDate, job.returnDate)}`}
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => router.push(`/jobs/${job.id}`)}
              icon="eye"
            >
              ดูข้อมูลต้นทาง
            </Button>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              ปิด
            </Button>
            {canUpdate && (
              <Button variant="primary" onClick={submit} loading={saving}>
                บันทึกการจัดสเก็ต
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge meta={SCHEDULE_STATUS[st]} size="sm" />
            <StatusBadge meta={JOB_STATUS[job.status]} size="sm" />
          </div>

          {hasConflict && (
            <Callout tone="amber" title="ตรวจสอบตารางงานของหัวหน้าทัวร์">
              วันหรือเวลาของทัวร์มีการเปลี่ยนแปลง หรือหัวหน้าทัวร์ที่จัดไว้มีงานซ้อนช่วงเวลานี้
              กรุณาตรวจสอบตารางงานของหัวหน้าทัวร์อีกครั้ง
            </Callout>
          )}

          {/* ข้อมูลทัวร์ (Read-only) — แก้ที่โมดูลทัวร์ต้นทาง (§6) */}
          <fieldset>
            <legend className="mb-2 flex items-center gap-2 text-sm font-semibold zego-text">
              ข้อมูลทัวร์ (จากต้นทาง)
              <span className="rounded zego-surface-soft-bg px-1.5 py-0.5 text-[11px] font-medium zego-text-tertiary">
                แก้ไขไม่ได้
              </span>
            </legend>
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <ReadonlyRow label="รหัสกรุ๊ป" value={<span className="font-mono">{job.id}</span>} />
              <ReadonlyRow label="ชื่อทัวร์" value={job.title} />
              <ReadonlyRow label="ประเทศ" value={job.country} />
              <ReadonlyRow label="เส้นทาง" value={job.route} />
              <ReadonlyRow
                label="วัน–เวลาเดินทาง"
                value={`${formatDateTime(job.meetingDateTime)} – ${formatDate(job.returnDate)}`}
              />
              <ReadonlyRow label="จำนวนวัน" value={`${days} วัน`} />
              <ReadonlyRow
                label="เที่ยวบิน"
                value={`${job.outboundFlight.flightNo} / ${job.inboundFlight.flightNo}`}
              />
              <ReadonlyRow label="จำนวนลูกค้า" value={`${job.paxCount} ท่าน`} />
            </dl>
          </fieldset>

          {/* ข้อมูลการจัดสเก็ต (แก้ไขได้) */}
          <fieldset className="space-y-4 zego-divider-top pt-5">
            <legend className="mb-2 text-sm font-semibold zego-text">ข้อมูลการจัดสเก็ต</legend>

            {/* หัวหน้าทัวร์ */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border zego-border-color zego-surface-soft-bg px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-xs zego-text-tertiary">หัวหน้าทัวร์</p>
                <p className="font-medium zego-text">
                  {mainLeader ? `${mainLeader.firstName} ${mainLeader.lastName}` : 'ยังไม่มีหัวหน้าทัวร์'}
                </p>
              </div>
              {canAssign && (
                <Button variant="secondary" size="sm" icon="users" onClick={() => setAssignOpen(true)}>
                  {mainLeader ? 'เปลี่ยน / ถอดหัวหน้าทัวร์' : 'มอบหมายหัวหน้าทัวร์'}
                </Button>
              )}
            </div>

            {/* เจ้าหน้าที่ส่งกรุ๊ป (เลือกได้หลายคน · เตือนเมื่อติดงานช่วงเดินทาง) */}
            <div>
              <p className="mb-1.5 text-sm font-medium zego-text-secondary">เจ้าหน้าที่ส่งกรุ๊ป</p>
              {assistants.length > 0 && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {assistants.map((id) => {
                    const clash = assistantConflicts.get(id);
                    return (
                      <span
                        key={id}
                        title={clash ? `ติดงานช่วงนี้: ${clash.map((j) => j.id).join(', ')}` : undefined}
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border',
                          clash
                            ? 'zego-badge--danger'
                            : 'zego-badge--info',
                        )}
                      >
                        {clash && <Icon name="warning" className="h-3 w-3 shrink-0" />}
                        {leaderName(id)}
                        {canUpdate && (
                          <button
                            type="button"
                            aria-label={`นำ ${leaderName(id)} ออก`}
                            onClick={() => setAssistants((prev) => prev.filter((x) => x !== id))}
                            className="rounded hover:opacity-70"
                          >
                            <Icon name="close" className="h-3 w-3" />
                          </button>
                        )}
                      </span>
                    );
                  })}
                </div>
              )}
              {canUpdate && assistantOptions.length > 0 && (
                <SelectInput
                  label="เพิ่มเจ้าหน้าที่ส่งกรุ๊ป"
                  value={addAssistant}
                  placeholder="เลือกเจ้าหน้าที่ส่งกรุ๊ป"
                  hint="เลือกได้มากกว่า 1 คน · ระบบจะเตือนหากติดงานช่วงเดินทางก่อนบันทึก"
                  options={assistantOptions}
                  onChange={(e) => {
                    if (e.target.value) {
                      setAssistants((prev) => [...prev, e.target.value]);
                      setAddAssistant('');
                    }
                  }}
                />
              )}
              {assistantConflicts.size > 0 && (
                <div className="mt-2">
                  <Callout tone="amber" title="เจ้าหน้าที่ส่งกรุ๊ปมีงานซ้อนช่วงเดินทาง">
                    {[...assistantConflicts.entries()]
                      .map(([id, js]) => `${leaderName(id)} (${js.map((j) => j.id).join(', ')})`)
                      .join(' · ')}{' '}
                    — ระบบจะให้ยืนยันอีกครั้งก่อนบันทึก
                  </Callout>
                </div>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput
                label="จุดนัดหมาย"
                value={meetingPoint}
                disabled={!canUpdate}
                onChange={(e) => setMeetingPoint(e.target.value)}
              />
              <TimeField
                label="เวลานัดหมาย"
                value={meetingTime}
                onChange={setMeetingTime}
                disabled={!canUpdate}
              />
            </div>

            <TextArea
              label="หมายเหตุสำหรับการปฏิบัติงาน"
              rows={2}
              value={note}
              disabled={!canUpdate}
              onChange={(e) => setNote(e.target.value)}
            />
          </fieldset>
        </div>
      </Modal>

      <AssignLeaderModal open={assignOpen} onClose={() => setAssignOpen(false)} job={job} />

      <ConfirmDialog
        open={confirmConflict}
        onClose={() => setConfirmConflict(false)}
        onConfirm={doSave}
        loading={saving}
        tone="danger"
        title="ยืนยันบันทึกทั้งที่ตารางซ้อน"
        confirmLabel="ยืนยัน บันทึก"
        message={`เจ้าหน้าที่ส่งกรุ๊ปต่อไปนี้มีงานซ้อนช่วงเดินทางของทัวร์นี้: ${[...assistantConflicts.entries()]
          .map(([id, js]) => `${leaderName(id)} (${js.map((j) => j.id).join(', ')})`)
          .join(' · ')} — ต้องการบันทึกต่อหรือไม่?`}
      />
    </>
  );
}
