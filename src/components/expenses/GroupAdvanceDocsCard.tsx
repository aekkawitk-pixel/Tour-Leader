'use client';

/**
 * ตารางค่าใช้จ่ายกรุ๊ป (หน้า "จัดการค่าใช้จ่ายกรุ๊ป") — 1 แถว = 1 กรุ๊ป
 *
 * เอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้าจาก .xls) ของกรุ๊ปเดียวกันรวมอยู่แถวเดียว เพราะซองเงินเป็นของกรุ๊ป:
 * การเงินรวมทุกเอกสารไว้ในซองเดียว หรือแยกหลายซองตามค่าใช้จ่ายที่ถือไปก็ได้ (GroupEnvelopeDrawer)
 * สถานะ = ขั้นตอนปัจจุบันของซองเงินทั้งกรุ๊ป · ยังไม่จัด/จัดไม่ครบ/ยังส่งมอบไม่ครบ → ปุ่มจัดการกดได้
 * ดู Timeline แยกหน้าจอ (ดูอย่างเดียว) · ทุกแถวแสดงปุ่มครบทั้งสอง ขั้นที่ยังใช้ไม่ได้ปุ่มจะ disable ไว้
 */

import { useEffect, useState } from 'react';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import { useDemo } from '@/store/DemoStore';
import { Button, Card } from '@/components/ui/Primitives';
import { formatCurrency, formatDateRange } from '@/lib/format';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { envelopeName, groupEnvelopeStatus, groupLines, groupManageable, sumAmounts } from '@/lib/logic/cashEnvelope';
import { GroupEnvelopeDrawer, GroupTimelineDrawer, StatusPill } from './CashEnvelopeDrawer';
import type { ExpenseRequest } from '@/types';

export interface GroupDocs {
  periodId: string;
  docs: ExpenseRequest[];
}

