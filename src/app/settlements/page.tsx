'use client';

/**
 * เคลียร์เงินกรุ๊ป — /settlements (ฝ่ายบัญชี/การเงิน) · ขั้นสุดท้ายของเงินกรุ๊ป
 *
 *   จัดการค่าใช้จ่ายกรุ๊ป (ให้เงินเป็นซอง) → ตรวจสอบรายการจ่าย (ตรวจใบเสร็จ / อนุมัติเบี้ยเลี้ยง) → เคลียร์เงินกรุ๊ป (หน้านี้)
 *
 * 1 แถว = 1 กรุ๊ปที่มีความเคลื่อนไหวทางเงิน (ซองที่ส่งมอบแล้ว / ใบเสร็จ / ใบเบิกเบี้ยเลี้ยง / ปิดเคลียร์แล้ว)
 * ยอดแยกทีละสกุล ไม่แปลงอัตราแลกเปลี่ยน — ในซอง − ส่งแลนด์ − ใบเสร็จที่ตรวจแล้ว = คงเหลือ (บวก = ต้องคืน · ลบ = บริษัทจ่ายเพิ่ม)
 * เบี้ยเลี้ยงโอนแยก ไม่หักกลบ · ปิดเคลียร์ได้เมื่อจบทริปและเอกสารผ่านตรวจครบ (GroupClearDrawer)
 * ข้อมูลจริงทั้งหมด — ไม่มีข้อมูลจำลองชุดเก่า (STL-…) แล้ว
 */

import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Card, cx, PageHeader } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { FilterBox, FILTER_INPUT } from '@/components/ui/FilterBox';
import { MultiSelectControl } from '@/components/ui/MultiSelect';
import { formatCurrency, formatDate, formatDateRange, toISODate } from '@/lib/format';
import { getTourPeriodById } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { loadGroupClears, type GroupClearRecord } from '@/services/groupClearStore';
import { clearAppointmentOf } from '@/services/appointmentStore';
import {
  CLEAR_DUE_DAYS, clearChecklist, clearNotEnded, effectiveClearValues, followUpOpen, followUpRemaining, GROUP_CLEAR_STAGE, summarizeGroupClear,
  type GroupClearStage, type GroupClearSummary,
} from '@/lib/logic/groupClear';
import { EXPENSE_STATUS, appointmentStatusMeta } from '@/lib/labels';
import { StatusPill } from '@/components/expenses/CashEnvelopeDrawer';
import { GroupClearDrawer } from '@/components/settlements/GroupClearDrawer';
import { expenseOriginalTotals } from '@/app/guide/expenses/expenseAmounts';
import { clearReadiness } from '@/lib/logic/clearReadiness';
import { tripEnded, tripStarted } from '@/lib/logic/tripPhase';

