'use client';

/**
 * แท็บ "เบี้ยเลี้ยง" ในหน้าจัดการค่าใช้จ่ายกรุ๊ป — 1 แถว = 1 กรุ๊ป (ทุกกรุ๊ปเหมือนแท็บซองเงิน · ยังไม่มีหัวหน้าทัวร์ก็ขึ้น)
 *
 * เบี้ยเลี้ยงจ่ายหลังจบทริป โอนเข้าบัญชีหัวหน้าทัวร์:
 *   หัวหน้าทัวร์ทำใบเบิก (พอร์ทัล → เบิกเบี้ยเลี้ยง) → การเงินตรวจ/อนุมัติ → บันทึกโอน
 * ใช้ใบเบิกชุดเดียวกับเมนู "ตรวจสอบรายการจ่าย" (ExpenseRequest claimKind 'per_diem') — ไม่สร้างข้อมูลซ้ำ
 * ใบเบิก = "เอกสารค่าใช้จ่ายหัวหน้าทัวร์" (6 หมวดตามแบบฟอร์ม · ยอดแยกสกุลเงิน) — พิมพ์ฟอร์มได้จากแถว
 * ยอดคำนวณ = อัตราเบี้ยเลี้ยงของโปรแกรม (ฝ่ายจัดหัวหน้าทัวร์ตั้ง) × จำนวนวันเดินทาง — เทียบกับข้อ 1 ที่หัวหน้าทัวร์เบิกมา
 */

import { useEffect, useState } from 'react';
import { Button, Card } from '@/components/ui/Primitives';
import { formatCurrency, formatDateRange } from '@/lib/format';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { LEADER_FORM_ITEMS, perDiemRateFor, tripDays, type PerDiemProgramRates } from '@/lib/logic/leaderClaims';
import { loadPerDiemRates } from '@/services/perDiemRateStore';
import { printLeaderExpenseForm } from '@/lib/printLeaderExpenseForm';
import { groupAmountsByCurrency } from '@/app/guide/expenses/expenseAmounts';
import { ExpenseDrawer } from './ExpenseDrawer';
import { StatusPill } from './CashEnvelopeDrawer';
import type { EnvelopeTone } from '@/lib/logic/cashEnvelope';
import type { ExpenseRequest } from '@/types';

export type PerDiemStage = 'no_leader' | 'not_ended' | 'to_claim' | 'draft' | 'submitted' | 'revise' | 'to_pay' | 'paid';

export interface PerDiemRow {
  periodId: string;
  /** หัวหน้าทัวร์ที่คอนเฟิร์มแล้ว — ยังไม่มี = null */
  leader: { id: string; name: string } | null;
  /** ใบเบิกเบี้ยเลี้ยงที่ยังมีผล (ไม่นับใบยกเลิก/ปฏิเสธ) */
  claim: ExpenseRequest | null;
  stage: PerDiemStage;
}

export const PER_DIEM_STAGE: Record<PerDiemStage, { label: string; tone: EnvelopeTone }> = {
  no_leader: { label: 'ยังไม่มีหัวหน้าทัวร์', tone: 'slate' },
  not_ended: { label: 'ยังไม่จบทริป', tone: 'slate' },
  to_claim: { label: 'รอหัวหน้าทัวร์ทำเบิก', tone: 'amber' },
  draft: { label: 'ทำร่างไว้ ยังไม่ส่ง', tone: 'slate' },
  submitted: { label: 'รออนุมัติ', tone: 'violet' },
  revise: { label: 'ส่งกลับแก้ไข', tone: 'amber' },
  to_pay: { label: 'รอโอน', tone: 'blue' },
  paid: { label: 'โอนแล้ว', tone: 'green' },
};

/** ขั้นตอนเบี้ยเลี้ยงของกรุ๊ป — ทำเบิกได้เมื่อจบทริปแล้ว (วันกลับ < วันนี้) */
export function perDiemStage(claim: ExpenseRequest | null, endDate: string | undefined, today: string, hasLeader = true): PerDiemStage {
  if (claim) {
    if (claim.status === 'paid') return 'paid';
    if (claim.status === 'approved' || claim.status === 'awaiting_payment') return 'to_pay';
    if (claim.status === 'revise') return 'revise';
    if (claim.status === 'submitted') return 'submitted';
    // ร่าง = หัวหน้าทัวร์ทำรอไว้ ยังไม่ส่งอนุมัติ (ส่งได้เมื่อจบทริป) — การเงินยังตรวจไม่ได้
    if (claim.status === 'draft') return 'draft';
  }
  /*
    ไม่มีใบเบิก — ดูช่วงทริปก่อน: ยังไม่ถึงวันกลับ = ยังไม่จบทริป (มีหรือไม่มีหัวหน้าทัวร์ก็ตาม)
    วันกลับนับเป็นจบทริป — ตรงกับฝั่งหัวหน้าทัวร์ที่ส่งอนุมัติได้ตั้งแต่วันกลับ
    จบทริปแล้วแต่ยังไม่มีหัวหน้าทัวร์คอนเฟิร์ม = ไม่มีใครทำเบิกได้
  */
  if (endDate && endDate > today) return 'not_ended';
  if (!hasLeader) return 'no_leader';
  return 'to_claim';
}

