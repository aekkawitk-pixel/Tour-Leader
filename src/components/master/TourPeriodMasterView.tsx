'use client';

/**
 * Master รายการทัวร์และพีเรียด (§8) — หน้าจัดการ Tour Period Master (อ่านอย่างเดียว + Sync/Validate)
 * อ่านข้อมูลผ่าน Service กลาง (services/tourPeriodMaster) เท่านั้น — ไม่อ่าน CSV เอง (§14)
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { startOfMonth, formatDate, formatDateTime } from '@/lib/format';
import { MonthPicker, nextMonthStart } from '@/components/ui/MonthPicker';
import { Button, Card, cx, PageHeader, StatusBadge } from '@/components/ui/Primitives';
import { SearchBox, SelectInput, TextInput } from '@/components/ui/FormField';
import { Drawer } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { getTourPeriods, syncTourPeriods, getTourPeriodHistory, getPeriodSource } from '@/services/tourPeriodMaster';
import { setPeriodDataStatus, clearPeriodOverride } from '@/services/periodOverrideStore';
import { getPeriodAttachments, getPeriodDocCategories, addPeriodDocCategory, addPeriodAttachment, removePeriodAttachment } from '@/services/periodAttachmentStore';
import { saveErrorMessage } from '@/services/browserStorage';
import { SALE_STATUS_LABEL } from '@/data/schedule/saleStatus';
import type { TourPeriodMaster, ValidationStatus } from '@/data/schedule/masterTypes';
import type { PeriodStatus, SaleStatus } from '@/data/schedule/types';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';

const DASH = '-';
const num = (n: number | null | undefined) => (n == null ? DASH : n.toLocaleString('th-TH'));

const SALE_BADGE: Record<SaleStatus, string> = {
  SELL: 'border zego-badge--success',
  // NO_SELL คงพื้นทึบเข้ม (ต่างจากป้ายพาสเทลโทนอื่น) เพื่อให้เห็นชัดว่า "ปิดขาย" เด่นกว่าสถานะอื่น —
  // zego ไม่มี badge พื้นทึบสำเร็จรูป (มีแต่ zego-badge--* แบบพาสเทล) จึงประกอบเองจาก token ตัวหนังสือ/พื้นหลัง
  // ของ zego (--zego-text/--zego-surface) แทน Tailwind slate ตรงๆ เพื่อให้กลับสีถูกต้องเมื่อสลับธีมมืด
  NO_SELL: 'ring-1 ring-inset bg-[var(--zego-text)] text-[var(--zego-surface)] ring-[var(--zego-text)]',
  CLOSED: 'border zego-badge--danger',
};
const VALIDATION_META: Record<ValidationStatus, { label: string; cls: string }> = {
  VALID: { label: 'ถูกต้อง', cls: 'border zego-badge--success' },
  WARNING: { label: 'ควรตรวจสอบ', cls: 'border zego-badge--warning' },
  INVALID: { label: 'ไม่ถูกต้อง', cls: 'border zego-badge--danger' },
};
const PAGE_SIZES = [25, 50, 100];

export function TourPeriodMasterView() {
  const { today, pushToast, currentUser } = useDemo();
  const canManage = currentUser.role === 'admin' || currentUser.role === 'coordinator'; // §17 Master Admin
  const [rev, setRev] = useState(0); // เพิ่มค่าเมื่อ override เปลี่ยน → re-query
  const allPeriods = useMemo(() => { void rev; return getTourPeriods(); }, [rev]);
  /* บอกให้ชัดว่าตัวเลขบนหน้านี้มาจากไหน — Zego API หรือไฟล์ตัวอย่างตั้งต้น */
  const source = useMemo(() => { void rev; return getPeriodSource(); }, [rev]);
  const countryOptions = useMemo(() => [...new Set(allPeriods.map((r) => r.countryName))].sort((a, b) => a.localeCompare(b)), [allPeriods]);

  const [monthCursor, setMonthCursor] = useState<string>(() => nextMonthStart(today));
  const [monthOn, setMonthOn] = useState(false);
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState('all');
  const [sale, setSale] = useState<'all' | SaleStatus>('all');
  const [period, setPeriod] = useState<'all' | PeriodStatus>('all'); // ประเภทกรุ๊ปมีแค่ INC/COL
  const [validation, setValidation] = useState<'all' | ValidationStatus>('all');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<TourPeriodMaster | null>(null);

  const filtered = useMemo(() => {
    void rev;
    return getTourPeriods({
      monthStart: monthOn ? startOfMonth(monthCursor) : undefined,
      countryName: country,
      saleStatus: sale === 'all' ? undefined : [sale],
      periodStatus: period === 'all' ? undefined : period,
      validationStatus: validation === 'all' ? undefined : validation,
      search: search.trim() || undefined,
    });
  }, [monthOn, monthCursor, country, sale, period, validation, search, rev]);

  // §10 ปิด/เปิดใช้งานพีเรียด (override) — ไม่ลบต้นทาง · ทำให้ทุก view (รวมตารางจัดหัวหน้าทัวร์) แจ้งเตือน §9
  const toggleActive = (p: TourPeriodMaster) => {
    if (p.dataStatus === 'ACTIVE') { setPeriodDataStatus(p.internalId, 'INACTIVE'); pushToast('info', `ปิดใช้งาน ${p.groupCode} — งานที่มอบหมายไว้จะขึ้นเตือนให้ตรวจสอบ`); }
    else { clearPeriodOverride(p.internalId); pushToast('success', `เปิดใช้งาน ${p.groupCode} อีกครั้ง`); }
    setRev((r) => r + 1);
    setDetail(null);
  };

  const counts = useMemo(() => ({
    total: allPeriods.length,
    valid: allPeriods.filter((r) => r.validationStatus === 'VALID').length,
    warning: allPeriods.filter((r) => r.validationStatus === 'WARNING').length,
    invalid: allPeriods.filter((r) => r.validationStatus === 'INVALID').length,
  }), [allPeriods]);

  const sig = [monthOn, monthCursor, country, sale, period, validation, search, pageSize].join('|');
  const [prevSig, setPrevSig] = useState(sig);
  if (prevSig !== sig) { setPrevSig(sig); setPage(1); }

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  const runSync = () => {
    const rep = syncTourPeriods('CSV');
    pushToast('success', `Sync สำเร็จ: ${rep.total} พีเรียด (VALID ${counts.valid} · WARNING ${rep.warningCount} · INVALID ${rep.invalidCount})`, `จาก ${rep.sourceFileName}`);
  };

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <PageHeader title="Master รายการทัวร์และพีเรียด" description={`แหล่งข้อมูลกลาง · ${counts.total} พีเรียด · ${source.label}`} />
        {source.kind === 'csv' && <Button variant="secondary" size="sm" icon="download" onClick={runSync}>Sync จากต้นทาง</Button>}
      </div>

      {/* สรุปสถานะตรวจสอบ (§13) */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="ทั้งหมด" value={counts.total} tone="slate" />
        <Stat label="ถูกต้อง (VALID)" value={counts.valid} tone="emerald" />
        <Stat label="ควรตรวจสอบ (WARNING)" value={counts.warning} tone="amber" />
        <Stat label="ไม่ถูกต้อง (INVALID)" value={counts.invalid} tone="rose" />
      </div>

      <Card className="mb-4" padded={false}>
        <div className="flex flex-wrap items-end gap-3 px-4 py-2.5">
          <label className="zego-text-secondary inline-flex items-center gap-1.5 text-sm">
            <input type="checkbox" checked={monthOn} onChange={(e) => setMonthOn(e.target.checked)} className="zego-border-color rounded border" />
            เดือนเดินทาง
          </label>
          {monthOn && <div className="w-52"><MonthPicker value={monthCursor} onChange={setMonthCursor} ariaLabel="เดือนเดินทาง" /></div>}
          <div className="min-w-[16rem] flex-1"><SearchBox value={search} onChange={setSearch} placeholder="ค้นหา Group Code / โปรแกรม / ชื่อ / INC" label="ค้นหาพีเรียด" /></div>
          <SelectInput label="ประเทศ" value={country} onChange={(e) => setCountry(e.target.value)} wrapperClassName="w-36" options={[{ value: 'all', label: 'ทุกประเทศ' }, ...countryOptions.map((c) => ({ value: c, label: c }))]} />
          <SelectInput label="สถานะขาย" value={sale} onChange={(e) => setSale(e.target.value as typeof sale)} wrapperClassName="w-32" options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'SELL', label: 'SELL' }, { value: 'NO_SELL', label: 'NO SELL' }, { value: 'CLOSED', label: 'CLOSED' }]} />
          <SelectInput label="ประเภทกรุ๊ป" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} wrapperClassName="w-32" options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'INC', label: 'INC' }, { value: 'COL', label: 'COL' }]} />
          <SelectInput label="ตรวจสอบ" value={validation} onChange={(e) => setValidation(e.target.value as typeof validation)} wrapperClassName="w-32" options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'VALID', label: 'ถูกต้อง' }, { value: 'WARNING', label: 'ควรตรวจสอบ' }, { value: 'INVALID', label: 'ไม่ถูกต้อง' }]} />
        </div>
      </Card>

      <div className="overflow-x-auto zego-card-surface">
        <table className="zego-table w-full min-w-[1100px] text-sm">
          <thead>
            <tr className="zego-divider-bottom zego-surface-soft-bg text-left text-xs zego-text-tertiary">
              <th className="px-3 py-2">ประเทศ</th>
              <th className="px-3 py-2">Group Code / Program</th>
              <th className="px-3 py-2">ชื่อโปรแกรม</th>
              <th className="px-3 py-2">วันเดินทาง</th>
              <th className="px-3 py-2 text-center">บัส</th>
              <th className="px-3 py-2 text-center">สถานะขาย</th>
              <th className="px-3 py-2 text-right">ราคา</th>
              <th className="px-3 py-2 text-center">ที่นั่ง</th>
              <th className="px-3 py-2 text-center">แหล่งข้อมูล</th>
              <th className="px-3 py-2">อัปเดตล่าสุด</th>
              <th className="px-3 py-2 text-center">ตรวจสอบ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.internalId} onClick={() => setDetail(r)} className="zego-divider-bottom zego-hover-surface cursor-pointer align-top">
                <td className="zego-text-secondary px-3 py-2.5">{r.countryName}</td>
                <td className="px-3 py-2.5">
                  <p className="zego-text font-mono text-sm font-semibold">{r.groupCode}</p>
                  <p className="zego-text-tertiary font-mono text-[11px]">{r.programCode ?? DASH}</p>
                </td>
                <td className="px-3 py-2.5"><span className="zego-text-secondary line-clamp-1" title={r.displayName}>{r.displayName}</span><span className={cx('ml-1 rounded px-1 text-[10px] border', TONE_ZEGO_BADGE.violet)}>{r.periodStatus}</span></td>
                <td className="zego-text-secondary whitespace-nowrap px-3 py-2.5">{formatDate(r.startDate)}–{formatDate(r.endDate)}</td>
                <td className="zego-text-secondary px-3 py-2.5 text-center">{r.bus ?? DASH}</td>
                <td className="px-3 py-2.5 text-center"><span className={cx('inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium', SALE_BADGE[r.saleStatus])}>{SALE_STATUS_LABEL[r.saleStatus]}</span></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums"><span className="zego-text">{num(r.price)}</span></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-center text-xs"><span className="zego-text-tertiary">{num(r.seatBooked)}/{num(r.seatTotal)}</span></td>
                <td className="px-3 py-2.5 text-center text-[11px]"><span className="zego-text-tertiary">{r.sourceSystem}</span></td>
                <td className="whitespace-nowrap px-3 py-2.5 text-xs"><span className="zego-text-tertiary">{formatDate(r.updatedAt)}</span></td>
                <td className="px-3 py-2.5 text-center"><span className={cx('inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium', VALIDATION_META[r.validationStatus].cls)}>{VALIDATION_META[r.validationStatus].label}</span></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={11} className="px-4 py-16 text-center text-sm"><span className="zego-text-tertiary">ไม่พบพีเรียดตามเงื่อนไข</span></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="zego-text-secondary mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>พบ <strong className="zego-text">{filtered.length}</strong> พีเรียด</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">แสดง
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="zego-border-color zego-surface-bg rounded-lg border px-2 py-1 text-sm">
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>/หน้า
          </label>
          <span className="tabular-nums">หน้า {safePage}/{totalPages}</span>
          <div className="inline-flex gap-1">
            <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>ก่อนหน้า</Button>
            <Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>ถัดไป</Button>
          </div>
        </div>
      </div>

      <MasterDetailPanel period={detail} onClose={() => setDetail(null)} canManage={canManage} onToggleActive={toggleActive} />
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'emerald' | 'amber' | 'rose' }) {
  const cls = { slate: 'zego-text-secondary', emerald: 'zego-text-success', amber: 'zego-text-warning', rose: 'zego-text-danger' }[tone];
  return (
    <div className="zego-border-color zego-surface-bg rounded-xl border px-4 py-2.5">
      <p className="zego-text-tertiary text-xs">{label}</p>
      <p className={cx('text-xl font-bold tabular-nums', cls)}>{value.toLocaleString('th-TH')}</p>
    </div>
  );
}

