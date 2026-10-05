'use client';

/**
 * อัตราเบี้ยเลี้ยง — /per-diem-rates (ฝ่ายจัดหัวหน้าทัวร์ / ผู้ดูแลระบบ)
 *
 * ตั้งอัตราเบี้ยเลี้ยงหัวหน้าทัวร์ (บาท / วัน) แยกตามโปรแกรมทัวร์ — รายชื่อโปรแกรมมาจากกรุ๊ปในระบบ (Tour Period Master)
 * ใบเบิกเบี้ยเลี้ยง = อัตราของโปรแกรม × จำนวนวันเดินทาง · โปรแกรมที่ยังไม่ตั้ง = หัวหน้าทัวร์กรอกอัตราเอง บัญชีตรวจ
 * มีผลกับใบเบิกที่ทำใหม่ (และใบที่กดแก้ไข) — ใบที่ส่งไปแล้วเก็บยอดเดิมไว้
 */

import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, Card, PageHeader } from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { formatDateTime, toISODate, toISODateTime } from '@/lib/format';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadPerDiemRates, savePerDiemRates, type StoredPerDiemRates } from '@/services/perDiemRateStore';
import { perDiemProgramKey } from '@/lib/logic/leaderClaims';

/** ค่าในฟอร์มเก็บเป็นข้อความ — ช่องว่าง = ยังไม่ตั้ง */
type RateForm = Record<string, string>;
const toForm = (m: Record<string, number>): RateForm => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)]));
const toMap = (f: RateForm): Record<string, number> =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));

const PAGE_SIZE = 50;

