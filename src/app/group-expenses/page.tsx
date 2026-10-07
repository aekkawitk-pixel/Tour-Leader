'use client';

/**
 * จัดการค่าใช้จ่ายกรุ๊ป — /group-expenses (ฝ่ายบัญชี/การเงิน)
 *
 * เอกสารเบิกค่าใช้จ่ายกรุ๊ป (นำเข้า .xls) → การเงินจัดเงินใส่ซอง → ส่งมอบให้เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์รับ
 * → ส่งแลนด์ / ใช้ตามรายการ · แยกจากเมนู "ตรวจสอบรายการจ่าย" (/expenses) ที่เป็นคิวตรวจ/อนุมัติใบที่หัวหน้าทัวร์ส่งมา
 *
 * 2 แท็บ ใช้แถบค้นหาชุดเดียวกัน:
 *   ซองเงิน   — จัดซอง/ส่งมอบเงินกรุ๊ปก่อนเดินทาง (ค่าเริ่มต้น: ก่อนเดินทาง)
 *   เบี้ยเลี้ยง — ใบเบิกเบี้ยเลี้ยงหัวหน้าทัวร์ หลังจบทริป ตรวจ/อนุมัติ/บันทึกโอน (ค่าเริ่มต้น: หลังเดินทาง)
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { PageHeader, Button, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { FilterBox, FILTER_INPUT } from '@/components/ui/FilterBox';
import { MultiSelectControl } from '@/components/ui/MultiSelect';
import { GroupAdvanceDocsCard, type GroupDocs } from '@/components/expenses/GroupAdvanceDocsCard';
import { AdvanceImportModal } from '@/components/expenses/AdvanceImportModal';
import { GroupPerDiemCard, PER_DIEM_STAGE, perDiemStage, type PerDiemRow, type PerDiemStage } from '@/components/expenses/GroupPerDiemCard';
import { activeLeaderClaim } from '@/lib/logic/leaderClaims';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { isGroupAdvanceDoc } from '@/lib/logic/groupBudget';
import { groupEnvelopeStatus, groupLines } from '@/lib/logic/cashEnvelope';
import { getAssignablePeriods, getTourPeriodById } from '@/services/tourPeriodMaster';
import { toISODate } from '@/lib/format';
import { advanceDocFallback } from '@/lib/logic/advanceDocFallback';

type Filter = 'all' | 'no_docs' | 'packing' | 'sealed' | 'handed_over' | 'received' | 'mismatch' | 'none';

const FILTERS: { key: Filter; label: string; hint: string; tone: string }[] = [
  { key: 'all', label: 'ทั้งหมด', hint: 'กรุ๊ปปัจจุบัน + กรุ๊ปที่มีเอกสารเบิก', tone: '#475569' },
  { key: 'no_docs', label: 'รอการทำเบิก', hint: 'ยังไม่พบเอกสารเบิก', tone: '#64748b' },
  { key: 'packing', label: 'รอจัดซอง', hint: 'ยังจัดไม่ครบทุกรายการ', tone: '#b45309' },
  { key: 'sealed', label: 'รอส่งมอบ', hint: 'ปิดซองแล้ว', tone: '#0369a1' },
  { key: 'handed_over', label: 'ระหว่างส่งมอบ', hint: 'รอเจ้าหน้าที่ / หัวหน้าทัวร์ยืนยันรับ', tone: '#6d28d9' },
  { key: 'received', label: 'หัวหน้าทัวร์รับแล้ว', hint: 'อยู่ในมือหัวหน้าทัวร์', tone: '#15803d' },
  { key: 'mismatch', label: 'แจ้งปัญหาซอง', hint: 'ยอดไม่ตรง / ไม่ได้รับซอง', tone: '#be123c' },
  { key: 'none', label: 'ไม่มีซอง', hint: 'การเงินระบุว่าไม่ต้องจัดซอง', tone: '#475569' },
];

type Tab = 'envelope' | 'per_diem';
type PdFilter = 'all' | PerDiemStage;
const PD_HINT: Record<PerDiemStage, string> = {
  no_leader: 'จบทริปแล้ว ไม่มีหัวหน้าทัวร์ในระบบ',
  not_ended: 'ยังทำเบิกไม่ได้',
  to_claim: 'จบทริปแล้ว ยังไม่มีใบเบิก',
  draft: 'หัวหน้าทัวร์ยังไม่ส่งอนุมัติ',
  submitted: 'การเงินต้องตรวจ',
  revise: 'รอหัวหน้าทัวร์แก้',
  to_pay: 'อนุมัติแล้ว ยังไม่โอน',
  paid: 'จ่ายเรียบร้อย',
};
const PD_TONE: Record<PerDiemStage, string> = {
  no_leader: '#64748b', not_ended: '#64748b', to_claim: '#b45309', draft: '#64748b', submitted: '#6d28d9', revise: '#b45309', to_pay: '#0369a1', paid: '#15803d',
};
const PD_FILTERS: { key: PdFilter; label: string; hint: string; tone: string }[] = [
  { key: 'all', label: 'ทั้งหมด', hint: 'กรุ๊ปปัจจุบัน + กรุ๊ปที่มีหัวหน้าทัวร์/ใบเบิก', tone: '#475569' },
  ...(Object.keys(PER_DIEM_STAGE) as PerDiemStage[]).map((k) => ({ key: k, label: PER_DIEM_STAGE[k].label, hint: PD_HINT[k], tone: PD_TONE[k] })),
];

function matches(s: { stage: string; mismatch: boolean }, f: Filter): boolean {
  if (f === 'all') return true;
  if (f === 'mismatch') return s.mismatch;
  return s.stage === f;
}

export default function GroupExpensesPage() {
  const { expenses, envelopes, currentUser, resetEnvelopes, noEnvelopeMarks, leaders } = useDemo();
  const [tab, setTab] = useState<Tab>('envelope');
  const [filter, setFilter] = useState<Filter>('all');
  const [pdFilter, setPdFilter] = useState<PdFilter>('all');

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
    const m = new Map<string, { stage: string; mismatch: boolean }>();
    for (const g of groups) {
      m.set(g.periodId, g.docs.length === 0
        ? { stage: 'no_docs', mismatch: false }
        : groupEnvelopeStatus(groupLines(g.docs), envelopes.filter((e) => e.periodId === g.periodId), noEnvelopeMarks.find((x) => x.periodId === g.periodId)));
    }
    return m;
  }, [groups, envelopes, noEnvelopeMarks]);
  const statusOf = (g: GroupDocs) => statuses.get(g.periodId)!;

  /*
    แท็บเบี้ยเลี้ยง — ทุกกรุ๊ปเหมือนแท็บซองเงิน (กรุ๊ปปัจจุบัน + กรุ๊ปที่มีเอกสารเบิก)
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
  const perDiemGroups = useMemo<GroupDocs[]>(() => [...perDiemRows.keys()].map((periodId) => ({ periodId, docs: [] })), [perDiemRows]);
  // แถวของแท็บที่เปิดอยู่ — แถบค้นหา/แบ่งหน้าใช้ร่วมกัน
  const base = tab === 'envelope' ? groups : perDiemGroups;

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
    หลังเดินทาง = ออกเดินทางไปแล้ว (รวมกรุ๊ปที่กำลังเดินทาง) · ค่าเริ่มต้น = ก่อนเดินทาง
  */
  const [trip, setTrip] = useState<'before' | 'after'>('before');
  const today = toISODate(new Date());
  // ไม่ได้ตั้งวันเริ่มเอง = อัตโนมัติ: ดูย้อนหลังได้เมื่อเลือกหลังเดินทาง ไม่งั้นเริ่มวันนี้
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const dateFromEff = dateFrom || (trip === 'after' ? firstStart : today);
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
  const pdMatches = (g: GroupDocs, f: PdFilter) => f === 'all' || perDiemRows.get(g.periodId)?.stage === f;
  const shown = searched
    .filter((g) => (tab === 'envelope' ? matches(statusOf(g), filter) : pdMatches(g, pdFilter)))
    // ก่อนเดินทาง: ออกใกล้สุดก่อน (จัดซองให้ทัน) · หลังเดินทาง: ออกล่าสุดก่อน (เพิ่งกลับ/กำลังเดินทาง อยู่บน)
    .sort((a, b) => {
      const c = (getTourPeriodById(a.periodId)?.startDate ?? '9').localeCompare(getTourPeriodById(b.periodId)?.startDate ?? '9');
      return trip === 'after' ? -c : c;
    });
  // ช่วงเดินทางเริ่มต้นตามแท็บ — ซองเงินจัดก่อนเดินทาง · เบี้ยเลี้ยงเบิกหลังเดินทาง
  const tripDefault = tab === 'envelope' ? 'before' : 'after';
  const switchTab = (t: Tab) => { setTab(t); setTrip(t === 'envelope' ? 'before' : 'after'); setDateFrom(''); setDateTo(''); };
  const searching = !!(countrySel.length > 0 || codeN || tourN || dateTo || dateFrom || trip !== tripDefault);
  const clearSearch = () => { setCountrySel([]); setCodeQ(''); setTourQ(''); setDateFrom(''); setDateTo(''); setTrip(tripDefault); };

  // แบ่งหน้า — เปลี่ยนตัวกรอง/คำค้น/ขนาดหน้า กลับไปหน้าแรก
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const sig = [tab, filter, pdFilter, trip, countrySel.join(','), codeN, tourN, dateFromEff, dateToEff, pageSize].join('|');
  const [prevSig, setPrevSig] = useState(sig);
  if (prevSig !== sig) { setPrevSig(sig); setPage(1); }
  const totalPages = Math.max(1, Math.ceil(shown.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = shown.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      <PageHeader
        title="จัดการค่าใช้จ่ายกรุ๊ป"
        description={tab === 'envelope'
          ? 'เอกสารเบิกค่าใช้จ่ายกรุ๊ป · การเงินจัดซอง → เจ้าหน้าที่ส่งกรุ๊ป → หัวหน้าทัวร์ → ส่งแลนด์ / ใช้ตามรายการ'
          : 'เบี้ยเลี้ยงหัวหน้าทัวร์ · จบทริป → หัวหน้าทัวร์ทำใบเบิก → การเงินตรวจ / อนุมัติ → โอนเข้าบัญชี'}
        actions={tab === 'envelope' && (
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

      {/* แท็บ — ซองเงิน (ก่อนเดินทาง) | เบี้ยเลี้ยง (หลังเดินทาง) */}
      <div className="mb-4 flex gap-1 border-b zego-border-color" role="tablist" aria-label="ประเภทงาน">
        {([['envelope', 'ซองเงิน', 'money'], ['per_diem', 'เบี้ยเลี้ยง', 'receipt']] as const).map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => switchTab(k)}
            className={cx(
              '-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm transition',
              tab === k ? 'border-emerald-600 font-semibold text-emerald-700' : 'border-transparent zego-text-secondary hover:text-emerald-700',
            )}
          >
            <Icon name={icon} className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* สรุปสถานะเบี้ยเลี้ยง — แตะเพื่อกรอง */}
      {tab === 'per_diem' && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-9">
          {PD_FILTERS.map((f) => {
            const count = searched.filter((g) => pdMatches(g, f.key)).length;
            const active = pdFilter === f.key;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() => setPdFilter(f.key)}
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
      )}

      {/* สรุปสถานะซอง — แตะเพื่อกรอง */}
      {tab === 'envelope' && (
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {FILTERS.map((f) => {
          const count = searched.filter((g) => matches(statusOf(g), f.key)).length;
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
      )}

      {/* แถบค้นหา — กล่องละ 1 เงื่อนไข: ไอคอน + ชื่อช่องด้านบน ค่าที่เลือกด้านล่าง */}
      <div className="mb-4 flex flex-wrap items-stretch gap-2 2xl:flex-nowrap">
        <FilterBox icon="plane" label="เลือกประเทศ" className="w-full sm:w-44" group>
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
        <FilterBox icon="briefcase" label="รหัสกรุ๊ป" className="w-full sm:w-44">
          <input aria-label="รหัสกรุ๊ป" value={codeQ} onChange={(e) => setCodeQ(e.target.value)} placeholder="กรองข้อมูล..." className={FILTER_INPUT} />
        </FilterBox>
        <FilterBox icon="list" label="รายการทัวร์" className="min-w-[10rem] flex-1">
          <input aria-label="รายการทัวร์" value={tourQ} onChange={(e) => setTourQ(e.target.value)} placeholder="กรองข้อมูล..." className={FILTER_INPUT} />
        </FilterBox>
        <div className="flex w-full shrink-0 items-stretch gap-1 sm:w-auto">
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
            {([['before', 'ก่อนเดินทาง'], ['after', 'หลังเดินทาง']] as const).map(([v, label]) => (
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

      {tab === 'envelope' ? (
        <GroupAdvanceDocsCard
          groups={pageRows}
          emptyText={groups.length === 0 ? 'ยังไม่มีกรุ๊ป — กด "นำเข้าเอกสารเบิก (.xls)"' : 'ไม่พบกรุ๊ปที่ตรงกับตัวกรอง'}
        />
      ) : (
        <GroupPerDiemCard
          rows={pageRows.map((g) => perDiemRows.get(g.periodId)!)}
          emptyText={perDiemGroups.length === 0 ? 'ยังไม่มีกรุ๊ป' : 'ไม่พบกรุ๊ปที่ตรงกับตัวกรอง'}
        />
      )}
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