/* ------------------------------ Detail (§8 ดูรายละเอียด/ต้นทาง/validation/history) ------------------------------ */

function MasterDetailPanel({ period, onClose, canManage, onToggleActive }: { period: TourPeriodMaster | null; onClose: () => void; canManage: boolean; onToggleActive: (p: TourPeriodMaster) => void }) {
  const { currentUser, today, pushToast } = useDemo();
  const history = period ? getTourPeriodHistory(period.internalId) : [];
  const [attRev, setAttRev] = useState(0);
  const attachments = useMemo(() => { void attRev; return period ? getPeriodAttachments(period.internalId) : []; }, [period, attRev]);
  const docCategories = useMemo(() => { void attRev; return period ? getPeriodDocCategories(period.internalId) : []; }, [period, attRev]);
  const [addingCategory, setAddingCategory] = useState<string | null>(null);
  const [attName, setAttName] = useState('');
  const [attSize, setAttSize] = useState('');
  const [newCategoryOpen, setNewCategoryOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const submitAttachment = (category: string) => {
    if (!period || !attName.trim()) return;
    try {
      addPeriodAttachment(period.internalId, category, attName.trim(), attSize.trim() || 'ไม่ระบุขนาด', currentUser.name, `${today}T09:00`);
      setAttName('');
      setAttSize('');
      setAddingCategory(null);
      setAttRev((r) => r + 1);
    } catch (err) {
      pushToast('error', 'เพิ่มไฟล์ไม่สำเร็จ', saveErrorMessage(err));
    }
  };

  const submitNewCategory = () => {
    if (!period || !newCategoryName.trim()) return;
    try {
      addPeriodDocCategory(period.internalId, newCategoryName.trim());
      setNewCategoryName('');
      setNewCategoryOpen(false);
      setAttRev((r) => r + 1);
    } catch (err) {
      pushToast('error', 'เพิ่มหมวดไม่สำเร็จ', saveErrorMessage(err));
    }
  };

  const removeAttachment = (attachmentId: string) => {
    if (!period) return;
    try {
      removePeriodAttachment(period.internalId, attachmentId);
      setAttRev((r) => r + 1);
    } catch (err) {
      pushToast('error', 'ลบไฟล์ไม่สำเร็จ', saveErrorMessage(err));
    }
  };
  return (
    <Drawer open={!!period} onClose={onClose} size="xl" title={period ? period.groupCode : ''} description={period?.displayName}
      // ไม่พบใน Zego = สถานะจากการดึงข้อมูล ไม่ใช่ override — เปิด/ปิดเองไม่ได้ (กลับมาเองเมื่อ Zego ส่งกรุ๊ปนี้มาอีก)
      footer={period && canManage && period.dataStatus !== 'MISSING_FROM_SOURCE' && (
        period.dataStatus === 'ACTIVE'
          ? <Button variant="danger" size="sm" onClick={() => onToggleActive(period)}>ปิดใช้งานพีเรียด (§10)</Button>
          : <Button variant="primary" size="sm" onClick={() => onToggleActive(period)}>เปิดใช้งานอีกครั้ง</Button>
      )}>
      {period && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge meta={{ label: SALE_STATUS_LABEL[period.saleStatus], tone: period.saleStatus === 'SELL' ? 'green' : period.saleStatus === 'CLOSED' ? 'red' : 'slate' }} />
            <span className={cx('rounded px-2 py-0.5 text-xs border', TONE_ZEGO_BADGE.violet)}>{period.periodStatus}</span>
            <span className={cx('rounded px-2 py-0.5 text-xs font-medium', VALIDATION_META[period.validationStatus].cls)}>{VALIDATION_META[period.validationStatus].label}</span>
            <span className={cx('rounded px-2 py-0.5 text-xs', TONE_ZEGO_BADGE.slate)}>{period.dataStatus === 'MISSING_FROM_SOURCE' ? 'ไม่พบใน Zego รอบล่าสุด' : period.dataStatus}</span>
          </div>

          {period.validationMessages.length > 0 && (
            <div className={cx('rounded-lg px-3 py-2 text-xs border', TONE_ZEGO_BADGE.amber)}>
              <p className="mb-1 font-semibold">ผลการตรวจสอบข้อมูล (§13)</p>
              <ul className="list-inside list-disc space-y-0.5">{period.validationMessages.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}

          <Section title="ข้อมูลอ้างอิง">
            <F label="Internal ID (PK)" value={period.internalId} mono />
            <F label="Group Code" value={period.groupCode} mono />
            <F label="Program Code" value={period.programCode ?? DASH} mono />
            <F label="Program ID" value={period.programId ?? 'ยังไม่แยกโปรแกรม'} />
            <F label="ประเทศ" value={`${period.countryName}${period.countryCode ? ` (${period.countryCode})` : ' · ยังไม่แมป Country Master'}`} />
            <F label="บัส" value={period.bus ?? DASH} />
          </Section>

          <Section title="การเดินทาง">
            <F label="วันเดินทาง" value={`${formatDate(period.startDate)} – ${formatDate(period.endDate)}`} />
            <F label="จำนวนวัน/คืน" value={`${period.durationDays} วัน ${period.durationNights} คืน`} />
            <F label="สนามบินขาออก (Sector 1)" value={period.departureAirportCode ?? DASH} />
            <F label="รหัสสายการบิน (Sector 1)" value={period.firstSectorAirlineCode ?? DASH} />
            <F label="ที่มารหัสสายการบิน" value={period.airlineSource === 'derived_from_group_code' ? 'อนุมานจากท้าย Group Code' : period.airlineSource ?? DASH} />
            <F label="Sectors" value={period.sectors.length ? `${period.sectors.length} ช่วง` : 'ไม่มีข้อมูล Sector จากต้นทาง'} />
          </Section>

          <Section title="ราคา / ที่นั่ง">
            <F label="ราคา" value={`${num(period.price)} ${period.currency}`} />
            <F label="ราคาวีซ่า" value={num(period.visaPrice)} />
            <F label="คอมมิชชั่น" value={period.commission ?? DASH} />
            <F label="ที่นั่งทั้งหมด" value={num(period.seatTotal)} />
            <F label="จองแล้ว" value={num(period.seatBooked)} />
            <F label="คงเหลือ" value={num(period.seatRemaining)} />
          </Section>

          <Section title="ข้อมูลต้นทาง (§8 ดูข้อมูลต้นทาง)">
            <F label="แหล่งข้อมูล" value={period.sourceSystem} />
            <F label="ไฟล์ต้นทาง" value={period.sourceFileName} />
            <F label="แถวต้นทาง" value={`#${period.sourceRowNumber}`} />
            <F label="tourStatus (ดิบ)" value={period.sourceTourStatus || DASH} />
            <F label="sellStatus (ดิบ)" value={period.sourceSellStatus || DASH} />
            <F label="IncName (ดิบ)" value={period.incName ?? DASH} className="col-span-2" />
            <F label="หมายเหตุจากระบบ" value={period.systemNote ?? DASH} className="col-span-2" />
            <F label="นำเข้าเมื่อ" value={formatDateTime(period.importedAt)} />
            <F label="Sync ล่าสุด" value={formatDateTime(period.lastSyncedAt)} />
          </Section>

          <div>
            <p className="zego-text-tertiary mb-1.5 text-xs font-semibold">เอกสารแนบ (§8 เอกสารทริป — จำลอง)</p>
            <div className="space-y-2.5">
              {docCategories.map((cat) => {
                const files = attachments.filter((a) => a.category === cat);
                return (
                  <div key={cat} className="zego-border-color rounded-lg border p-2.5">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="zego-text text-sm font-semibold">{cat}</p>
                      {canManage && (
                        <button
                          type="button"
                          onClick={() => { setAddingCategory(cat); setAttName(''); setAttSize(''); }}
                          className="zego-text-success text-xs font-medium hover:underline"
                        >
                          + เพิ่มไฟล์
                        </button>
                      )}
                    </div>
                    {files.length === 0 ? (
                      <p className="zego-text-tertiary text-xs">ยังไม่มีไฟล์ในหมวดนี้</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {files.map((file) => (
                          <li key={file.id} className="zego-surface-soft-bg flex items-center gap-3 rounded-lg px-3 py-2">
                            <Icon name="file" className="zego-text-tertiary h-4 w-4 shrink-0" />
                            <span className="zego-text-secondary min-w-0 flex-1 truncate font-mono text-xs">{file.name}</span>
                            <span className="zego-text-tertiary shrink-0 text-xs">{file.size}</span>
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => removeAttachment(file.id)}
                                className="zego-text-disabled shrink-0 rounded p-1 hover:bg-rose-50 hover:text-rose-600"
                                aria-label={`ลบ ${file.name}`}
                              >
                                <Icon name="close" className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    {addingCategory === cat && (
                      <div className="zego-surface-soft-bg mt-2 flex flex-wrap items-end gap-2 rounded-lg p-2.5">
                        <TextInput label="ชื่อไฟล์" wrapperClassName="min-w-[10rem] flex-1" value={attName} onChange={(e) => setAttName(e.target.value)} placeholder="เช่น ตั๋วเครื่องบิน.pdf" />
                        <TextInput label="ขนาด (ไม่บังคับ)" wrapperClassName="w-28" value={attSize} onChange={(e) => setAttSize(e.target.value)} placeholder="เช่น 2.4 MB" />
                        <Button variant="secondary" size="sm" icon="plus" disabled={!attName.trim()} onClick={() => submitAttachment(cat)}>เพิ่มไฟล์</Button>
                        <Button variant="ghost" size="sm" onClick={() => setAddingCategory(null)}>ยกเลิก</Button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {canManage && (
              newCategoryOpen ? (
                <div className="zego-surface-soft-bg mt-2 flex flex-wrap items-end gap-2 rounded-lg p-2.5">
                  <TextInput label="ชื่อหมวดใหม่" wrapperClassName="min-w-[10rem] flex-1" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} placeholder="เช่น วีซ่า" />
                  <Button variant="secondary" size="sm" icon="plus" disabled={!newCategoryName.trim()} onClick={submitNewCategory}>เพิ่มหมวด</Button>
                  <Button variant="ghost" size="sm" onClick={() => setNewCategoryOpen(false)}>ยกเลิก</Button>
                </div>
              ) : (
                <Button variant="ghost" size="sm" icon="plus" className="mt-2" onClick={() => setNewCategoryOpen(true)}>เพิ่มหมวดเอกสารใหม่</Button>
              )
            )}
          </div>

          <div>
            <p className="zego-text-tertiary mb-1.5 text-xs font-semibold">ประวัติการเปลี่ยนแปลง (§12)</p>
            <ol className="zego-border-color space-y-1.5 border-l pl-3">
              {history.map((h, i) => (
                <li key={i} className="zego-text-secondary text-xs"><span className="zego-text font-medium">{formatDateTime(h.at)}</span> · {h.action} · {h.source}<span className="zego-text-tertiary"> · {h.by}</span></li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="zego-text-tertiary mb-1.5 text-xs font-semibold">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">{children}</dl>
    </div>
  );
}

function F({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt className="zego-text-tertiary text-xs">{label}</dt>
      <dd className={cx('zego-text font-medium', mono && 'break-all font-mono text-xs')}>{value}</dd>
    </div>
  );
}
