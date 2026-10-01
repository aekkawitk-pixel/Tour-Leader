'use client';

/**
 * เมนู "โปรแกรมทัวร์ (Zego)" — ดึงข้อมูลโปรแกรมทัวร์จาก Zego API v1.5 มาแสดง
 *
 * รูปแบบการทำงาน: กด "ดึงข้อมูลล่าสุด" → เก็บลงเครื่อง → ใช้ต่อได้แม้ API ล่ม
 * ทุกคำขอผ่าน /api/zego/* ฝั่งเซิร์ฟเวอร์เสมอ — Token ไม่หลุดมาถึงเบราว์เซอร์
 *
 * ข้อมูลที่นำเข้าแล้วจะถูกใช้เป็นแหล่งข้อมูล Zego ของทั้งระบบผ่าน zegoSource.ts
 */

import { useEffect, useMemo, useState } from 'react';
import { Button, Callout, Card, cx, EmptyState, PageHeader, Pill, StatusBadge } from '@/components/ui/Primitives';
import { SearchBox } from '@/components/ui/FormField';
import { MultiSelectControl } from '@/components/ui/MultiSelect';
import { Icon } from '@/components/ui/Icon';
import { formatDateRange, formatDateTime } from '@/lib/format';
import { StorageWriteError } from '@/services/browserStorage';
import { clearZegoImport, loadZegoImport, saveZegoImport, type ZegoImportSnapshot } from '@/services/zegoImportStore';
import {
  EMPTY_ZEGO_CONFIG, loadZegoConfig, scopeLabel, scopeQuery, type ZegoConfig,
} from '@/services/zegoConfigStore';
import { ZegoSetupPanel, type ZegoStatus } from './ZegoSetupPanel';
import type { ZegoPeriod, ZegoProgram } from '@/data/zego/types';

interface FetchResult {
  programs: ZegoProgram[];
  periods: ZegoPeriod[];
  skipped: string[];
}

/**
 * เวลาเที่ยวบินจาก API มาเป็น HH:MM:SS โดยวินาทีเป็น 00 เสมอ — ตัดทิ้งให้อ่านง่าย
 * รูปแบบอื่นคืนค่าเดิมไป ไม่ตัดมั่วจนข้อมูลเพี้ยน
 */
function flightTime(value: string): string {
  const m = value.trim().match(/^(\d{1,2}:\d{2}):\d{2}$/);
  return m ? m[1] : value.trim();
}

/** สถานะขายของพีเรียด — ใช้สีเดียวกับความหมายในระบบ (ขายอยู่/ปิดขาย) */
function saleTone(status: string): 'green' | 'slate' | 'red' {
  const s = status.toUpperCase();
  if (s.includes('NO')) return 'red';
  if (s.includes('CLOSE')) return 'slate';
  return 'green';
}

