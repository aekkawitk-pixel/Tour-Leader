'use client';

/**
 * การ์ด "ปลายทางเดือนนี้" (หน้าหลักหัวหน้าทัวร์) — แยกงานตามประเทศปลายทาง เรียงจากมากไปน้อย
 * หน้าตา/การเลื่อนดู ใช้ RankTilesCard ร่วมกับการ์ดสายการบิน · ตัวเลขมาจาก destinationBreakdown (lib/logic/destinations.ts)
 * ธงเป็นภาพ SVG จาก flag-icons (รวมอยู่ในแอป ไม่ดึงจากภายนอก) — Windows แสดงธงแบบ emoji ไม่ได้ (ขึ้นเป็นตัวอักษร JP)
 */

import 'flag-icons/css/flag-icons.min.css';

import type { DestinationCount } from '@/lib/logic/destinations';
import { thaiMonthTitle } from './MonthJobsCard';
import { RankTilesCard } from './RankTilesCard';

export function DestinationsCard({ month, isCurrent, items }: {
  month: string;
  isCurrent: boolean;
  items: DestinationCount[];
}) {
  return (
    <RankTilesCard
      icon="mapPin"
      title={isCurrent ? 'ปลายทางเดือนนี้' : 'ปลายทางของเดือน'}
      subtitle={`แยกตามประเทศปลายทาง · ${thaiMonthTitle(month)}`}
      moreText="เลื่อนดูปลายทางเพิ่ม ›"
      items={items.map((d) => ({
        key: d.key,
        label: d.label,
        count: d.count,
        visual: d.alpha2 ? (
          // กรอบวงกลมกำหนดขนาด · ธง (fis = จัตุรัส) เต็มกรอบด้วย style — CSS ของ flag-icons ตั้งความกว้างเป็น em ทับคลาสขนาดได้
          <span className="block h-9 w-9 shrink-0 overflow-hidden rounded-full shadow-sm ring-1 ring-black/10" aria-hidden>
            <span className={`fi fis fi-${d.alpha2}`} style={{ display: 'block', width: '100%', height: '100%', backgroundSize: 'cover', lineHeight: 0 }} />
          </span>
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-xl shadow-sm ring-1 ring-black/5" aria-hidden>{d.flag}</span>
        ),
      }))}
    />
  );
}
