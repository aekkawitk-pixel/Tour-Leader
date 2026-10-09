'use client';

/**
 * จัดการค่าใช้จ่ายกรุ๊ป — /group-expenses (ฝ่ายบัญชี/การเงิน)
 *
 * เอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้า .xls) → การเงินจัดเงินใส่ซอง → ส่งมอบให้เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์รับ
 * → ส่งแลนด์ / ใช้ตามรายการ · แยกจากเมนู "ตรวจสอบรายการจ่าย" (/expenses) ที่เป็นคิวตรวจ/อนุมัติใบที่หัวหน้าทัวร์ส่งมา
 *
 * การเงินคนเดียวดูแลทั้งสองเรื่องของกรุ๊ป จึงรวมเป็นตารางเดียว (1 แถว = 1 กรุ๊ป):
 *   ซองเงิน   — จัดซอง/ส่งมอบเงินกรุ๊ปก่อนเดินทาง
 *   เบี้ยเลี้ยง — ใบเบิกเบี้ยเลี้ยงหัวหน้าทัวร์ หลังจบทริป ตรวจ/อนุมัติ/บันทึกโอน
 * การ์ดสรุปด้านบน = งานที่ต้องทำของทั้งสองเรื่อง · ปุ่ม "จัดการ" เปิดแผงของกรุ๊ป
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { PageHeader, Button, cx } from '@/components/ui/Primitives';
import { FilterBox, FILTER_INPUT } from '@/components/ui/FilterBox';
import { MultiSelectControl } from '@/components/ui/MultiSelect';
import { AdvanceImportModal } from '@/components/expenses/AdvanceImportModal';
import { GroupExpensesCard, perDiemStage, type GroupDocs, type GroupExpenseRow, type PerDiemRow } from '@/components/expenses/GroupExpensesCard';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { groupEnvelopeStatus, groupLines } from '@/lib/logic/cashEnvelope';
import { getAssignablePeriods, getTourPeriodById } from '@/services/tourPeriodMaster';
import { toISODate } from '@/lib/format';
import { advanceDocFallback } from '@/lib/logic/advanceDocFallback';

type EnvStatus = { stage: string; mismatch: boolean };

/*
  การ์ดสรุป = งานที่ต้องทำ ของซองเงิน (ก่อนเดินทาง) และเบี้ยเลี้ยง (หลังจบทริป) · แตะเพื่อกรอง
  สถานะที่ไม่ต้องทำอะไรแล้ว (รับแล้ว / ไม่มีซอง / โอนแล้ว) ไม่มีการ์ดแยก — รวมอยู่ใน "เสร็จครบ"
*/
type Filter =
  | 'all'
  | 'env_no_docs' | 'env_packing' | 'env_sealed' | 'env_handed_over' | 'env_mismatch'
  | 'pd_to_claim' | 'pd_submitted' | 'pd_to_pay'
  | 'done';

const FILTERS: { key: Filter; label: string; hint: string; tone: string }[] = [
  { key: 'all', label: 'ทั้งหมด', hint: 'ทุกกรุ๊ปตามตัวกรอง', tone: '#475569' },
  { key: 'env_no_docs', label: 'ซอง · รอการทำเบิก', hint: 'ยังไม่พบเอกสารเบิก', tone: '#64748b' },
  { key: 'env_packing', label: 'ซอง · รอจัดซอง', hint: 'ยังจัดไม่ครบทุกรายการ', tone: '#b45309' },
  { key: 'env_sealed', label: 'ซอง · รอส่งมอบ', hint: 'ปิดซองแล้ว', tone: '#0369a1' },
  { key: 'env_handed_over', label: 'ซอง · ระหว่างส่งมอบ', hint: 'รอเจ้าหน้าที่ / หัวหน้าทัวร์ยืนยันรับ', tone: '#6d28d9' },
  { key: 'env_mismatch', label: 'ซอง · แจ้งปัญหา', hint: 'ยอดไม่ตรง / ไม่ได้รับซอง', tone: '#be123c' },
  { key: 'pd_to_claim', label: 'เบี้ยเลี้ยง · รอทำเบิก', hint: 'จบทริปแล้ว หัวหน้าทัวร์ยังไม่ทำใบเบิก', tone: '#b45309' },
  { key: 'pd_submitted', label: 'เบี้ยเลี้ยง · รออนุมัติ', hint: 'การเงินต้องตรวจ', tone: '#6d28d9' },
  { key: 'pd_to_pay', label: 'เบี้ยเลี้ยง · รอโอน', hint: 'อนุมัติแล้ว ยังไม่โอน', tone: '#0369a1' },
  { key: 'done', label: 'เสร็จครบ', hint: 'ซองถึงมือหัวหน้าทัวร์ + โอนเบี้ยเลี้ยงแล้ว', tone: '#15803d' },
];

