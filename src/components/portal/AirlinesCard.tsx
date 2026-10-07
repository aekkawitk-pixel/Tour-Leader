'use client';

/**
 * การ์ด "สายการบินเดือนนี้" (หน้าหลักหัวหน้าทัวร์) — แยกงานตามสายการบิน เรียงจากมากไปน้อย
 * หน้าตา/การเลื่อนดู ใช้ RankTilesCard ร่วมกับการ์ดปลายทาง · ตัวเลขมาจาก airlineBreakdown (lib/logic/airlines.ts)
 * โลโก้สายการบิน: ภาพจากบริการสาธารณะของ Kiwi.com ตามรหัส IATA (ระบบยังไม่มีไฟล์โลโก้ของตัวเอง)
 *   โหลดไม่ได้ (ออฟไลน์ / ไม่มีรูป) = แสดงรหัส IATA ในวงกลมแทน
 */

import { useState } from 'react';
import type { AirlineCount } from '@/lib/logic/airlines';
import { thaiMonthTitle } from './MonthJobsCard';
import { RankTilesCard } from './RankTilesCard';

const logoUrl = (code: string) => `https://images.kiwi.com/airlines/64/${encodeURIComponent(code)}.png`;

/** โลโก้สายการบินในวงกลม — โหลดไม่ได้ / ไม่ทราบรหัส = รหัสตัวอักษรแทน */
function AirlineLogo({ code }: { code: string }) {
  const [failed, setFailed] = useState(false);
  if (!code || failed) {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xs font-bold tracking-tight text-emerald-800 shadow-sm ring-1 ring-black/10" aria-hidden>
        {code || '?'}
      </span>
    );
  }
  return (
    <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-full bg-white shadow-sm ring-1 ring-black/10" aria-hidden>
      {/* รูปภายนอกขนาดเล็กคงที่ — ไม่ผ่าน next/image เพื่อไม่ต้องตั้งค่าโดเมนภาพเพิ่ม */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoUrl(code)} alt="" width={36} height={36} loading="lazy" className="h-full w-full object-contain p-0.5" onError={() => setFailed(true)} />
    </span>
  );
}

export function AirlinesCard({ month, isCurrent, items }: {
  month: string;
  isCurrent: boolean;
  items: AirlineCount[];
}) {
  return (
    <RankTilesCard
      icon="plane"
      title={isCurrent ? 'สายการบินเดือนนี้' : 'สายการบินของเดือน'}
      subtitle={`แยกตามสายการบิน · ${thaiMonthTitle(month)}`}
      moreText="เลื่อนดูสายการบินเพิ่ม ›"
      items={items.map((a) => ({
        key: a.code || 'none',
        label: a.label,
        count: a.count,
        visual: <AirlineLogo code={a.code} />,
      }))}
    />
  );
}
