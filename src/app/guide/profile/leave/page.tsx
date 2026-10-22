'use client';

/**
 * สถานะ/การลา — /guide/profile/leave (ต้นแบบ C4)
 *
 *   การ์ดสถานะวันนี้อยู่บนสุด — พร้อมรับงาน / ไม่ว่างวันนี้ (เพราะอะไร ถึงเมื่อไร) · บัญชีถูกระงับก็บอกในการ์ดนี้
 *   ช่วงไม่ว่างถัดไป — ช่วงที่อนุมัติแล้วและปิดรับงาน (คำขอลาของเรา หรือฝ่ายจัดงานบันทึก) เรียงวันเริ่ม
 *   คำขอลา · N — คำขอที่หัวหน้าทัวร์ส่งเอง ทุกสถานะ (อนุมัติ · รออนุมัติ · ไม่อนุมัติ · ยกเลิก)
 *   ปุ่ม "ขอลา" ล่างสุด → หน้าขอลา /guide/profile/leave/new (ต้นแบบ C5 · ตรวจทริปที่ทับกับวันลาก่อนส่ง)
 *
 * ใช้วันที่จริงของเครื่อง เหมือนหน้าอื่นในพอร์ทัล
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { formatDate, toISODate } from '@/lib/format';
import { AVAILABILITY_TYPE, formatRecordSchedule, isActiveOn } from '@/lib/logic/availabilityStatus';
import { leaderLeaveRequests, upcomingUnavailability } from '@/lib/logic/leaveRequest';
import { LEADER_STATUS, LEADER_USAGE_STATUS } from '@/lib/labels';
import { Card, EmptyState, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import type { AvailabilityApproval } from '@/types';
import { ProfileBackHeader } from '../ProfileBackHeader';

/** ป้ายสถานะคำขอ — คำสั้นแบบต้นแบบ · สีตามความหมายเดียวกันทั้งแอป */
const APPROVAL_CHIP: Record<AvailabilityApproval, { label: string; chip: string }> = {
  approved: { label: 'อนุมัติ', chip: 'zego-chip--green' },
  pending: { label: 'รออนุมัติ', chip: 'zego-chip--gold' },
  rejected: { label: 'ไม่อนุมัติ', chip: 'zego-chip--red' },
  cancelled: { label: 'ยกเลิก', chip: 'zego-chip--neutral' },
};

export default function GuideLeavePage() {
  const { currentUser, leaders, availabilityRecords } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="สถานะ/การลา" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  const today = toISODate(new Date());
  const upcoming = upcomingUnavailability(availabilityRecords, leader.id, today);
  const requests = leaderLeaveRequests(availabilityRecords, leader.id);

  // การ์ดสถานะวันนี้ — ช่วงไม่ว่างที่มีผลวันนี้มาก่อน แล้วจึงดูการตั้งค่าความพร้อม
  const blockToday = upcoming.find((r) => isActiveOn(r, today));
  const accountOk = leader.usageStatus === 'active';
  const ready = !blockToday && leader.status === 'available' && accountOk;
  const statusTitle = blockToday ? 'ไม่ว่างวันนี้' : LEADER_STATUS[leader.status]?.label ?? '—';
  const statusSub = blockToday
    ? `${AVAILABILITY_TYPE[blockToday.type].label} · ${formatRecordSchedule(blockToday)}`
    : leader.status === 'available' ? 'วันนี้ไม่มีช่วงไม่ว่าง' : 'ตั้งค่าไว้ว่าไม่พร้อมรับงาน';

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="สถานะ/การลา" />

      <div className="zego-guide-list zego-guide-row zego-guide-row--tall">
        <span className={cx('zego-guide-tile zego-guide-tile--lg', ready ? 'zego-guide-tile--green' : 'zego-guide-tile--gold')}>
          <Icon name={ready ? 'checkCircle' : 'warning'} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="zego-guide-row__title zego-guide-row__title--lg">{statusTitle}</span>
          <span className="zego-guide-row__sub">{statusSub}</span>
          {!accountOk && (
            <span className="zego-guide-row__sub" style={{ color: 'var(--zego-chip-gold-fg)' }}>
              สถานะบัญชี: {LEADER_USAGE_STATUS[leader.usageStatus].label} — กรุณาติดต่อเจ้าหน้าที่
            </span>
          )}
        </span>
      </div>

      <section className="space-y-1.5">
        <h2 className="zego-guide-label">ช่วงไม่ว่างถัดไป</h2>
        {upcoming.length === 0 ? (
          <p className="zego-guide-list px-4 py-3 text-sm zego-text-tertiary">ไม่มีช่วงไม่ว่างที่กำลังจะถึง</p>
        ) : (
          <ul className="zego-guide-list">
            {upcoming.map((r) => {
              const mine = r.createdByRole === 'leader';
              return (
                <li key={r.id} className="zego-guide-row zego-guide-row--tall">
                  <span className={cx('zego-guide-tile', mine ? 'zego-guide-tile--gold' : 'zego-guide-tile--neutral')}>
                    <Icon name="calendar" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="zego-guide-row__title">{formatRecordSchedule(r)}</span>
                    <span className="zego-guide-row__sub">
                      {[mine ? 'คำขอลาที่อนุมัติ' : 'ฝ่ายจัดงานบันทึก', AVAILABILITY_TYPE[r.type].label, r.reason].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-1.5">
        <h2 className="zego-guide-label">
          คำขอลา
          {requests.length > 0 && <span className="font-normal zego-text-tertiary">· {requests.length}</span>}
        </h2>
        {requests.length === 0 ? (
          <p className="zego-guide-list px-4 py-3 text-sm zego-text-tertiary">ยังไม่เคยส่งคำขอลา</p>
        ) : (
          <ul className="zego-guide-list">
            {requests.map((r) => {
              const chip = APPROVAL_CHIP[r.approval];
              return (
                <li key={r.id} className="zego-guide-row zego-guide-row--tall">
                  <span className="min-w-0 flex-1">
                    <span className="zego-guide-row__title">{formatRecordSchedule(r)}</span>
                    <span className="zego-guide-row__sub">
                      {AVAILABILITY_TYPE[r.type].label} · ส่ง {formatDate(r.createdAt.slice(0, 10))}
                    </span>
                  </span>
                  <span className={cx('zego-chip shrink-0', chip.chip)}>{chip.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Link href="/guide/profile/leave/new" className="zego-button zego-button--primary w-full justify-center">
        <Icon name="plus" className="h-4 w-4" />
        ขอลา
      </Link>
    </div>
  );
}
