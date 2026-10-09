'use client';

/**
 * ตารางค่าใช้จ่ายกรุ๊ป (หน้า "จัดการค่าใช้จ่ายกรุ๊ป") — 1 แถว = 1 กรุ๊ป · ซองเงินกับเบี้ยเลี้ยงอยู่แถวเดียวกัน
 *
 * การเงินคนเดียวดูแลทั้งสองเรื่องของกรุ๊ป จึงรวมไว้หน้าเดียว:
 *   ซองเงิน   — เอกสารเบิก (นำเข้า .xls) → จัดซอง → ส่งมอบให้เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์รับ (ก่อนเดินทาง)
 *   เบี้ยเลี้ยง — หัวหน้าทัวร์ทำใบเบิก → การเงินตรวจ/อนุมัติ → บันทึกโอน (หลังจบทริป)
 * ตารางแสดงสถานะสั้น ๆ ของทั้งสองเรื่อง · ปุ่ม "จัดการ" เปิดแผงของกรุ๊ป (รายละเอียด + ปุ่มของแต่ละเรื่อง)
 * ปุ่มในแผงเปิดหน้าจอเดิม (จัดซอง / Timeline / ตรวจใบเบิก) — ปิดแล้วกลับมาที่แผงของกรุ๊ปเดิม
 */

import { useEffect, useState } from 'react';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import { useDemo } from '@/store/DemoStore';
import { Button, Card } from '@/components/ui/Primitives';
import { Drawer } from '@/components/ui/Modal';
import { formatCurrency, formatDateRange } from '@/lib/format';
import { getTourPeriodById, periodCodeOf } from '@/services/tourPeriodMaster';
import { advanceDocFallback } from '@/lib/logic/advanceDocFallback';
import {
  envelopeName,
  groupEnvelopeStatus,
  groupLines,
  groupManageable,
  sumAmounts,
  type CashEnvelope,
  type EnvelopeTone,
  type NoEnvelopeMark,
} from '@/lib/logic/cashEnvelope';
import { LEADER_FORM_ITEMS, perDiemRateFor, tripDays, EMPTY_PER_DIEM_RATES, type PerDiemRates } from '@/lib/logic/leaderClaims';
import { loadPerDiemRates } from '@/services/perDiemRateStore';
import { printLeaderExpenseForm } from '@/lib/printLeaderExpenseForm';
import { groupAmountsByCurrency } from '@/app/guide/expenses/expenseAmounts';
import { tripEnded } from '@/lib/logic/tripPhase';
import { GroupEnvelopeDrawer, GroupTimelineDrawer, StatusPill } from './CashEnvelopeDrawer';
import { ExpenseDrawer } from './ExpenseDrawer';
import type { ExpenseRequest } from '@/types';

export interface GroupDocs {
  periodId: string;
  docs: ExpenseRequest[];
}

/* -------------------------------- เบี้ยเลี้ยง -------------------------------- */

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
  if (endDate && !tripEnded({ startDate: endDate, endDate }, today)) return 'not_ended';
  if (!hasLeader) return 'no_leader';
  return 'to_claim';
}

/* ------------------------- สถานะซองเงิน / เบี้ยเลี้ยงของกรุ๊ป ------------------------- */

const groupCodeOf = (periodId: string, docs: ExpenseRequest[]) =>
  getTourPeriodById(periodId)?.groupCode ?? docs[0]?.sourceDoc?.groupCode ?? periodCodeOf(periodId);

