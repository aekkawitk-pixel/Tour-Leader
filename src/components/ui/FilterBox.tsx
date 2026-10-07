'use client';

/**
 * แถบค้นหาแบบกล่อง — กล่องละ 1 เงื่อนไข: ไอคอน + ชื่อช่องบรรทัดบน · ค่า/ช่องกรอกบรรทัดล่าง
 * ใช้ร่วมกันหลายหน้า (จัดการค่าใช้จ่ายกรุ๊ป · เคลียร์เงินกรุ๊ป) ให้หน้าตาและการใช้งานเหมือนกัน
 */

import type { ReactNode } from 'react';
import { cx } from './Primitives';
import { Icon, type IconName } from './Icon';

/** ช่องในแถบค้นหา — โปร่งใส ไม่มีกรอบ (กรอบอยู่ที่ FilterBox) ค่าเป็นสีหลัก */
export const FILTER_INPUT = 'w-full bg-transparent text-sm text-sky-700 outline-none placeholder:text-[var(--zego-text-tertiary)] placeholder:text-xs';

/** กล่องตัวกรอง 1 เงื่อนไข — ไอคอน + ชื่อช่องบรรทัดบน · ค่า/ช่องกรอกบรรทัดล่าง */
export function FilterBox({ icon, label, className, children, group }: { icon: IconName; label: string; className?: string; children: ReactNode; group?: boolean }) {
  // มีหลายปุ่มในกล่อง (group) ใช้ div — label จะส่งคลิกที่ชื่อช่องไปกดปุ่มแรก
  const Tag = group ? 'div' : 'label';
  return (
    <Tag className={cx('flex flex-col justify-center gap-0.5 rounded-lg border zego-border-color zego-surface-bg px-3 py-1.5 focus-within:border-[var(--zego-primary-500)]', className)}>
      <span className="flex items-center gap-1.5 text-xs zego-text">
        <Icon name={icon} className="h-4 w-4 zego-text-secondary" />
        {label}
      </span>
      {children}
    </Tag>
  );
}