export function ZegoProgramsView() {
  const [snapshot, setSnapshot] = useState<ZegoImportSnapshot | null>(null);
  const [config, setConfig] = useState<ZegoConfig>(EMPTY_ZEGO_CONFIG);
  const [status, setStatus] = useState<ZegoStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [countries, setCountries] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  /* อ่าน localStorage ได้เฉพาะฝั่ง client → โหลดใน effect เพื่อไม่ให้ HTML ฝั่ง server ต่างกัน */
  useEffect(() => {
    const saved = loadZegoImport();
    const cfg = loadZegoConfig();
    /* eslint-disable react-hooks/set-state-in-effect */
    setSnapshot(saved);
    setConfig(cfg);
    // ยังไม่เคยตั้งค่าและยังไม่เคยนำเข้า → กางแผงตั้งค่าให้เลย ไม่ต้องให้หาเอง
    setSetupOpen(!cfg.token && !saved);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  /* อ้างอิงคงที่เมื่อ snapshot ไม่เปลี่ยน — ไม่งั้น [] ตัวใหม่ทุกรอบทำให้ useMemo ข้างล่างคำนวณใหม่ทุกครั้ง */
  const programs = useMemo(() => snapshot?.programs ?? [], [snapshot]);
  const periods = useMemo(() => snapshot?.periods ?? [], [snapshot]);

  /** พีเรียดของแต่ละโปรแกรม — จับคู่ด้วย programCode ตัวเดียวกับที่ทั้งระบบใช้ */
  const periodsByProgram = useMemo(() => {
    const m = new Map<string, ZegoPeriod[]>();
    for (const p of periods) {
      const list = m.get(p.programCode) ?? [];
      list.push(p);
      m.set(p.programCode, list);
    }
    for (const list of m.values()) list.sort((a, b) => a.startDate.localeCompare(b.startDate));
    return m;
  }, [periods]);

  /** ตัวเลือกประเทศ — จากข้อมูลที่ดึงมาจริง ไม่ใช่รายชื่อประเทศทั้งโลก */
  const countryOptions = useMemo(() => {
    const names = new Set(programs.map((p) => p.country).filter(Boolean));
    return [...names].sort().map((c) => ({ value: c, label: c }));
  }, [programs]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    return programs.filter((p) => {
      if (countries.length > 0 && !countries.includes(p.country)) return false;
      if (!q) return true;
      const codes = (periodsByProgram.get(p.programCode) ?? []).map((d) => d.groupCode).join(' ');
      const flights = (p.flights ?? []).map((f) => `${f.flightNo} ${f.route} ${f.airlineCode} ${f.airlineName}`).join(' ');
      return [p.programCode, p.programName ?? '', p.country, codes, flights].join(' ').toLowerCase().includes(q);
    });
  }, [programs, countries, search, periodsByProgram]);

  /** จำนวนพีเรียดที่มีคำเตือนตอนแปลงข้อมูล — บอกไว้ ไม่ซ่อน */
  const warnedPeriods = useMemo(() => periods.filter((p) => p.importWarnings.length > 0), [periods]);

  /*
    ส่ง Token ที่ตั้งไว้ไปกับคำขอ ให้ Route Handler ฝั่งเซิร์ฟเวอร์เป็นคนยิงต่อ
    (ถ้าเซิร์ฟเวอร์ตั้ง env var ไว้ ค่านั้นชนะ — ดู resolveToken ใน api/zego/config.ts)
  */
  const authHeaders = (cfg: ZegoConfig): HeadersInit =>
    (cfg.token.trim() ? { 'x-zego-token': cfg.token.trim() } : {});

  /** ทดสอบการเชื่อมต่อโดยไม่ดึงข้อมูลจริง — ยิง endpoint ที่เบาที่สุด */
  const testConnection = async (cfg: ZegoConfig) => {
    setTesting(true);
    try {
      const res = await fetch('/api/zego/status', { headers: authHeaders(cfg) });
      const body = await res.json().catch(() => ({}));
      setStatus(res.ok
        ? body as ZegoStatus
        : { ok: false, tokenSource: 'none', error: body?.error ?? `ทดสอบไม่สำเร็จ (${res.status})` });
    } catch (e) {
      setStatus({ ok: false, tokenSource: 'none', error: e instanceof Error ? e.message : 'ทดสอบไม่สำเร็จ' });
    } finally {
      setTesting(false);
    }
  };

  const toggle = (code: string) => setExpanded((prev) => {
    const next = new Set(prev);
    if (next.has(code)) next.delete(code); else next.add(code);
    return next;
  });

  /** ดึงข้อมูลจาก API แล้วบันทึกลงเครื่อง — ล้มเหลวที่ขั้นไหนก็บอกสาเหตุที่ขั้นนั้น */
  const importNow = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/zego/programtours${scopeQuery(config)}`, { headers: authHeaders(config) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? `ดึงข้อมูลไม่สำเร็จ (${res.status})`);
      const data = body as FetchResult;

      /* ถามเวลาอัปเดตล่าสุดเป็นข้อมูลเสริม — ถามไม่ได้ก็ไม่ควรทำให้การนำเข้าล้มทั้งหมด */
      let sourceUpdatedAt: string | null = null;
      try {
        const up = await fetch('/api/zego/updated-at', { headers: authHeaders(config) });
        if (up.ok) sourceUpdatedAt = (await up.json())?.updatedAt ?? null;
      } catch { /* ข้ามไป — ไม่ใช่ข้อมูลที่จำเป็นต่อการนำเข้า */ }

      const next: ZegoImportSnapshot = {
        importedAt: new Date().toISOString(),
        sourceUpdatedAt,
        scope: scopeLabel(config),
        programs: data.programs ?? [],
        periods: data.periods ?? [],
        skipped: data.skipped ?? [],
      };
      saveZegoImport(next);
      setSnapshot(next);
    } catch (e) {
      setError(e instanceof StorageWriteError
        ? `ดึงข้อมูลมาได้ แต่บันทึกลงเครื่องไม่สำเร็จ: ${e.message}`
        : e instanceof Error ? e.message : 'เกิดข้อผิดพลาดที่ไม่คาดคิด');
    } finally {
      setLoading(false);
    }
  };

  const clearNow = () => {
    try {
      clearZegoImport();
      setSnapshot(null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ล้างข้อมูลไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-3">
      <PageHeader
        title="โปรแกรมทัวร์ (Zego)"
        description="ดึงโปรแกรมทัวร์และพีเรียดจาก Zego API v1.5 มาเก็บไว้ใช้ในระบบ"
        actions={
          <>
            <Button variant="ghost" size="sm" onClick={() => setSetupOpen((v) => !v)} aria-expanded={setupOpen}>
              {setupOpen ? 'ซ่อนการตั้งค่า' : 'ตั้งค่าการเชื่อมต่อ'}
            </Button>
            {snapshot && <Button variant="ghost" size="sm" onClick={clearNow}>ล้างข้อมูลที่นำเข้า</Button>}
            <Button variant="primary" size="sm" onClick={importNow} disabled={loading}>
              {loading ? 'กำลังดึงข้อมูล…' : 'ดึงข้อมูลล่าสุด'}
            </Button>
          </>
        }
      />

      {setupOpen && (
        <ZegoSetupPanel
          config={config}
          onChange={setConfig}
          status={status}
          onTest={testConnection}
          testing={testing}
        />
      )}

      {error && (
        <Callout tone="red" title="ดึงข้อมูลไม่สำเร็จ">
          <p className="text-sm">{error}</p>
        </Callout>
      )}

      {/* สถานะข้อมูลชุดที่ถืออยู่ — ต้องรู้เสมอว่ากำลังดูข้อมูล ณ เวลาไหน */}
      {snapshot && (
        <Card>
          <div className="zego-text-secondary flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="zego-text inline-flex items-center gap-1.5 font-medium">
              <Icon name="check" className="zego-text-success h-4 w-4" />
              นำเข้าแล้ว {snapshot.programs.length} โปรแกรม · {snapshot.periods.length} พีเรียด
            </span>
            <span>นำเข้าเมื่อ {formatDateTime(snapshot.importedAt)}</span>
            {snapshot.sourceUpdatedAt && <span>ข้อมูลต้นทางอัปเดต {snapshot.sourceUpdatedAt}</span>}
            <span>ขอบเขต: {snapshot.scope}</span>
          </div>
          {/* ข้อมูลชุดนี้เป็นข้อมูลกลางของทั้งระบบ ไม่ได้ใช้แค่ในหน้านี้ — บอกให้ผู้ใช้รู้ว่ากระทบที่ไหนบ้าง */}
          <p className="zego-divider-top zego-text-tertiary mt-1.5 pt-1.5 text-xs">
            ข้อมูลชุดนี้ถูกใช้เป็นข้อมูลกลางของทุกเมนูที่เกี่ยวข้องแล้ว — การจัดสเก็ต · ปฏิทินงาน · Master รายการทัวร์ · รายงาน
          </p>
        </Card>
      )}

      {snapshot && snapshot.skipped.length > 0 && (
        <Callout tone="amber" title={`ข้ามไป ${snapshot.skipped.length} รายการเพราะไม่มีรหัสโปรแกรม`}>
          <ul className="mt-1 space-y-0.5 text-xs">
            {snapshot.skipped.slice(0, 5).map((s) => <li key={s}>{s}</li>)}
            {snapshot.skipped.length > 5 && <li>… และอีก {snapshot.skipped.length - 5} รายการ</li>}
          </ul>
        </Callout>
      )}

      {warnedPeriods.length > 0 && (
        <Callout tone="amber" title={`${warnedPeriods.length} พีเรียดมีข้อมูลไม่ครบหรือไม่สอดคล้อง`}>
          <ul className="mt-1 space-y-0.5 text-xs">
            {warnedPeriods.slice(0, 5).map((p) => (
              <li key={p.id}><span className="font-mono font-semibold">{p.groupCode || p.programCode}</span> — {p.importWarnings.join(' · ')}</li>
            ))}
            {warnedPeriods.length > 5 && <li>… และอีก {warnedPeriods.length - 5} พีเรียด</li>}
          </ul>
        </Callout>
      )}

      {!snapshot ? (
        <Card>
          <EmptyState
            icon="download"
            title="ยังไม่ได้ดึงข้อมูลจาก Zego"
            description={config.token
              ? 'กด “ดึงข้อมูลล่าสุด” เพื่อนำโปรแกรมทัวร์และพีเรียดเข้ามาเก็บไว้ในระบบ'
              : 'ตั้งค่า Token ที่หัวข้อ “ตั้งค่าการเชื่อมต่อ” ก่อน แล้วจึงกด “ดึงข้อมูลล่าสุด”'}
          />
        </Card>
      ) : (
        <>
          <Card padded={false}>
            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
              <div className="min-w-[12rem] flex-1">
                <SearchBox value={search} onChange={setSearch} label="ค้นหาโปรแกรมทัวร์" placeholder="ค้นหารหัสโปรแกรม ชื่อโปรแกรม หรือรหัสกรุ๊ป" />
              </div>
              <div className="w-[11rem] shrink-0">
                <MultiSelectControl
                  ariaLabel="ประเทศ"
                  value={countries}
                  onChange={setCountries}
                  options={countryOptions}
                  allLabel="ทุกประเทศ"
                  summaryFormat={(n) => (n === 1 ? countries[0] : `${n} ประเทศ`)}
                />
              </div>
              <span className="zego-text-tertiary ms-auto shrink-0 text-sm">แสดง {shown.length} จาก {programs.length} โปรแกรม</span>
            </div>
          </Card>

          {shown.length === 0 ? (
            <Card><EmptyState icon="search" title="ไม่พบโปรแกรมตามเงื่อนไข" description="ลองแก้คำค้นหรือเปลี่ยนประเทศที่เลือก" /></Card>
          ) : (
            <div className="space-y-2">
              {shown.map((p) => {
                const list = periodsByProgram.get(p.programCode) ?? [];
                const open = expanded.has(p.programCode);
                return (
                  <Card key={p.id} padded={false}>
                    <button
                      type="button"
                      onClick={() => toggle(p.programCode)}
                      aria-expanded={open}
                      className="zego-hover-surface flex w-full items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <Icon name="chevronDown" className={cx('zego-text-tertiary h-4 w-4 shrink-0 transition-transform', !open && '-rotate-90')} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-2">
                          <span className="zego-text font-mono text-sm font-semibold">{p.programCode}</span>
                          <span className="zego-text-secondary truncate text-sm">{p.programName ?? '(ไม่มีชื่อโปรแกรม)'}</span>
                        </span>
                        <span className="zego-text-tertiary mt-0.5 flex flex-wrap gap-x-3 text-xs">
                          {p.country && <span>{p.country}</span>}
                          {p.durationDays !== null && <span>{p.durationDays} วัน{p.durationNights !== null ? ` ${p.durationNights} คืน` : ''}</span>}
                          <span>{list.length} พีเรียด</span>
                          {(p.flights?.length ?? 0) > 0 && <span>{p.flights!.length} เที่ยวบิน</span>}
                        </span>
                      </span>
                    </button>

                    {open && (
                      list.length === 0 ? (
                        <p className="zego-divider-top zego-text-tertiary px-4 py-3 text-center text-xs">โปรแกรมนี้ยังไม่มีพีเรียดในข้อมูลที่ดึงมา</p>
                      ) : (
                        <div className="zego-divider-top">
                          {/*
                            เที่ยวบินเป็นข้อมูลระดับโปรแกรม (ทุกพีเรียดใช้ชุดเดียวกัน)
                            จึงแสดงไว้เหนือตารางพีเรียด ไม่ใช่ซ้ำในทุกแถว
                            ส่วนสายการบินรายพีเรียดอยู่ในคอลัมน์ของตารางด้านล่าง เพราะต่างกันได้รายกรุ๊ป
                          */}
                          {(p.flights?.length ?? 0) > 0 && (
                            <div className="zego-divider-bottom zego-surface-soft-bg px-3 py-2">
                              <p className="zego-text-secondary mb-1 text-xs font-semibold">เที่ยวบิน</p>
                              <ul className="flex flex-wrap gap-x-4 gap-y-1">
                                {p.flights!.map((f, i) => (
                                  <li key={`${f.flightNo}-${f.route}-${i}`} className="zego-text-secondary flex items-center gap-1.5 text-xs">
                                    <Icon name="plane" className="zego-text-tertiary h-3.5 w-3.5 shrink-0" />
                                    <span className="zego-text font-mono font-semibold">{f.flightNo || '—'}</span>
                                    {f.route && <span>{f.route}</span>}
                                    {(f.departureTime || f.arrivalTime) && (
                                      <span className="zego-text-tertiary tabular-nums">
                                        {flightTime(f.departureTime) || '—'}–{flightTime(f.arrivalTime) || '—'}
                                      </span>
                                    )}
                                    {f.airlineName && <span className="zego-text-tertiary">{f.airlineName}</span>}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="overflow-x-auto">
                          <table className="zego-table w-full min-w-[52rem] text-sm">
                            <thead>
                              <tr>
                                <th className="px-3 py-1.5 text-left font-medium">รหัสกรุ๊ป</th>
                                <th className="px-3 py-1.5 text-left font-medium">วันเดินทาง</th>
                                <th className="px-3 py-1.5 text-left font-medium">สายการบิน</th>
                                <th className="px-3 py-1.5 text-left font-medium">สนามบิน</th>
                                <th className="px-3 py-1.5 text-left font-medium">สถานะขาย</th>
                                <th className="px-3 py-1.5 text-right font-medium">ที่นั่ง</th>
                                <th className="px-3 py-1.5 text-right font-medium">ราคา</th>
                                <th className="px-3 py-1.5 text-left font-medium">หมายเหตุ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {list.map((d) => (
                                <tr key={d.id}>
                                  <td className="px-3 py-1.5 font-mono font-medium">
                                    <span className="zego-text">{d.groupCode || '—'}</span>
                                    {d.bus && <span className="zego-text-tertiary ml-1 text-xs">({d.bus})</span>}
                                  </td>
                                  <td className="px-3 py-1.5">{d.startDate && d.endDate ? formatDateRange(d.startDate, d.endDate) : '—'}</td>
                                  <td className="px-3 py-1.5 text-xs" title={d.airlineName}>
                                    {d.airlineCode || d.airlineName
                                      ? (
                                        <>
                                          {d.airlineCode && <span className="zego-text-secondary font-medium">{d.airlineCode}</span>}
                                          {d.airlineName && <span className={d.airlineCode ? 'zego-text-tertiary ml-1' : 'zego-text-secondary'}>{d.airlineName}</span>}
                                        </>
                                      )
                                      : '—'}
                                  </td>
                                  <td className="zego-text-secondary px-3 py-1.5 text-xs">{d.airport || '—'}</td>
                                  <td className="px-3 py-1.5">
                                    <Pill tone={saleTone(d.saleStatus)}>{d.saleStatus}</Pill>
                                    {d.confirmStatus === 'CONFIRMED' && <span className="zego-text-success ml-1.5 text-xs">คอนเฟิร์ม</span>}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">
                                    {d.bookedSeats ?? '—'}/{d.totalSeats ?? '—'}
                                    {d.isOverbooked && <span className="zego-text-danger ml-1 text-xs font-medium">เกิน {d.overbookedSeats}</span>}
                                  </td>
                                  <td className="px-3 py-1.5 text-right tabular-nums">{d.salePrice !== null ? d.salePrice.toLocaleString('th-TH') : '—'}</td>
                                  <td className="px-3 py-1.5 text-xs">
                                    {d.periodTags.map((t) => <StatusBadge key={t} meta={{ label: t, tone: 'blue' }} size="sm" dot={false} />)}
                                    {d.remark}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                          </div>
                        </div>
                      )
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