export function GroupPerDiemCard({ rows, emptyText }: { rows: PerDiemRow[]; emptyText: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [rates, setRates] = useState<PerDiemProgramRates>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    setRates(loadPerDiemRates().byProgram);
  }, []);
  const open = rows.find((r) => r.claim?.id === openId)?.claim ?? null;

  const th = 'px-3 py-2.5 text-xs font-medium zego-text-tertiary';
  return (
    <Card padded={false}>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm zego-text-tertiary">{emptyText}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="zego-surface-soft-bg text-left">
              <tr>
                <th className={th}>ประเทศ</th>
                <th className={th}>รหัสกรุ๊ป</th>
                <th className={th}>ชื่อโปรแกรม</th>
                <th className={th}>วันเดินทางไป-กลับ</th>
                <th className={th}>หัวหน้าทัวร์</th>
                <th className={`${th} text-right`}>ยอดคำนวณ</th>
                <th className={th}>ใบเบิก</th>
                <th className={`${th} text-right`}>ยอดเบิก</th>
                <th className={th}>สถานะ</th>
                <th className={`${th} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--zego-border-soft)]">
              {rows.map(({ periodId, leader, claim, stage }) => {
                const p = getTourPeriodById(periodId);
                const rate = p ? perDiemRateFor(p, rates) : null;
                const days = p ? tripDays(p.startDate, p.endDate) : 0;
                const expected = rate ? rate * days : null;
                // ข้อ 1 ค่าเบี้ยเลี้ยงที่เบิกมาไม่ตรงยอดคำนวณ — ให้การเงินเห็นก่อนอนุมัติ (ใบเก่ามีรายการเดียว = เบี้ยเลี้ยง)
                const live = claim?.lines.filter((l) => !l.rejected) ?? [];
                const perDiemLine = live.find((l) => l.expenseType === LEADER_FORM_ITEMS[0]) ?? (claim?.claimForm ? undefined : live[0]);
                const differs = !!perDiemLine && expected !== null && perDiemLine.amount !== expected;
                const claimTotals = groupAmountsByCurrency(live.map((l) => ({ amount: l.amount, currency: l.currency })));
                const s = PER_DIEM_STAGE[stage];
                const action = stage === 'submitted' ? 'ตรวจ / อนุมัติ' : stage === 'to_pay' ? 'บันทึกโอน' : 'ดูใบเบิก';
                return (
                  <tr key={periodId} className="zego-hover-surface">
                    <td className="px-3 py-2.5 align-top"><p className="whitespace-nowrap zego-text-secondary">{p?.countryName || '—'}</p></td>
                    <td className="px-3 py-2.5 align-top"><p className="whitespace-nowrap font-semibold zego-text">{p?.groupCode ?? periodId}</p></td>
                    <td className="max-w-[18rem] px-3 py-2.5 align-top"><p className="line-clamp-2 zego-text-secondary">{p?.displayName ?? '—'}</p></td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="whitespace-nowrap tabular-nums zego-text">{p ? formatDateRange(p.startDate, p.endDate) : '—'}</p>
                      {p && <p className="text-xs zego-text-tertiary">{days} วัน</p>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {leader ? <p className="whitespace-nowrap zego-text">{leader.name}</p> : <p className="whitespace-nowrap zego-text-tertiary">ยังไม่มีหัวหน้าทัวร์</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">
                      {expected !== null ? (
                        <>
                          <p className="whitespace-nowrap font-semibold zego-text">{formatCurrency(expected, 'THB')}</p>
                          <p className="whitespace-nowrap text-xs zego-text-tertiary">{formatCurrency(rate!, 'THB')} × {days} วัน</p>
                        </>
                      ) : (
                        <p className="whitespace-nowrap text-xs zego-text-tertiary">โปรแกรมนี้ยังไม่ตั้งอัตรา</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {claim ? <p className="whitespace-nowrap zego-text">{claim.id}</p> : <p className="whitespace-nowrap zego-text-tertiary">ยังไม่มีใบเบิก</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">
                      {claim ? (
                        <>
                          {claimTotals.map((t) => <p key={t.currency} className="whitespace-nowrap font-semibold zego-text">{formatCurrency(t.amount, t.currency)}</p>)}
                          {differs && <p className="whitespace-nowrap text-xs zego-text-warning">เบี้ยเลี้ยงไม่ตรงยอดคำนวณ</p>}
                        </>
                      ) : <p className="zego-text-tertiary">—</p>}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <StatusPill label={s.label} tone={s.tone} />
                      {stage === 'paid' && claim?.paidRef && <p className="mt-0.5 whitespace-nowrap text-xs zego-text-tertiary">อ้างอิง {claim.paidRef}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top">
                      <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        size="sm"
                        icon="download"
                        disabled={!claim}
                        title={claim ? 'พิมพ์เอกสารค่าใช้จ่ายหัวหน้าทัวร์' : 'ยังไม่มีใบเบิก'}
                        onClick={() => claim && printLeaderExpenseForm(claim, p)}
                      >
                        พิมพ์
                      </Button>
                      <Button
                        variant={stage === 'submitted' || stage === 'to_pay' ? 'primary' : 'secondary'}
                        size="sm"
                        className="min-w-[6.5rem] justify-center whitespace-nowrap"
                        disabled={!claim || stage === 'draft'}
                        title={stage === 'draft' ? 'หัวหน้าทัวร์ทำร่างไว้ ยังไม่ส่งอนุมัติ' : claim ? undefined : stage === 'not_ended' ? 'ยังไม่จบทริป — หัวหน้าทัวร์ส่งอนุมัติได้หลังกลับจากทริป' : 'หัวหน้าทัวร์ยังไม่ได้ทำใบเบิกเบี้ยเลี้ยง'}
                        onClick={() => claim && setOpenId(claim.id)}
                      >
                        {action}
                      </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {/* ตรวจ / อนุมัติ / ส่งกลับแก้ไข / บันทึกโอน — แผงเดียวกับเมนูตรวจสอบรายการจ่าย */}
      <ExpenseDrawer expense={open} onClose={() => setOpenId(null)} onEdit={() => setOpenId(null)} />
    </Card>
  );
}
