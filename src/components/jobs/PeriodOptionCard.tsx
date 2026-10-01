'use client';

/**
 * การ์ดกรุ๊ป 1 ใบในหน้าต่างจัดงาน — ใช้ทั้งการจัดหัวหน้าทัวร์และการจัดเจ้าหน้าที่ส่งกรุ๊ป
 *
 * ข้อมูลที่ต้องเห็นก่อนตัดสินใจเหมือนกันทั้งสองงาน (รหัสกรุ๊ป ชื่อโปรแกรม สนามบิน
 * สายการบิน ช่วงวันเดินทาง สถานะขาย เที่ยวบิน) จึงวาดจากที่เดียว
 * ถ้าแยกกันวาด อีกหน้าต่างจะขาดข้อมูลไปเงียบ ๆ เวลามีการเพิ่มฟิลด์
 *
 * ส่วนที่ต่างกันของแต่ละงานส่งเข้ามาเป็น badge และ notes ไม่ฝังไว้ในการ์ด
 */

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { formatDateRange } from '@/lib/format';
import { flightSummary, periodScheduleDisplay, sectorSummary, splitFlightLegs } from '@/lib/logic/guideBoard';
import { airportLabel } from '@/lib/logic/airportLabel';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';

/** จำนวนวันเดินทางของพีเรียด (นับรวมวันแรกและวันสุดท้าย) */
export function tripDays(p: TourPeriodMaster): number {
  const ms = Date.parse(`${p.endDate}T00:00:00Z`) - Date.parse(`${p.startDate}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) + 1 : 0;
}

export type OptionTone = 'ok' | 'warn' | 'blocked' | 'overlap';

const BADGE: Record<OptionTone, string> = {
  ok: 'zego-badge--success',
  warn: 'zego-badge--warning',
  blocked: 'zego-badge--danger',
  /** จัดได้แต่เวลานัดทับซ้อนกับงานอื่นของคนเดียวกัน (สนามบินเดียวกัน) — คนละความหมายกับ warn (ข้อมูลไม่ครบ) */
  overlap: 'zego-badge--orange',
};

/** บรรทัดเที่ยวบินบนการ์ดงาน — 1 บรรทัดเมื่อสั้น · แยกขาไป/ขากลับเมื่อเกิน 2 ช่วง */
export function FlightLines({ period }: { period: TourPeriodMaster }) {
  if (period.sectors.length === 0) return null;

  const { outbound, inbound } = splitFlightLegs(period.sectors);
  const full = flightSummary(period);
  const line = (label: string, list: typeof period.sectors) => (
    <p className="flex items-center gap-1.5 text-[11px] zego-text-tertiary" title={full}>
      <Icon name="plane" className="h-3 w-3 shrink-0 zego-text-tertiary" />
      {/* ชิดขวา — ไป/กลับ ยาวไม่เท่ากัน ถ้าชิดซ้ายช่องว่างก่อนเลขเที่ยวบินจะไม่เท่ากันทั้งสองบรรทัด */}
      <span className="w-8 shrink-0 text-right zego-text-tertiary">{label}</span>
      <span className="truncate">{list.map(sectorSummary).filter(Boolean).join(' · ')}</span>
    </p>
  );

  // แยกได้และมีมากกว่า 2 ช่วงเท่านั้นจึงคุ้มที่จะใช้สองบรรทัด — ไป-กลับอย่างละช่วงเดียวอ่านรวดเดียวได้อยู่แล้ว
  if (inbound.length > 0 && period.sectors.length > 2) {
    return (
      <span className="mt-0.5 block space-y-0.5">
        {line('ไป', outbound)}
        {line('กลับ', inbound)}
      </span>
    );
  }

  return (
    <p className="mt-0.5 flex items-center gap-1 text-[11px] zego-text-tertiary" title={full}>
      <Icon name="plane" className="h-3 w-3 shrink-0 zego-text-tertiary" />
      <span className="truncate">{full}</span>
    </p>
  );
}

export function PeriodOptionCard({
  period, picked, disabled, warned, badge, tailLine, notes, onToggle,
}: {
  period: TourPeriodMaster;
  picked: boolean;
  disabled: boolean;
  /** ขอบแดง — เลือกไว้แล้วแต่ชนกับกรุ๊ปอื่นในชุดเดียวกัน */
  warned?: boolean;
  badge: { label: string; tone: OptionTone };
  /**
   * ท้ายบรรทัดสรุป — ต่อจาก "เดินทาง … · N วัน · ขาย …"
   * แต่ละงานเติมสิ่งที่ตัวเองสนใจ (ยังไม่ระบุหัวหน้าทัวร์ / เวลาที่ต้องถึงสนามบิน)
   */
  tailLine?: ReactNode;
  /** คำเตือนหรือเหตุผลที่เลือกไม่ได้ — วางใต้เที่ยวบิน */
  notes?: ReactNode;
  onToggle: () => void;
}) {
  const d = periodScheduleDisplay(period);
  return (
    <button
      type="button"
      data-testid="assign-option"
      role="checkbox"
      aria-checked={picked}
      disabled={disabled}
      onClick={onToggle}
      className={cx(
        'w-full rounded-xl border p-3 text-left transition',
        disabled
          ? 'cursor-not-allowed zego-border-color opacity-60'
          : warned
            ? 'zego-warned-border zego-warned-tint'
            : picked
              ? 'zego-selected-border zego-selected-tint'
              : 'zego-border-color zego-hover-selected',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2">
          <span aria-hidden="true" className={cx(
            'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
            picked ? 'zego-selected-fill' : 'zego-border-color zego-surface-bg',
          )}>
            {picked && <Icon name="check" className="h-3 w-3" />}
          </span>
          <span className="truncate font-mono text-sm font-bold zego-text">
            {period.groupCode}{period.bus && period.bus !== '-' ? ` (${period.bus})` : ''}
          </span>
        </span>
        <span className={cx('shrink-0 rounded-md border px-2 py-0.5 text-[11px] font-medium', BADGE[badge.tone])}>
          {badge.label}
        </span>
      </div>
      <p className="mt-0.5 line-clamp-1 text-xs zego-text-secondary">{period.displayName}</p>
      {/* ข้อมูลที่ต้องเห็นก่อนตัดสินใจ — อ่านจาก Master ทั้งหมด */}
      <p className="text-xs zego-text-tertiary">
        {period.programCode ? `${period.programCode} · ` : ''}{period.countryName} · {airportLabel(d.depAirport)} · {d.airlineCode}
      </p>
      <p className="text-xs zego-text-tertiary">
        เดินทาง {formatDateRange(period.startDate, period.endDate)} · {tripDays(period)} วัน · ขาย {period.saleStatus}
        {tailLine ? <> · {tailLine}</> : null}
      </p>
      {/*
        เที่ยวบิน — แสดงเฉพาะเมื่อแหล่งข้อมูลมีจริง ไม่ทิ้งบรรทัดว่างไว้
        เกิน 2 ช่วง (เช่นบินต่อเครื่อง เข้าเมืองหนึ่งออกอีกเมือง) แยกขาไป/ขากลับคนละบรรทัด
      */}
      <FlightLines period={period} />
      {notes}
    </button>
  );
}
