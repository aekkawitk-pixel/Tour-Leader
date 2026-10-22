'use client';

/**
 * ชิ้นส่วนหน้าตาของพอร์ทัลหัวหน้าทัวร์ตามธีม v3 (ZEGO Guide · Brand Theme v3)
 * สไตล์ทั้งหมดอยู่ใน src/styles/zego-overrides.css หมวด "พอร์ทัลหัวหน้าทัวร์" — ที่นี่แค่ประกอบโครง
 * (ไม่ใช่ page.tsx จึงไม่ถูกนับเป็น route)
 */

import 'flag-icons/css/flag-icons.min.css';

import type { ReactNode } from 'react';
import { cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';

/**
 * แถบหัวโค้งสองชั้น (แบบ A) ของหน้ารวม — ต่อจากหัวสีเขียวของ GuideShell
 * overlap = เนื้อหาถัดไปห่อด้วย <GuideOverlap> แล้วซ้อนทับขอบล่างของแถบ
 */
export function GuideBand({ children, overlap = false }: { children: ReactNode; overlap?: boolean }) {
  return <div className={cx('zego-guide-band', overlap && 'zego-guide-band--overlap')}>{children}</div>;
}

/** เนื้อหาที่ซ้อนขอบล่างของ GuideBand (ต้องวางต่อจาก GuideBand ทันที) */
export function GuideOverlap({ children }: { children: ReactNode }) {
  return <div className="zego-guide-overlap space-y-3">{children}</div>;
}

/** ภาพธงตามรหัสประเทศ alpha-2 (flag-icons แบบจัตุรัส) — เต็มกรอบที่ครอบอยู่ */
function FlagImage({ alpha2 }: { alpha2: string }) {
  return (
    <span
      className={`fi fis fi-${alpha2.toLowerCase()}`}
      style={{ display: 'block', width: '100%', height: '100%', backgroundSize: 'cover', lineHeight: 0 }}
    />
  );
}

/** วงกลมประเทศ 62px — มีธงใช้ธง ไม่มีใช้รหัส/ตัวย่อบนพื้นมิ้นต์ · เลือกอยู่ = ขอบเขียว */
export function FlagCircle({ alpha2, fallback, selected = false, label }: {
  alpha2?: string;
  fallback: string;
  selected?: boolean;
  label: string;
}) {
  return alpha2 ? (
    <span role="img" aria-label={`ธง${label}`} className={cx('zego-guide-flag', selected && 'zego-guide-flag--sel')}>
      <FlagImage alpha2={alpha2} />
    </span>
  ) : (
    <span role="img" aria-label={label} className={cx('zego-guide-flag zego-guide-flag--none', selected && 'zego-guide-flag--sel')}>
      {fallback}
    </span>
  );
}

/** ธงทรงเหลี่ยมมน 40px หน้าแถวรายการงาน */
export function FlagTile({ alpha2, fallback, label }: { alpha2?: string; fallback: string; label: string }) {
  return alpha2 ? (
    <span role="img" aria-label={`ธง${label}`} className="zego-guide-flag-tile">
      <FlagImage alpha2={alpha2} />
    </span>
  ) : (
    <span role="img" aria-label={label} className="zego-guide-flag-tile zego-guide-flag-tile--none">{fallback}</span>
  );
}

/**
 * หน้าที่ยังไม่เปิดใช้งาน (รอ API/ข้อมูล) — วงมิ้นต์ขอบเส้นประเขียว ไม่มีปุ่ม
 * ต้นแบบใช้มาสคอตกลางวง ตอนนี้แอปยังไม่มีไฟล์มาสคอต (public/brand) จึงใช้ไอคอนของหัวข้อแทน
 */
export function GuideComingSoon({ icon, title = 'ยังไม่เปิดใช้งาน', description }: {
  icon: IconName;
  title?: string;
  description: string;
}) {
  return (
    <div className="zego-guide-soon">
      <div className="zego-guide-soon__art" aria-hidden="true">
        <svg className="zego-guide-soon__ring" viewBox="0 0 176 176">
          <circle cx="88" cy="88" r="81" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 7" />
        </svg>
        <span className="zego-guide-soon__icon">
          <Icon name={icon} className="h-16 w-16" />
        </span>
      </div>
      <p className="zego-guide-soon__title">{title}</p>
      <p className="zego-guide-soon__body">{description}</p>
      <span className="zego-guide-soon__pill">
        <Icon name="clock" className="h-3.5 w-3.5" />
        จะแสดงที่หน้านี้เมื่อระบบพร้อม
      </span>
    </div>
  );
}
