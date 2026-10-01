'use client';

/**
 * สถานะ/การลา — /guide/profile/leave — ดูสถานะการใช้งาน + ประวัติการลา และขอลาผ่านมือถือได้
 *
 * ⚠️ เดิมมีฟอร์มขอลาแบบย่อของตัวเองที่ตัดช่วงเวลาออก (ทั้งวันเสมอ) — ไม่มีทางระบุว่าลาแค่บางช่วงเวลา
 * เปลี่ยนมาใช้ AvailabilityFormModal เดียวกับฝั่งผู้จัดตรง ๆ (มีสลับ "ทั้งวัน" ↔ "ระบุเวลาเริ่ม–สิ้นสุด"
 * อยู่แล้ว) แทนการเขียนสลับเวลาเองอีกชุด — ปุ่มจะขึ้น "ส่งคำขอ (รออนุมัติ)" อัตโนมัติเพราะ role หัวหน้าทัวร์
 * ไม่ใช่ผู้จัด (isManager ในฟอร์มเป็น false)
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import {
  AVAILABILITY_APPROVAL, AVAILABILITY_TYPE,
  formatRecordSchedule, recordsForLeader,
} from '@/lib/logic/availabilityStatus';
import { LEADER_USAGE_STATUS } from '@/lib/labels';
import { Button, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { AvailabilityFormModal } from '@/components/leaders/AvailabilityFormModal';
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideLeavePage() {
  const { currentUser, leaders, availabilityRecords } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const [requestOpen, setRequestOpen] = useState(false);

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="สถานะ/การลา" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  const leaveRecords = recordsForLeader(availabilityRecords, leader.id);

  return (
    <div>
      <ProfileBackHeader title="สถานะ/การลา" />
      <Card padded={false}>
        <div className="flex items-center justify-between gap-2 zego-divider-bottom px-4 py-2.5">
          <span className="text-sm zego-text-secondary">สถานะการใช้งาน</span>
          <StatusBadge meta={LEADER_USAGE_STATUS[leader.usageStatus]} size="sm" />
        </div>
        {leaveRecords.length === 0 ? (
          <EmptyState icon="calendar" title="ยังไม่มีรายการลา/ช่วงไม่พร้อม" />
        ) : (
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {leaveRecords.map((r) => (
              <li key={r.id} className="px-4 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium zego-text">{AVAILABILITY_TYPE[r.type].label}</p>
                    <p className="text-xs zego-text-tertiary">{formatRecordSchedule(r)}</p>
                    {r.reason && <p className="mt-0.5 text-xs zego-text-tertiary">{r.reason}</p>}
                  </div>
                  <StatusBadge meta={AVAILABILITY_APPROVAL[r.approval]} size="sm" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Button variant="primary" icon="plus" className="mt-3 w-full" onClick={() => setRequestOpen(true)}>
        ขอลา / แจ้งช่วงไม่พร้อมรับงาน
      </Button>

      <AvailabilityFormModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
        leader={leader}
        record={null}
        currentUserRole={currentUser.role}
        currentUserName={currentUser.name}
      />
    </div>
  );
}
