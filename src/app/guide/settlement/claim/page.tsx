'use client';

/**
 * เคลียร์ค่าใช้จ่ายรายกรุ๊ป — /guide/settlement/claim
 *
 * ขั้นที่ 1 — เลือกกรุ๊ปที่ "เดินทางเสร็จแล้ว" เท่านั้น (endDate ≤ วันนี้) — เคลียร์ค่าใช้จ่ายก่อนเดินทางยังไม่มีประโยชน์
 * ขั้นที่ 2 — กรอกแบบฟอร์มเบิกเบี้ยเลี้ยง/ค่าใช้จ่ายเต็มรูปแบบ (SettlementClaimForm)
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { formatDateRange, toISODate } from '@/lib/format';
import { Card } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { SettlementBackHeader } from '../SettlementBackHeader';
import { SettlementClaimForm } from './SettlementClaimForm';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

export default function GuideSettlementClaimPage() {
  const { currentUser } = useDemo();
  const leaderId = ownLeaderScope(currentUser);

  const eligibleJobs = useMemo(() => {
    // หมายเหตุ: ใช้วันที่จริงของเครื่อง ไม่ใช้ DEMO_TODAY — ข้อมูลกรุ๊ป (periods.seed.ts) เป็นชุดข้อมูลจริง
    // ที่ยึดปฏิทินจริง (ส.ค.–ต.ค. 2569) คนละชุดกับ DEMO_TODAY ที่ตรึงไว้ที่ 13 ก.ค. 2569 สำหรับข้อมูลจำลองเก่า
    // ถ้าใช้ DEMO_TODAY เทียบ จะไม่มีกรุ๊ปไหนผ่านเงื่อนไข "เดินทางเสร็จแล้ว" ได้เลยแม้แต่กรุ๊ปเดียว
    const realToday = toISODate(new Date());
    const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
    return (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId) : [])
      .map((assignment) => ({ assignment, period: periodById.get(assignment.periodId) }))
      .filter((x): x is { assignment: typeof x.assignment; period: NonNullable<typeof x.period> } => Boolean(x.period))
      // เฉพาะกรุ๊ปที่คอนเฟิร์มแล้วและเดินทางเสร็จแล้ว — เคลียร์ค่าใช้จ่ายก่อนกรุ๊ปเดินทางจริงยังไม่มีประโยชน์
      .filter((x) => x.assignment.assignmentStatus === 'CONFIRMED' && x.period.endDate <= realToday)
      .sort((a, b) => b.period.endDate.localeCompare(a.period.endDate));
  }, [leaderId]);

  const [selectedPeriod, setSelectedPeriod] = useState<TourPeriodMaster | null>(null);

  if (selectedPeriod) {
    return <SettlementClaimForm period={selectedPeriod} onCancel={() => setSelectedPeriod(null)} onSaved={() => setSelectedPeriod(null)} />;
  }

  return (
    <div className="space-y-4">
      <SettlementBackHeader title="เคลียร์ค่าใช้จ่ายรายกรุ๊ป" description="เลือกกรุ๊ปที่เดินทางเสร็จแล้ว เพื่อกรอกแบบฟอร์มเคลียร์ค่าใช้จ่าย" />

      {eligibleJobs.length === 0 ? (
        <Card>
          <p className="zego-border-color rounded-lg border border-dashed px-4 py-6 text-center text-sm zego-text-tertiary">
            ยังไม่มีกรุ๊ปที่เดินทางเสร็จแล้วให้เคลียร์ค่าใช้จ่าย
          </p>
        </Card>
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {eligibleJobs.map((j) => (
              <li key={j.period.internalId}>
                <button
                  type="button"
                  onClick={() => setSelectedPeriod(j.period)}
                  className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left zego-hover-surface"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium zego-text">{j.period.groupCode} · {j.period.displayName}</span>
                    <span className="block text-xs zego-text-tertiary">{j.period.countryName} · {formatDateRange(j.period.startDate, j.period.endDate)}</span>
                  </span>
                  <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