export default function PerDiemRatesPage() {
  const { currentUser, pushToast } = useDemo();
  const [saved, setSaved] = useState<StoredPerDiemRates>({ byProgram: {} });
  const [form, setForm] = useState<RateForm>({});
  const [query, setQuery] = useState('');
  const [onlyUnset, setOnlyUnset] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    const r = loadPerDiemRates();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    setSaved(r);
    setForm(toForm(r.byProgram));
  }, []);

  /** โปรแกรมทั้งหมดในระบบ — นับกรุ๊ปที่ยังไม่จบทริป (ใช้บ่อยขึ้นก่อน) */
  const programs = useMemo(() => {
    const today = toISODate(new Date());
    const m = new Map<string, { key: string; code: string | null; name: string; country: string; upcoming: number; total: number }>();
    for (const p of getTourPeriods()) {
      const key = perDiemProgramKey(p);
      if (!key) continue;
      const row = m.get(key) ?? { key, code: p.programCode, name: p.displayName, country: p.countryName, upcoming: 0, total: 0 };
      row.total += 1;
      if (p.endDate >= today) row.upcoming += 1;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => b.upcoming - a.upcoming || a.key.localeCompare(b.key));
  }, []);

  const q = query.trim().toLowerCase();
  const shown = programs.filter((p) => (!onlyUnset || !(Number(form[p.key]) > 0))
    && (!q || [p.code, p.name, p.country].join(' ').toLowerCase().includes(q)));
  const setCount = programs.filter((p) => Number(form[p.key]) > 0).length;

  const next = toMap(form);
  const dirty = JSON.stringify(next) !== JSON.stringify(saved.byProgram);
  const invalid = Object.values(form).some((v) => v.trim() !== '' && !(Number(v) > 0));

  const submit = () => {
    if (invalid) return;
    try {
      const row = savePerDiemRates(next, currentUser.name, toISODateTime(new Date()));
      setSaved(row);
      setForm(toForm(row.byProgram));
      pushToast('success', 'บันทึกอัตราเบี้ยเลี้ยงแล้ว', 'มีผลกับใบเบิกเบี้ยเลี้ยงที่ทำใหม่ตั้งแต่ตอนนี้');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  return (
    <>
      <PageHeader
        title="อัตราเบี้ยเลี้ยง"
        description="อัตราเบี้ยเลี้ยงหัวหน้าทัวร์ (บาท / วัน) ตามโปรแกรมทัวร์ — ใบเบิกเบี้ยเลี้ยง = อัตรา × จำนวนวันเดินทาง"
      />

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={query} onChange={setQuery} onClear={() => setQuery('')} placeholder="ค้นหารหัสโปรแกรม ชื่อโปรแกรม หรือประเทศ" label="ค้นหาโปรแกรม" className="min-w-[16rem] flex-1" />
          <label className="flex items-center gap-2 text-sm zego-text-secondary">
            <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={onlyUnset} onChange={(e) => setOnlyUnset(e.target.checked)} />
            เฉพาะที่ยังไม่ตั้งอัตรา
          </label>
          <span className="text-xs zego-text-tertiary">ตั้งแล้ว {setCount} / {programs.length} โปรแกรม</span>
        </div>

        <div className="overflow-x-auto rounded-lg border zego-border-color">
          <table className="w-full text-sm">
            <thead className="zego-surface-soft-bg text-left">
              <tr>
                <th className="px-3 py-2 text-xs font-medium zego-text-tertiary">ประเทศ</th>
                <th className="px-3 py-2 text-xs font-medium zego-text-tertiary">รหัสโปรแกรม</th>
                <th className="px-3 py-2 text-xs font-medium zego-text-tertiary">ชื่อโปรแกรม</th>
                <th className="px-3 py-2 text-right text-xs font-medium zego-text-tertiary">กรุ๊ป (ยังไม่จบ / ทั้งหมด)</th>
                <th className="px-3 py-2 text-right text-xs font-medium zego-text-tertiary">อัตรา (บาท / วัน)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--zego-border-soft)]">
              {shown.slice(0, limit).map((p) => (
                <tr key={p.key}>
                  <td className="whitespace-nowrap px-3 py-1.5 zego-text-secondary">{p.country || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-medium zego-text">{p.code ?? '—'}</td>
                  <td className="max-w-[28rem] px-3 py-1.5"><p className="line-clamp-2 zego-text-secondary">{p.name}</p></td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums zego-text-tertiary">{p.upcoming} / {p.total}</td>
                  <td className="px-3 py-1.5 text-right">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      placeholder="ยังไม่ตั้ง"
                      aria-label={`อัตราเบี้ยเลี้ยง ${p.code ?? p.name}`}
                      className="w-28 rounded-lg border zego-border-color px-2 py-1.5 text-right text-sm tabular-nums"
                      value={form[p.key] ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, [p.key]: e.target.value }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="px-3 py-6 text-center text-sm zego-text-tertiary">ไม่พบโปรแกรม</p>}
        </div>
        {shown.length > limit && (
          <div className="text-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>แสดงเพิ่ม ({shown.length - limit} โปรแกรม)</Button>
          </div>
        )}

        {invalid && <p className="zego-text-danger text-sm">อัตราต้องเป็นตัวเลขมากกว่า 0 (เว้นว่าง = ยังไม่ตั้ง)</p>}

        <div className="zego-divider-top flex flex-wrap items-center gap-2 pt-3">
          <Button variant="primary" disabled={invalid || !dirty} onClick={submit}>บันทึกอัตราเบี้ยเลี้ยง</Button>
          <Button variant="secondary" disabled={!dirty} onClick={() => setForm(toForm(saved.byProgram))}>ยกเลิกการแก้ไข</Button>
          {dirty && <span className="zego-text-warning text-xs">ยังไม่ได้บันทึก</span>}
          {saved.updatedAt && (
            <span className="zego-text-tertiary ml-auto text-xs">แก้ล่าสุด {formatDateTime(saved.updatedAt)}{saved.updatedBy ? ` โดย ${saved.updatedBy}` : ''}</span>
          )}
        </div>

        <Callout tone="blue" title="ใช้อย่างไร">
          <ul className="ml-4 list-disc space-y-0.5">
            <li>หัวหน้าทัวร์ทำเอกสารค่าใช้จ่ายหลังจบทริป — ข้อ 1 ค่าเบี้ยเลี้ยงคำนวณให้ = อัตราของโปรแกรม × จำนวนวันเดินทาง</li>
            <li>โปรแกรมที่ยังไม่ตั้งอัตรา — หัวหน้าทัวร์กรอกอัตราเอง การเงินตรวจตอนอนุมัติ</li>
            <li>ใบที่ส่งไปแล้วเก็บยอดเดิมไว้ ไม่เปลี่ยนย้อนหลัง</li>
          </ul>
        </Callout>
      </Card>
    </>
  );
}
