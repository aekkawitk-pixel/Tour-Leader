'use client';

/**
 * ตั้งค่าระบบ → ค่าทิป — อัตราค่าทิปหัวหน้าทัวร์ (บาท / ลูกค้า 1 คน / ทั้งทริป) · ผู้ดูแลระบบเท่านั้น
 *
 * อัตราหลักตั้งตามประเทศ · บางโปรแกรมมีอัตราเฉพาะ (ชนะอัตราประเทศ) — ดู tipRateFor
 * รายชื่อประเทศ/โปรแกรมมาจากกรุ๊ปที่มีในระบบ (Tour Period Master) เพื่อพิมพ์ชื่อตรงกันเสมอ
 * มีผลกับใบเบิกค่าทิปที่ทำใหม่ (และใบที่กดแก้ไข) — ใบที่ส่งไปแล้วเก็บยอดของตัวเองไว้
 */

import { useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, CardHeader } from '@/components/ui/Primitives';
import { formatCurrency, formatDateTime, toISODateTime } from '@/lib/format';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadTipRates, saveTipRates, type StoredTipRates } from '@/services/tipRateStore';
import { EMPTY_TIP_RATES } from '@/lib/logic/leaderClaims';

/** ค่าในฟอร์มเก็บเป็นข้อความ — ช่องว่าง = ยังไม่ตั้ง */
type RateForm = Record<string, string>;
const toForm = (m: Record<string, number>): RateForm => Object.fromEntries(Object.entries(m).map(([k, v]) => [k, String(v)]));
const toMap = (f: RateForm): Record<string, number> =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => Number(v) > 0).map(([k, v]) => [k, Number(v)]));

