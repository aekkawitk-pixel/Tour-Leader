'use client';

/** Timeline ประวัติสถานะ — ใช้ร่วมกันทั้งงานทัวร์ ใบเบิก เคลียร์เงินกรุ๊ป และนัดหมาย */

import { formatDateTime } from '@/lib/format';
import type { StatusMeta } from '@/lib/labels';
import { TONE_ZEGO_COLOR } from '@/lib/tone-tokens';
import type { StatusEvent } from '@/types';
import { EmptyState } from './Primitives';

export function Timeline({
  events,
  resolve,
}: {
  events: StatusEvent[];
  /** แปลงรหัสสถานะเป็นข้อความและสี */
  resolve: (statusKey: string) => StatusMeta;
}) {
  if (events.length === 0) {
    return <EmptyState title="ยังไม่มีประวัติสถานะ" description="เมื่อมีการเปลี่ยนสถานะ ระบบจะบันทึกไว้ที่นี่" />;
  }

  const ordered = [...events].reverse();

  return (
    <ol>
      {ordered.map((event) => {
        const meta = resolve(event.to);
        const fromMeta = event.from ? resolve(event.from) : null;
        return (
          <li key={event.id} className="zego-timeline__item">
            <span
              className="zego-timeline__dot"
              style={{ background: TONE_ZEGO_COLOR[meta.tone] }}
              aria-hidden="true"
            />
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <strong>
                {fromMeta && fromMeta.label !== meta.label ? (
                  <>
                    <span className="zego-text-tertiary font-normal">{fromMeta.label}</span>
                    <span className="zego-text-tertiary mx-1">→</span>
                    {meta.label}
                  </>
                ) : (
                  meta.label
                )}
              </strong>
              <span>{formatDateTime(event.at)}</span>
            </div>
            <span>โดย {event.by}</span>
            {event.note && (
              <p className="zego-surface-soft-bg zego-text-secondary mt-1 rounded-md px-2.5 py-1.5 text-xs">
                {event.note}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
