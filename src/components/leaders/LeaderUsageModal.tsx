'use client';

/**
 * ปรับสถานะการใช้งานหัวหน้าทัวร์ — ใช้งาน / ระงับการใช้งาน / สิ้นสุดการใช้งาน
 *
 * คุมเฉพาะ "ยังใช้งานในระบบได้หรือไม่" — ไม่ปนกับความพร้อมรับงาน
 *   • ระงับ/สิ้นสุด → ระบบตั้งความพร้อมรับงานเป็น “ไม่พร้อมรับงาน” ให้อัตโนมัติ
 *   • ไม่พร้อมเฉพาะช่วงวัน–เวลา ให้บันทึกที่ “จัดการความพร้อมและการลา” (ไม่มีตัวเลือกที่นี่)
 * ก่อนยืนยัน แสดงโปรแกรมในอนาคตที่อาจได้รับผลกระทบ (ไม่ลบโปรแกรม/ประวัติอัตโนมัติ)
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Modal } from '@/components/ui/Modal';
import { Button, cx, StatusBadge } from '@/components/ui/Primitives';
import { TextArea } from '@/components/ui/FormField';
import { useDemo } from '@/store/DemoStore';
import { saveErrorMessage } from '@/services/browserStorage';
import {
  AVAILABILITY_MENU_TERM,
  JOB_STATUS,
  LEADER_STATUS,
  LEADER_USAGE_STATUS,
  LEADER_USAGE_STATUS_DESC,
  LEADER_USAGE_STATUS_ORDER,
  READINESS_TERM,
  USAGE_STATUS_TERM,
} from '@/lib/labels';
import { formatDateRange } from '@/lib/format';
import { isBlockingJob } from '@/lib/logic/conflicts';
import type { LeaderUsageStatus, TourLeader } from '@/types';

export function LeaderUsageModal({
  open,
  onClose,
  leader,
}: {
  open: boolean;
  onClose: () => void;
  leader: TourLeader;
}) {
  const { jobs, today, setLeaderUsageStatus, saving } = useDemo();

  const [choice, setChoice] = useState<LeaderUsageStatus>(leader.usageStatus);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  const futureJobs = useMemo(
    () =>
      jobs
        .filter((j) => j.leaderId === leader.id && isBlockingJob(j) && j.departDate >= today)
        .sort((a, b) => a.departDate.localeCompare(b.departDate)),
    [jobs, leader.id, today],
  );

  const affects = choice !== 'active';

  const submit = async () => {
    if (affects && !reason.trim()) {
      setError('กรุณาระบุเหตุผล');
      return;
    }
    setError('');

    // ปิด Modal หลังบันทึกสำเร็จเท่านั้น — ล้มเหลวจะคงหน้าต่างไว้พร้อมสาเหตุจริง
    try {
      await setLeaderUsageStatus(leader.id, choice, reason.trim() || undefined);
      onClose();
    } catch (err) {
      setError(saveErrorMessage(err));
    }
  };

  if (!open) return null;

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={`ปรับ${USAGE_STATUS_TERM}`}
      description={`${leader.firstName} ${leader.lastName} · ${leader.id}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button variant={affects ? 'danger' : 'primary'} icon="check" onClick={submit} loading={saving}>
            ยืนยัน
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <fieldset className="space-y-2" data-field="usageStatus">
          {LEADER_USAGE_STATUS_ORDER.map((v) => (
            <label
              key={v}
              className={cx(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                choice === v
                  ? 'zego-selected-border zego-selected-tint'
                  : 'zego-border-color zego-hover-selected',
              )}
            >
              <input
                type="radio"
                name="usage"
                className="mt-0.5 h-4 w-4 accent-[var(--zego-primary-500)]"
                checked={choice === v}
                onChange={() => setChoice(v)}
              />
              <span className="min-w-0">
                <span className="text-sm font-medium zego-text">{LEADER_USAGE_STATUS[v].label}</span>
                <span className="block text-xs zego-text-tertiary">{LEADER_USAGE_STATUS_DESC[v]}</span>
                {leader.usageStatus === v && (
                  <span className="mt-0.5 block text-xs zego-text-tertiary">{USAGE_STATUS_TERM}ปัจจุบัน</span>
                )}
              </span>
            </label>
          ))}
        </fieldset>

        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          ไม่พร้อมรับงานเฉพาะช่วงวัน–เวลา ให้บันทึกที่ “{AVAILABILITY_MENU_TERM}” · เปลี่ยน{READINESS_TERM}
          ถาวรใช้ปุ่ม “เปลี่ยน{READINESS_TERM}”
        </p>

        {affects && (
          <>
            <TextArea label="เหตุผล" required rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
            <p className="rounded-lg border zego-badge--info px-3 py-2 text-xs">
              ระบบจะตั้ง{READINESS_TERM}เป็น “{LEADER_STATUS.unavailable.label}” ให้อัตโนมัติ ·
              ไม่ลบโปรไฟล์ ประวัติงาน คะแนน เอกสาร และประวัติการเปลี่ยนสถานะ
            </p>
          </>
        )}

        {affects && futureJobs.length > 0 && (
          <div className="rounded-lg border zego-badge--warning p-3 text-sm">
            <p className="font-medium zego-text-warning">
              หัวหน้าทัวร์มีโปรแกรมที่มอบหมายในอนาคต {futureJobs.length} รายการ
            </p>
            <ul className="mt-1.5 space-y-1">
              {futureJobs.map((j) => (
                <li key={j.id} className="flex items-center justify-between gap-2 text-xs zego-text-warning">
                  <Link href={`/jobs/${j.id}`} target="_blank" className="truncate hover:underline">
                    {j.id} · {j.title} ({formatDateRange(j.departDate, j.returnDate)})
                  </Link>
                  <StatusBadge meta={JOB_STATUS[j.status]} size="sm" />
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs zego-text-warning">
              โปรแกรมเดิมจะไม่ถูกลบอัตโนมัติ — โปรดตรวจสอบและจัดหัวหน้าทัวร์ใหม่ให้โปรแกรมเหล่านี้
            </p>
          </div>
        )}

        {error && <p className="text-sm font-medium zego-text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