export function GroupAdvanceDocsCard({
  groups,
  className = '',
  emptyText = 'ไม่มีเอกสารเบิก',
}: {
  groups: GroupDocs[];
  className?: string;
  /** ข้อความเมื่อไม่มีเอกสาร (เช่น กรองแล้วไม่พบ) */
  emptyText?: string;
}) {
  const { envelopes, noEnvelopeMarks, leaders } = useDemo();
  /*
    ซองปิดแล้วแต่ยังไม่ส่งมอบ ยังไม่มีชื่อผู้รับในซอง — ใช้เจ้าหน้าที่ส่งกรุ๊ปที่ผู้จัดสเก็ตจัดให้กรุ๊ปนั้นแทน
    (คนกลุ่มเดียวกับที่ขึ้นเป็นตัวเลือกแรกตอนกดส่งมอบ) การเงินจะได้รู้ล่วงหน้าว่าใครจะมารับซอง
    อ่านจาก localStorage จึงคำนวณฝั่ง client ใน effect ไม่ใช่ตอน render (หน้านี้ถูก prerender)
  */
  const [pickupByPeriod, setPickupByPeriod] = useState<Map<string, string[]>>(new Map());
  useEffect(() => {
    const staffById = new Map(loadSendOffStaff().map((s) => [s.id, s]));
    const m = new Map<string, string[]>();
    for (const a of loadSendOffAssignments()) {
      const s = staffById.get(a.staffId);
      if (!s) continue;
      const name = `${sendOffStaffName(s)}${a.status === 'CONFIRMED' ? '' : ' (รอคอนเฟิร์ม)'}`;
      m.set(a.periodId, [...(m.get(a.periodId) ?? []), name]);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPickupByPeriod(m);
  }, []);
  // จัดการ (จัดซอง/ส่งมอบ) กับ Timeline แยกหน้าจอกัน
  const [open, setOpen] = useState<{ periodId: string; view: 'manage' | 'timeline' } | null>(null);
  const openGroup = open && groups.find((g) => g.periodId === open.periodId);

  const th = 'px-3 py-2.5 text-xs font-medium zego-text-tertiary';
  return (
    <Card className={className} padded={false}>
      {groups.length === 0 ? (
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
                <th className={`${th} text-center`}>เอกสารเบิก</th>
                <th className={`${th} text-right`}>จำนวนเงิน</th>
                <th className={th}>สถานะ</th>
                <th className={`${th} text-right`}>Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--zego-border-soft)]">
              {groups.map(({ periodId, docs }) => {
                const period = getTourPeriodById(periodId);
                const lines = groupLines(docs);
                const envs = envelopes.filter((e) => e.periodId === periodId);
                const noEnv = noEnvelopeMarks.find((m) => m.periodId === periodId);
                const status = groupEnvelopeStatus(lines, envs, noEnv);
                // ยังไม่ได้จัด / จัดไม่ครบ / ยังส่งมอบไม่ครบ / ส่งมอบแล้วแต่ยังไม่มีผู้ตอบรับ / ระบุไม่มีซอง → การเงินยังเข้าไปจัดการได้
                const manageable = groupManageable(lines, envs, noEnv);
                const hasEvents = envs.some((e) => e.history.length > 0);
                // ยังไม่มีเอกสารเบิก = รอการทำเบิก — ไม่มียอดเงิน และยังจัดซองไม่ได้
                const noDocs = docs.length === 0;
                const forwarded = envs.filter((e) => e.packedLineIds.length > 0 && e.leaderForward).sort((a, b) => a.no - b.no);
                return (
                  <tr key={periodId} className="zego-hover-surface">
                    <td className="px-3 py-2.5 align-top">
                      <p className="whitespace-nowrap zego-text-secondary">{period?.countryName || '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="whitespace-nowrap font-semibold zego-text">{period?.groupCode ?? docs[0]?.sourceDoc?.groupCode ?? periodId}</p>
                    </td>
                    <td className="max-w-[20rem] px-3 py-2.5 align-top">
                      <p className="line-clamp-2 zego-text-secondary">{period?.displayName ?? docs[0]?.sourceDoc?.programName ?? '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="whitespace-nowrap tabular-nums zego-text">{period ? formatDateRange(period.startDate, period.endDate) : '—'}</p>
                    </td>
                    <td className="px-3 py-2.5 text-center align-top">
                      {noDocs
                        ? <p className="whitespace-nowrap zego-text-tertiary">ไม่พบเอกสารเบิก</p>
                        : docs.map((d) => <p key={d.id} className="whitespace-nowrap zego-text">{d.id}</p>)}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums">
                      {noDocs && <p className="zego-text-tertiary">—</p>}
                      {sumAmounts(lines).map((b) => <p key={b.currency} className="whitespace-nowrap font-semibold zego-text">{formatCurrency(b.amount, b.currency)}</p>)}
                    </td>
                    {/* สถานะ = ขั้นตอนปัจจุบันของซองเงินทั้งกรุ๊ป */}
                    <td className="px-3 py-2.5 align-top">
                      {noDocs ? <StatusPill label="รอการทำเบิก" tone="slate" /> : <StatusPill label={status.label} tone={status.tone} />}
                      {!noDocs && status.awaiting &&<p className="mt-0.5 whitespace-nowrap text-xs zego-text-tertiary">{status.awaiting}</p>}
                      {/* หัวหน้าทัวร์ที่รับซองแล้ว — ชื่อ นามสกุล (ชื่อเล่น) ของผู้กดยืนยันรับ (ไม่ซ้ำ) */}
                      {(() => {
                        const acked = envs.filter((e) => e.packedLineIds.length > 0 && e.leaderAck);
                        if (acked.length === 0) return null;
                        const nameOf = (ack: NonNullable<(typeof acked)[number]['leaderAck']>) => {
                          const l = leaders.find((x) => x.id === ack.leaderId);
                          if (!l) return ack.leaderName;
                          const full = `${l.firstName} ${l.lastName}`.trim() || ack.leaderName;
                          return l.nickname ? `${full} (${l.nickname})` : full;
                        };
                        const names = [...new Set(acked.map((e) => nameOf(e.leaderAck!)))].join(', ');
                        return (
                          <p className="mt-0.5 whitespace-nowrap text-xs zego-text-secondary">
                            ผู้รับ: <span className="font-medium zego-text">{names}</span>
                          </p>
                        );
                      })()}
                      {status.stage === 'sealed' && !status.mismatch && (pickupByPeriod.get(periodId)?.length ?? 0) > 0 && (
                        <p className="mt-0.5 text-xs zego-text-tertiary">ผู้มารับ: {pickupByPeriod.get(periodId)!.join(', ')}</p>
                      )}
                      {(status.envelopeCount > 1 || forwarded.length > 0) && (
                        <p className="mt-0.5 whitespace-nowrap text-[11px] zego-text-tertiary">
                          {status.envelopeCount} ซอง{forwarded.length > 0 ? ` · ส่งต่อแล้ว ${forwarded.length} ซอง` : ''}
                        </p>
                      )}
                      {/* ซองที่หัวหน้าทัวร์ส่งต่อ — บอกชัดว่าซองไหนไปอยู่กับใคร */}
                      {forwarded.map((e) => (
                        <p key={e.id} className="mt-0.5 whitespace-nowrap text-[11px] text-sky-800">
                          {envelopeName(e)} → {e.leaderForward!.toName}
                        </p>
                      ))}
                    </td>
                    {/*
                      ทุกแถวมีปุ่มชุดเดียวกันในตำแหน่งเดิมเสมอ (ไม่ซ่อนปุ่ม) — แถวเรียงตรงกันทั้งตาราง
                      ทำไม่ได้ในขั้นนี้ → disable พร้อมบอกเหตุผลที่ title · รอจัด → ปุ่มหลักขึ้น "จัดซอง" นอกนั้น "จัดการ"
                    */}
                    <td className="px-3 py-2.5 text-right align-top">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          className="min-w-[4.5rem] justify-center"
                          disabled={noDocs || !manageable}
                          title={noDocs ? 'ยังไม่มีเอกสารเบิก — นำเข้าเอกสารเบิกก่อนจึงจะจัดซองได้' : manageable ? undefined : 'ส่งมอบครบและมีผู้ตอบรับแล้ว — จัดการซองเพิ่มไม่ได้'}
                          onClick={() => setOpen({ periodId, view: 'manage' })}
                        >
                          {noDocs || status.label === 'รอจัด' ? 'จัดซอง' : 'จัดการ'}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          className="min-w-[6.5rem] justify-center"
                          disabled={!hasEvents}
                          title={hasEvents ? undefined : 'ยังไม่มีความเคลื่อนไหวของซอง — จัดซองก่อนจึงจะมี Timeline'}
                          onClick={() => setOpen({ periodId, view: 'timeline' })}
                        >
                          ดู Timeline
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
      {openGroup && open.view === 'manage' && (
        <GroupEnvelopeDrawer key={openGroup.periodId} periodId={openGroup.periodId} docs={openGroup.docs} onClose={() => setOpen(null)} />
      )}
      {openGroup && open.view === 'timeline' && (
        <GroupTimelineDrawer key={openGroup.periodId} periodId={openGroup.periodId} docs={openGroup.docs} onClose={() => setOpen(null)} />
      )}
    </Card>
  );
}
