'use client';

/**
 * การ์ด "จำนวนงานเดือนปัจจุบัน" ของหน้าหลักพอร์ทัลมือถือ — ใช้ร่วมกัน เจ้าหน้าที่ส่งกรุ๊ป (/staff/home) และหัวหน้าทัวร์ (/guide)
 * ไอคอน + จำนวนงานตัวใหญ่ · แถบสัดส่วนตามสนามบิน · กล่องสนามบิน (สุวรรณภูมิ เขียว / ดอนเมือง น้ำตาล / อื่น ๆ เทา) พร้อม %
 * ตัวเลขแยกสนามบินมาจาก airportBreakdown (lib/logic/staffPortal.ts)
 */

import { Card, cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { airportName } from '@/lib/logic/airportLabel';
import type { AirportCount } from '@/lib/logic/staffPortal';

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
/** "2026-10" → "ตุลาคม 2569" */
export const thaiMonthTitle = (ym: string) => `${TH_MONTHS[Number(ym.slice(5, 7)) - 1]} ${Number(ym.slice(0, 4)) + 543}`;

/** ชื่อสนามบินสำหรับการ์ด — ไม่ทราบสนามบิน = "ยังไม่ระบุสนามบิน" */
export const airportText = (code: string) => (code ? (airportName(code) !== code ? airportName(code) : code) : 'ยังไม่ระบุสนามบิน');

/** สีประจำสนามบิน — โทนเขียว/น้ำตาลของระบบ: สุวรรณภูมิ เขียว · ดอนเมือง น้ำตาล · อื่น ๆ เทา */
export const GREEN = { tile: 'bg-emerald-50', text: 'text-emerald-700', bar: 'bg-emerald-600', badge: 'bg-emerald-100 text-emerald-800' };
export const BROWN = { tile: 'bg-[#f6efe6]', text: 'text-[#8a5a2b]', bar: 'bg-[#a8763e]', badge: 'bg-[#ecdcc6] text-[#6f4520]' };
const OTHER_TONE = { tile: 'zego-surface-soft-bg', text: 'zego-text-secondary', bar: 'bg-slate-400', badge: 'bg-slate-100 text-slate-700' };
const AIRPORT_TONE: Record<string, typeof GREEN> = { BKK: GREEN, DMK: BROWN };
export const airportTone = (code: string) => AIRPORT_TONE[code] ?? OTHER_TONE;

export function MonthJobsCard({ month, isCurrent, count, byAirport, pending = 0, onBack }: {
  /** เดือนที่แสดง (yyyy-mm) */
  month: string;
  /** เป็นเดือนปัจจุบันไหม — หัวข้อ "จำนวนงานเดือนปัจจุบัน" / "จำนวนงานของเดือน" */
  isCurrent: boolean;
  count: number;
  byAirport: AirportCount[];
  /** งานที่ยังรอคอนเฟิร์ม (มี = แสดงบรรทัดเตือน) */
  pending?: number;
  /** ไม่ใช่เดือนปัจจุบัน — ปุ่ม "กลับเดือนนี้" */
  onBack?: () => void;
}) {
  const total = count || 1;
  return (
    <Card className="space-y-3 border-emerald-200 bg-emerald-50/40">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <Icon name="calendar" className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold zego-text">{isCurrent ? 'จำนวนงานเดือนปัจจุบัน' : 'จำนวนงานของเดือน'}</p>
          <p className="text-xs zego-text-tertiary">
            {thaiMonthTitle(month)}
            {!isCurrent && onBack && (
              <button type="button" onClick={onBack} className="ml-2 font-medium zego-text-success hover:underline">กลับเดือนนี้</button>
            )}
          </p>
        </div>
        <p className="text-3xl font-bold tabular-nums text-emerald-700">{count} <span className="text-sm font-medium">งาน</span></p>
      </div>
      {pending > 0 && <p className="text-[11px] zego-text-warning">รอคอนเฟิร์ม {pending} งาน</p>}
      {/* แถบสัดส่วนตามสนามบิน */}
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-200" aria-hidden>
        {byAirport.filter((a) => a.count > 0).map((a) => (
          <span key={a.code || 'none'} className={airportTone(a.code).bar} style={{ width: `${(a.count / total) * 100}%` }} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {byAirport.map((a) => {
          const t = airportTone(a.code);
          return (
            <div key={a.code || 'none'} className={cx('flex items-start gap-2 rounded-lg px-3 py-2', t.tile)}>
              <Icon name="plane" className={cx('mt-0.5 h-5 w-5 shrink-0', t.text)} />
              <div className="min-w-0 flex-1">
                {/* ชื่อสนามบินแสดงเต็ม (ขึ้นบรรทัดใหม่ได้) · % อยู่แถวเดียวกับจำนวน จะได้ไม่บีบชื่อ */}
                <p className="text-xs leading-tight zego-text-secondary">{airportText(a.code)}{a.code && ` (${a.code})`}</p>
                <p className="mt-0.5 flex items-center justify-between gap-1">
                  <span className={cx('text-lg font-bold tabular-nums', t.text)}>{a.count} <span className="text-xs font-medium">งาน</span></span>
                  {count > 0 && <span className={cx('rounded-md px-1.5 py-0.5 text-[11px] font-semibold tabular-nums', t.badge)}>{Math.round((a.count / count) * 100)}%</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