/** ซองเสร็จ = ไม่ต้องจัดซอง / หัวหน้าทัวร์รับแล้ว / ระบุไม่มีซอง (และไม่มีปัญหาค้าง) */
const envelopeDone = (s: EnvStatus | null) => !s || (!s.mismatch && (s.stage === 'received' || s.stage === 'none'));

function matches(env: EnvStatus | null, pd: PerDiemRow | null, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'done') return envelopeDone(env) && (!pd || pd.stage === 'paid');
  if (f.startsWith('pd_')) return pd?.stage === f.slice(3);
  if (!env) return false;
  if (f === 'env_mismatch') return env.mismatch;
  return !env.mismatch && env.stage === f.slice(4);
}

export default function GroupExpensesPage() {
  const { expenses, envelopes, currentUser, resetEnvelopes, noEnvelopeMarks, leaders } = useDemo();
  const [filter, setFilter] = useState<Filter>('all');

  const [importOpen, setImportOpen] = useState(false);
  const [resetting, setResetting] = useState(false);

  // ล้างซองทั้งหมด (จัดซอง/ส่งมอบ/รับ/ส่งแลนด์ + รูป) — เอกสารเบิกที่นำเข้ายังอยู่ ใช้ทดสอบ flow ใหม่ตั้งแต่ต้น
  const onReset = async () => {
    if (!window.confirm(`รีเซ็ตซองเงินทั้งหมด ${envelopes.length} ซอง?\nทุกกรุ๊ปจะกลับไปสถานะ "รอจัดซอง" (เอกสารเบิกที่นำเข้ายังอยู่) — ย้อนกลับไม่ได้`)) return;
    setResetting(true);
    try {
      await resetEnvelopes();
    } catch {
      /* แจ้งผ่าน toast แล้ว */
    } finally {
      setResetting(false);
    }
  };
  const canImport = can(currentUser.role, 'expense.create') || can(currentUser.role, 'expense.approve');

  // 1 แถว = 1 กรุ๊ป (เอกสารเบิกหลายใบของกรุ๊ปเดียวกันรวมกัน — ซองเงินเป็นของกรุ๊ป)
  // กรุ๊ปปัจจุบัน (ยังไม่จบทริป) ขึ้นทุกกรุ๊ปแม้ยังไม่มีเอกสารเบิก — การเงินเห็นล่วงหน้าว่ากรุ๊ปไหนยังรอทำเบิก
  const groups = useMemo(() => {
    const m = new Map<string, GroupDocs>();
    const today = toISODate(new Date());
    for (const p of getAssignablePeriods()) {
      if (p.endDate >= today) m.set(p.internalId, { periodId: p.internalId, docs: [] });
    }
    for (const d of expenses.filter(isGroupAdvanceDoc)) {
      const g = m.get(d.jobId) ?? { periodId: d.jobId, docs: [] };
      g.docs.push(d);
      m.set(d.jobId, g);
    }
    return [...m.values()];
  }, [expenses]);
  // สถานะทุกกรุ๊ปคำนวณครั้งเดียว — กรุ๊ปเป็นร้อยต่อเดือน การ์ดสรุปนับซ้ำทุกตัวกรอง
  const statuses = useMemo(() => {
    const m = new Map<string, EnvStatus>();
    for (const g of groups) {
      const mark = noEnvelopeMarks.find((x) => x.periodId === g.periodId);
      // ยังไม่มีเอกสารเบิก = รอการทำเบิก — เว้นแต่การเงินระบุไว้แล้วว่ากรุ๊ปนี้ไม่มีซอง
      m.set(g.periodId, g.docs.length === 0 && !mark
        ? { stage: 'no_docs', mismatch: false }
        : groupEnvelopeStatus(groupLines(g.docs), envelopes.filter((e) => e.periodId === g.periodId), mark));
    }
    return m;
  }, [groups, envelopes, noEnvelopeMarks]);

  /*
    เบี้ยเลี้ยง — ทุกกรุ๊ปของซองเงิน (กรุ๊ปปัจจุบัน + กรุ๊ปที่มีเอกสารเบิก)
    รวมกรุ๊ปที่จบทริปแล้วแต่มีหัวหน้าทัวร์คอนเฟิร์ม / มีใบเบิกเบี้ยเลี้ยง — เบี้ยเลี้ยงเบิกหลังจบทริป
    ใบเบิก = ใบเบิกเบี้ยเลี้ยงที่ยังมีผลของหัวหน้าทัวร์คนนั้น (ใบยกเลิก/ปฏิเสธไม่นับ ทำใหม่ได้)
    ยังไม่มีหัวหน้าทัวร์ = ยังขึ้นในตาราง (สถานะ "ยังไม่มีหัวหน้าทัวร์")
  */
  const perDiemRows = useMemo(() => {
    const today = toISODate(new Date());
    const leaderOf = new Map<string, { id: string; name: string }>();
    for (const a of loadActiveGuideAssignments()) {
      if (a.assignmentStatus !== 'CONFIRMED' || leaderOf.has(a.periodId)) continue;
      const l = leaders.find((x) => x.id === a.tourLeaderId);
      if (l) leaderOf.set(a.periodId, { id: l.id, name: `${l.firstName} ${l.lastName}`.trim() });
    }
    const claimPeriods = expenses
      .filter((e) => e.claimKind === 'per_diem' && e.status !== 'cancelled' && e.status !== 'rejected')
      .map((e) => e.jobId);
    const ids = new Set([...groups.map((g) => g.periodId), ...leaderOf.keys(), ...claimPeriods]);
    const m = new Map<string, PerDiemRow>();
    for (const id of ids) {
      const p = getTourPeriodById(id);
      if (!p) continue;
      const leader = leaderOf.get(id) ?? null;
      // มีหัวหน้าทัวร์ = ใบของคนนั้น · ยังไม่มี = ใบเบิกใดก็ได้ของกรุ๊ป (เช่น ถอดหัวหน้าทัวร์ภายหลัง)
      const claim = leader
        ? activeLeaderClaim(expenses, id, leader.id, 'per_diem')
        : expenses.find((e) => e.claimKind === 'per_diem' && e.jobId === id && e.status !== 'cancelled' && e.status !== 'rejected') ?? null;
      m.set(id, { periodId: id, leader, claim, stage: perDiemStage(claim, p.endDate, today, !!leader) });
    }
    return m;
  }, [expenses, leaders, groups]);
  // แถวเดียวต่อกรุ๊ป — กรุ๊ปของซองเงิน + กรุ๊ปที่มีแต่เบี้ยเลี้ยง (จบทริปแล้ว ไม่มีเอกสารเบิก)
  const base = useMemo<GroupExpenseRow[]>(() => {
    const docsOf = new Map(groups.map((g) => [g.periodId, g.docs]));
    const ids = new Set([...docsOf.keys(), ...perDiemRows.keys()]);
    return [...ids].map((periodId) => ({
      periodId,
      docs: docsOf.get(periodId) ?? [],
      hasEnvelope: docsOf.has(periodId),
      perDiem: perDiemRows.get(periodId) ?? null,
    }));
  }, [groups, perDiemRows]);

  /*
    แถบค้นหา — ประเทศ · รหัสกรุ๊ป · รายการทัวร์ · ช่วงวันที่เดินทาง
    ค่าเริ่มต้นช่วงวันที่ = วันนี้ → วันกลับของกรุ๊ปสุดท้าย · การ์ดสรุปนับตามผลค้นหา
  */
  // เลือกได้หลายประเทศ — ไม่เลือก = ทุกประเทศ
  const [countrySel, setCountrySel] = useState<string[]>([]);
  const [codeQ, setCodeQ] = useState('');
  const [tourQ, setTourQ] = useState('');
  const lastEnd = useMemo(
    () => base.reduce((max, g) => { const d = getTourPeriodById(g.periodId)?.endDate ?? ''; return d > max ? d : max; }, ''),
    [base],
  );
  const firstStart = useMemo(
    () => base.reduce((min, g) => { const d = getTourPeriodById(g.periodId)?.startDate ?? ''; return d && (!min || d < min) ? d : min; }, ''),
    [base],
  );
  /*
    ช่วงเดินทาง — ก่อนเดินทาง = ยังไม่ออกเดินทาง (ออกวันนี้นับเป็นก่อนเดินทาง ยังต้องจัดซองให้ทัน)
    หลังเดินทาง = ออกเดินทางไปแล้ว (รวมกรุ๊ปที่กำลังเดินทาง) · ค่าเริ่มต้น = ทั้งหมด (ซองเงิน + เบี้ยเลี้ยง)
  */
  const [trip, setTrip] = useState<'all' | 'before' | 'after'>('all');
  /** จอเล็ก: ประเทศ / รายการทัวร์ / ช่วงวันที่ พับไว้ — เหลือรหัสกรุ๊ปกับช่วงเดินทางที่ใช้บ่อย */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const today = toISODate(new Date());
  // ไม่ได้ตั้งวันเริ่มเอง = อัตโนมัติ: ก่อนเดินทางเริ่มวันนี้ · ทั้งหมด / หลังเดินทาง ดูย้อนหลังได้
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const dateFromEff = dateFrom || (trip === 'before' ? today : firstStart);
  // หลังเดินทาง = ออกเดินทางแล้ว → ถึงวันนี้ (ไม่ใช่วันกลับของกรุ๊ปสุดท้ายในอนาคต) · ก่อนเดินทาง = ถึงวันกลับของกรุ๊ปสุดท้าย
  const dateToEff = dateTo || (trip === 'after' ? today : lastEnd);
  const countries = useMemo(
    // ไม่พบกรุ๊ปใน Master — ใช้ประเทศจากรหัสกรุ๊ปในเอกสารเบิก (ให้เลือกกรองได้เหมือนกรุ๊ปอื่น)
    () => [...new Set(base.map((g) => getTourPeriodById(g.periodId)?.countryName || advanceDocFallback(g.docs[0]?.sourceDoc).countryName).filter((c): c is string => !!c))].sort((a, b) => a.localeCompare(b)),
    [base],
  );

  const has = (text: string | undefined | null, needle: string) => !needle || (text ?? '').toLowerCase().includes(needle);
  const codeN = codeQ.trim().toLowerCase();
  const tourN = tourQ.trim().toLowerCase();
  const searched = base.filter((g) => {
    const p = getTourPeriodById(g.periodId);
    const src = g.docs[0]?.sourceDoc;
    // ไม่พบกรุ๊ปใน Master — ใช้วันเดินทาง/ประเทศจากตัวเอกสารเบิก (ไม่งั้นหลุดตัวกรองช่วงเดินทาง เช่น กรุ๊ปที่ไปแล้วขึ้นใน "ก่อนเดินทาง")
    const fb = p ? null : advanceDocFallback(src);
    const range = p ?? (fb?.startDate && fb.endDate ? { startDate: fb.startDate, endDate: fb.endDate } : null);
    if (countrySel.length > 0 && !countrySel.includes(p?.countryName ?? fb?.countryName ?? '')) return false;
    // รหัสกรุ๊ป — ค้นเลขที่เอกสารเบิก (Ref) ได้ด้วย
    if (!has([p?.groupCode, src?.groupCode, ...g.docs.map((d) => d.id)].join(' '), codeN)) return false;
    if (!has([p?.displayName, p?.tourName, p?.programCode, src?.programName].join(' '), tourN)) return false;
    // ช่วงวันที่ — กรุ๊ปที่เดินทางคาบเกี่ยวช่วงที่เลือก (ไม่มีทั้งพีเรียดและวันในเอกสารเบิก = ไม่กรองวันที่)
    if (range && trip === 'before' && range.startDate < today) return false;
    if (range && trip === 'after' && range.startDate >= today) return false;
    if (range && dateFromEff && range.endDate < dateFromEff) return false;
    if (range && dateToEff && range.startDate > dateToEff) return false;
    return true;
  });
  const rowMatches = (g: GroupExpenseRow, f: Filter) => matches(g.hasEnvelope ? statuses.get(g.periodId) ?? null : null, g.perDiem, f);
  // ระยะห่างจากวันนี้ — ใช้เรียงเมื่อดูทั้งหมด: กรุ๊ปที่ออกใกล้วันนี้ที่สุด (เพิ่งกลับ / ใกล้ออก) อยู่บน
  const distance = (iso: string) => Math.abs(new Date(`${iso}T00:00:00`).getTime() - new Date(`${today}T00:00:00`).getTime());
  const shown = searched
    .filter((g) => rowMatches(g, filter))
    // ก่อนเดินทาง: ออกใกล้สุดก่อน (จัดซองให้ทัน) · หลังเดินทาง: ออกล่าสุดก่อน (เพิ่งกลับ/กำลังเดินทาง อยู่บน)
    .sort((a, b) => {
      const sa = getTourPeriodById(a.periodId)?.startDate;
      const sb = getTourPeriodById(b.periodId)?.startDate;
      if (trip === 'all') return (sa ? distance(sa) : Infinity) - (sb ? distance(sb) : Infinity);
      const c = (sa ?? '9').localeCompare(sb ?? '9');
      return trip === 'after' ? -c : c;
    });
  const searching = !!(countrySel.length > 0 || codeN || tourN || dateTo || dateFrom || trip !== 'all');
  const clearSearch = () => { setCountrySel([]); setCodeQ(''); setTourQ(''); setDateFrom(''); setDateTo(''); setTrip('all'); };

  // แบ่งหน้า — เปลี่ยนตัวกรอง/คำค้น/ขนาดหน้า กลับไปหน้าแรก
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const sig = [filter, trip, countrySel.join(','), codeN, tourN, dateFromEff, dateToEff, pageSize].join('|');
  const [prevSig, setPrevSig] = useState(sig);
  if (prevSig !== sig) { setPrevSig(sig); setPage(1); }
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = shown.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      <PageHeader
        title="จัดการค่าใช้จ่ายกรุ๊ป"
        description="ซองเงิน: การเงินจัดซอง → เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ · เบี้ยเลี้ยง: จบทริป → หัวหน้าทัวร์ทำใบเบิก → การเงินตรวจ / อนุมัติ → โอน"
        actions={(
          <>
            {(envelopes.length > 0 || noEnvelopeMarks.length > 0) && (
              <Button variant="secondary" loading={resetting} onClick={onReset}>
                รีเซ็ตซองเงิน (ทดสอบใหม่)
              </Button>
            )}
            {canImport && (
              <Button variant="primary" icon="download" onClick={() => setImportOpen(true)}>
                นำเข้าเอกสารเบิก (.xls)
              </Button>
            )}
          </>
        )}
      />

      {/* งานที่ต้องทำ — ซองเงิน + เบี้ยเลี้ยง · แตะเพื่อกรอง · จอเล็ก: การ์ดย่อ (ชื่อ + ตัวเลข ไม่มีคำอธิบาย) */}
      <div className="mb-4 grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2">
        {FILTERS.map((f) => {
          const count = searched.filter((g) => rowMatches(g, f.key)).length;
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              aria-pressed={active}
              className={cx('zego-card-surface rounded-xl px-2 py-1.5 text-left transition sm:px-3 sm:py-2.5', active ? 'ring-2 ring-emerald-500' : 'hover:ring-1 hover:ring-emerald-200')}
            >
              <p className="line-clamp-2 text-[11px] leading-tight zego-text-tertiary sm:text-xs">{f.label}</p>
              <p className="text-lg font-bold tabular-nums sm:text-2xl" style={{ color: count > 0 && f.key !== 'all' ? f.tone : undefined }}>{count}</p>
              <p className="hidden text-[11px] zego-text-tertiary sm:block">{f.hint}</p>
            </button>
          );
        })}
      </div>

      {/* แถบค้นหา — กล่องละ 1 เงื่อนไข: ไอคอน + ชื่อช่องด้านบน ค่าที่เลือกด้านล่าง */}
      <div className="mb-4 flex flex-wrap items-stretch gap-2 2xl:flex-nowrap">
        <FilterBox icon="plane" label="เลือกประเทศ" className={cx('w-full sm:w-44', !filtersOpen && 'max-md:hidden')} group>
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
        <div className="flex w-full items-stretch gap-2 sm:w-44 max-md:order-first">
          <FilterBox icon="briefcase" label="รหัสกรุ๊ป" className="min-w-0 flex-1">
            <input aria-label="รหัสกรุ๊ป" value={codeQ} onChange={(e) => setCodeQ(e.target.value)} placeholder="กรองข้อมูล..." className={FILTER_INPUT} />
          </FilterBox>
          {/* ตัวเลข = ตัวกรองที่พับไว้แต่ตั้งค่าอยู่ (ประเทศ / รายการทัวร์ / วันที่) */}
          <Button className="shrink-0 self-stretch md:hidden!" variant={countrySel.length > 0 || tourN || dateFrom || dateTo ? 'primary' : 'secondary'} icon="filter" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((v) => !v)}>
            ตัวกรอง{(() => { const n = [countrySel.length > 0, !!tourN, !!(dateFrom || dateTo)].filter(Boolean).length; return n > 0 ? ` (${n})` : ''; })()}
          </Button>
        </div>
        <FilterBox icon="list" label="รายการทัวร์" className={cx('min-w-[10rem] flex-1', !filtersOpen && 'max-md:hidden')}>
          <input aria-label="รายการทัวร์" value={tourQ} onChange={(e) => setTourQ(e.target.value)} placeholder="กรองข้อมูล..." className={FILTER_INPUT} />
        </FilterBox>
        <div className={cx('flex w-full shrink-0 items-stretch gap-1 sm:w-auto', !filtersOpen && 'max-md:hidden')}>
          <FilterBox icon="calendar" label="วันที่" className="flex-1 sm:w-36">
            <input type="date" aria-label="ตั้งแต่วันที่" value={dateFromEff} onChange={(e) => setDateFrom(e.target.value)} className={FILTER_INPUT} />
          </FilterBox>
          <button
            type="button"
            aria-label="สลับวันที่เริ่ม-สิ้นสุด"
            title="สลับวันที่เริ่ม-สิ้นสุด"
            onClick={() => { const a = dateFromEff; setDateFrom(dateToEff); setDateTo(a); }}
            className="self-center rounded-md px-1 py-2 text-base zego-text-secondary zego-hover-surface"
          >
            ⇄
          </button>
          <FilterBox icon="calendar" label="ถึงวันที่" className="flex-1 sm:w-36">
            <input type="date" aria-label="ถึงวันที่" value={dateToEff} onChange={(e) => setDateTo(e.target.value)} className={FILTER_INPUT} />
          </FilterBox>
        </div>
        <FilterBox icon="plane" label="ช่วงเดินทาง" className="w-full sm:w-auto" group>
          <span className="flex gap-1" role="group" aria-label="ช่วงเดินทาง">
            {([['all', 'ทั้งหมด'], ['before', 'ก่อนเดินทาง'], ['after', 'หลังเดินทาง']] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={trip === v}
                onClick={() => setTrip(v)}
                className={cx('whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs transition', trip === v ? 'bg-emerald-600 font-semibold text-white' : 'zego-text-secondary zego-hover-surface')}
              >
                {label}
              </button>
            ))}
          </span>
        </FilterBox>
        {searching && (
          <Button variant="ghost" size="sm" className="self-center" onClick={clearSearch}>ล้างตัวกรอง</Button>
        )}
      </div>

      <GroupExpensesCard
        rows={pageRows}
        emptyText={base.length === 0 ? 'ยังไม่มีกรุ๊ป — กด "นำเข้าเอกสารเบิก (.xls)"' : 'ไม่พบกรุ๊ปที่ตรงกับตัวกรอง'}
      />
      {shown.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm zego-text-secondary">
          <span>พบ <strong className="zego-text">{shown.length}</strong> กรุ๊ป</span>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs">แสดง
              <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="zego-border-color zego-surface-bg rounded-lg border px-2 py-1 text-sm">
                {[25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>/หน้า
            </label>
            <span className="tabular-nums">หน้า {safePage}/{totalPages}</span>
            <div className="inline-flex gap-1">
              <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setPage(safePage - 1)}>ก่อนหน้า</Button>
              <Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => setPage(safePage + 1)}>ถัดไป</Button>
            </div>
          </div>
        </div>
      )}

      <AdvanceImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </>
  );
}
