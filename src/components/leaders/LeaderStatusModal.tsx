'use client';

/**
 * เปลี่ยน "ความพร้อมรับงาน" พร้อมเหตุผล (บันทึกลงหมายเหตุภายใน)
 *
 * มี 2 ตัวเลือกเท่านั้น: พร้อมรับงาน / ไม่พร้อมรับงาน
 *   • “ระงับการใช้งาน / สิ้นสุดการใช้งาน” จัดการที่ Modal “ปรับสถานะการใช้งาน” เท่านั้น
 *   • ไม่พร้อมเฉพาะช่วงวัน–เวลา ให้บันทึกที่ “จัดการความพร้อมและการลา”
 */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, cx, StatusBadge } from '@/components/ui/Primitives';
import { TextArea } from '@/components/ui/FormField';
import { useDemo } from '@/store/DemoStore';
import {
  AVAILABILITY_MENU_TERM,
  LEADER_STATUS,
  LEADER_STATUS_ORDER,
  READINESS_TERM,
  USAGE_STATUS_TERM,
} from '@/lib/labels';
import type { LeaderStatus, TourLeader } from '@/types';

/** เปิดเมื่อ open = true เท่านั้น เพื่อให้ state เริ่มต้นใหม่ทุกครั้ง (ไม่ต้อง reset ผ่าน effect) */
export function LeaderStatusModal({
  open,
  onClose,
  leader,
}: {
  open: boolean;
  onClose: () => void;
  leader: TourLeader | null;
}) {
  if (!open || !leader) return null;
  return <LeaderStatusForm key={leader.id} onClose={onClose} leader={leader} />;
}

function LeaderStatusForm({
  onClose,
  leader,
}: {
  onClose: () => void;
  leader: TourLeader;
}) {
  const { setLeaderStatus, saving } = useDemo();
  const [status, setStatus] = useState<LeaderStatus>(leader.status);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string>();

  const submit = async () => {
    if (status === 'unavailable' && !note.trim()) {
      setError('กรุณาระบุเหตุผลเมื่อตั้งเป็นไม่พร้อมรับงาน');
      return;
    }
    await setLeaderStatus(leader.id, status, note.trim() || undefined);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`เปลี่ยน${READINESS_TERM}`}
      description={`${leader.firstName} ${leader.lastName} (${leader.id})`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            บันทึก{READINESS_TERM}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <fieldset>
          <legend className="mb-2 text-sm font-medium zego-text-secondary">เลือก{READINESS_TERM}ใหม่</legend>
          <div className="space-y-2">
            {LEADER_STATUS_ORDER.map((option) => (
              <label
                key={option}
                className={cx(
                  'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                  status === option
                    ? 'zego-selected-border zego-selected-tint'
                    : 'zego-border-color zego-hover-selected',
                )}
              >
                <input
                  type="radio"
                  name="leader-status"
                  value={option}
                  checked={status === option}
                  onChange={() => {
                    setStatus(option);
                    setError(undefined);
                  }}
                  className="h-4 w-4 accent-[var(--zego-primary-500)]"
                />
                <StatusBadge meta={LEADER_STATUS[option]} size="sm" />
                {leader.status === option && (
                  <span className="ml-auto text-xs zego-text-tertiary">สถานะปัจจุบัน</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <p className="rounded-lg zego-surface-soft-bg px-3 py-2 text-xs zego-text-tertiary">
          ระงับการใช้งาน / สิ้นสุดการใช้งาน ปรับที่ “{USAGE_STATUS_TERM}” · ไม่พร้อมเฉพาะช่วงวัน–เวลา
          บันทึกที่ “{AVAILABILITY_MENU_TERM}”
        </p>

        <TextArea
          label="เหตุผล / บันทึกเพิ่มเติม"
          required={status === 'unavailable'}
          rows={3}
          value={note}
          error={error}
          onChange={(e) => {
            setNote(e.target.value);
            setError(undefined);
          }}
          hint="ข้อความจะถูกต่อท้ายหมายเหตุภายในพร้อมวันที่"
        />
      </div>
    </Modal>
  );
}
