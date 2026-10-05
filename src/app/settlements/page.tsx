'use client';

/**
 * เคลียร์เงินกรุ๊ป — /settlements (ฝ่ายบัญชี/การเงิน) · ขั้นสุดท้ายของเงินกรุ๊ป
 *
 *   จัดการค่าใช้จ่ายกรุ๊ป (ให้เงินเป็นซอง) → ตรวจสอบรายการจ่าย (อนุมัติใบเสร็จ/เบี้ยเลี้ยง) → เคลียร์เงินกรุ๊ป (หน้านี้)
 *
 * 1 แถว = 1 กรุ๊ปที่มีความเคลื่อนไหวทางเงิน (ซองที่ส่งมอบแล้ว / ใบเสร็จ / ใบเบิกเบี้ยเลี้ยง / ปิดเคลียร์แล้ว)
 * ยอดแยกทีละสกุล ไม่แปลงอัตราแลกเปลี่ยน — ในซอง − ส่งแลนด์ − ใบเสร็จที่อนุมัติ = คงเหลือ (บวก = ต้องคืน · ลบ = บริษัทจ่ายเพิ่ม)
 * เบี้ยเลี้ยงโอนแยก ไม่หักกลบ · ปิดเคลียร์ได้เมื่อจบทริปและเอกสารผ่านตรวจครบ (GroupClearDrawer)
 * ข้อมูลจริงทั้งหมด — ไม่มีข้อมูลจำลองชุดเก่า (STL-…) แล้ว
 */

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, cx, PageHeader } from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { formatCurrency, formatDate, formatDateRange, toISODate } from '@/lib/format';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadGroupClears, type GroupClearRecord } from '@/services/groupClearStore';
import { clearAppointmentOf } from '@/services/appointmentStore';
import { GROUP_CLEAR_STAGE, summarizeGroupClear, type GroupClearStage, type GroupClearSummary } from '@/lib/logic/groupClear';
import { APPOINTMENT_STATUS, EXPENSE_STATUS } from '@/lib/labels';
import { StatusPill } from '@/components/expenses/CashEnvelopeDrawer';
import { GroupClearDrawer } from '@/components/settlements/GroupClearDrawer';
import { expenseOriginalTotals } from '@/app/guide/expenses/expenseAmounts';

