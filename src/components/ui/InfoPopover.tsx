'use client';

/**
 * Popover ข้อมูลเพิ่มเติม — ใช้แทน Tooltip ในตารางที่แสดงข้อมูลได้จำกัด
 *
 * เข้าถึงได้ด้วยคีย์บอร์ด: เปิด/ปิดด้วย Enter หรือ Space (เป็น <button> จริง)
 * ปิดด้วย Escape หรือคลิกนอกกล่อง · โฟกัสมองเห็นชัดด้วย focus-visible ring
 */

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { cx } from './Primitives';

export function InfoPopover({
  label,
  title,
  children,
  align = 'left',
  className,
}: {
  /** ข้อความบนปุ่ม เช่น "+2 ประเทศ" หรือ "ดูทั้งหมด" */
  label: ReactNode;
  /** ชื่อกำกับสำหรับผู้ใช้ Screen reader (ถ้าไม่ระบุจะใช้ label) */
  title: string;
  children: ReactNode;
  align?: 'left' | 'right';
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClickOutside = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };

    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className={cx('relative inline-block', className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={title}
        // อยู่ในแถวที่กดได้ — กันไม่ให้คลิกทะลุไปเปิดหน้ารายละเอียด
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className={cx(
          'zego-badge zego-badge--info zego-badge--sm max-w-full',
          open && 'zego-is-open',
        )}
      >
        {label}
      </button>

      {/* z-40 = Z_POPOVER ใน @/lib/z-index (ตัวเลขคงเดิม อยู่ต่ำกว่า topbar/sidebar ของ zego แล้ว) */}
      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label={title}
          onClick={(e) => e.stopPropagation()}
          className={cx(
            'zego-popover zego-is-open zego-popover--wide top-full z-40 mt-1 cursor-default text-left',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          <p className="zego-text mb-1.5 text-xs font-semibold">{title}</p>
          <div className="zego-text-secondary max-h-64 overflow-y-auto text-xs">{children}</div>
        </div>
      )}
    </div>
  );
}
