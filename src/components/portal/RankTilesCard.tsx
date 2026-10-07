'use client';

/**
 * การ์ดจัดอันดับแบบช่อง (หน้าหลักพอร์ทัล) — ใช้ร่วมกัน "ปลายทางเดือนนี้" และ "สายการบินเดือนนี้"
 * หัวการ์ด: ไอคอน + หัวข้อ + บรรทัดรอง · ช่อง: ภาพ (ธง/โลโก้) + ชื่อ + จำนวนงาน
 * รายการเรียงมาแล้ว (มาก→น้อย) · พอดี 4 ช่องต่อแถว · ไม่เกิน 4 = จัดกึ่งกลาง · มากกว่า 4 = เลื่อนแนวนอนดูต่อ · ช่องที่งานมากสุดเน้นสีเขียว
 */

import type { ReactNode } from 'react';
import { Card, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';

export interface RankTile {
  key: string;
  label: string;
  count: number;
  /** ภาพในวงกลม (ธง / รหัสสายการบิน) ขนาด h-9 w-9 */
  visual: ReactNode;
}

export function RankTilesCard({ icon, title, subtitle, items, moreText, emptyText = 'เดือนนี้ยังไม่มีงาน' }: {
  icon: IconName;
  title: string;
  subtitle: string;
  items: RankTile[];
  /** ข้อความใต้การ์ดเมื่อมีมากกว่า 4 ช่อง เช่น "เลื่อนดูปลายทางเพิ่ม ›" */
  moreText: string;
  emptyText?: string;
}) {
  // เน้นสีเขียวเฉพาะอันดับหนึ่งที่ชัดเจน — เท่ากันหลายช่อง (เช่น ทุกสาย 1 งาน) ไม่เน้น จะได้ไม่เขียวทั้งแถว
  const top = items[0]?.count ?? 0;
  const tied = items.filter((x) => x.count === top).length > 1;
  return (
    <Card className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
          <Icon name={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold zego-text">{title}</p>
          <p className="text-xs zego-text-tertiary">{subtitle}</p>
        </div>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg zego-surface-soft-bg px-3 py-3 text-center text-xs zego-text-tertiary">{emptyText}</p>
      ) : (
        // 4 ช่องเต็มความกว้าง — เกิน 4 เลื่อนแนวนอนดูต่อ (ช่องกว้างคงที่ = 1/4 ของแถว)
        // ไม่เกิน 4 ช่อง = จัดกึ่งกลาง · เกิน 4 = ชิดซ้าย (กึ่งกลางตอนเลื่อนได้จะตัดช่องแรกและเลื่อนกลับไปดูไม่ได้)
        <div className={cx('-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1', items.length <= 4 && 'justify-center')} role="list" aria-label={title}>
          {items.map((d) => {
            const lead = !tied && d.count === top && top > 0;
            return (
              <div
                key={d.key}
                role="listitem"
                className={cx(
                  'flex w-[calc((100%-1.5rem)/4)] shrink-0 snap-start flex-col items-center gap-1 rounded-xl border px-1 py-2 text-center',
                  lead ? 'border-emerald-300 bg-emerald-50' : 'zego-border-color zego-surface-bg',
                )}
              >
                {d.visual}
                <span className="line-clamp-1 w-full text-xs font-medium zego-text" title={d.label}>{d.label}</span>
                <span className={cx('text-sm font-bold tabular-nums', lead ? 'text-emerald-700' : 'zego-text-secondary')}>
                  {d.count} <span className="text-[11px] font-medium">งาน</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
      {items.length > 4 && <p className="text-right text-[10px] zego-text-tertiary">{moreText}</p>}
    </Card>
  );
}