function envelopeView({ periodId, docs }: GroupDocs, envelopes: CashEnvelope[], noEnvelopeMarks: NoEnvelopeMark[]) {
  const lines = groupLines(docs);
  const envs = envelopes.filter((e) => e.periodId === periodId);
  const noEnv = noEnvelopeMarks.find((m) => m.periodId === periodId);
  const status = groupEnvelopeStatus(lines, envs, noEnv);
  // ยังไม่มีเอกสารเบิก = รอการทำเบิก — ไม่มียอดเงิน และยังจัดซองไม่ได้ (เว้นแต่ระบุแล้วว่าไม่มีซอง)
  const noDocs = docs.length === 0;
  const code = groupCodeOf(periodId, docs);
  return {
    envs,
    noEnv,
    status,
    noDocs,
    // ยังไม่ได้จัด / จัดไม่ครบ / ยังส่งมอบไม่ครบ / ส่งมอบแล้วแต่ยังไม่มีผู้ตอบรับ / ระบุไม่มีซอง → การเงินยังเข้าไปจัดการได้
    manageable: groupManageable(lines, envs, noEnv),
    hasEvents: envs.some((e) => e.history.length > 0),
    // ซองของกรุ๊ปอื่นที่การเงินระบุให้ฝากไปกับกรุ๊ปนี้ และยังไม่มีใครดึงไป — ต้องเห็นจากหน้ารายการ ไม่งั้นไม่มีใครรู้
    incoming: envelopes.filter((e) => e.pendingDeposit?.target?.periodId === periodId && !e.handover).length,
    // ซองกรุ๊ปอื่นที่ดึงไปฝากกับกรุ๊ปนี้แล้ว — มี Timeline ให้ดูแม้กรุ๊ปนี้ยังไม่มีซองของตัวเอง
    carried: envelopes.some((e) => e.periodId !== periodId && !!e.handover && (e.handover.depositedWith ?? e.handover.viaGroup) === code),
    forwarded: envs.filter((e) => e.packedLineIds.length > 0 && e.leaderForward).sort((a, b) => a.no - b.no),
    amounts: sumAmounts(lines),
    pill: noDocs && !noEnv ? { label: 'รอการทำเบิก', tone: 'slate' as EnvelopeTone } : { label: status.label, tone: status.tone },
  };
}

function perDiemView({ periodId, claim, stage }: PerDiemRow, rates: PerDiemRates) {
  const p = getTourPeriodById(periodId);
  const rate = p ? perDiemRateFor(p, rates) : null;
  const days = p ? tripDays(p.startDate, p.endDate) : 0;
  const expected = rate ? rate * days : null;
  // ข้อ 1 ค่าเบี้ยเลี้ยงที่เบิกมาไม่ตรงยอดคำนวณ — ให้การเงินเห็นก่อนอนุมัติ (ใบเก่ามีรายการเดียว = เบี้ยเลี้ยง)
  const live = claim?.lines.filter((l) => !l.rejected) ?? [];
  const perDiemLine = live.find((l) => l.expenseType === LEADER_FORM_ITEMS[0]) ?? (claim?.claimForm ? undefined : live[0]);
  return {
    rate,
    days,
    expected,
    differs: !!perDiemLine && expected !== null && perDiemLine.amount !== expected,
    claimTotals: groupAmountsByCurrency(live.map((l) => ({ amount: l.amount, currency: l.currency }))),
    meta: PER_DIEM_STAGE[stage],
    action: stage === 'submitted' ? 'ตรวจ / อนุมัติ' : stage === 'to_pay' ? 'บันทึกโอน' : 'ดูใบเบิก',
  };
}

/* --------------------------------- ตารางรวม -------------------------------- */

export interface GroupExpenseRow extends GroupDocs {
  /** อยู่ในรายการซองเงิน (กรุ๊ปปัจจุบัน / มีเอกสารเบิก) — กรุ๊ปที่จบทริปแล้วไม่มีเอกสารเบิกไม่ต้องจัดซอง */
  hasEnvelope: boolean;
  /** null = ไม่พบกรุ๊ปในรายการทัวร์ (แสดงตามเอกสารเบิก) — คิดเบี้ยเลี้ยงไม่ได้ */
  perDiem: PerDiemRow | null;
}

type View = 'group' | 'manage' | 'timeline' | 'claim';

