'use client';

/**
 * ซองที่ฝากคุณนำส่ง — หัวหน้าทัวร์ที่ถูกฝากซองของกรุ๊ปอื่นไปส่ง (ผู้ถือซองระหว่างทาง ไม่ใช่ปลายทาง)
 *
 * ทอดเดียวกับเจ้าหน้าที่ส่งกรุ๊ป: รับซอง (แนบรูป) → ส่งต่อให้หัวหน้าทัวร์ของกรุ๊ปนั้น / ผู้รับคนอื่น /
 * ฝากต่อคนในระบบ / ส่งคืนการเงิน · แยกจากซองของกรุ๊ปตัวเองชัดเจน (การ์ดนี้บอกรหัสกรุ๊ปปลายทางเสมอ)
 * ไม่มีซองที่ฝาก = ไม่แสดงอะไร
 */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { carriedByLeader, type CashEnvelope } from '@/lib/logic/cashEnvelope';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { CarrierEnvelopeCard, useCarrierActions } from '@/components/expenses/CarrierEnvelopeCard';

export function CarrierLeaderSection() {
  const { envelopes, currentUser, leaders } = useDemo();
  const leaderId = ownLeaderScope(currentUser) ?? '';
  const me = leaders.find((l) => l.id === leaderId);
  const myName = me ? `${me.firstName} ${me.lastName}`.trim() : currentUser.name;
  const { leaderOf, relayTargetsFor, receive, passOn, relay, giveBack } = useCarrierActions({ kind: 'leader', id: leaderId, name: myName });

  const mine = envelopes.filter((e) => carriedByLeader(e, leaderId));
  if (mine.length === 0) return null;
  // ซองของกรุ๊ปเดียวกันรวมการ์ดเดียว · เรียงตามวันเดินทางของกรุ๊ปปลายทาง
  const groups = [...mine.reduce((m, e) => m.set(e.periodId, [...(m.get(e.periodId) ?? []), e]), new Map<string, CashEnvelope[]>())]
    .map(([periodId, envs]) => ({ periodId, envs: envs.sort((a, b) => a.no - b.no) }))
    .sort((a, b) => (getTourPeriodById(a.periodId)?.startDate ?? '9').localeCompare(getTourPeriodById(b.periodId)?.startDate ?? '9'));

  return (
    <section className="space-y-2" aria-label="ซองที่ฝากคุณนำส่ง">
      <div className="px-1">
        <p className="text-sm font-semibold zego-text">ซองที่ฝากคุณนำส่ง · {mine.length} ซอง</p>
        <p className="text-xs zego-text-tertiary">ซองของกรุ๊ปอื่น — รับไว้ แล้วนำไปส่งหัวหน้าทัวร์ของกรุ๊ปนั้น</p>
      </div>
      <ul className="space-y-3">
        {groups.map((g) => (
          <CarrierEnvelopeCard
            key={g.periodId}
            envs={g.envs}
            leader={leaderOf(g.periodId)}
            onReceive={receive}
            onPassOn={passOn}
            onReturn={giveBack}
            relayTargets={relayTargetsFor(g.periodId)}
            onRelay={relay}
          />
        ))}
      </ul>
    </section>
  );
}
