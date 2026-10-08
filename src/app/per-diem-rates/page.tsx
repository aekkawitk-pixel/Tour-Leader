'use client';

/**
 * อัตราเบี้ยเลี้ยง — /per-diem-rates (ฝ่ายจัดหัวหน้าทัวร์ / ผู้ดูแลระบบ)
 *
 * 1) ค่าเริ่มต้นตามประเทศ (บาท / วัน) — ทุกโปรแกรมของประเทศนั้นใช้อัตรานี้
 * 2) อัตราเฉพาะโปรแกรม — ตั้งเฉพาะโปรแกรมที่ต้องการให้ต่างจากค่าเริ่มต้น (เว้นว่าง = ใช้ค่าของประเทศ)
 * ใบเบิกเบี้ยเลี้ยง = อัตราที่ใช้ × จำนวนวันเดินทาง · ไม่มีทั้งสองอย่าง = หัวหน้าทัวร์กรอกอัตราเอง บัญชีตรวจ
 * มีผลกับใบเบิกที่ทำใหม่ (และใบที่กดแก้ไข) — ใบที่ส่งไปแล้วเก็บยอดเดิมไว้
 */

import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, Card, CardHeader, cx, PageHeader } from '@/components/ui/Primitives';
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
const baht = (n: number) => n.toLocaleString('th-TH');

type ProgramFilter = 'all' | 'override' | 'none';
const PAGE_SIZE = 50;