export function GroupExpensesCard({ rows, emptyText }: { rows: GroupExpenseRow[]; emptyText: string }) {
  const { envelopes, noEnvelopeMarks, leaders } = useDemo();
  /*
    ซองปิดแล้วแต่ยังไม่ส่งมอบ ยังไม่มีชื่อผู้รับในซอง — ใช้เจ้าหน้าที่ส่งกรุ๊ปที่ผู้จัดสเก็ตจัดให้กรุ๊ปนั้นแทน
    (คนกลุ่มเดียวกับที่ขึ้นเป็นตัวเลือกแรกตอนกดส่งมอบ) การเงินจะได้รู้ล่วงหน้าว่าใครจะมารับซอง
    อ่านจาก localStorage จึงคำนวณฝั่ง client ใน effect ไม่ใช่ตอน render (หน้านี้ถูก prerender)
  */
  const [pickupByPeriod, setPickupByPeriod] = useState<Map<string, string[]>>(new Map());
  const [rates, setRates] = useState<PerDiemRates>(EMPTY_PER_DIEM_RATES);
  useEffect(() => {
    const staffById = new Map(loadSendOffStaff().map((s) => [s.id, s]));
    const m = new Map<string, string[]>();
    for (const a of loadSendOffAssignments()) {
      const s = staffById.get(a.staffId);
      if (!s) continue;
      const name = `${sendOffStaffName(s)}${a.status === 'CONFIRMED' ? '' : ' (รอคอนเฟิร์ม)'}`;
      m.set(a.periodId, [...(m.get(a.periodId) ?? []), name]);
    }
    /* eslint-disable react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount */
    setPickupByPeriod(m);
    setRates(loadPerDiemRates());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  // แผงของกรุ๊ป กับหน้าจอย่อย (จัดซอง / Timeline / ใบเบิก) เปิดทีละจอ — ปิดหน้าจอย่อยแล้วกลับมาที่แผงของกรุ๊ป
  const [open, setOpen] = useState<{ periodId: string; view: View } | null>(null);
  const openRow = open && rows.find((r) => r.periodId === open.periodId);
  const backToGroup = () => setOpen((o) => (o ? { ...o, view: 'group' } : null));

  const envelopeOf = (g: GroupDocs) => envelopeView(g, envelopes, noEnvelopeMarks);
  const perDiemOf = (r: PerDiemRow) => perDiemView(r, rates);

  /* ------------------------------ ข้อมูลกรุ๊ป ------------------------------ */
  const groupInfo = ({ periodId, docs }: GroupDocs) => {
    const period = getTourPeriodById(periodId);
    // ไม่พบกรุ๊ปใน Master (เช่น เดินทางไปแล้ว ไม่อยู่ในข้อมูล Zego รอบใหม่) — ใช้ข้อมูลจากตัวเอกสารเบิกแทน
    const fb = period ? null : advanceDocFallback(docs[0]?.sourceDoc);
    return {
      fb,
      country: period?.countryName || fb?.countryName || '—',
      groupCode: groupCodeOf(periodId, docs),
      program: period?.displayName ?? (fb?.programName || '—'),
      dates: period ? formatDateRange(period.startDate, period.endDate) : fb?.startDate && fb.endDate ? formatDateRange(fb.startDate, fb.endDate) : '—',
      days: period ? tripDays(period.startDate, period.endDate) : null,
    };
  };

  const money = (items: { amount: number; currency: string }[]) =>
    items.map((b) => <p key={b.currency} className="whitespace-nowrap font-semibold zego-text">{formatCurrency(b.amount, b.currency)}</p>);
  const dash = <p className="zego-text-tertiary">—</p>;

  /* ช่องซองเงิน / เบี้ยเลี้ยงในตาราง — ป้ายสถานะ + ยอด + สัญญาณที่ต้องเห็นจากหน้ารายการ */
  const envelopeCell = (row: GroupExpenseRow) => {
    if (!row.hasEnvelope) return dash;
    const e = envelopeOf(row);
    return (
      <>
        <StatusPill label={e.pill.label} tone={e.pill.tone} />
        {!e.noDocs && <div className="mt-1 tabular-nums">{money(e.amounts)}</div>}
        {e.incoming > 0 && (
          <p className="mt-1">
            <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 md:whitespace-nowrap">มีซองฝากรอ {e.incoming} ซอง</span>
          </p>
        )}
        {e.status.recheck && <p className="mt-0.5 text-xs zego-text-warning">มีใบเบิกเข้ามาแล้ว — ตรวจว่ายังไม่ต้องจัดซองจริงไหม</p>}
      </>
    );
  };
  const perDiemCell = (row: GroupExpenseRow) => {
    if (!row.perDiem) return dash;
    const d = perDiemOf(row.perDiem);
    return (
      <>
        <StatusPill label={d.meta.label} tone={d.meta.tone} />
        <div className="mt-1 tabular-nums">
          {row.perDiem.claim
            ? money(d.claimTotals)
            : d.expected !== null && <p className="whitespace-nowrap text-xs zego-text-tertiary">คำนวณ {formatCurrency(d.expected, 'THB')}</p>}
        </div>
        {d.differs && <p className="whitespace-nowrap text-xs zego-text-warning">เบี้ยเลี้ยงไม่ตรงยอดคำนวณ</p>}
      </>
    );
  };
  const leaderCell = (row: GroupExpenseRow) =>
    row.perDiem?.leader
      ? <p className="zego-text md:whitespace-nowrap">{row.perDiem.leader.name}</p>
      : <p className="zego-text-tertiary md:whitespace-nowrap">{row.perDiem ? 'ยังไม่มีหัวหน้าทัวร์' : '—'}</p>;
  const manageButton = (periodId: string) => (
    <Button variant="primary" size="sm" className="min-w-[4.5rem] justify-center max-md:w-full" onClick={() => setOpen({ periodId, view: 'group' })}>
      จัดการ
    </Button>
  );

  const th = 'px-3 py-2.5 text-xs font-medium zego-text-tertiary';
  return (
    <Card padded={false}>
      {rows.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm zego-text-tertiary">{emptyText}</p>
      ) : (
        <>
          {/* จอเล็ก — การ์ดละกรุ๊ป (ตารางกว้างเลื่อนข้างอ่านไม่ได้) */}
          <ul className="divide-y divide-[var(--zego-border-soft)] md:hidden">
            {rows.map((row) => {
              const g = groupInfo(row);
              return (
                <li key={row.periodId} className="space-y-2 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-semibold zego-text">{g.groupCode}</p>
                    <p className="text-xs zego-text-tertiary">{g.country} · <span className="tabular-nums">{g.dates}</span></p>
                    <p className="line-clamp-1 text-sm zego-text-secondary">{g.program}</p>
                  </div>
                  <div className="text-sm">{leaderCell(row)}</div>
                  <div className="grid grid-cols-2 gap-2 rounded-lg zego-surface-soft-bg px-3 py-2 text-sm">
                    <div><p className="mb-1 text-[11px] zego-text-tertiary">ซองเงิน</p>{envelopeCell(row)}</div>
                    <div><p className="mb-1 text-[11px] zego-text-tertiary">เบี้ยเลี้ยง</p>{perDiemCell(row)}</div>
                  </div>
                  {manageButton(row.periodId)}
                </li>
              );
            })}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="zego-surface-soft-bg text-left">
                <tr>
                  <th className={th}>ประเทศ</th>
                  <th className={th}>รหัสกรุ๊ป / โปรแกรม</th>
                  <th className={th}>วันเดินทางไป-กลับ</th>
                  <th className={th}>หัวหน้าทัวร์</th>
                  <th className={th}>ซองเงิน</th>
                  <th className={th}>เบี้ยเลี้ยง</th>
                  <th className={`${th} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--zego-border-soft)]">
                {rows.map((row) => {
                  const g = groupInfo(row);
                  return (
                    <tr key={row.periodId} className="zego-hover-surface">
                      <td className="px-3 py-2.5 align-top"><p className="whitespace-nowrap zego-text-secondary">{g.country}</p></td>
                      <td className="max-w-[20rem] px-3 py-2.5 align-top">
                        <p className="whitespace-nowrap font-semibold zego-text">{g.groupCode}</p>
                        <p className="line-clamp-1 text-xs zego-text-secondary">{g.program}</p>
                        {g.fb && <p className="mt-0.5 text-[11px] zego-text-warning">ไม่พบกรุ๊ปนี้ในรายการทัวร์ — แสดงตามเอกสารเบิก</p>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="whitespace-nowrap tabular-nums zego-text">{g.dates}</p>
                        {g.days !== null && <p className="text-xs zego-text-tertiary">{g.days} วัน</p>}
                      </td>
                      <td className="px-3 py-2.5 align-top">{leaderCell(row)}</td>
                      <td className="px-3 py-2.5 align-top">{envelopeCell(row)}</td>
                      <td className="px-3 py-2.5 align-top">{perDiemCell(row)}</td>
                      <td className="px-3 py-2.5 text-right align-top">{manageButton(row.periodId)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      {openRow && open.view === 'group' && (
        <GroupDetailDrawer
          row={openRow}
          info={groupInfo(openRow)}
          envelope={openRow.hasEnvelope ? envelopeOf(openRow) : null}
          perDiem={openRow.perDiem ? perDiemOf(openRow.perDiem) : null}
          leaderNames={(acked) => [...new Set(acked.map((ack) => {
            const l = leaders.find((x) => x.id === ack.leaderId);
            if (!l) return ack.leaderName;
            const full = `${l.firstName} ${l.lastName}`.trim() || ack.leaderName;
            return l.nickname ? `${full} (${l.nickname})` : full;
          }))].join(', ')}
          pickup={pickupByPeriod.get(openRow.periodId) ?? []}
          onView={(view) => setOpen({ periodId: openRow.periodId, view })}
          onClose={() => setOpen(null)}
        />
      )}
      {openRow && open.view === 'manage' && (
        <GroupEnvelopeDrawer key={openRow.periodId} periodId={openRow.periodId} docs={openRow.docs} onClose={backToGroup} />
      )}
      {openRow && open.view === 'timeline' && (
        <GroupTimelineDrawer key={openRow.periodId} periodId={openRow.periodId} docs={openRow.docs} onClose={backToGroup} />
      )}
      {/* ตรวจ / อนุมัติ / ส่งกลับแก้ไข / บันทึกโอน — แผงเดียวกับเมนูตรวจสอบรายการจ่าย */}
      <ExpenseDrawer
        expense={openRow && open.view === 'claim' ? openRow.perDiem?.claim ?? null : null}
        onClose={backToGroup}
        onEdit={backToGroup}
      />
    </Card>
  );
}

/* ------------------------------ แผงของกรุ๊ป ------------------------------ */

type EnvelopeView = ReturnType<typeof envelopeView>;
type PerDiemView = ReturnType<typeof perDiemView>;
type LeaderAck = NonNullable<CashEnvelope['leaderAck']>;

function GroupDetailDrawer({
  row,
  info,
  envelope: e,
  perDiem: d,
  leaderNames,
  pickup,
  onView,
  onClose,
}: {
  row: GroupExpenseRow;
  info: { fb: unknown; country: string; groupCode: string; program: string; dates: string; days: number | null };
  envelope: EnvelopeView | null;
  perDiem: PerDiemView | null;
  leaderNames: (acked: LeaderAck[]) => string;
  pickup: string[];
  onView: (view: Exclude<View, 'group'>) => void;
  onClose: () => void;
}) {
  const leader = row.perDiem?.leader;
  const claim = row.perDiem?.claim ?? null;
  const stage = row.perDiem?.stage;
  const section = 'rounded-xl border zego-border-color p-4';
  const acked = e ? e.envs.filter((x) => x.packedLineIds.length > 0 && x.leaderAck).map((x) => x.leaderAck!) : [];

  return (
    <Drawer
      open
      onClose={onClose}
      title={info.groupCode}
      description={[info.country, info.dates + (info.days !== null ? ` · ${info.days} วัน` : ''), leader ? `หัวหน้าทัวร์ ${leader.name}` : null].filter(Boolean).join(' · ')}
    >
      <div className="space-y-4 text-sm">
        <div>
          <p className="zego-text-secondary">{info.program}</p>
          {!!info.fb && <p className="mt-0.5 text-xs zego-text-warning">ไม่พบกรุ๊ปนี้ในรายการทัวร์ — แสดงตามเอกสารเบิก</p>}
        </div>

        {/* ซองเงิน — ก่อนเดินทาง */}
        <section className={section} aria-label="ซองเงิน">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold zego-text">ซองเงิน {e && <StatusPill label={e.pill.label} tone={e.pill.tone} />}</h3>
            {e && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!e.hasEvents && !e.carried && e.incoming === 0}
                  title={e.hasEvents || e.carried || e.incoming > 0 ? undefined : 'ยังไม่มีความเคลื่อนไหวของซอง — จัดซองก่อนจึงจะมี Timeline'}
                  onClick={() => onView('timeline')}
                >
                  ดู Timeline
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  disabled={!e.noDocs && !e.manageable && e.incoming === 0}
                  title={e.noDocs ? 'ยังไม่มีเอกสารเบิก — จัดซองได้เมื่อนำเข้าเอกสารเบิกแล้ว · ระบุว่ากรุ๊ปนี้ไม่มีซองได้เลย' : e.manageable || e.incoming > 0 ? undefined : 'ส่งมอบครบและมีผู้ตอบรับแล้ว — จัดการซองเพิ่มไม่ได้'}
                  onClick={() => onView('manage')}
                >
                  {!e.noDocs && e.status.label === 'รอจัด' ? 'จัดซอง' : 'จัดการซอง'}
                </Button>
              </div>
            )}
          </div>
          {!e ? (
            <p className="mt-2 text-xs zego-text-tertiary">จบทริปแล้วและไม่มีเอกสารเบิก — กรุ๊ปนี้ไม่ต้องจัดซอง</p>
          ) : (
            <div className="mt-3 space-y-1">
              <p className="text-xs zego-text-tertiary">
                เอกสารเบิก: {e.noDocs ? 'ไม่พบเอกสารเบิก' : <span className="zego-text-secondary">{row.docs.map((x) => x.id).join(', ')}</span>}
              </p>
              {!e.noDocs && (
                <div className="tabular-nums">
                  {e.amounts.map((b) => <p key={b.currency} className="font-semibold zego-text">{formatCurrency(b.amount, b.currency)}</p>)}
                </div>
              )}
              {e.incoming > 0 && (
                <p><span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">มีซองฝากรอ {e.incoming} ซอง</span></p>
              )}
              {(!e.noDocs || !!e.noEnv) && e.status.awaiting && <p className="text-xs zego-text-tertiary">{e.status.awaiting}</p>}
              {e.status.recheck && <p className="text-xs zego-text-warning">มีใบเบิกเข้ามาแล้ว — ตรวจว่ายังไม่ต้องจัดซองจริงไหม</p>}
              {/* หัวหน้าทัวร์ที่รับซองแล้ว — ชื่อ นามสกุล (ชื่อเล่น) ของผู้กดยืนยันรับ (ไม่ซ้ำ) */}
              {acked.length > 0 && <p className="text-xs zego-text-secondary">ผู้รับ: <span className="font-medium zego-text">{leaderNames(acked)}</span></p>}
              {e.status.stage === 'sealed' && !e.status.mismatch && pickup.length > 0 && (
                <p className="text-xs zego-text-tertiary">ผู้มารับ: {pickup.join(', ')}</p>
              )}
              {(e.status.envelopeCount > 1 || e.forwarded.length > 0) && (
                <p className="text-xs zego-text-tertiary">
                  {e.status.envelopeCount} ซอง{e.forwarded.length > 0 ? ` · ส่งต่อแล้ว ${e.forwarded.length} ซอง` : ''}
                </p>
              )}
              {/* ซองที่หัวหน้าทัวร์ส่งต่อ — บอกชัดว่าซองไหนไปอยู่กับใคร */}
              {e.forwarded.map((x) => (
                <p key={x.id} className="text-xs text-sky-800">{envelopeName(x)} → {x.leaderForward!.toName}</p>
              ))}
            </div>
          )}
        </section>

        {/* เบี้ยเลี้ยง — หลังจบทริป */}
        <section className={section} aria-label="เบี้ยเลี้ยง">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-semibold zego-text">เบี้ยเลี้ยง {d && <StatusPill label={d.meta.label} tone={d.meta.tone} />}</h3>
            {d && (
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  icon="download"
                  disabled={!claim}
                  title={claim ? 'พิมพ์เอกสารค่าใช้จ่ายหัวหน้าทัวร์' : 'ยังไม่มีใบเบิก'}
                  onClick={() => claim && printLeaderExpenseForm(claim, getTourPeriodById(row.periodId))}
                >
                  พิมพ์
                </Button>
                <Button
                  variant={stage === 'submitted' || stage === 'to_pay' ? 'primary' : 'secondary'}
                  size="sm"
                  disabled={!claim || stage === 'draft'}
                  title={stage === 'draft' ? 'หัวหน้าทัวร์ทำร่างไว้ ยังไม่ส่งอนุมัติ' : claim ? undefined : stage === 'not_ended' ? 'ยังไม่จบทริป — หัวหน้าทัวร์ส่งอนุมัติได้หลังกลับจากทริป' : 'หัวหน้าทัวร์ยังไม่ได้ทำใบเบิกเบี้ยเลี้ยง'}
                  onClick={() => onView('claim')}
                >
                  {d.action}
                </Button>
              </div>
            )}
          </div>
          {!d ? (
            <p className="mt-2 text-xs zego-text-tertiary">ไม่พบกรุ๊ปนี้ในรายการทัวร์ — คิดเบี้ยเลี้ยงไม่ได้</p>
          ) : (
            // ยอดคำนวณ กับ ยอดที่เบิกจริง วางคู่กันให้เทียบได้ทันที
            <div className="mt-3 grid grid-cols-2 gap-3 rounded-lg zego-surface-soft-bg px-3 py-2 tabular-nums">
              <div>
                <p className="text-[11px] zego-text-tertiary">ยอดคำนวณ</p>
                {d.expected !== null ? (
                  <>
                    <p className="font-semibold zego-text">{formatCurrency(d.expected, 'THB')}</p>
                    <p className="text-xs zego-text-tertiary">{formatCurrency(d.rate!, 'THB')} × {d.days} วัน</p>
                  </>
                ) : <p className="text-xs zego-text-tertiary">โปรแกรมนี้ยังไม่ตั้งอัตรา</p>}
              </div>
              <div>
                <p className="text-[11px] zego-text-tertiary">ยอดเบิก{claim ? ` · ${claim.id}` : ''}</p>
                {claim ? (
                  <>
                    {d.claimTotals.map((t) => <p key={t.currency} className="font-semibold zego-text">{formatCurrency(t.amount, t.currency)}</p>)}
                    {d.differs && <p className="text-xs zego-text-warning">เบี้ยเลี้ยงไม่ตรงยอดคำนวณ</p>}
                  </>
                ) : <p className="text-xs zego-text-tertiary">ยังไม่มีใบเบิก</p>}
                {stage === 'paid' && claim?.paidRef && <p className="text-xs zego-text-tertiary">อ้างอิง {claim.paidRef}</p>}
              </div>
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
