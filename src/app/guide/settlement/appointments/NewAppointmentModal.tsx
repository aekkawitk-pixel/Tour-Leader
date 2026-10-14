'use client';

/**
 * สร้างนัดหมายจากเมนู "นัดหมาย" (พอร์ทัลหัวหน้าทัวร์) — ขั้นที่ 1 เลือกกรุ๊ป แล้วต่อด้วยหน้าต่างนัดเคลียร์เงิน (RequestClearModal)
 * ซึ่งเลือกได้เฉพาะวันเวลาที่ฝ่ายบัญชีว่าง
 *
 * กรุ๊ปที่นัดได้ = คอนเฟิร์มแล้ว · ออกเดินทางแล้ว (จบทริป หรือกำลังเดินทาง) · การเงินยังไม่ปิดเคลียร์ · ยังไม่มีนัดเคลียร์ที่ยังมีผล
 * นัดล่วงหน้าได้เลย — ยังทำไม่ครบ / ยังไม่กลับก็นัดได้ (บอกสิ่งที่ขาด · กำลังเดินทาง = เลือกวันนัดได้หลังวันกลับ)
 * แสดงรายการกรุ๊ปให้เลือกเสมอ แม้มีกรุ๊ปเดียว — หัวหน้าทัวร์ต้องเห็นว่ากำลังนัดกรุ๊ปไหน
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { loadGroupClears } from '@/services/groupClearStore';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { clearReadiness } from '@/lib/logic/clearReadiness';
import { tripEnded, tripStarted } from '@/lib/logic/tripPhase';
import { formatDate, formatDateRange, toISODate } from '@/lib/format';
import { Button, cx, EmptyState } from '@/components/ui/Primitives';
import { Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { RequestClearModal } from '../claim/RequestClearModal';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

type Candidate = { period: TourPeriodMaster; missing: string | null; ongoing: boolean };

/** presetPeriodId = เปิดหน้าต่างนัดของกรุ๊ปนี้เลย (ทำนัดใหม่หลังถูกยกเลิก) · ไม่อยู่ในรายการที่นัดได้ = เปิดรายการให้เลือกตามปกติ */
export function NewAppointmentModal({ onClose, presetPeriodId }: { onClose: () => void; presetPeriodId?: string }) {
  const { currentUser, expenses, envelopes, appointments } = useDemo();
  const leaderId = ownLeaderScope(currentUser);
  const today = toISODate(new Date());
  const clears = loadGroupClears();

  const candidates: Candidate[] = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId && a.assignmentStatus === 'CONFIRMED') : [])
    .map((a) => getTourPeriodById(a.periodId))
    .filter((p): p is TourPeriodMaster => Boolean(p))
    .filter((p) => tripStarted(p, today) && !clears[p.internalId]?.closedAt)
    .filter((p) => !appointments.some((a) => a.leaderId === leaderId && a.kind === 'clear' && a.jobId === p.internalId && a.status !== 'cancelled'))
    // จบทริปแล้วก่อน (กลับล่าสุดก่อน) แล้วค่อยกรุ๊ปที่กำลังเดินทาง
    .sort((a, b) => Number(!tripEnded(a, today)) - Number(!tripEnded(b, today)) || b.endDate.localeCompare(a.endDate))
    .map((period) => {
      const pid = period.internalId;
      const ready = clearReadiness({
        started: true,
        ended: true,
        startText: formatDate(period.startDate),
        endText: formatDate(period.endDate || period.startDate),
        envs: envelopes.filter((e) => e.periodId === pid && e.sealed),
        receipts: expenses.filter((e) => e.jobId === pid && e.category === 'actual' && e.requesterId === leaderId && e.status !== 'cancelled'),
        perDiem: leaderId ? activeLeaderClaim(expenses, pid, leaderId, 'per_diem') : null,
      });
      return { period, missing: ready.ready ? null : ready.detail, ongoing: !tripEnded(period, today) };
    });

  const [picked, setPicked] = useState<Candidate | null>(() => candidates.find((c) => c.period.internalId === presetPeriodId) ?? null);

  if (picked && leaderId) {
    return <RequestClearModal period={picked.period} leaderId={leaderId} missing={picked.missing} onClose={onClose} onBack={() => setPicked(null)} />;
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="สร้างนัดหมาย"
      description="นัดเคลียร์เงินกับบัญชี — เลือกกรุ๊ป"
      footer={<Button variant="secondary" className="w-full" onClick={onClose}>ปิด</Button>}
    >
      {candidates.length === 0 ? (
        <EmptyState
          icon="calendar"
          title="ไม่มีกรุ๊ปที่ต้องนัดเคลียร์เงิน"
          description="นัดได้ตั้งแต่ออกเดินทางแล้ว · กรุ๊ปที่นัดไว้แล้วหรือการเงินปิดเคลียร์แล้วไม่แสดง"
        />
      ) : (
        <ul className="space-y-2">
          {candidates.map((c) => (
            <li key={c.period.internalId}>
              <button
                type="button"
                onClick={() => setPicked(c)}
                className="flex w-full items-center gap-2 rounded-lg border zego-border-color px-3 py-2.5 text-left zego-hover-surface"
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold zego-text">{c.period.groupCode}</span>
                  <span className="block text-xs zego-text-tertiary">
                    {formatDateRange(c.period.startDate, c.period.endDate)}
                    {c.ongoing && <span className="ml-1.5 rounded-full bg-sky-50 px-1.5 py-0.5 text-[11px] font-medium text-sky-700">กำลังเดินทาง · นัดได้หลังกลับ</span>}
                  </span>
                  <span className={cx('block text-xs', c.missing ? 'text-amber-800' : 'text-emerald-700')}>{c.missing ?? 'ครบแล้ว พร้อมนัด'}</span>
                </span>
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
