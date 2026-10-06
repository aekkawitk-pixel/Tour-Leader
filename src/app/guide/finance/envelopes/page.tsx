'use client';

/**
 * รับซองเงิน — /guide/finance/envelopes (หัวข้อใต้หัวเรื่อง "จัดการซองเงิน" ของหน้าบัญชี-การเงิน)
 *
 * ที่เดียวที่หัวหน้าทัวร์ยืนยันรับ / ส่งต่อ / แนบรูปซองเงิน — การ์ดเดียวกับหน้ารายละเอียดงาน
 * ซองของกรุ๊ปอื่นที่ฝากคุณนำส่ง (ถ้ามี) อยู่ด้านบน แยกจากซองของกรุ๊ปตัวเอง
 */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { formatDateRange, toISODate } from '@/lib/format';
import { Card } from '@/components/ui/Primitives';
import { GuideEnvelopeCard } from '../../expenses/GuideEnvelopeCard';
import { ExpensesBackHeader } from '../../expenses/ExpensesBackHeader';
import { CarrierLeaderSection } from '../../CarrierLeaderSection';
import { leaderEnvelopeGroups } from '../envelopeGroups';

export default function GuideEnvelopesPage() {
  const { currentUser, envelopes } = useDemo();
  const groups = leaderEnvelopeGroups(envelopes, ownLeaderScope(currentUser), toISODate(new Date()));

  return (
    <div className="space-y-3">
      <ExpensesBackHeader title="รับซองเงิน" description="ยืนยันรับซองที่การเงินส่งมอบ · แนบรูปซองที่ได้รับ · ส่งต่อซอง — ใช้เงินในซองที่หน้าบันทึกใบเสร็จ" backTab="envelopes" />
      <CarrierLeaderSection />
      {groups.length === 0 ? (
        <Card>
          <p className="py-4 text-center text-sm zego-text-tertiary">ยังไม่มีซองเงินที่ส่งมอบถึงคุณ</p>
        </Card>
      ) : (
        groups.map((g) => (
          <GuideEnvelopeCard
            key={g.periodId}
            periodId={g.periodId}
            mode="receive"
            groupLabel={{
              code: g.period?.groupCode ?? g.periodId,
              detail: g.period?.displayName,
              dates: g.period ? formatDateRange(g.period.startDate, g.period.endDate) : undefined,
            }}
          />
        ))
      )}
    </div>
  );
}
