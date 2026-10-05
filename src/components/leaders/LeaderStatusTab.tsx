'use client';

/**
 * แท็บ "สถานะการใช้งาน" — จัดการ 2 มิติที่แยกกันชัดเจน (ไม่ใช่วันลา)
 *   • สถานะการใช้งาน (ใช้งาน / ระงับการใช้งาน / สิ้นสุดการใช้งาน) — ปรับที่ปุ่มในหน้านี้
 *   • ความพร้อมรับงานปัจจุบัน (พร้อมรับงาน / ไม่พร้อมรับงาน — คำนวณรวมสถานะประกอบตามช่วงวัน)
 *   • ช่วงไม่พร้อมรับงานเฉพาะวัน–เวลา บันทึกที่ “จัดการความพร้อมและการลา”
 */

import { useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { AVAILABILITY_MENU_TERM, READINESS_TERM, USAGE_STATUS_TERM } from '@/lib/labels';
import { readinessStatus, usageStatus } from '@/lib/logic/availabilityStatus';
import { formatDateTime, toISODate } from '@/lib/format';
import { useLeaderTrips } from '@/lib/useLeaderTrips';
import { Avatar, Button, Card, StatusBadge } from '@/components/ui/Primitives';
import { LeaderUsageModal } from '@/components/leaders/LeaderUsageModal';
import type { TourLeader } from '@/types';

export function LeaderStatusTab({ leader }: { leader: TourLeader }) {
  const { availabilityRecords, currentUser } = useDemo();
  // ความพร้อมคำนวณจากวันจริง + กรุ๊ปที่จัดหัวหน้าทัวร์จริง (ไม่ใช่งานตัวอย่าง / วันจำลองของ Demo)
  const trips = useLeaderTrips();
  const today = toISODate(new Date());
  const isSelf = currentUser.role === 'leader' && currentUser.leaderId === leader.id;
  const canChangeUsage = can(currentUser.role, 'leader.changeStatus') && !isSelf;

  const [usageOpen, setUsageOpen] = useState(false);

  const usage = usageStatus(leader);
  const readiness = readinessStatus(leader, trips, availabilityRecords, today);
  const statusHistory = leader.auditLog.filter(
    (a) => a.category === 'workStatus' || a.category === 'activation',
  );

  const rows = [
    { label: USAGE_STATUS_TERM, value: <StatusBadge meta={usage} size="sm" /> },
    {
      label: `${READINESS_TERM}ปัจจุบัน (คำนวณ)`,
      value: (
        <span className="inline-flex flex-col items-end gap-0.5">
          <span className="inline-flex items-center gap-1.5">
            <StatusBadge meta={{ label: readiness.label, tone: readiness.tone }} size="sm" />
            {readiness.reason && <span className="text-xs zego-text-tertiary">({readiness.reason})</span>}
          </span>
          {/* ช่วงที่ไม่พร้อม — ตั้งแต่เมื่อไรถึงเมื่อไร */}
          {readiness.span && <span className="text-xs font-medium zego-text-secondary">{readiness.span}</span>}
          {readiness.next && <span className="text-xs zego-text-tertiary">{readiness.next}</span>}
        </span>
      ),
    },
    { label: 'วันที่/เวลาเริ่มใช้สถานะ', value: formatDateTime(leader.updatedAt) },
    { label: 'วันที่/เวลาสิ้นสุด (ถ้าชั่วคราว)', value: leader.usageStatus === 'suspended' ? 'ไม่มีกำหนด' : '—' },
    { label: 'เหตุผลล่าสุด', value: statusHistory[0]?.reason || '—' },
    { label: 'ผู้ปรับสถานะ', value: leader.updatedBy || '—' },
    { label: 'วันที่แก้ไขล่าสุด', value: formatDateTime(leader.updatedAt) },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <Avatar initials={leader.avatarInitials} color={leader.avatarColor} src={leader.photoUrl} alt={`รูปของ ${leader.firstName}`} />
            <div className="min-w-0">
              <p className="font-semibold zego-text">
                {leader.firstName} {leader.lastName}
              </p>
              <p className="text-xs zego-text-tertiary">
                {leader.nickname ? `${leader.nickname} · ` : ''}
                {leader.id}
              </p>
            </div>
          </div>
          {canChangeUsage && (
            <Button variant="primary" size="sm" icon="edit" onClick={() => setUsageOpen(true)}>
              ปรับ{USAGE_STATUS_TERM}
            </Button>
          )}
        </div>

        <dl className="mt-4 divide-y divide-[var(--zego-border)] rounded-xl border zego-border-color">
          {rows.map((r) => (
            <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <dt className="zego-text-tertiary">{r.label}</dt>
              <dd className="text-right font-medium zego-text">{r.value}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-3 text-xs leading-relaxed zego-text-tertiary">
          <strong className="zego-text-secondary">{USAGE_STATUS_TERM}</strong> (ใช้งาน / ระงับการใช้งาน /
          สิ้นสุดการใช้งาน) คุมว่านำไปจัดงานได้หรือไม่ — ระงับ/สิ้นสุด จะตั้ง{READINESS_TERM}เป็น
          “ไม่พร้อมรับงาน” ให้อัตโนมัติ ·{' '}
          <strong className="zego-text-secondary">{READINESS_TERM}</strong> (พร้อมรับงาน / ไม่พร้อมรับงาน)
          เป็นอีกมิติ ไม่ใช่การระงับบัญชี · ติดงาน/ลา ระบบคำนวณตามช่วงวันจากงานที่มอบหมายและ
          “{AVAILABILITY_MENU_TERM}” — การบันทึกวันลาไม่เปลี่ยน{USAGE_STATUS_TERM}
        </p>
      </Card>

      <Card>
        <h3 className="mb-3 text-sm font-semibold zego-text">ประวัติการปรับสถานะ</h3>
        {statusHistory.length === 0 ? (
          <p className="py-6 text-center text-sm zego-text-tertiary">ยังไม่มีประวัติการปรับสถานะ</p>
        ) : (
          <ul className="space-y-2">
            {statusHistory.map((a) => (
              <li key={a.id} className="rounded-lg border zego-border-color px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium zego-text-secondary">{a.action}</span>
                  <span className="zego-text-tertiary">{formatDateTime(a.at)}</span>
                </div>
                <p className="mt-0.5 zego-text-tertiary">
                  {a.oldValue ? `${a.oldValue} → ` : ''}
                  {a.newValue} · โดย {a.by}
                  {a.reason ? ` · ${a.reason}` : ''}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <LeaderUsageModal open={usageOpen} onClose={() => setUsageOpen(false)} leader={leader} />
    </div>
  );
}
