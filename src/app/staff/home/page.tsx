'use client';

/**
 * หน้าหลัก — /staff/home (พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป)
 *
 *   หัวหน้า: เลือกเดือนที่ดู (มีผลกับการ์ดจำนวนงานเดือน)
 *   1) จำนวนงานของเดือน + แถบสัดส่วน สุวรรณภูมิ (ฟ้า) / ดอนเมือง (ส้ม) + จำนวน·% — แตะการ์ด = ทั้งหน้าดูทั้งเดือน
 *      (แถบสัปดาห์ → ปฏิทินทั้งเดือน · ช่วงเช้า/เย็น · แยกสนามบิน · รายการงาน นับทั้งเดือน · แตะวันในปฏิทิน = กลับดูรายวัน)
 *   แถบเลือกวันที่รายสัปดาห์ อา.–ส. กด ‹ › เลื่อนทีละสัปดาห์ (ค่าเริ่มต้น = วันนี้) — การ์ดงานรายวันและรายการงานเปลี่ยนตามวันที่เลือก
 *   2) งานวันนี้ / งานวันที่เลือก — รวมทั้งหมด · ช่วงเช้า 00:01–12:00 / ช่วงเย็น 12:01–00:00 (ตามเวลาต้องถึงสนามบิน · แตะเพื่อกรองรายการ)
 *      · แยกตามสนามบิน (วันนี้)
 *   3) รายการงาน (วันที่เลือก / ทั้งเดือน) — กรองทั้งหมด / ตามสนามบิน · (วันที่) เวลานัด · สนามบิน · รหัสกรุ๊ป · สถานะตามเวลา
 * ตัวเลขคำนวณที่ staffHomeSummary / dutyStage (lib/logic/staffPortal.ts)
 */

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, StatusBadge, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDate } from '@/lib/format';
import { DUTY_STAGE, dutyShift, dutyStage, staffHomeSummary } from '@/lib/logic/staffPortal';
import { useStaffPortal } from '../useStaffPortal';
import { MonthPicker } from '@/components/ui/MonthPicker';
import { MonthJobsCard, airportText, airportTone, thaiMonthTitle, GREEN, BROWN } from '@/components/portal/MonthJobsCard';
import { staffEnvelopeNotice } from '../envelopeNotice';
import { useDemo } from '@/store/DemoStore';
import { periodCodeOf } from '@/services/tourPeriodMaster';

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];
const dayTitle = (iso: string) => {
  const d = new Date(`${iso}T00:00:00`);
  return `วัน${TH_DAYS[d.getDay()]}ที่ ${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
};
const toneOf = airportTone;

export default function StaffHomePage() {
  const router = useRouter();
  const { duties, today, staffId } = useStaffPortal();
  const { envelopes, expenses, currentUser } = useDemo();
  const [month, setMonth] = useState(today.slice(0, 7));
  // วันที่เลือกดูในเดือน — ค่าเริ่มต้นวันนี้ · เปลี่ยนเดือน = วันนี้ (ถ้าเป็นเดือนนี้) ไม่งั้นวันแรกที่มีงาน / วันที่ 1
  const [day, setDay] = useState(today);
  const changeMonth = (m: string) => {
    setMonth(m);
    setDay(m === today.slice(0, 7) ? today : duties.map((d) => d.dutyDate).filter((d) => d.startsWith(m)).sort()[0] ?? `${m}-01`);
  };
  const s = staffHomeSummary(duties, today, month, day);
  const isToday = day === today;
  // จำนวนงานต่อวัน — ตัวเลขบนแถบวันที่
  const dayCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of duties) m.set(d.dutyDate, (m.get(d.dutyDate) ?? 0) + 1);
    return m;
  }, [duties]);
  /** เลือกวัน — สัปดาห์คร่อมเดือนได้ เลือกวันของเดือนอื่น = เปลี่ยนเดือนที่ดูตามไปด้วย */
  const pickDay = (iso: string) => {
    setDay(iso);
    if (iso.slice(0, 7) !== month) setMonth(iso.slice(0, 7));
  };
  /** คำเรียกวันที่เลือก — "วันนี้" / "วันที่ 20/10/26" */
  const dayWord = isToday ? 'วันนี้' : `วันที่ ${formatDate(day)}`;
  // เดือนที่เลือกได้ = เดือนนี้ + เดือนที่มีงาน
  // จำนวนงานต่อเดือน (ตามวันที่ต้องไปสนามบิน) — ตัวเลขในตารางเลือกเดือน
  const monthCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of duties) m[d.dutyDate.slice(0, 7)] = (m[d.dutyDate.slice(0, 7)] ?? 0) + 1;
    return m;
  }, [duties]);
  const now = new Date().toTimeString().slice(0, 5);
  // ตัวกรองรายการวันนี้ — สนามบิน / ช่วงเวลา (แตะการ์ดช่วงเช้า/เย็น)
  const [airportFilter, setAirportFilter] = useState<string>('all');
  const [shiftFilter, setShiftFilter] = useState<'morning' | 'evening' | null>(null);
  /** ทั้งหน้า: ดูรายวัน (วันที่เลือก) / ทั้งเดือน — สลับที่การ์ดจำนวนงานของเดือน */
  const [scope, setScope] = useState<'day' | 'month'>('day');
  const monthDuties = useMemo(
    () => duties.filter((d) => d.dutyDate.startsWith(month))
      .sort((a, b) => a.dutyDate.localeCompare(b.dutyDate) || (a.arrivalTime ?? '99').localeCompare(b.arrivalTime ?? '99')),
    [duties, month],
  );
  // ตัวเลขชุดเดียวกับรายวัน แต่นับทั้งเดือน
  const view = scope === 'month'
    ? {
      duties: monthDuties,
      morning: monthDuties.filter((d) => dutyShift(d.arrivalTime) === 'morning').length,
      evening: monthDuties.filter((d) => dutyShift(d.arrivalTime) === 'evening').length,
      noTime: monthDuties.filter((d) => !d.arrivalTime).length,
      airports: s.monthByAirport,
    }
    : s.today;
  const base = view.duties;
  // จำนวนต่อสนามบินของรายการที่ดูอยู่ — ใช้กับปุ่มกรอง
  const airportCount = (code: string) => base.filter((d) => (d.airport ?? '').toUpperCase() === code).length;
  const otherAirports = [...new Set(base.map((d) => (d.airport ?? '').toUpperCase()).filter((c) => c !== 'BKK' && c !== 'DMK'))];
  const list = base.filter((d) => (airportFilter === 'all' || (d.airport ?? '').toUpperCase() === airportFilter)
    && (!shiftFilter || dutyShift(d.arrivalTime) === shiftFilter));
  const listWord = scope === 'month' ? `เดือน${thaiMonthTitle(month)}` : dayWord;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-bold zego-text">หน้าหลัก</h1>
          <p className="text-xs zego-text-tertiary">สรุปงานส่งกรุ๊ป · วันนี้ {formatDate(today)}</p>
        </div>
        {/* เลือกเดือนจากตารางปฏิทินรายเดือน (ปี ‹ › + 12 เดือน · ตัวเลข = จำนวนงานของเดือน) */}
        <MonthPicker compact value={`${month}-01`} onChange={(iso) => changeMonth(iso.slice(0, 7))} counts={monthCounts} currentMonth={today.slice(0, 7)} />
      </div>

      {/* 1) จำนวนงานของเดือน + สัดส่วนสนามบิน — การ์ดกลาง ใช้ร่วมกับหน้าหลักหัวหน้าทัวร์ */}
      <MonthJobsCard
        month={month}
        isCurrent={month === today.slice(0, 7)}
        count={s.monthCount}
        byAirport={s.monthByAirport}
        pending={s.monthPending}
        active={scope === 'month'}
        onClick={() => setScope((v) => (v === 'month' ? 'day' : 'month'))}
      />

      {/* 2) งานรายวัน / ทั้งเดือน — แถบสัปดาห์ (หรือปฏิทินทั้งเดือน) + ช่วงเช้า/เย็น + แยกสนามบิน */}
      <Card className="space-y-3">
        {/* หัวข้อบรรทัดเดียวเหนือแถบวันที่ — บอกวันที่กำลังดู (แม้วันที่เลือกเลื่อนพ้นแถบ) + จำนวนงาน · ไม่ซ้ำตัวเลขใหญ่ */}
        <p className="text-sm zego-text">
          <span className="font-semibold">{scope === 'month' ? `งานทั้งเดือน${thaiMonthTitle(month)}` : `${isToday ? 'งานวันนี้ · ' : 'งาน'}${dayTitle(day)}`}</span>
          <span className="zego-text-tertiary"> · </span>
          <span className="font-semibold text-emerald-700">{view.duties.length} งาน</span>
        </p>
        {scope === 'month'
          // ทั้งเดือน — ปฏิทินทั้งเดือนแทนแถบสัปดาห์ · แตะวัน = กลับดูรายวันของวันนั้น
          ? <MonthGrid month={month} today={today} counts={dayCounts} onPick={(iso) => { pickDay(iso); setScope('day'); }} />
          : <WeekStrip day={day} today={today} counts={dayCounts} onPick={pickDay} />}
        <div className="grid grid-cols-2 gap-2">
          {([
            ['morning', 'ช่วงเช้า', '00:01 – 12:00', 'sun', GREEN.tile, GREEN.text, view.morning],
            ['evening', 'ช่วงเย็น', '12:01 – 00:00', 'moon', BROWN.tile, BROWN.text, view.evening],
          ] as const).map(([k, label, range, icon, bg, text, n]) => (
            <button
              key={k}
              type="button"
              aria-pressed={shiftFilter === k}
              // แตะ = กรองรายการงานด้านล่างตามช่วงนี้ · แตะซ้ำ = ยกเลิก (กรอบเขียวบอกว่ากรองอยู่ ไม่มีป้ายแยก)
              title={shiftFilter === k ? 'แตะอีกครั้งเพื่อแสดงทุกช่วง' : `แสดงเฉพาะ${label}`}
              onClick={() => setShiftFilter((f) => (f === k ? null : k))}
              className={cx('flex items-center gap-2 rounded-lg px-3 py-2 text-left transition', bg, shiftFilter === k && 'ring-2 ring-emerald-500')}
            >
              <Icon name={icon} className={cx('h-6 w-6 shrink-0', text)} />
              <span className="min-w-0 flex-1">
                <span className={cx('block text-sm font-semibold', text)}>{label}</span>
                <span className="block text-[11px] zego-text-tertiary">{range}</span>
                <span className={cx('block text-lg font-bold tabular-nums', text)}>{n} <span className="text-xs font-medium">งาน</span></span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 zego-text-tertiary" />
            </button>
          ))}
        </div>
        {view.noTime > 0 && <p className="text-[11px] zego-text-warning">ยังไม่ทราบเวลา {view.noTime} งาน — ไม่นับในช่วงเช้า/เย็น</p>}
        <div>
          <p className="mb-1.5 text-xs font-semibold zego-text">แยกตามสนามบิน ({scope === 'month' ? 'ทั้งเดือน' : dayWord})</p>
          <div className="grid grid-cols-2 gap-2">
            {(['BKK', 'DMK'] as const).map((code) => view.airports.find((a) => a.code === code) ?? { code, count: 0 })
              .concat(view.airports.filter((a) => a.code !== 'BKK' && a.code !== 'DMK' && a.count > 0))
              .map((a) => {
                const t = toneOf(a.code);
                return (
                  <div key={a.code || 'none'} className={cx('flex items-center gap-2 rounded-lg px-3 py-2', t.tile)}>
                    <Icon name="plane" className={cx('h-5 w-5 shrink-0', t.text)} />
                    <div className="min-w-0">
                      <p className="text-xs leading-tight zego-text-secondary">{airportText(a.code)}{a.code && ` (${a.code})`}</p>
                      <p className={cx('text-lg font-bold tabular-nums', t.text)}>{a.count} <span className="text-xs font-medium">งาน</span></p>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      </Card>

      {/* 3) รายการงาน — วันที่เลือก / ทั้งเดือน ตามการ์ดเดือนด้านบน */}
      <Card className="space-y-3">
        <div className="flex items-center gap-2">
          <Icon name="list" className="h-5 w-5 text-emerald-700" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold zego-text">รายการงาน{scope === 'day' && isToday ? '' : ' '}{listWord}</h2>
        </div>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="กรองตามสนามบิน">
          {[
            { code: 'all', label: 'ทั้งหมด', count: base.length },
            // สุวรรณภูมิ / ดอนเมือง แสดงเสมอ (แม้ 0) · สนามบินอื่นแสดงเมื่อมีงาน
            ...(['BKK', 'DMK'] as const).map((code) => ({ code, label: airportText(code), count: airportCount(code) })),
            ...otherAirports.map((code) => ({ code, label: airportText(code), count: airportCount(code) })),
          ].map((f) => (
            <button
              key={f.code || 'none'}
              type="button"
              aria-pressed={airportFilter === f.code}
              onClick={() => setAirportFilter(f.code)}
              className={cx('rounded-full px-2.5 py-0.5 text-[11px] font-medium leading-5 transition', airportFilter === f.code ? 'bg-emerald-600 text-white' : 'zego-surface-soft-bg zego-text-secondary hover:bg-emerald-50')}
            >
              {f.label} ({f.count})
            </button>
          ))}
        </div>

        {list.length === 0 ? (
          <p className="rounded-lg zego-surface-soft-bg px-3 py-4 text-center text-sm zego-text-tertiary">
            {base.length === 0 ? `${listWord}${scope === 'day' && isToday ? '' : ' '}ไม่มีงานส่งกรุ๊ป` : 'ไม่มีงานที่ตรงกับตัวกรอง'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-[11px] zego-text-tertiary">
                  <th className="whitespace-nowrap py-1.5 pr-2 font-medium">{scope === 'month' ? 'วันที่ · เวลานัด' : 'เวลานัด'}</th>
                  <th className="whitespace-nowrap py-1.5 pr-2 font-medium">สนามบิน</th>
                  <th className="py-1.5 pr-2 font-medium">รหัสกรุ๊ป</th>
                  <th className="py-1.5 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--zego-border-soft)]">
                {list.map((d) => {
                  const code = (d.airport ?? '').toUpperCase();
                  const stage = DUTY_STAGE[dutyStage(d, now, today)];
                  return (
                    <tr key={d.assignmentId} className="cursor-pointer align-top hover:bg-emerald-50/40" onClick={() => router.push('/staff')}>
                      <td className="py-2 pr-2 font-semibold tabular-nums zego-text">
                        {/* ทั้งเดือน — วันที่อยู่บนเวลานัด */}
                        {scope === 'month' && <span className="block whitespace-nowrap text-[11px] font-medium zego-text-secondary">{formatDate(d.dutyDate).slice(0, 5)}</span>}
                        {d.arrivalTime ?? '—'}
                      </td>
                      <td className="py-2 pr-2">
                        <span className={cx('rounded px-1.5 py-0.5 text-[11px] font-semibold', toneOf(code).badge)}>{code || '—'}</span>
                      </td>
                      <td className="py-2 pr-2">
                        <span className="block font-medium zego-text">{d.period?.groupCode ?? periodCodeOf(d.periodId)}</span>
                        {/* ซองเงินของกรุ๊ปนี้ — ข้อความเดียวกับหน้าตารางงาน · ต้องทำอะไรต่อ = สีเหลือง */}
                        {(() => {
                          const n = staffEnvelopeNotice({ envelopes, expenses, staffId, staffName: currentUser.name, periodId: d.periodId });
                          return n && (
                            <span className={cx('mt-0.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium', n.tone === 'amber' ? 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200' : 'zego-surface-soft-bg zego-text-secondary')}>
                              <Icon name="money" className="h-3 w-3 shrink-0" />
                              {n.text}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="py-2"><StatusBadge meta={stage} size="sm" /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-1.5 text-[11px] zego-text-tertiary">เวลานัด = เวลาที่ต้องถึงสนามบิน · แตะรายการเพื่อดูตารางงาน</p>
          </div>
        )}
      </Card>
    </div>
  );
}

const TH_DAYS_SHORT = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

/** เลื่อนวันที่ ISO ไป n วัน */
const shiftDay = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * แถบเลือกวันที่รายสัปดาห์ — 7 วัน อา.–ส. ของสัปดาห์ที่มีวันที่เลือก
 * ‹ › เลื่อนทีละสัปดาห์ (วันที่เลือกเลื่อนไป 7 วัน) · วันที่เลือกพื้นเขียว · วันนี้มีกรอบ · มีงาน = ตัวเลขจำนวนงานใต้วัน
 * วันนอกเดือนที่ดูอยู่แสดงจางลง (แตะได้ — เปลี่ยนเดือนตาม)
 */
function WeekStrip({ day, today, counts, onPick }: {
  day: string;
  today: string;
  counts: Map<string, number>;
  onPick: (iso: string) => void;
}) {
  const sunday = shiftDay(day, -new Date(`${day}T00:00:00`).getDay());
  const days = Array.from({ length: 7 }, (_, i) => shiftDay(sunday, i));
  const month = day.slice(0, 7);
  const arrow = 'flex h-8 w-7 shrink-0 items-center justify-center rounded-lg zego-text-secondary zego-hover-surface';
  return (
    <div className="flex items-center gap-1">
      <button type="button" aria-label="สัปดาห์ก่อน" className={arrow} onClick={() => onPick(shiftDay(day, -7))}>
        <Icon name="chevronLeft" className="h-4 w-4" />
      </button>
      <div className="grid min-w-0 flex-1 grid-cols-7 gap-1" role="group" aria-label="เลือกวันที่">
        {days.map((iso, i) => {
          const on = iso === day;
          const n = counts.get(iso) ?? 0;
          return (
            <button
              key={iso}
              type="button"
              aria-pressed={on}
              aria-label={`${formatDate(iso)}${n ? ` · ${n} งาน` : ''}`}
              onClick={() => onPick(iso)}
              className={cx(
                'flex flex-col items-center rounded-lg py-1.5 text-center transition',
                on ? 'bg-emerald-600 text-white' : 'zego-surface-soft-bg zego-text hover:bg-emerald-50',
                iso === today && !on && 'ring-1 ring-inset ring-emerald-500',
                !on && iso.slice(0, 7) !== month && 'opacity-50',
              )}
            >
              <span className={cx('text-[10px]', on ? 'text-white/80' : i === 0 || i === 6 ? 'text-rose-500' : 'zego-text-tertiary')}>{TH_DAYS_SHORT[i]}</span>
              <span className="text-sm font-semibold tabular-nums">{Number(iso.slice(8, 10))}</span>
              <span className={cx('mt-0.5 h-3.5 min-w-3.5 rounded-full px-1 text-[9px] font-bold leading-[14px]', n ? (on ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white') : 'invisible')}>{n || 0}</span>
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="สัปดาห์ถัดไป" className={arrow} onClick={() => onPick(shiftDay(day, 7))}>
        <Icon name="chevronRight" className="h-4 w-4" />
      </button>
    </div>
  );
}

/**
 * ปฏิทินทั้งเดือน (โหมดดูทั้งเดือน) — 7 คอลัมน์ อา.–ส. · ตัวเลขจำนวนงานใต้วันที่ที่มีงาน · วันนี้มีกรอบ
 * แตะวัน = กลับไปดูรายวันของวันนั้น
 */
function MonthGrid({ month, today, counts, onPick }: {
  month: string;
  today: string;
  counts: Map<string, number>;
  onPick: (iso: string) => void;
}) {
  const first = `${month}-01`;
  const lead = new Date(`${first}T00:00:00`).getDay();
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => shiftDay(first, i))] as (string | null)[];
  return (
    <div className="grid grid-cols-7 gap-1" role="group" aria-label="เลือกวันที่ในเดือน">
      {TH_DAYS_SHORT.map((d, i) => (
        <span key={d} className={cx('text-center text-[10px]', i === 0 || i === 6 ? 'text-rose-500' : 'zego-text-tertiary')}>{d}</span>
      ))}
      {cells.map((iso, i) => {
        if (!iso) return <span key={`x${i}`} />;
        const n = counts.get(iso) ?? 0;
        return (
          <button
            key={iso}
            type="button"
            aria-label={`${formatDate(iso)}${n ? ` · ${n} งาน` : ''}`}
            onClick={() => onPick(iso)}
            className={cx(
              'flex flex-col items-center rounded-lg py-1 text-center transition',
              n ? 'bg-emerald-50 zego-text hover:bg-emerald-100' : 'zego-surface-soft-bg zego-text-tertiary hover:bg-emerald-50',
              iso === today && 'ring-1 ring-inset ring-emerald-500',
            )}
          >
            <span className="text-xs font-semibold tabular-nums">{Number(iso.slice(8, 10))}</span>
            <span className={cx('mt-0.5 h-3.5 min-w-3.5 rounded-full px-1 text-[9px] font-bold leading-[14px]', n ? 'bg-emerald-600 text-white' : 'invisible')}>{n || 0}</span>
          </button>
        );
      })}
    </div>
  );
}