type Filter = 'all' | GroupClearStage | 'overdue';
const STAGE_TONE: Record<GroupClearStage, string> = {
  traveling: '#64748b', waiting_leader: '#b45309', waiting_docs: '#6d28d9', ready: '#0369a1', closed: '#15803d',
};
const STAGE_HINT: Record<GroupClearStage, string> = {
  traveling: 'ยังไม่ถึงวันกลับ',
  waiting_leader: 'ยังไม่ส่ง / ร่าง / ส่งกลับแก้ไข',
  waiting_docs: 'ส่งแล้ว รอบัญชีตรวจ',
  ready: 'ตรวจครบแล้ว รอรับคืน/ปิด',
  closed: 'ปิดการเคลียร์แล้ว',
};
const money = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GroupClearPage() {
  const { envelopes, expenses, leaders, appointments } = useDemo();
  const today = toISODate(new Date());
  const [records, setRecords] = useState<Record<string, GroupClearRecord>>({});
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ตอน mount
    setRecords(loadGroupClears());
  }, []);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  /** หัวหน้าทัวร์ของกรุ๊ป — คอนเฟิร์มแล้วก่อน ไม่มีจึงใช้ผู้ส่งใบเสร็จ/ใบเบิก */
  const leaderOf = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const a of loadActiveGuideAssignments()) {
      if (a.assignmentStatus !== 'CONFIRMED' || m.has(a.periodId)) continue;
      const l = leaders.find((x) => x.id === a.tourLeaderId);
      if (l) m.set(a.periodId, { id: l.id, name: `${l.firstName} ${l.lastName}`.trim() });
    }
    return m;
  }, [leaders]);

  const rows = useMemo(() => {
    // กรุ๊ปที่มีความเคลื่อนไหวทางเงิน
    const ids = new Set<string>([
      // ซองที่ส่งมอบแล้ว (รวมที่ยังรอหัวหน้าทัวร์ยืนยันรับ) — การเงินเห็นตั้งแต่เงินออกไป
      ...envelopes.filter((e) => e.sealed && (e.leaderAck || e.handover)).map((e) => e.periodId),
      ...expenses.filter((e) => (e.category === 'actual' || e.claimKind === 'per_diem') && e.status !== 'cancelled').map((e) => e.jobId),
      ...Object.keys(records).filter((id) => records[id].closedAt),
    ]);
    return [...ids]
      .map((id) => ({ id, p: getTourPeriodById(id) }))
      .filter((x): x is { id: string; p: NonNullable<typeof x.p> } => !!x.p)
      .map(({ id, p }) => {
        const s = summarizeGroupClear({ periodId: id, endDate: p.endDate, today, envelopes, expenses, closed: !!records[id]?.closedAt });
        const doc = s.receipts[0] ?? s.perDiem;
        const leader = leaderOf.get(id) ?? (doc ? { id: doc.requesterId, name: doc.requesterName } : null);
        return { p, s, leader };
      })
      .sort((a, b) => b.p.endDate.localeCompare(a.p.endDate));
  }, [envelopes, expenses, records, leaderOf, today]);

  const q = query.trim().toLowerCase();
  const searched = rows.filter((r) => !q || [r.p.groupCode, r.p.displayName, r.p.countryName, r.leader?.name ?? ''].join(' ').toLowerCase().includes(q));
  const matches = (s: GroupClearSummary, f: Filter) => f === 'all' || (f === 'overdue' ? s.overdue : s.stage === f);
  const shown = searched.filter((r) => matches(r.s, filter));
  const cards: { key: Filter; label: string; hint: string; tone: string }[] = [
    { key: 'all', label: 'ทั้งหมด', hint: 'กรุ๊ปที่มีความเคลื่อนไหวทางเงิน', tone: '#475569' },
    ...(Object.keys(GROUP_CLEAR_STAGE) as GroupClearStage[]).map((k) => ({ key: k as Filter, label: GROUP_CLEAR_STAGE[k].label, hint: STAGE_HINT[k], tone: STAGE_TONE[k] })),
    { key: 'overdue', label: 'เกินกำหนด', hint: `เลยวันกลับเกิน 14 วัน ยังไม่ปิด`, tone: '#be123c' },
  ];
  const open = rows.find((r) => r.p.internalId === openId);
  const th = 'px-3 py-2.5 text-xs font-medium zego-text-tertiary';

  return (
    <>
      <PageHeader
        title="เคลียร์เงินกรุ๊ป"
        description="สรุปเงินของแต่ละกรุ๊ป แยกทีละสกุล: ในซอง − ส่งแลนด์ − ใบเสร็จที่อนุมัติ = คงเหลือ (หัวหน้าทัวร์ต้องคืน / บริษัทจ่ายเพิ่ม) · เบี้ยเลี้ยงโอนแยก"
        actions={
          <Link href="/settlements/custody">
            <Button variant="secondary" size="sm" icon="money">เงินค่าแลนด์ที่ถือไป</Button>
          </Link>
        }
      />

      {/* สรุปสถานะ — แตะเพื่อกรอง */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {cards.map((f) => {
          const count = searched.filter((r) => matches(r.s, f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={cx('zego-card-surface rounded-xl px-3 py-2.5 text-left transition', active ? 'ring-2 ring-emerald-500' : 'hover:ring-1 hover:ring-emerald-200')}
            >
              <p className="text-xs zego-text-tertiary">{f.label}</p>
              <p className="text-2xl font-bold tabular-nums" style={{ color: count > 0 && f.key !== 'all' ? f.tone : undefined }}>{count}</p>
              <p className="text-[11px] zego-text-tertiary">{f.hint}</p>
            </button>
          );
        })}
      </div>

      <Card className="mb-4">
        <SearchBox value={query} onChange={setQuery} onClear={() => setQuery('')} placeholder="ค้นหารหัสกรุ๊ป ชื่อโปรแกรม ประเทศ หรือหัวหน้าทัวร์" label="ค้นหากรุ๊ป" />
      </Card>

      <Card padded={false}>
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm zego-text-tertiary">
            {rows.length === 0 ? 'ยังไม่มีกรุ๊ปที่มีความเคลื่อนไหวทางเงิน — เมื่อหัวหน้าทัวร์รับซอง หรือส่งใบเสร็จ/ใบเบิก กรุ๊ปจะขึ้นที่นี่' : 'ไม่พบกรุ๊ปที่ตรงกับตัวกรอง'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="zego-surface-soft-bg text-left">
                <tr>
                  <th className={th}>ประเทศ</th>
                  <th className={th}>รหัสกรุ๊ป</th>
                  <th className={th}>วันเดินทางไป-กลับ</th>
                  <th className={th}>หัวหน้าทัวร์</th>
                  <th className={`${th} text-right`}>ในซอง</th>
                  <th className={`${th} text-right`}>ใช้ไป (อนุมัติ)</th>
                  <th className={`${th} text-right`}>คงเหลือ</th>
                  <th className={th}>เบี้ยเลี้ยง</th>
                  <th className={th}>สถานะ</th>
                  <th className={`${th} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--zego-border-soft)]">
                {shown.map(({ p, s, leader }) => {
                  const st = GROUP_CLEAR_STAGE[s.stage];
                  return (
                    <tr key={p.internalId} className="zego-hover-surface">
                      <td className="px-3 py-2.5 align-top whitespace-nowrap zego-text-secondary">{p.countryName || '—'}</td>
                      <td className="px-3 py-2.5 align-top">
                        <p className="whitespace-nowrap font-semibold zego-text">{p.groupCode}</p>
                        <p className="max-w-[11rem] truncate text-xs zego-text-tertiary">{p.displayName}</p>
                      </td>
                      <td className="px-3 py-2.5 align-top tabular-nums zego-text">{formatDateRange(p.startDate, p.endDate)}</td>
                      <td className="px-3 py-2.5 align-top">{leader ? <span className="zego-text">{leader.name}</span> : <span className="zego-text-tertiary">—</span>}</td>
                      <td className="px-3 py-2.5 text-right align-top tabular-nums">
                        {s.balance.filter((b) => b.face > 0).map((b) => <p key={b.currency} className="whitespace-nowrap zego-text">{formatCurrency(b.face, b.currency)}</p>)}
                        {!s.balance.some((b) => b.face > 0) && s.inTransit.length === 0 && <p className="zego-text-tertiary">—</p>}
                        {/* ส่งมอบแล้ว หัวหน้าทัวร์ยังไม่กดรับ — ยังไม่นับในยอด แต่เห็นว่าเงินออกไปแล้ว */}
                        {s.inTransit.map((t) => (
                          <p key={t.currency} className="whitespace-nowrap text-[11px] zego-text-tertiary">รอรับ {formatCurrency(t.amount, t.currency)}</p>
                        ))}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top tabular-nums">
                        {s.balance.filter((b) => b.land + b.spent > 0).map((b) => <p key={b.currency} className="whitespace-nowrap zego-text">{formatCurrency(b.land + b.spent, b.currency)}</p>)}
                        {!s.balance.some((b) => b.land + b.spent > 0) && <p className="zego-text-tertiary">—</p>}
                        {/* แยกให้ชัด: ส่งแล้วรอบัญชีตรวจ กับ หัวหน้าทัวร์ยังไม่ส่ง · ใบเสร็จ กับ เบี้ยเลี้ยง */}
                        {/* ใช้ไป = ใบเสร็จเท่านั้น (เบี้ยเลี้ยงโอนแยก — ดูสถานะที่คอลัมน์เบี้ยเลี้ยง) */}
                        {s.toReview.receipts > 0 && (
                          <p className="whitespace-nowrap text-[11px] text-violet-700">ใบเสร็จรอตรวจ {s.toReview.receipts} ใบ</p>
                        )}
                        {s.atLeader.receipts > 0 && (
                          <p className="whitespace-nowrap text-[11px] zego-text-warning">ใบเสร็จยังไม่ส่ง {s.atLeader.receipts} ใบ</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right align-top tabular-nums">
                        {/* ปิดแล้ว = แสดงเงินที่รับคืนจริง (ไม่ใช่ยอดค้าง) */}
                        {s.stage === 'closed' ? (
                          (records[p.internalId]?.returned.length ?? 0) > 0
                            ? records[p.internalId]!.returned.map((r) => (
                              <p key={r.currency} className="whitespace-nowrap">
                                <span className="font-semibold text-emerald-700">{money(r.amount)} {r.currency}</span>
                                <span className="block text-[11px] zego-text-tertiary">รับคืนแล้ว</span>
                              </p>
                            ))
                            : <p className="text-xs zego-text-tertiary">ไม่มีเงินคืน</p>
                        ) : s.balance.filter((b) => b.remaining !== 0).map((b) => (
                          <p key={b.currency} className="whitespace-nowrap">
                            <span className={cx('font-semibold', b.remaining > 0 ? 'zego-text-danger' : 'text-emerald-700')}>{money(Math.abs(b.remaining))} {b.currency}</span>
                            <span className="block text-[11px] zego-text-tertiary">{b.remaining > 0 ? 'ต้องคืน' : 'บริษัทจ่ายเพิ่ม'}</span>
                          </p>
                        ))}
                        {s.stage !== 'closed' && !s.balance.some((b) => b.remaining !== 0) && <p className="zego-text-tertiary">—</p>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        {s.perDiem ? (
                          <>
                            <p className="whitespace-nowrap text-xs tabular-nums zego-text">{expenseOriginalTotals(s.perDiem).map((t) => formatCurrency(t.amount, t.currency)).join(' · ')}</p>
                            <p className="whitespace-nowrap text-[11px] zego-text-tertiary">{EXPENSE_STATUS[s.perDiem.status].label}</p>
                          </>
                        ) : <p className="whitespace-nowrap text-xs zego-text-tertiary">ยังไม่มีใบเบิก</p>}
                      </td>
                      <td className="px-3 py-2.5 align-top">
                        <StatusPill label={st.label} tone={st.tone} />
                        {/* นัดหมายเคลียร์เงิน */}
                        {(() => {
                          const ap = clearAppointmentOf(appointments, p.internalId);
                          if (!ap || s.stage === 'closed') return null;
                          return (
                            <p className={cx('mt-0.5 whitespace-nowrap text-[11px]', ap.status === 'rescheduled' ? 'font-semibold text-violet-700' : 'zego-text-secondary')}>
                              นัด {formatDate(ap.date)} {ap.time} · {APPOINTMENT_STATUS[ap.status].label}
                            </p>
                          );
                        })()}
                        <p className={cx('mt-0.5 text-[11px]', s.overdue ? 'font-semibold zego-text-danger' : 'zego-text-tertiary')}>
                          {s.stage === 'closed' ? '' : `กำหนด ${formatDate(s.dueDate)}${s.overdue ? ' · เกินกำหนด' : ''}`}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-right align-top">
                        {(() => {
                          const ap = clearAppointmentOf(appointments, p.internalId);
                          const hasAppt = !!ap;
                          // พร้อมเคลียร์: ยังไม่นัด → "นัดหมาย" · นัดแล้ว → "เคลียร์" · หัวหน้าทัวร์ขอเลื่อน → "แก้นัด"
                          // นัด/เคลียร์ได้ = เอกสารผ่านตรวจครบ (หรือไม่มีเอกสารเลย เช่น คืนทั้งซอง) — เงื่อนไขเดียวกับในแผง
                          const actionable = s.stage === 'ready' || (s.stage === 'waiting_leader' && s.pendingDocs === 0);
                          const label = !actionable ? 'ดู' : !hasAppt ? 'นัดหมาย' : ap!.status === 'rescheduled' ? 'แก้นัด' : 'เคลียร์';
                          return (
                            <Button variant={actionable ? 'primary' : 'secondary'} size="sm" className="min-w-[5rem] justify-center" onClick={() => setOpenId(p.internalId)}>
                              {label}
                            </Button>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && (
        <GroupClearDrawer
          key={open.p.internalId}
          summary={open.s}
          leader={open.leader}
          record={records[open.p.internalId]}
          onClose={() => setOpenId(null)}
          onSaved={() => { setRecords(loadGroupClears()); setOpenId(null); }}
        />
      )}
    </>
  );
}