export default function PerDiemRatesPage() {
  const { currentUser, pushToast } = useDemo();
  const [saved, setSaved] = useState<StoredPerDiemRates>({ byCountry: {}, byProgram: {} });
  const [countryForm, setCountryForm] = useState<RateForm>({});
  const [form, setForm] = useState<RateForm>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ProgramFilter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);

  useEffect(() => {
    const r = loadPerDiemRates();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    setSaved(r);
    setCountryForm(toForm(r.byCountry));
    setForm(toForm(r.byProgram));
  }, []);

  /** โปรแกรมทั้งหมดในระบบ — นับกรุ๊ปที่ยังไม่จบทริป (ใช้บ่อยขึ้นก่อน) */
  const programs = useMemo(() => {
    const today = toISODate(new Date());
    const m = new Map<string, { key: string; code: string | null; name: string; country: string; upcoming: number; total: number }>();
    for (const p of getTourPeriods()) {
      const key = perDiemProgramKey(p);
      if (!key) continue;
      const row = m.get(key) ?? { key, code: p.programCode, name: p.displayName, country: (p.countryName ?? '').trim().toUpperCase(), upcoming: 0, total: 0 };
      row.total += 1;
      if (p.endDate >= today) row.upcoming += 1;
      m.set(key, row);
    }
    return [...m.values()].sort((a, b) => b.upcoming - a.upcoming || a.key.localeCompare(b.key));
  }, []);

  /** ประเทศที่มีโปรแกรมในระบบ — เรียงตามจำนวนโปรแกรม */
  const countries = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of programs) if (p.country) m.set(p.country, (m.get(p.country) ?? 0) + 1);
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }, [programs]);

  const countryRate = (c: string) => (Number(countryForm[c]) > 0 ? Number(countryForm[c]) : null);
  const programRate = (k: string) => (Number(form[k]) > 0 ? Number(form[k]) : null);

  const q = query.trim().toLowerCase();
  const shown = programs.filter((p) => (filter === 'all' || (filter === 'override' ? programRate(p.key) !== null : programRate(p.key) === null && countryRate(p.country) === null))
    && (!q || [p.code, p.name, p.country].join(' ').toLowerCase().includes(q)));
  const overrideCount = programs.filter((p) => programRate(p.key) !== null).length;
  const noneCount = programs.filter((p) => programRate(p.key) === null && countryRate(p.country) === null).length;

  const next = { byCountry: toMap(countryForm), byProgram: toMap(form) };
  const dirty = JSON.stringify(next.byCountry) !== JSON.stringify(saved.byCountry) || JSON.stringify(next.byProgram) !== JSON.stringify(saved.byProgram);
  const invalid = [...Object.values(form), ...Object.values(countryForm)].some((v) => v.trim() !== '' && !(Number(v) > 0));

  const submit = () => {
    if (invalid) return;
    try {
      const row = savePerDiemRates(next, currentUser.name, toISODateTime(new Date()));
      setSaved(row);
      setCountryForm(toForm(row.byCountry));
      setForm(toForm(row.byProgram));
      pushToast('success', 'บันทึกอัตราเบี้ยเลี้ยงแล้ว', 'มีผลกับใบเบิกเบี้ยเลี้ยงที่ทำใหม่ตั้งแต่ตอนนี้');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };
  const cancel = () => { setCountryForm(toForm(saved.byCountry)); setForm(toForm(saved.byProgram)); };

  const input = 'w-28 rounded-lg border zego-border-color px-2 py-1.5 text-right text-sm tabular-nums';
  const th = 'px-3 py-2 text-xs font-medium zego-text-tertiary';

  return (
    <>
      <PageHeader
        title="อัตราเบี้ยเลี้ยง"
        description="อัตราเบี้ยเลี้ยงหัวหน้าทัวร์ (บาท / วัน) — ค่าเริ่มต้นตามประเทศ ปรับเฉพาะโปรแกรมได้ · ใบเบิกเบี้ยเลี้ยง = อัตรา × จำนวนวันเดินทาง"
        actions={(
          <div className="flex flex-wrap items-center gap-2 max-md:hidden">
            {dirty && <span className="zego-text-warning text-xs">ยังไม่ได้บันทึก</span>}
            <Button variant="secondary" disabled={!dirty} onClick={cancel}>ยกเลิกการแก้ไข</Button>
            <Button variant="primary" disabled={invalid || !dirty} onClick={submit}>บันทึกอัตราเบี้ยเลี้ยง</Button>
          </div>
        )}
      />

      {invalid && <p className="zego-text-danger mb-3 text-sm">อัตราต้องเป็นตัวเลขมากกว่า 0 (เว้นว่าง = ยังไม่ตั้ง)</p>}

      {/* 1) ค่าเริ่มต้นตามประเทศ */}
      <Card className="mb-5">
        <CardHeader title="1. ค่าเริ่มต้นตามประเทศ" description="ทุกโปรแกรมของประเทศนั้นใช้อัตรานี้ — เว้นแต่ตั้งอัตราเฉพาะโปรแกรมไว้ในข้อ 2" />
        {/* จอเล็ก: 2 ประเทศต่อแถว ช่องกรอกเต็มความกว้างอยู่ใต้ชื่อ — รายการสั้นลงครึ่งหนึ่ง */}
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-4">
          {countries.map((c) => (
            <label key={c.name} className={cx('flex justify-between gap-1.5 rounded-lg border px-3 py-2 max-sm:flex-col sm:items-center sm:gap-3', countryRate(c.name) === null ? 'border-amber-300 bg-amber-50/40' : 'zego-border-color')}>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium zego-text">{c.name}</span>
                <span className="block text-xs zego-text-tertiary">{c.count} โปรแกรม{countryRate(c.name) === null ? ' · ยังไม่ตั้ง' : ''}</span>
              </span>
              <input
                type="number" inputMode="decimal" min={0} placeholder="ยังไม่ตั้ง"
                aria-label={`อัตราเบี้ยเลี้ยงเริ่มต้น ${c.name}`}
                className={cx(input, 'max-sm:w-full')}
                value={countryForm[c.name] ?? ''}
                onChange={(e) => setCountryForm((f) => ({ ...f, [c.name]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      </Card>

      {/* 2) อัตราเฉพาะโปรแกรม */}
      <Card className="space-y-3">
        <CardHeader title="2. อัตราเฉพาะโปรแกรม" description="กรอกเฉพาะโปรแกรมที่ต้องการให้ต่างจากค่าเริ่มต้นของประเทศ — เว้นว่าง = ใช้ค่าเริ่มต้น" />
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox value={query} onChange={setQuery} onClear={() => setQuery('')} placeholder="ค้นหารหัสโปรแกรม ชื่อโปรแกรม หรือประเทศ" label="ค้นหาโปรแกรม" className="min-w-0 flex-1 basis-full sm:min-w-[16rem] sm:basis-auto" />
          <select className="h-10 rounded-lg border zego-border-color bg-white px-3 text-sm max-sm:w-full" value={filter} onChange={(e) => { setFilter(e.target.value as ProgramFilter); setLimit(PAGE_SIZE); }} aria-label="กรองโปรแกรม">
            <option value="all">ทุกโปรแกรม ({programs.length})</option>
            <option value="override">ตั้งเฉพาะโปรแกรม ({overrideCount})</option>
            <option value="none">ยังไม่มีอัตรา ({noneCount})</option>
          </select>
        </div>

        {/* จอเล็ก — การ์ดละโปรแกรม (ตาราง 6 คอลัมน์เลื่อนข้างกรอกไม่สะดวก) */}
        <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color md:hidden">
          {shown.slice(0, limit).map((p) => {
            const own = programRate(p.key);
            const def = countryRate(p.country);
            return (
              <li key={p.key} className="space-y-1.5 px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 text-sm"><span className="font-semibold zego-text">{p.code ?? '—'}</span> <span className="text-xs zego-text-tertiary">· {p.country || '—'}</span></p>
                  <span className="shrink-0 text-xs tabular-nums zego-text-tertiary" title="กรุ๊ปยังไม่จบ / ทั้งหมด">กรุ๊ป {p.upcoming}/{p.total}</span>
                </div>
                <p className="line-clamp-2 text-xs zego-text-secondary">{p.name}</p>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm">
                    {own !== null ? (
                      <><span className="font-semibold tabular-nums zego-text">{baht(own)}</span> <span className="text-[11px] text-violet-700">เฉพาะโปรแกรม</span></>
                    ) : def !== null ? (
                      <><span className="tabular-nums zego-text">{baht(def)}</span> <span className="text-[11px] zego-text-tertiary">ตามประเทศ</span></>
                    ) : <span className="text-xs zego-text-warning">ยังไม่มีอัตรา</span>}
                  </span>
                  <input
                    type="number" inputMode="decimal" min={0}
                    placeholder={def !== null ? `ตามประเทศ` : 'ยังไม่ตั้ง'}
                    aria-label={`อัตราเบี้ยเลี้ยงเฉพาะโปรแกรม ${p.code ?? p.name}`}
                    className={cx(input, own !== null && 'border-violet-300 bg-violet-50/40')}
                    value={form[p.key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, [p.key]: e.target.value }))}
                  />
                </div>
              </li>
            );
          })}
          {shown.length === 0 && <li className="px-3 py-6 text-center text-sm zego-text-tertiary">ไม่พบโปรแกรม</li>}
        </ul>
        <div className="hidden overflow-x-auto rounded-lg border zego-border-color md:block">
          <table className="w-full text-sm">
            <thead className="zego-surface-soft-bg text-left">
              <tr>
                <th className={th}>ประเทศ</th>
                <th className={th}>รหัสโปรแกรม</th>
                <th className={th}>ชื่อโปรแกรม</th>
                <th className={cx(th, 'text-right')}>กรุ๊ป (ยังไม่จบ / ทั้งหมด)</th>
                <th className={cx(th, 'text-right')}>อัตราที่ใช้ (บาท / วัน)</th>
                <th className={cx(th, 'text-right')}>เฉพาะโปรแกรม</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--zego-border-soft)]">
              {shown.slice(0, limit).map((p) => {
                const own = programRate(p.key);
                const def = countryRate(p.country);
                return (
                  <tr key={p.key}>
                    <td className="whitespace-nowrap px-3 py-1.5 zego-text-secondary">{p.country || '—'}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-medium zego-text">{p.code ?? '—'}</td>
                    <td className="max-w-[28rem] px-3 py-1.5"><p className="line-clamp-2 zego-text-secondary">{p.name}</p></td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right tabular-nums zego-text-tertiary">{p.upcoming} / {p.total}</td>
                    <td className="whitespace-nowrap px-3 py-1.5 text-right">
                      {own !== null ? (
                        <><span className="font-semibold tabular-nums zego-text">{baht(own)}</span><span className="block text-[11px] text-violet-700">เฉพาะโปรแกรม</span></>
                      ) : def !== null ? (
                        <><span className="tabular-nums zego-text">{baht(def)}</span><span className="block text-[11px] zego-text-tertiary">ตามประเทศ</span></>
                      ) : <span className="text-xs zego-text-warning">ยังไม่มีอัตรา</span>}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <input
                        type="number" inputMode="decimal" min={0}
                        placeholder={def !== null ? `ตามประเทศ` : 'ยังไม่ตั้ง'}
                        aria-label={`อัตราเบี้ยเลี้ยงเฉพาะโปรแกรม ${p.code ?? p.name}`}
                        className={cx(input, own !== null && 'border-violet-300 bg-violet-50/40')}
                        value={form[p.key] ?? ''}
                        onChange={(e) => setForm((f) => ({ ...f, [p.key]: e.target.value }))}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="px-3 py-6 text-center text-sm zego-text-tertiary">ไม่พบโปรแกรม</p>}
        </div>
        {shown.length > limit && (
          <div className="text-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit((n) => n + PAGE_SIZE)}>แสดงเพิ่ม ({shown.length - limit} โปรแกรม)</Button>
          </div>
        )}

        {saved.updatedAt && (
          <p className="zego-text-tertiary text-right text-xs">แก้ล่าสุด {formatDateTime(saved.updatedAt)}{saved.updatedBy ? ` โดย ${saved.updatedBy}` : ''}</p>
        )}

        <Callout tone="blue" title="ใช้อย่างไร">
          <ul className="ml-4 list-disc space-y-0.5">
            <li>ตั้งค่าเริ่มต้นของแต่ละประเทศก่อน — ทุกโปรแกรมของประเทศนั้นใช้อัตรานี้ทันที</li>
            <li>โปรแกรมไหนต้องการอัตราต่างออกไป ค่อยกรอกช่อง “เฉพาะโปรแกรม” · ลบค่าออก = กลับไปใช้ค่าเริ่มต้นของประเทศ</li>
            <li>หัวหน้าทัวร์ทำใบเบิกหลังจบทริป — ค่าเบี้ยเลี้ยงคำนวณให้ = อัตราที่ใช้ × จำนวนวันเดินทาง</li>
            <li>ไม่มีทั้งค่าเฉพาะโปรแกรมและค่าของประเทศ — หัวหน้าทัวร์กรอกอัตราเอง การเงินตรวจตอนอนุมัติ</li>
            <li>ใบที่ส่งไปแล้วเก็บยอดเดิมไว้ ไม่เปลี่ยนย้อนหลัง</li>
          </ul>
        </Callout>
      </Card>
      {/*
        จอเล็ก: ปุ่มบันทึกอยู่บนสุดของหน้า เลื่อนลงมากรอกแล้วมองไม่เห็น → แถบติดล่างจอ ขึ้นเมื่อมีการแก้ที่ยังไม่บันทึก
        เว้นที่ท้ายหน้าเท่าความสูงแถบ ไม่ให้บังเนื้อหาบรรทัดสุดท้าย
      */}
      {dirty && (
        <>
          <div className="h-20 md:hidden" aria-hidden />
          <div className="zego-surface-bg zego-divider-top fixed inset-x-0 bottom-0 z-40 flex items-center gap-2 px-4 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.06)] md:hidden">
            <span className="zego-text-warning min-w-0 flex-1 text-xs">{invalid ? 'มีอัตราที่ไม่ถูกต้อง' : 'ยังไม่ได้บันทึก'}</span>
            <Button variant="secondary" size="sm" onClick={cancel}>ยกเลิก</Button>
            <Button variant="primary" size="sm" disabled={invalid} onClick={submit}>บันทึก</Button>
          </div>
        </>
      )}
    </>
  );
}
