'use client';

/**
 * การจัดสเก็ต / Schedule — Schedule Table (อ่านอย่างเดียว)
 * ข้อมูลจริงจากไฟล์ CSV ผ่าน CSV Loader → Normalizer → Sale/Period Status Mapper (data/schedule)
 * 6 คอลัมน์ · table-fixed ไม่มี Horizontal Scroll ≥1280px · Group Code เป็นข้อมูลหลัก
 * สถานะขาย (multi-select) แยกจากสถานะพีเรียด (INC/COL) · ไม่มีจัดหัวหน้าทัวร์/สายการบิน
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { endOfMonth, formatDate, startOfMonth } from '@/lib/format';
import { Button, Card, cx, PageHeader } from '@/components/ui/Primitives';
import { SearchBox, SelectInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Icon } from '@/components/ui/Icon';
import { MonthPicker, nextMonthStart } from '@/components/ui/MonthPicker';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { validateSchedulePeriods } from '@/data/schedule/validate';
import { getPeriodStatus } from '@/data/schedule/normalize';
import { SALE_STATUS_LABEL } from '@/data/schedule/saleStatus';
import type { PeriodStatus, SaleStatus, SchedulePeriod } from '@/data/schedule/types';

const DASH = '-';
const num = (n: number | null | undefined) => (n == null ? DASH : n.toLocaleString('th-TH'));
const visa = (n: number | null | undefined) => (n == null || n === 0 ? DASH : n.toLocaleString('th-TH'));

const SALE_BADGE: Record<SaleStatus, string> = {
  SELL: 'zego-badge--success',
  NO_SELL: 'zego-badge--slate',
  CLOSED: 'zego-badge--danger',
};
const PERIOD_TAG: Record<PeriodStatus, string> = {
  INC: 'zego-badge--violet',
  COL: 'zego-badge--sky',
};
const SALE_STATUSES: SaleStatus[] = ['SELL', 'NO_SELL', 'CLOSED'];
const PAGE_SIZES = [20, 50, 100];
type SortKey = 'startDate' | 'groupCode' | 'country' | 'price' | 'remaining';

function SaleBadge({ status }: { status: SaleStatus }) {
  // Tag สถานะขาย — ลดจาก 13px อีก 40% → 8px · min-h/padding/radius ย่อตามสัดส่วน (เล็กกว่าข้อความบัส)
  return <span className={cx('inline-flex min-h-[13px] items-center justify-center whitespace-nowrap rounded border px-1 py-px text-[8px] font-semibold leading-none', SALE_BADGE[status])}>{SALE_STATUS_LABEL[status]}</span>;
}
/** Tag สถานะพีเรียด (รอง) — ขนาดเดียวกับ Tag สถานะขายที่ย่อแล้ว · แสดงเฉพาะเมื่อมี COL/INC · สีต่างจากสถานะขาย */
function PeriodTag({ status }: { status: PeriodStatus }) {
  return <span className={cx('inline-flex min-h-[13px] items-center justify-center whitespace-nowrap rounded border px-1 py-px text-[8px] font-semibold leading-none', PERIOD_TAG[status])}>{status}</span>;
}
/** Group Code แบบคลิกเพื่อคัดลอก (ไม่มีไอคอน/ปุ่มแยก · Focus ได้ · Enter/Space คัดลอกได้) */
function GroupCodeText({ code, onCopy, className }: { code: string; onCopy: (c: string) => void; className?: string }) {
  if (!code) return <span className="inline-flex items-center gap-1 text-sm font-semibold zego-text-danger"><Icon name="warning" className="h-3.5 w-3.5" /> ไม่ระบุ</span>;
  const trigger = (e: React.SyntheticEvent) => { e.stopPropagation(); e.preventDefault(); onCopy(code); };
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={`คัดลอก Group Code ${code}`}
      title={`คลิกเพื่อคัดลอก ${code}`}
      onClick={trigger}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') trigger(e); }}
      className={cx('cursor-pointer whitespace-nowrap rounded-sm font-mono font-semibold zego-text hover:text-[var(--zego-primary-700)] hover:underline', className)}
    >
      {code}
    </span>
  );
}
function remainColor(rem: number | null) {
  if (rem == null) return 'zego-text-tertiary';
  if (rem <= 0) return 'zego-text-danger';
  if (rem <= 5) return 'zego-text-warning';
  return 'zego-text-secondary';
}
function SortHead({ k, label, className, active, dir, onToggle }: { k: SortKey; label: string; className?: string; active: boolean; dir: 'asc' | 'desc'; onToggle: (k: SortKey) => void }) {
  return (
    <button type="button" onClick={() => onToggle(k)} className={cx('inline-flex items-center gap-1 font-medium hover:text-[var(--zego-text)]', className)}>
      {label}
      <Icon name="chevronDown" className={cx('h-3 w-3 transition-transform', active ? 'zego-text-info' : 'zego-text-disabled', active && dir === 'asc' ? 'rotate-180' : '')} />
    </button>
  );
}
/** บรรทัด 1 ของ Group Code: Group Code · บัส · สถานะขาย · สถานะพีเรียด */
function HeaderLine({ r, onCopy }: { r: SchedulePeriod; onCopy: (c: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <GroupCodeText code={r.tourCode} onCopy={onCopy} className="text-sm" />
      <span className="text-[13px] leading-5 zego-text-tertiary">บัส {r.bus ?? DASH}</span>
      <SaleBadge status={r.saleStatus} />
      <PeriodTag status={r.periodStatus} />
    </div>
  );
}

export function ProgramScheduleView({ hideHeader = false }: { hideHeader?: boolean } = {}) {
  const { today } = useDemo();
  const all = useMemo(() => getTourPeriods(), []); // อ่านผ่าน Service กลาง (Tour Period Master) — ไม่อ่าน CSV เอง

  // คัดลอก Group Code + Toast เล็ก (fixed — ไม่ทำให้ Layout ขยับ · ~1.8s)
  const [copyToast, setCopyToast] = useState<{ text: string; ok: boolean } | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyCode = useCallback((code: string) => {
    const flash = (text: string, ok: boolean) => {
      setCopyToast({ text, ok });
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopyToast(null), 1800);
    };
    navigator.clipboard.writeText(code).then(() => flash(`คัดลอก ${code} แล้ว`, true)).catch(() => flash('ไม่สามารถคัดลอก Group Code ได้', false));
  }, []);
  useEffect(() => () => { if (copyTimer.current) clearTimeout(copyTimer.current); }, []);

  // §27 Data Validation Report (ไม่ทำให้หน้า Error)
  useEffect(() => {
    const w = validateSchedulePeriods(all);
    if (w.length) console.warn(`[ScheduleTable] พบข้อมูลควรตรวจสอบ ${w.length} รายการ:`, w.slice(0, 20));
  }, [all]);

  const [monthCursor, setMonthCursor] = useState(() => nextMonthStart(today));
  const [saleF, setSaleF] = useState<Set<SaleStatus>>(new Set()); // ว่าง = ทั้งหมด (§4 multi-select)
  const [periodF, setPeriodF] = useState<'all' | PeriodStatus>('all'); // ประเภทกรุ๊ปมีแค่ INC/COL
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const [country, setCountry] = useState('all');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('startDate');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  // §8/§24 debounce ค้นหา 250ms
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput), 250);
    return () => clearTimeout(t);
  }, [queryInput]);

  const monthStart = startOfMonth(monthCursor);
  const monthEnd = endOfMonth(monthCursor);
  // §10 ช่วงวันที่: ใส่ข้างเดียวได้ · ถ้าใส่ทั้งคู่และวันเริ่ม > วันสิ้นสุด = ผิด (เตือน ไม่ error)
  const rangeError = !!rangeStart && !!rangeEnd && rangeStart > rangeEnd;
  const rangeActive = (!!rangeStart || !!rangeEnd) && !rangeError;

  const countryOptions = useMemo(() => [...new Set(all.map((r) => r.countryName))].sort((a, b) => a.localeCompare(b)), [all]);

  // ฐาน = กรองเดือน/ช่วงวัน + ประเทศ + สถานะพีเรียด + ค้นหา (ยังไม่กรองสถานะขาย) → ใช้นับต่อสถานะขาย (§4/§22)
  const base = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => {
      if (rangeActive) {
        if (rangeStart && r.endDate < rangeStart) return false;
        if (rangeEnd && r.startDate > rangeEnd) return false;
      } else if (!(r.startDate <= monthEnd && r.endDate >= monthStart)) return false;
      if (country !== 'all' && r.countryName !== country) return false;
      if (periodF !== 'all' && r.periodStatus !== periodF) return false;
      if (q) return [r.tourCode, r.programCode ?? '', r.displayName, r.incName ?? '', r.systemNote ?? ''].join(' ').toLowerCase().includes(q);
      return true;
    });
  }, [all, query, country, periodF, rangeActive, rangeStart, rangeEnd, monthStart, monthEnd]);

  const statusCounts = useMemo(() => base.reduce((a, r) => ((a[r.saleStatus] = (a[r.saleStatus] || 0) + 1), a), {} as Record<string, number>), [base]);

  // §4 กรองสถานะขายแบบ OR (ว่าง/ครบ 3 = ทั้งหมด)
  const filtered = useMemo(() => {
    const bySale = saleF.size === 0 || saleF.size === 3 ? base : base.filter((r) => saleF.has(r.saleStatus));
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...bySale].sort((a, b) => {
      let c = 0;
      if (sortKey === 'groupCode') c = a.tourCode.localeCompare(b.tourCode);
      else if (sortKey === 'country') c = a.countryName.localeCompare(b.countryName);
      else if (sortKey === 'price') c = (a.price ?? 0) - (b.price ?? 0);
      else if (sortKey === 'remaining') c = (a.bookingBalance ?? 0) - (b.bookingBalance ?? 0);
      else c = a.startDate.localeCompare(b.startDate);
      if (c === 0) c = a.startDate.localeCompare(b.startDate) || a.tourCode.localeCompare(b.tourCode);
      return c * dir;
    });
  }, [base, saleF, sortKey, sortDir]);

  const filterSig = [query, country, [...saleF].sort().join(','), periodF, monthCursor, rangeStart, rangeEnd, pageSize, sortKey, sortDir].join('|');
  const [prevSig, setPrevSig] = useState(filterSig);
  if (prevSig !== filterSig) { setPrevSig(filterSig); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const hasFilter = saleF.size > 0 || periodF !== 'all' || query.trim() !== '' || country !== 'all' || !!rangeStart || !!rangeEnd;
  const resetFilters = () => { setSaleF(new Set()); setPeriodF('all'); setQueryInput(''); setQuery(''); setCountry('all'); setRangeStart(''); setRangeEnd(''); setMonthCursor(nextMonthStart(today)); };

  // §4 toggle สถานะขาย (ครบ 3 = ล้างเป็นทั้งหมด)
  const toggleSale = (s: SaleStatus) => {
    setSaleF((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next.size === 3 ? new Set() : next;
    });
  };

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('asc'); }
  };
  const sortHead = (k: SortKey, label: string, className?: string) => (
    <SortHead k={k} label={label} className={className} active={sortKey === k} dir={sortDir} onToggle={toggleSort} />
  );

  return (
    <>
      {!hideHeader && <PageHeader title="การจัดสเก็ต / Schedule" description={`ข้อมูลจริงจากไฟล์ CSV · พบ ${filtered.length} จาก ${all.length} พีเรียด`} />}

      <div className="mb-3 flex items-start gap-2 rounded-xl border zego-border-color zego-surface-soft-bg px-4 py-2 text-sm zego-text-secondary">
        <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 zego-text-tertiary" />
        <span>ฟังก์ชันจัดหัวหน้าทัวร์ถูกปิดใช้งานชั่วคราว — หน้านี้แสดง ตรวจสอบ ค้นหา และกรองรายการงานทัวร์จากไฟล์ CSV เท่านั้น</span>
      </div>

      {/* ---------- Filter ---------- */}
      <Card className="mb-4" padded={false}>
        {/* แถว 1: เดือน + สถานะขาย (multi-select) */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 zego-divider-bottom px-4 py-2.5">
          <span className="text-sm font-medium zego-text-secondary">เดือนเดินทาง</span>
          <div className="w-56"><MonthPicker value={monthCursor} onChange={setMonthCursor} ariaLabel="เดือนเดินทาง" /></div>
          <Button variant="ghost" size="sm" onClick={() => setMonthCursor(startOfMonth(today))}>เดือนปัจจุบัน</Button>
          <Button variant="ghost" size="sm" onClick={() => setMonthCursor(nextMonthStart(today))}>เดือนถัดไป</Button>
          <span className="mx-1 hidden h-5 w-px bg-[var(--zego-border-strong)] sm:block" />
          <span className="text-sm font-medium zego-text-secondary">สถานะขาย:</span>
          <button type="button" aria-pressed={saleF.size === 0} onClick={() => setSaleF(new Set())}
            className={cx('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
              saleF.size === 0 ? 'zego-badge--info' : 'zego-badge--slate zego-hover-surface')}>
            ทั้งหมด
            <span className={cx('rounded-full px-1.5 text-[10px]', saleF.size === 0 ? 'bg-[var(--zego-info)]/15' : 'zego-surface-soft-bg zego-text-tertiary')}>{base.length}</span>
          </button>
          {SALE_STATUSES.map((s) => {
            const on = saleF.has(s);
            return (
              <button key={s} type="button" aria-pressed={on} onClick={() => toggleSale(s)}
                className={cx('inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                  on ? 'zego-badge--info' : 'zego-badge--slate zego-hover-surface')}>
                {SALE_STATUS_LABEL[s]}
                <span className={cx('rounded-full px-1.5 text-[10px]', on ? 'bg-[var(--zego-info)]/15' : 'zego-surface-soft-bg zego-text-tertiary')}>{statusCounts[s] ?? 0}</span>
              </button>
            );
          })}
        </div>
        {/* แถว 2: ประเทศ · ค้นหา · สถานะพีเรียด · ช่วงวัน · ล้างค่า */}
        <div className="flex flex-wrap items-end gap-3 px-4 py-2.5">
          <SelectInput label="ประเทศ" value={country} onChange={(e) => setCountry(e.target.value)} wrapperClassName="w-40" options={[{ value: 'all', label: 'ทุกประเทศ' }, ...countryOptions.map((c) => ({ value: c, label: c }))]} />
          <div className="min-w-[18rem] flex-1">
            <SearchBox value={queryInput} onChange={setQueryInput} placeholder="ค้นหา Group Code ชื่อทัวร์ หรือ INC" label="ค้นหาทัวร์" />
          </div>
          <SelectInput label="ประเภทกรุ๊ป" value={periodF} onChange={(e) => setPeriodF(e.target.value as typeof periodF)} wrapperClassName="w-36"
            options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'INC', label: 'INC' }, { value: 'COL', label: 'COL' }]} />
          <DateField label="ตั้งแต่วันที่" value={rangeStart} onChange={setRangeStart} optional picker wrapperClassName="w-32" error={rangeError ? 'วันเริ่มเกินวันสิ้นสุด' : undefined} />
          <DateField label="ถึงวันที่" value={rangeEnd} onChange={setRangeEnd} optional picker wrapperClassName="w-32" />
          {hasFilter && <Button variant="ghost" size="sm" onClick={resetFilters}>ล้างค่า</Button>}
        </div>
        {rangeError && <p className="px-4 pb-2 text-xs font-medium zego-text-danger">ช่วงวันที่ไม่ถูกต้อง: วันเริ่มต้องไม่เกินวันสิ้นสุด — ระบบยังแสดงตามเดือนที่เลือก</p>}
      </Card>

      {/* ---------- Desktop ≥1280: ตาราง 6 คอลัมน์ (table-fixed, ไม่มี h-scroll) ---------- */}
      <div className="hidden overflow-hidden zego-card-surface xl:block">
        <table className="w-full table-fixed text-sm">
          <colgroup>
            <col style={{ width: '13%' }} /><col style={{ width: '44%' }} /><col style={{ width: '16%' }} />
            <col style={{ width: '10%' }} /><col style={{ width: '13%' }} /><col style={{ width: '4%' }} />
          </colgroup>
          <thead>
            <tr className="zego-divider-bottom zego-surface-soft-bg text-left text-xs zego-text-tertiary">
              <th className="px-3 py-2">{sortHead('country', 'ประเทศ')}</th>
              <th className="px-3 py-2">{sortHead('groupCode', 'Group Code / โปรแกรม')}</th>
              <th className="px-3 py-2">{sortHead('startDate', 'วันเดินทาง')}</th>
              <th className="px-3 py-2 text-right">{sortHead('price', 'ราคา', 'justify-end')}</th>
              <th className="px-3 py-2">{sortHead('remaining', 'ที่นั่ง')}</th>
              <th className="px-2 py-2 text-center" title="รายละเอียด"><span className="sr-only">รายละเอียด</span></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r) => {
              const open = expanded === r.internalId;
              return (
                <Fragment key={r.internalId}>
                <tr onClick={() => setExpanded(open ? null : r.internalId)} className={cx('cursor-pointer zego-divider-bottom align-top transition-colors', open ? 'zego-badge--info' : 'zego-hover-surface')}>
                  <td className="px-3 py-4"><span className="truncate zego-text-secondary" title={r.countryName}>{r.countryName}</span></td>
                  <td className="px-3 py-4">
                    <div className="group/gc min-w-0">
                      <HeaderLine r={r} onCopy={copyCode} />
                      <p className="mt-1 line-clamp-2 text-xs leading-snug zego-text-secondary" title={r.displayName}>{r.displayName}</p>
                      <span className="font-mono text-[11px] zego-text-tertiary">{r.programCode ?? DASH}</span>
                    </div>
                  </td>
                  <td className="px-3 py-4"><span className="whitespace-nowrap zego-text-secondary">{formatDate(r.startDate)}–{formatDate(r.endDate)}</span></td>
                  <td className="px-3 py-4 text-right">
                    <p className="whitespace-nowrap tabular-nums font-medium zego-text">{num(r.price)}</p>
                    <p className="text-xs zego-text-tertiary">วีซ่า {visa(r.visaRegularPrice)}</p>
                  </td>
                  <td className="px-3 py-4">
                    <p className="text-xs tabular-nums zego-text-tertiary">ทั้งหมด <strong className="zego-text-secondary">{num(r.seat)}</strong></p>
                    <p className="text-xs tabular-nums zego-text-tertiary">จอง <strong className="zego-text-secondary">{num(r.bookingCount)}</strong> · เหลือ <strong className={remainColor(r.bookingBalance)}>{num(r.bookingBalance)}</strong></p>
                  </td>
                  <td className="px-2 py-4 text-center">
                    <button type="button" aria-label="ดูรายละเอียด" onClick={(e) => { e.stopPropagation(); setExpanded(open ? null : r.internalId); }} className="rounded-md p-1 zego-text-tertiary zego-hover-surface hover:text-[var(--zego-text)]">
                      <Icon name="chevronDown" className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} />
                    </button>
                  </td>
                </tr>
                {open && (
                  <tr className="zego-divider-bottom zego-surface-soft-bg">
                    <td colSpan={6} className="px-4 pb-4 pt-1"><ExpandedDetail r={r} /></td>
                  </tr>
                )}
                </Fragment>
              );
            })}
            {pageRows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-16 text-center text-sm zego-text-tertiary">ไม่พบพีเรียดในช่วง/เงื่อนไขที่เลือก</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---------- < 1280: Card List (ประเทศบนสุด) ---------- */}
      <div className="space-y-2 xl:hidden">
        {pageRows.map((r) => {
          const open = expanded === r.internalId;
          return (
            <div key={r.internalId} className="zego-card-surface p-3">
              <p className="text-xs zego-text-tertiary">{r.countryName}</p>
              <div className="mt-0.5"><HeaderLine r={r} onCopy={copyCode} /></div>
              <p className="mt-1 line-clamp-2 text-xs zego-text-secondary">{r.displayName}</p>
              <p className="font-mono text-[11px] zego-text-tertiary">{r.programCode ?? DASH}</p>
              <div className="mt-1.5 space-y-1 text-xs zego-text-secondary">
                <div className="flex justify-between"><span>{formatDate(r.startDate)}–{formatDate(r.endDate)}</span><span className="font-medium zego-text">{num(r.price)} · วีซ่า {visa(r.visaRegularPrice)}</span></div>
                <span>ทั้งหมด {num(r.seat)} · จอง {num(r.bookingCount)} · เหลือ <strong className={remainColor(r.bookingBalance)}>{num(r.bookingBalance)}</strong></span>
              </div>
              <button type="button" onClick={() => setExpanded(open ? null : r.internalId)} className="mt-2 inline-flex items-center gap-1 text-xs font-medium zego-text-info">
                <Icon name="chevronDown" className={cx('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} /> {open ? 'ซ่อนรายละเอียด' : 'ดูรายละเอียด'}
              </button>
              {open && <div className="mt-2 zego-divider-top pt-2"><ExpandedDetail r={r} /></div>}
            </div>
          );
        })}
        {pageRows.length === 0 && <p className="rounded-xl border border-dashed zego-border-color py-12 text-center text-sm zego-text-tertiary">ไม่พบพีเรียดในช่วง/เงื่อนไขที่เลือก</p>}
      </div>

      {/* ---------- Pagination ---------- */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm zego-text-secondary">
        <span>พบทั้งหมด <strong className="zego-text">{filtered.length}</strong> รายการ</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">
            แสดง
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="rounded-lg border zego-border-color zego-surface-bg px-2 py-1 text-sm">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            รายการ/หน้า
          </label>
          <span className="tabular-nums">หน้า {safePage} จาก {totalPages}</span>
          <div className="inline-flex gap-1">
            <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>ก่อนหน้า</Button>
            <Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>ถัดไป</Button>
          </div>
        </div>
      </div>

      {copyToast && (
        <div role="status" aria-live="polite" className={cx('fixed bottom-6 left-1/2 z-50 inline-flex -translate-x-1/2 items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-white shadow-lg', copyToast.ok ? 'bg-[var(--zego-text)]' : 'bg-rose-600')}>
          <Icon name={copyToast.ok ? 'check' : 'warning'} className="h-4 w-4" />
          {copyToast.text}
        </div>
      )}
    </>
  );
}

/* ------------------------------ Expanded Detail ------------------------------ */

function ExpandedDetail({ r }: { r: SchedulePeriod }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3 lg:grid-cols-4">
      <Field label="ประเทศ" value={r.countryName} />
      <Field label="Group Code" value={r.tourCode || 'ไม่ระบุ'} mono />
      <Field label="Program Code" value={r.programCode ?? DASH} mono />
      <Field label="บัส" value={r.bus ?? DASH} />
      <Field label="สถานะขาย"><SaleBadge status={r.saleStatus} /></Field>
      <Field label="ประเภทกรุ๊ป"><PeriodTag status={r.periodStatus} /></Field>
      <Field label="วันเดินทาง" value={`${formatDate(r.startDate)}–${formatDate(r.endDate)} (${r.durationDays} วัน)`} />
      <Field label="ราคาทัวร์" value={num(r.price)} />
      <Field label="ราคาวีซ่า" value={visa(r.visaRegularPrice)} />
      <Field label="ที่นั่งทั้งหมด" value={num(r.seat)} />
      <Field label="จำนวนจอง" value={num(r.bookingCount)} />
      <Field label="คงเหลือ" value={num(r.bookingBalance)} />
      <Field label="คอมมิชชั่น" value={r.comStandard ?? DASH} />
      {/* ข้อความเต็มถ้า IncName ระบุ INC:/COL: จริง · ไม่มีก็แสดงแค่ประเภทกรุ๊ป */}
      <Field label="INC / COL (เต็ม)" value={(getPeriodStatus(r.incName) ? r.incName : null) ?? r.periodStatus} className="col-span-2 sm:col-span-3 lg:col-span-2" />
      <Field label="หมายเหตุจากระบบ" value={r.systemNote ?? DASH} className="col-span-2 sm:col-span-3 lg:col-span-2" />
      <Field label="ชื่อรายการทัวร์ (เต็ม)" value={r.tourName} className="col-span-2 sm:col-span-3 lg:col-span-4" />
    </dl>
  );
}

function Field({ label, value, children, mono, className }: { label: string; value?: string; children?: React.ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={cx('flex flex-col gap-0.5', className)} onClick={(e) => e.stopPropagation()}>
      <dt className="text-xs zego-text-tertiary">{label}</dt>
      <dd className={cx('font-medium zego-text', mono && 'font-mono')}>{children ?? value}</dd>
    </div>
  );
}
