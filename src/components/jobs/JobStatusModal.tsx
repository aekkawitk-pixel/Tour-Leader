'use client';

/** เปลี่ยนสถานะงานทัวร์ตาม workflow ที่กำหนด */

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button, Callout, cx, StatusBadge } from '@/components/ui/Primitives';
import { TextArea } from '@/components/ui/FormField';
import { useDemo } from '@/store/DemoStore';
import { JOB_STATUS } from '@/lib/labels';
import { nextJobStatuses } from '@/lib/logic/workflow';
import type { JobStatus, TourJob } from '@/types';

/** เปิดเมื่อ open = true เท่านั้น เพื่อให้ state เริ่มต้นใหม่ทุกครั้ง (ไม่ต้อง reset ผ่าน effect) */
export function JobStatusModal({
  open,
  onClose,
  job,
}: {
  open: boolean;
  onClose: () => void;
  job: TourJob | null;
}) {
  if (!open || !job) return null;
  return <JobStatusForm key={`${job.id}-${job.status}`} onClose={onClose} job={job} />;
}

function JobStatusForm({ onClose, job }: { onClose: () => void; job: TourJob }) {
  const { changeJobStatus, saving } = useDemo();
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [note, setNote] = useState('');

  const options = nextJobStatuses(job.status);
  const needsLeader = (status === 'offered' || status === 'accepted') && !job.leaderId;

  const submit = async () => {
    if (!status) return;
    await changeJobStatus(job.id, status, note.trim() || undefined);
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="เปลี่ยนสถานะงาน"
      description={`${job.id} · ${job.title}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            ยกเลิก
          </Button>
          <Button
            variant="primary"
            onClick={submit}
            loading={saving}
            disabled={!status || needsLeader}
          >
            บันทึกสถานะ
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-2 rounded-lg zego-surface-soft-bg px-3 py-2.5">
          <span className="text-sm zego-text-tertiary">สถานะปัจจุบัน</span>
          <StatusBadge meta={JOB_STATUS[job.status]} size="sm" />
        </div>

        {options.length === 0 ? (
          <Callout tone="green" title="งานนี้ปิดแล้ว">
            ไม่มีขั้นตอนถัดไปสำหรับสถานะ “{JOB_STATUS[job.status].label}”
          </Callout>
        ) : (
          <fieldset>
            <legend className="mb-2 text-sm font-medium zego-text-secondary">เลือกสถานะถัดไป</legend>
            <div className="space-y-2">
              {options.map((option) => (
                <label
                  key={option}
                  className={cx(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                    status === option
                      ? 'zego-badge--info'
                      : 'zego-border-color zego-hover-surface',
                  )}
                >
                  <input
                    type="radio"
                    name="job-status"
                    checked={status === option}
                    onChange={() => setStatus(option)}
                    className="h-4 w-4 accent-blue-700"
                  />
                  <StatusBadge meta={JOB_STATUS[option]} size="sm" />
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {needsLeader && (
          <Callout tone="red" title="ยังไม่มีหัวหน้าทัวร์">
            ต้องเลือกหัวหน้าทัวร์ก่อนจึงจะเปลี่ยนเป็นสถานะนี้ได้
          </Callout>
        )}

        {status === 'awaiting_settlement' && (
          <Callout tone="blue" title="ระบบจะสร้างรายการรอเคลียร์ให้อัตโนมัติ">
            เมื่อเปลี่ยนเป็น “รอเคลียร์” ระบบจะสร้างรายการเคลียร์เงินกรุ๊ป (จำลอง) พร้อมกำหนดวันเคลียร์
            14 วันหลังวันเดินทางกลับ
          </Callout>
        )}

        {options.length > 0 && (
          <TextArea
            label="หมายเหตุ"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            hint="บันทึกลงในประวัติสถานะ (Timeline)"
          />
        )}
      </div>
    </Modal>
  );
}