type Filter = 'all' | GroupClearStage | 'overdue' | 'followup';
const STAGE_TONE: Record<GroupClearStage, string> = {
  upcoming: '#94a3b8', traveling: '#64748b', waiting_leader: '#b45309', waiting_docs: '#6d28d9', ready: '#0369a1', closed: '#15803d', closed_partial: '#b45309',
};
const STAGE_HINT: Record<GroupClearStage, string> = {
  upcoming: 'ยังไม่ถึงวันออกเดินทาง',
  traveling: 'ออกเดินทางแล้ว ยังไม่ถึงวันกลับ',
  waiting_leader: 'ยังไม่ส่ง / ร่าง / ส่งกลับแก้ไข',
  waiting_docs: 'ส่งแล้ว รอบัญชีตรวจ',
  ready: 'ตรวจครบแล้ว รอรับคืน/ปิด',
  closed: 'ปิดแล้ว เช็กลิสต์ผ่านครบ',
  closed_partial: 'ปิดแล้ว ยังมีข้อค้าง',
};
/** การ์ดแถวบน = งานที่บัญชีต้องลงมือ (ที่เหลือเป็นชิปแถวล่าง) */
const PRIMARY_FILTERS: string[] = ['waiting_docs', 'ready', 'waiting_leader', 'overdue', 'followup'];
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
  // แถบค้นหา — ไม่เลือกประเทศ = ทุกประเทศ · หน้านี้แสดงเฉพาะกรุ๊ปที่ออกเดินทางแล้ว (ก่อนเดินทางยังไม่มีอะไรให้เคลียร์)
  const [countrySel, setCountrySel] = useState<string[]>([]);
  const [codeQ, setCodeQ] = useState('');
  const [tourQ, setTourQ] = useState('');
  const [leaderQ, setLeaderQ] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  /** จอเล็ก: ประเทศ / รายการทัวร์ / หัวหน้าทัวร์ / ช่วงวันที่ พับไว้ — เหลือรหัสกรุ๊ป */
  const [filtersOpen, setFiltersOpen] = useState(false);

  /** หัวหน้าทัวร์ของกรุ๊ป — คอนเฟิร์มแล้วก่อน ไม่มีจึงใช้ผู้ส่งใบเสร็จ/ใบเบิก */
  const leaderOf = useMemo(() => {
    const m = new Map<string, { id: string; name: string }>();
    for (const a of loadActiveGuideAssignments()) {
      if (a.assignmentStatus !== 'CONFIRMED' || m.has(a.periodId)) continue;
      const l = leaders.find((x) => x.id === a.tourLeaderId);
      // ชื่อ นามสกุล (ชื่อเล่น) — รูปแบบเดียวกับคอลัมน์ผู้รับซองในหน้าจัดการค่าใช้จ่ายกรุ๊ป
      if (l) m.set(a.periodId, { id: l.id, name: `${`${l.firstName} ${l.lastName}`.trim()}${l.nickname ? ` (${l.nickname})` : ''}` });
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
        const rec = records[id];
        let s = summarizeGroupClear({ periodId: id, startDate: p.startDate, endDate: p.endDate, today, envelopes, expenses, closed: rec?.closedAt ? 'complete' : false });
        const doc = s.receipts[0] ?? s.perDiem;
        const leader = leaderOf.get(id) ?? (doc ? { id: doc.requesterId, name: doc.requesterName } : null);
        // เช็กลิสต์ความครบถ้วน — ค่าที่บันทึกไว้ + การชำระยอดค้างติดตาม
        const checks = clearChecklist(s, effectiveClearValues(rec));
        // ปิดแบบมีค้าง → ชำระยอดค้างครบ (และข้ออื่นผ่าน) = เคลียร์ครบเอง · ยังไม่ครบ = ปิดแบบมีค้าง
        if (rec?.closedAt && rec.closeKind === 'partial' && !checks.every((c) => c.ok)) s = { ...s, stage: 'closed_partial' };
        const openFollowUps = (rec?.followUps ?? []).filter(followUpOpen);
        return { p, s, leader, checks, openFollowUps };
      })
      .sort((a, b) => b.p.endDate.localeCompare(a.p.endDate));
  }, [envelopes, expenses, records, leaderOf, today]);

  /*
    แถบค้นหา — ประเทศ (หลายประเทศ) · รหัสกรุ๊ป · รายการทัวร์ · หัวหน้าทัวร์ · ช่วงวันที่เดินทาง
    การ์ดสรุปนับตามผลค้นหา · ไม่ระบุวันที่ = ไม่กรองวันที่
  */
  const countries = useMemo(() => [...new Set(rows.map((r) => r.p.countryName).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)), [rows]);
  const has = (text: string | undefined | null, needle: string) => !needle || (text ?? '').toLowerCase().includes(needle);
  const codeN = codeQ.trim().toLowerCase();
  const tourN = tourQ.trim().toLowerCase();
  const leaderN = leaderQ.trim().toLowerCase();
  const searched = rows.filter((r) => {
    if (countrySel.length > 0 && !countrySel.includes(r.p.countryName ?? '')) return false;
    if (!has(r.p.groupCode, codeN)) return false;
    if (!has([r.p.displayName, r.p.tourName, r.p.programCode].join(' '), tourN)) return false;
    if (!has(r.leader?.name, leaderN)) return false;
    // เฉพาะกรุ๊ปที่ออกเดินทางแล้ว (รวมกำลังเดินทาง) — ก่อนเดินทางเรื่องซองอยู่ที่หน้าจัดการค่าใช้จ่ายกรุ๊ป ยังไม่มีอะไรให้เคลียร์
    if (r.p.startDate >= today) return false;
    // ช่วงวันที่ — กรุ๊ปที่เดินทางคาบเกี่ยวช่วงที่เลือก
    if (dateFrom && r.p.endDate < dateFrom) return false;
    if (dateTo && r.p.startDate > dateTo) return false;
    return true;
  });
  const searching = !!(countrySel.length > 0 || codeN || tourN || leaderN || dateFrom || dateTo);
  const clearSearch = () => { setCountrySel([]); setCodeQ(''); setTourQ(''); setLeaderQ(''); setDateFrom(''); setDateTo(''); };
  const matches = (s: GroupClearSummary, f: Filter) => f === 'all' || (f === 'overdue' ? s.overdue : s.stage === f);
  const rowMatches = (r: (typeof rows)[number], f: Filter) => (f === 'followup' ? r.openFollowUps.length > 0 : matches(r.s, f));
  const shown = searched.filter((r) => rowMatches(r, filter));
  const cards: { key: Filter; label: string; hint: string; tone: string }[] = [
    { key: 'all', label: 'ทั้งหมด', hint: 'กรุ๊ปที่มีความเคลื่อนไหวทางเงิน', tone: '#475569' },
    ...(Object.keys(GROUP_CLEAR_STAGE) as GroupClearStage[]).map((k) => ({ key: k as Filter, label: GROUP_CLEAR_STAGE[k].label, hint: STAGE_HINT[k], tone: STAGE_TONE[k] })),
    // การ์ดเกินกำหนด — มีเมื่อมีนโยบายกำหนดเคลียร์แล้วเท่านั้น
    ...(CLEAR_DUE_DAYS === null ? [] : [{ key: 'overdue' as const, label: 'เกินกำหนด', hint: `เลยวันกลับเกิน ${CLEAR_DUE_DAYS} วัน ยังไม่ปิด`, tone: '#be123c' }]),
    { key: 'followup', label: 'ยอดค้างติดตาม', hint: 'เงินขาด / เกิน ที่ยังไม่ปิดยอด', tone: '#be123c' },
  ];
  const open = rows.find((r) => r.p.internalId === openId);
  const th = 'whitespace-nowrap px-3 py-2.5 text-xs font-medium zego-text-tertiary';

  /*
    1 กรุ๊ป → เนื้อหาแต่ละช่องคิดครั้งเดียว วางได้ 2 แบบ
      จอใหญ่ = แถวตาราง 8 คอลัมน์ (เหมือนเดิม) · จอเล็ก = การ์ด (ตารางกว้างเลื่อนข้างอ่านไม่ได้)
  */
  const renderRow = ({ p, s, leader, openFollowUps }: (typeof rows)[number], asCard: boolean) => {
    const isClosed = s.stage === 'closed' || s.stage === 'closed_partial';
    const notEnded = clearNotEnded(s.stage);
    const st = GROUP_CLEAR_STAGE[s.stage];
    /*
      สถานะ = หัวหน้าทัวร์ทำรายละเอียดครบหรือยัง — กติกาเดียวกับหน้าตรวจสอบของหัวหน้าทัวร์ (clearReadiness)
      ป้ายหลัก: ยังไม่ออก/กำลังเดินทาง · ยังไม่ครบ N อย่าง · รอบัญชีตรวจ (ส่งครบแล้ว) · ครบแล้ว · ปิดแล้วใช้ป้ายขั้นตอนเดิม
      ช่องเล็ก 3 ช่อง (ซอง · ใบเสร็จ · เบี้ยเลี้ยง) — เขียว ครบ · ส้ม ต้องทำ · เทา ไม่เกี่ยวข้อง/ยังไม่ถึงเวลา
    */
    const ready = clearReadiness({
      started: tripStarted(p, today),
      ended: tripEnded(p, today),
      startText: formatDate(p.startDate),
      endText: formatDate(p.endDate || p.startDate),
      envs: s.envelopes,
      receipts: s.receipts,
      perDiem: s.perDiem,
    });
    const waitingReview = ready.ready && (s.toReview.receipts > 0 || s.toReview.perDiem);
    const mainPill: { label: string; tone: 'slate' | 'amber' | 'violet' | 'green' } = isClosed
      ? { label: st.label, tone: st.tone === 'green' ? 'green' : 'amber' }
      : notEnded ? { label: st.label, tone: 'slate' }
        : !ready.ready ? { label: ready.label, tone: 'amber' }
          : waitingReview ? { label: 'รอบัญชีตรวจ', tone: 'violet' }
            : { label: 'ครบแล้ว', tone: 'green' };
    const moneyEl = (
      <>
        {s.balance.length === 0 && s.inTransit.length === 0 && <p className="zego-text-tertiary">—</p>}
        <div className="space-y-2">
          {s.balance.map((b) => {
            const used = b.land + b.spent;
            const after = Math.round((b.remaining - b.pending) * 100) / 100;
            const scale = Math.max(b.face, used + b.pending) || 1;
            const pct = (n: number) => `${Math.min(100, (n / scale) * 100)}%`;
            const over = after < -0.005;
            return (
              <div key={b.currency}>
                <p className="whitespace-nowrap zego-text">
                  <span className="font-semibold">{money(b.face)}</span>
                  <span className="zego-text-tertiary"> / </span>
                  {money(used)} <span className="text-xs zego-text-tertiary">{b.currency}</span>
                </p>
                <div className="mt-1 flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
                  <span className={over ? 'bg-rose-500' : 'bg-emerald-500'} style={{ width: pct(used) }} />
                  <span className="bg-violet-400" style={{ width: pct(b.pending) }} />
                </div>
                <p className="mt-0.5 whitespace-nowrap text-[11px]">
                  {b.pending > 0 && <span className="text-violet-700">รอตรวจ {money(b.pending)} · </span>}
                  {isClosed ? <span className="zego-text-tertiary">ปิดแล้ว</span>
                    : Math.abs(after) < 0.005 ? <span className="font-semibold text-emerald-700">ใช้ครบ</span>
                      : over ? <span className="font-semibold text-rose-700">ใช้เกิน {money(-after)}</span>
                        : <span className={cx('font-semibold', notEnded ? 'zego-text-secondary' : 'zego-text-danger')}>{notEnded ? 'เหลือ' : 'ต้องคืน'} {money(after)}</span>}
                </p>
              </div>
            );
          })}
        </div>
        {/* ส่งมอบแล้ว หัวหน้าทัวร์ยังไม่กดรับ — ยังไม่นับในยอด แต่เห็นว่าเงินออกไปแล้ว */}
        {s.inTransit.map((t) => (
          <p key={t.currency} className="whitespace-nowrap text-[11px] zego-text-tertiary">รอหัวหน้าทัวร์รับ {formatCurrency(t.amount, t.currency)}</p>
        ))}
        {s.atLeader.receipts > 0 && (
          <p className="whitespace-nowrap text-[11px] zego-text-warning">ใบเสร็จยังไม่ส่ง {s.atLeader.receipts} ใบ</p>
        )}
        {s.outside.map((o) => (
          <p key={o.currency} className="whitespace-nowrap text-[11px] text-amber-800">
            + นอกรายการ {formatCurrency(o.approved + o.pending, o.currency)}{o.pending > 0 ? ' (มีรอตรวจ)' : ''}
          </p>
        ))}
        {/* ปิดแล้ว — เงินที่รับคืนจริง (คืนเป็นสกุลอื่นแสดงตามสกุลที่จ่าย) */}
        {isClosed && (records[p.internalId]?.returned ?? []).map((r, i) => (
          <p key={i} className="whitespace-nowrap text-[11px] font-semibold text-emerald-700">รับคืนแล้ว {money(r.paidAmount ?? r.amount)} {r.paidCurrency ?? r.currency}</p>
        ))}
      </>
    );
    const perDiemEl = (
      <>
        {s.perDiem ? (
          <>
            <p className="whitespace-nowrap text-xs tabular-nums zego-text">{expenseOriginalTotals(s.perDiem).map((t) => formatCurrency(t.amount, t.currency)).join(' · ')}</p>
            <p className="whitespace-nowrap text-[11px] zego-text-tertiary">{EXPENSE_STATUS[s.perDiem.status].label}</p>
          </>
        ) : <p className="whitespace-nowrap text-xs zego-text-tertiary">{notEnded ? 'ส่งได้หลังจบทริป' : 'ยังไม่มีใบเบิก'}</p>}
      </>
    );
    const statusEl = (
      <>
        {/* ปิดแล้วแสดงป้ายผลการปิด · ยังไม่ปิดแสดงแค่ 3 ช่อง (ซอง · ใบเสร็จ · เบี้ยเลี้ยง) — ชี้ดูรายละเอียด */}
        {isClosed && <StatusPill label={mainPill.label} tone={mainPill.tone} />}
        {!isClosed && (
          <span className="flex gap-1">
            {ready.checks.map((c) => (
              <span
                key={c.label}
                title={`${c.label}: ${c.text}`}
                className={cx(
                  'inline-flex items-center gap-0.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset',
                  c.na ? 'bg-slate-50 text-slate-500 ring-slate-200' : c.ok ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200',
                )}
              >
                {!c.na && <span aria-hidden>{c.ok ? '✓' : '!'}</span>}
                {c.label}
              </span>
            ))}
          </span>
        )}
        {/* นัดหมายเคลียร์เงิน */}
        {(() => {
          const ap = clearAppointmentOf(appointments, p.internalId);
          if (!ap || isClosed) return null;
          return (
            <p className={cx('mt-0.5 max-w-[13rem] text-[11px] leading-snug', ap.status === 'rescheduled' ? 'font-semibold text-violet-700' : 'zego-text-secondary')}>
              นัด {formatDate(ap.date)} {ap.time} · {appointmentStatusMeta(ap).label}
            </p>
          );
        })()}
        {/* ยอดค้างติดตาม — ใครค้างใคร เท่าไร */}
        {openFollowUps.map((f) => (
          <p key={f.id} className={cx('mt-0.5 whitespace-nowrap text-[11px] font-semibold', f.direction === 'leader_owes' ? 'zego-text-danger' : 'text-violet-700')}>
            {f.direction === 'leader_owes' ? 'หัวหน้าทัวร์ค้าง' : 'บริษัทค้างจ่าย'} {formatCurrency(followUpRemaining(f), f.currency)}
          </p>
        ))}
        {/* ไม่มีนโยบายกำหนดเคลียร์ (CLEAR_DUE_DAYS = null) = ไม่แสดง */}
        {!isClosed && s.dueDate && (
          <p className={cx('mt-0.5 text-[11px]', s.overdue ? 'font-semibold zego-text-danger' : 'zego-text-tertiary')}>
            กำหนด {formatDate(s.dueDate)}{s.overdue ? ' · เกินกำหนด' : ''}
          </p>
        )}
      </>
    );
    const actionEl = (
      <>
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
      </>
    );

    if (asCard) {
      return (
        <li key={p.internalId} className="space-y-2 px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold zego-text">{p.groupCode}</p>
              <p className="text-xs zego-text-tertiary">{p.countryName || '—'} · <span className="tabular-nums">{formatDateRange(p.startDate, p.endDate)}</span></p>
            </div>
            <div className="shrink-0">{actionEl}</div>
          </div>
          <p className="line-clamp-2 text-sm zego-text-secondary">{p.displayName}</p>
          <p className="text-sm">{leader ? <span className="zego-text">{leader.name}</span> : <span className="zego-text-tertiary">ยังไม่มีหัวหน้าทัวร์</span>}</p>
          {/* เงินในซอง / ใช้แล้ว กับ เบี้ยเลี้ยง — กล่องเดียวกัน อ่านยอดของกรุ๊ปจบในที่เดียว */}
          <div className="space-y-2 rounded-lg zego-surface-soft-bg px-3 py-2 text-sm tabular-nums">
            <div>
              <p className="mb-0.5 text-[11px] zego-text-tertiary">เงินในซอง / ใช้แล้ว</p>
              {moneyEl}
            </div>
            <div className="zego-divider-top pt-2">
              <p className="mb-0.5 text-[11px] zego-text-tertiary">เบี้ยเลี้ยง</p>
              {perDiemEl}
            </div>
          </div>
          <div>{statusEl}</div>
        </li>
      );
    }

    return (
      <tr key={p.internalId} className="zego-hover-surface">
        {/* กรุ๊ป — รหัส · โปรแกรม · ประเทศ + วันเดินทาง · หัวหน้าทัวร์ รวมช่องเดียว (เดิมแยก 4 คอลัมน์ ตารางกว้างจนปุ่มท้ายแถวล้นจอ) */}
        <td className="px-3 py-2.5 align-top">
          <p className="whitespace-nowrap font-semibold zego-text">{p.groupCode}</p>
          <p className="max-w-[15rem] truncate text-xs zego-text-secondary" title={p.displayName}>{p.displayName}</p>
          <p className="whitespace-nowrap text-xs tabular-nums zego-text-tertiary">{p.countryName || '—'} · {formatDateRange(p.startDate, p.endDate)}</p>
          <p className="mt-0.5 flex max-w-[15rem] items-center gap-1 text-xs" title={leader?.name}>
            <Icon name="guide" className="h-3 w-3 shrink-0 zego-text-tertiary" />
            {leader ? <span className="truncate zego-text">{leader.name}</span> : <span className="zego-text-tertiary">ยังไม่มีหัวหน้าทัวร์</span>}
          </p>
        </td>
        {/*
          เงินในซอง / ใช้แล้ว — คอลัมน์เดียว แยกทีละสกุล
            บรรทัดบน: ในซอง / ใช้แล้ว (ส่งแลนด์ + ใบเสร็จตามรายการเบิกที่ตรวจแล้ว)
            แถบ: เขียว ใช้แล้ว · ม่วง รอตรวจ · เทา ยังเหลือ · แดง ใช้เกินซอง
            บรรทัดล่าง: ผล — คิดแบบรอตรวจผ่านหมดแล้ว (ใกล้ยอดเคลียร์จริงที่สุด) · ปิดแล้วแสดงเงินที่รับคืนจริง
          นอกรายการเบิกไม่ใช่เงินในซอง — บรรทัดเล็กท้ายช่อง · รายละเอียด (แลนด์/ใบเสร็จ) ดูในแผงของกรุ๊ป
        */}
        {/* เงินในซอง / ใช้แล้ว + เบี้ยเลี้ยง ช่องเดียว (แบบเดียวกับการ์ดบนจอเล็ก) — ลดความกว้างตาราง */}
        <td className="min-w-[12.5rem] px-3 py-2.5 align-top tabular-nums">
          {moneyEl}
          {/* เบี้ยเลี้ยงบรรทัดเดียว: ยอด · สถานะ */}
          <p className="mt-1.5 zego-divider-top pt-1.5 whitespace-nowrap text-[11px]">
            <span className="zego-text-tertiary">เบี้ยเลี้ยง </span>
            {s.perDiem
              ? <><span className="font-medium zego-text">{expenseOriginalTotals(s.perDiem).map((t) => formatCurrency(t.amount, t.currency)).join(' · ')}</span><span className="zego-text-tertiary"> · {EXPENSE_STATUS[s.perDiem.status].label}</span></>
              : <span className="zego-text-tertiary">{notEnded ? 'ส่งได้หลังจบทริป' : 'ยังไม่มีใบเบิก'}</span>}
          </p>
        </td>
        <td className="px-3 py-2.5 align-top">{statusEl}</td>
        <td className="sticky right-0 w-px whitespace-nowrap zego-surface-bg px-3 py-2.5 text-right align-top shadow-[-8px_0_8px_-8px_rgba(0,0,0,0.15)]">{actionEl}</td>
      </tr>
    );
  };

  return (
    <>
      <PageHeader
        title="เคลียร์เงินกรุ๊ป"
        description="คงเหลือแยกทีละสกุล = ในซอง − ส่งแลนด์ − ใบเสร็จตามรายการเบิกที่ตรวจแล้ว · นอกรายการเบิกไม่หักจากซอง · เบี้ยเลี้ยงโอนแยก"
      />

      {/*
        สรุปสถานะ — แตะเพื่อกรอง
          แถวบน: การ์ดงานที่บัญชีต้องทำ (ใหญ่ มีคำอธิบาย 1 บรรทัด)
          แถวล่าง: ชิปสถานะอื่น (ทั้งหมด · กำลังเดินทาง · ปิดแล้ว) — แสดงเมื่อมีกรุ๊ปหรือกำลังเลือกอยู่
      */}
      <div className="mb-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        {cards.filter((f) => PRIMARY_FILTERS.includes(f.key)).map((f) => {
          const count = searched.filter((r) => rowMatches(r, f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(active ? 'all' : f.key)}
              aria-pressed={active}
              title={f.hint}
              className={cx('zego-card-surface flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition', active ? 'ring-2 ring-emerald-500' : 'hover:ring-1 hover:ring-emerald-200')}
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium zego-text">{f.label}</span>
                <span className="block truncate text-[11px] zego-text-tertiary">{f.hint}</span>
              </span>
              <span className="shrink-0 text-2xl font-bold tabular-nums" style={{ color: count > 0 ? f.tone : undefined }}>{count}</span>
            </button>
          );
        })}
      </div>
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {cards.filter((f) => !PRIMARY_FILTERS.includes(f.key)).map((f) => {
          const count = searched.filter((r) => rowMatches(r, f.key)).length;
          const active = filter === f.key;
          if (f.key !== 'all' && count === 0 && !active) return null;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              title={f.hint}
              className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition', active ? 'border-emerald-600 bg-emerald-600 font-semibold text-white' : 'zego-border-color zego-text-secondary zego-hover-surface')}
            >
              {f.label}
              <span className={cx('tabular-nums', active ? 'text-white' : 'font-semibold zego-text')}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* แถบค้นหา — แบบเดียวกับหน้าจัดการค่าใช้จ่ายกรุ๊ป: กล่องละ 1 เงื่อนไข */}
      <div className="mb-4 flex flex-wrap items-stretch gap-2 xl:flex-nowrap">
        <FilterBox icon="plane" label="เลือกประเทศ" className={cx('w-full sm:w-40', !filtersOpen && 'max-md:hidden')} group>
          <MultiSelectControl
            ariaLabel="เลือกประเทศ"
            value={countrySel}
            onChange={setCountrySel}
            options={countries.map((c) => ({ value: c, label: c }))}
            allLabel="All Country"
            summaryAfter={2}
            summaryFormat={(n) => `${n} ประเทศ`}
            triggerClassName="flex w-full items-center justify-between gap-2 bg-transparent text-left text-sm text-sky-700"
            panelClassName="w-max min-w-full"
          />
        </FilterBox>
        <div className="flex w-full items-stretch gap-2 sm:w-40 max-md:order-first">
          <FilterBox icon="briefcase" label="รหัสกรุ๊ป" className="min-w-0 flex-1">
            <input aria-label="รหัสกรุ๊ป" value={codeQ} onChange={(e) => setCodeQ(e.target.value)} placeholder="กรองข้อมูล..." className={FILTER_INPUT} />
          </FilterBox>
          {/* ตัวเลข = ตัวกรองที่พับไว้แต่ตั้งค่าอยู่ · md:hidden! — .zego-button กำหนด display เองจนคลาสซ่อนปกติไม่มีผล */}
          {(() => {
            const n = [countrySel.length > 0, !!tourN, !!leaderN, !!(dateFrom || dateTo)].filter(Boolean).length;
            return (
              <Button className="shrink-0 self-stretch md:hidden!" variant={n > 0 ? 'primary' : 'secondary'} icon="filter" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
                ตัวกรอง{n > 0 ? ` (${n})` : ''}
              </Button>
            );
          })()}
        </div>
        <FilterBox icon="list" label="รายการทัวร์" className={cx('min-w-[8rem] flex-1', !filtersOpen && 'max-md:hidden')}>
          <input aria-label="รายการทัวร์" value={tourQ} onChange={(e) => setTourQ(e.target.value)} placeholder="กรองข้อมูล..." className={FILTER_INPUT} />
        </FilterBox>
        <FilterBox icon="users" label="หัวหน้าทัวร์" className={cx('w-full sm:w-44', !filtersOpen && 'max-md:hidden')}>
          <input aria-label="หัวหน้าทัวร์" value={leaderQ} onChange={(e) => setLeaderQ(e.target.value)} placeholder="กรองข้อมูล..." className={FILTER_INPUT} />
        </FilterBox>
        <div className={cx('flex w-full shrink-0 items-stretch gap-1 sm:w-auto', !filtersOpen && 'max-md:hidden')}>
          <FilterBox icon="calendar" label="วันที่" className="flex-1 sm:w-36">
            <input type="date" aria-label="ตั้งแต่วันที่" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className={FILTER_INPUT} />
          </FilterBox>
          <button
            type="button"
            aria-label="สลับวันที่เริ่ม-สิ้นสุด"
            title="สลับวันที่เริ่ม-สิ้นสุด"
            onClick={() => { const a = dateFrom; setDateFrom(dateTo); setDateTo(a); }}
            className="self-center rounded-md px-1 py-2 text-base zego-text-secondary zego-hover-surface"
          >
            ⇄
          </button>
          <FilterBox icon="calendar" label="ถึงวันที่" className="flex-1 sm:w-36">
            <input type="date" aria-label="ถึงวันที่" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className={FILTER_INPUT} />
          </FilterBox>
        </div>
        {searching && (
          <Button variant="ghost" size="sm" className="self-center" onClick={clearSearch}>ล้างตัวกรอง</Button>
        )}
      </div>

      <Card padded={false}>
        {shown.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm zego-text-tertiary">
            {rows.length === 0 ? 'ยังไม่มีกรุ๊ปที่มีความเคลื่อนไหวทางเงิน — เมื่อหัวหน้าทัวร์รับซอง หรือส่งใบเสร็จ/ใบเบิก กรุ๊ปจะขึ้นที่นี่' : 'ไม่พบกรุ๊ปที่ตรงกับตัวกรอง'}
          </p>
        ) : (
          <>
          {/* จอเล็ก — การ์ดละกรุ๊ป */}
          <ul className="divide-y divide-[var(--zego-border-soft)] md:hidden">
            {shown.map((r) => renderRow(r, true))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead className="zego-surface-soft-bg text-left">
                <tr>
                  <th className={th}>กรุ๊ป</th>
                  <th className={th}>เงินในซอง / ใช้แล้ว · เบี้ยเลี้ยง</th>
                  <th className={th}>สถานะ</th>
                  <th className={`${th} sticky right-0 zego-surface-soft-bg text-right`}>Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--zego-border-soft)]">
                {shown.map((r) => renderRow(r, false))}
              </tbody>
            </table>
          </div>
          </>
        )}
      </Card>

      {open && (
        <GroupClearDrawer
          key={open.p.internalId}
          summary={open.s}
          leader={open.leader}
          record={records[open.p.internalId]}
          onClose={() => setOpenId(null)}
          onSaved={(keepOpen) => { setRecords(loadGroupClears()); if (!keepOpen) setOpenId(null); }}
        />
      )}
    </>
  );
}