export function TipRateSettings() {
  const { currentUser, pushToast } = useDemo();
  const [saved, setSaved] = useState<StoredTipRates>(EMPTY_TIP_RATES);
  const [countries, setCountries] = useState<RateForm>({});
  const [programs, setPrograms] = useState<RateForm>({});
  const [pickProgram, setPickProgram] = useState('');

  useEffect(() => {
    const r = loadTipRates();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ซิงก์จากภายนอก (localStorage) ครั้งเดียวตอน mount
    setSaved(r);
    setCountries(toForm(r.byCountry));
    setPrograms(toForm(r.byProgram));
  }, []);

  /** ประเทศ/โปรแกรมที่มีกรุ๊ปในระบบ — ประเทศเรียงตามจำนวนกรุ๊ป (ใช้บ่อยขึ้นก่อน) */
  const { countryList, programList } = useMemo(() => {
    const periods = getTourPeriods();
    const cCount = new Map<string, number>();
    const pSet = new Map<string, string>();
    for (const p of periods) {
      const c = p.countryName?.trim().toUpperCase();
      if (c) cCount.set(c, (cCount.get(c) ?? 0) + 1);
      const name = p.displayName?.trim();
      if (name && !pSet.has(name)) pSet.set(name, c ?? '');
    }
    for (const c of Object.keys(saved.byCountry)) if (!cCount.has(c)) cCount.set(c, 0);
    return {
      countryList: [...cCount].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([c, n]) => ({ country: c, groups: n })),
      programList: [...pSet].sort((a, b) => a[0].localeCompare(b[0], 'th')).map(([name, country]) => ({ name, country })),
    };
  }, [saved]);

  const next = { byCountry: toMap(countries), byProgram: toMap(programs) };
  const dirty = JSON.stringify(next) !== JSON.stringify({ byCountry: saved.byCountry, byProgram: saved.byProgram });
  const invalid = [...Object.values(countries), ...Object.values(programs)].some((v) => v.trim() !== '' && !(Number(v) > 0));
  const programRows = Object.keys(programs).sort((a, b) => a.localeCompare(b, 'th'));
  const countryOfProgram = (name: string) => programList.find((p) => p.name === name)?.country ?? '';

  const submit = () => {
    if (invalid) return;
    try {
      const row = saveTipRates(next, currentUser.name, toISODateTime(new Date()));
      setSaved(row);
      setCountries(toForm(row.byCountry));
      setPrograms(toForm(row.byProgram));
      pushToast('success', 'บันทึกอัตราค่าทิปแล้ว', 'มีผลกับใบเบิกค่าทิปที่ทำใหม่ตั้งแต่ตอนนี้');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const input = 'w-28 rounded-lg border zego-border-color px-2 py-1.5 text-right text-sm tabular-nums';

  return (
    <div className="space-y-4">
      <CardHeader
        title="อัตราค่าทิปหัวหน้าทัวร์"
        description="บาท ต่อลูกค้า 1 คน ทั้งทริป — ใบเบิกค่าทิป = อัตรา × จำนวนลูกค้า · อัตราโปรแกรมเฉพาะใช้แทนอัตราประเทศ"
      />

      {/* อัตราตามประเทศ */}
      <div className="rounded-lg border zego-border-color">
        <p className="border-b zego-border-color px-3 py-2 text-sm font-semibold zego-text">ตามประเทศ</p>
        <ul className="divide-y divide-[var(--zego-border-soft)]">
          {countryList.map(({ country, groups }) => (
            <li key={country} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="min-w-0">
                <span className="text-sm zego-text">{country}</span>
                <span className="ml-2 text-xs zego-text-tertiary">{groups} กรุ๊ป</span>
              </span>
              <span className="flex items-center gap-2 text-xs zego-text-tertiary">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  className={input}
                  placeholder="ยังไม่ตั้ง"
                  aria-label={`อัตราค่าทิป ${country}`}
                  value={countries[country] ?? ''}
                  onChange={(e) => setCountries((p) => ({ ...p, [country]: e.target.value }))}
                />
                บาท/คน
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* อัตราเฉพาะโปรแกรม */}
      <div className="rounded-lg border zego-border-color">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b zego-border-color px-3 py-2">
          <p className="text-sm font-semibold zego-text">เฉพาะโปรแกรม <span className="text-xs font-normal zego-text-tertiary">(ใช้แทนอัตราประเทศ)</span></p>
          <div className="flex min-w-0 items-center gap-2">
            <select
              className="min-w-0 max-w-[22rem] rounded-lg border zego-border-color px-2 py-1.5 text-sm"
              value={pickProgram}
              onChange={(e) => setPickProgram(e.target.value)}
              aria-label="เลือกโปรแกรม"
            >
              <option value="">— เลือกโปรแกรม —</option>
              {programList.filter((p) => !(p.name in programs)).map((p) => (
                <option key={p.name} value={p.name}>{p.country ? `[${p.country}] ` : ''}{p.name}</option>
              ))}
            </select>
            <Button
              variant="secondary"
              size="sm"
              icon="plus"
              disabled={!pickProgram}
              onClick={() => {
                setPrograms((p) => ({ ...p, [pickProgram]: '' }));
                setPickProgram('');
              }}
            >
              เพิ่ม
            </Button>
          </div>
        </div>
        {programRows.length === 0 ? (
          <p className="px-3 py-4 text-center text-xs zego-text-tertiary">ยังไม่มีโปรแกรมที่ตั้งอัตราเฉพาะ — ทุกกรุ๊ปใช้อัตราตามประเทศ</p>
        ) : (
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {programRows.map((name) => {
              const base = Number(countries[countryOfProgram(name)]) || 0;
              return (
                <li key={name} className="flex items-center justify-between gap-3 px-3 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm zego-text">{name}</span>
                    <span className="block text-xs zego-text-tertiary">
                      {countryOfProgram(name) || '—'} · อัตราประเทศ {base > 0 ? formatCurrency(base, 'THB') : 'ยังไม่ตั้ง'}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-xs zego-text-tertiary">
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      className={input}
                      aria-label={`อัตราค่าทิปโปรแกรม ${name}`}
                      value={programs[name]}
                      onChange={(e) => setPrograms((p) => ({ ...p, [name]: e.target.value }))}
                    />
                    บาท/คน
                    <button
                      type="button"
                      className="zego-text-danger hover:underline"
                      onClick={() => setPrograms((p) => Object.fromEntries(Object.entries(p).filter(([k]) => k !== name)))}
                    >
                      ลบ
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {invalid && <p className="zego-text-danger text-sm">อัตราต้องเป็นตัวเลขมากกว่า 0 (เว้นว่าง = ยังไม่ตั้ง)</p>}

      <div className="zego-divider-top flex flex-wrap items-center gap-2 pt-3">
        <Button variant="primary" disabled={invalid || !dirty} onClick={submit}>บันทึกอัตราค่าทิป</Button>
        <Button
          variant="secondary"
          disabled={!dirty}
          onClick={() => {
            setCountries(toForm(saved.byCountry));
            setPrograms(toForm(saved.byProgram));
          }}
        >
          ยกเลิกการแก้ไข
        </Button>
        {dirty && <span className="zego-text-warning text-xs">ยังไม่ได้บันทึก</span>}
        {saved.updatedAt && (
          <span className="zego-text-tertiary ml-auto text-xs">แก้ล่าสุด {formatDateTime(saved.updatedAt)}{saved.updatedBy ? ` โดย ${saved.updatedBy}` : ''}</span>
        )}
      </div>

      <Callout tone="blue" title="ใช้อย่างไร">
        <ul className="ml-4 list-disc space-y-0.5">
          <li>หัวหน้าทัวร์ทำใบเบิกค่าทิปแยกต่อกรุ๊ป: อัตรา × จำนวนลูกค้า (ตั้งต้นจากจำนวนที่จองไว้ แก้ได้ตามจริง)</li>
          <li>ประเทศที่ยังไม่ตั้งอัตรา — หัวหน้าทัวร์กรอกอัตราเอง บัญชีตรวจตอนอนุมัติ</li>
          <li>ใบที่ส่งไปแล้วเก็บยอดเดิมไว้ ไม่เปลี่ยนย้อนหลัง</li>
        </ul>
      </Callout>
    </div>
  );
}
