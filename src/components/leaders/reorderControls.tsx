'use client';

/**
 * เครื่องมือ "สลับลำดับรายการ" ที่ใช้ร่วมกัน — ให้พฤติกรรม Drag & Drop เหมือนกันทุกที่
 *   • useDragReorder — ลากสลับลำดับด้วย Pointer Events (เมาส์ + สัมผัส) ผ่าน window listener
 *   • DragHandle     — ไอคอนลาก ⠿
 *   • RowMenu        — เมนูจัดการ (เลื่อนขึ้น/ลง/ลบ ฯลฯ)
 *
 * หลักการ:
 *   • ไม่เรียงตามวันที่อัตโนมัติ — ลำดับเป็นไปตามที่ผู้ใช้จัด
 *   • ระหว่างลากแสดงเส้นตำแหน่งวาง (inset box-shadow — ไม่ทำ layout กระโดด)
 *   • ต้องใช้ id ที่ไม่ซ้ำเป็น React key เสมอ (ห้ามใช้ index) เพื่อไม่ให้ข้อมูลสลับผิดแถว
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import { cx } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';

export interface DragReorder {
  /** id ของรายการที่กำลังลาก (null = ไม่ได้ลาก) */
  dragId: string | null;
  /** handler สำหรับ onPointerDown ของไอคอนลาก */
  dragStart: (id: string) => (e: ReactPointerEvent) => void;
  /** เลื่อนขึ้น/ลงทีละหนึ่ง (ปุ่มในเมนู — ใช้แทนการลาก) */
  move: (id: string, direction: -1 | 1) => void;
  /** style เส้นตำแหน่งวางของแถว index นี้ */
  indicatorStyle: (index: number) => CSSProperties | undefined;
  /** ref callback สำหรับผูกกับ element ของแต่ละแถว (ใช้คำนวณตำแหน่งวาง) */
  setRowRef: (id: string) => (el: HTMLElement | null) => void;
}

/** hook สลับลำดับรายการที่มี `id` ไม่ซ้ำ */
export function useDragReorder<T extends { id: string }>(
  items: T[],
  onChange: (next: T[]) => void,
): DragReorder {
  const rowRefs = useRef(new Map<string, HTMLElement | null>());
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const dragIdRef = useRef<string | null>(null);
  const dropIndexRef = useRef<number | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);

  const setDrop = (value: number | null) => {
    dropIndexRef.current = value;
    setDropIndex(value);
  };

  /** ตำแหน่งที่จะแทรก (0..n) จากตำแหน่ง Y ของตัวชี้ เทียบกับกึ่งกลางของแต่ละแถว */
  const computeDropIndex = (clientY: number) => {
    let idx = 0;
    for (const item of itemsRef.current) {
      const el = rowRefs.current.get(item.id);
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      if (clientY > rect.top + rect.height / 2) idx += 1;
    }
    return idx;
  };

  const moveToIndex = (id: string, insertIndex: number) => {
    const list = itemsRef.current;
    const from = list.findIndex((e) => e.id === id);
    if (from < 0) return;
    let to = insertIndex;
    if (to > from) to -= 1; // ชดเชยตำแหน่งที่หายไปหลังนำออก
    if (to === from) return;
    const next = [...list];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange(next);
  };

  const move = (id: string, direction: -1 | 1) => {
    const list = itemsRef.current;
    const index = list.findIndex((e) => e.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const endDrag = () => {
    const id = dragIdRef.current;
    if (id !== null && dropIndexRef.current !== null) {
      moveToIndex(id, dropIndexRef.current);
    }
    dragIdRef.current = null;
    setDragId(null);
    setDrop(null);
  };

  const dragStart = (id: string) => (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    dragIdRef.current = id;
    setDrop(itemsRef.current.findIndex((x) => x.id === id));
    setDragId(id); // เปลี่ยนค่า → effect ด้านล่างผูก listener ที่ window ให้
  };

  /**
   * ผูก listener ที่ window ระหว่างลาก — ลากได้แม้ตัวชี้ออกนอกไอคอน (เมาส์ + สัมผัส)
   * cleanup ถอด listener ชุดเดิมทุกครั้งที่ dragId เปลี่ยน / คอมโพเนนต์ถูกถอด (ไม่รั่ว)
   */
  useEffect(() => {
    if (dragId === null) return;
    const onMove = (e: PointerEvent) => {
      e.preventDefault();
      setDrop(computeDropIndex(e.clientY));
    };
    const onUp = () => endDrag();
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragId]);

  /**
   * ระหว่างลาก — เปลี่ยนเคอร์เซอร์ทั้งหน้าเป็นมือกำ + ปิดการเลือกข้อความ
   * ให้รู้สึกชัดว่า "กำลังลากอยู่" แม้ตัวชี้จะเลื่อนออกนอกไอคอนไปแล้ว (คนละจุดกับแถวที่ลาก)
   */
  useEffect(() => {
    if (dragId === null) return;
    const { cursor, userSelect } = document.body.style;
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
    return () => {
      document.body.style.cursor = cursor;
      document.body.style.userSelect = userSelect;
    };
  }, [dragId]);

  const setRowRef = (id: string) => (el: HTMLElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  };

  /**
   * เส้นตำแหน่งวาง (อ่านจาก props `items` ไม่ใช่ ref — ปลอดภัยกับ render)
   * หนา 4px + เรืองแสงบาง ๆ รอบเส้น ให้เห็นชัดว่ากำลังจะวางตรงไหน ไม่ใช่แค่เส้นบาง ๆ ที่มองข้ามง่าย
   */
  const dropLineStyle = (side: 'top' | 'bottom'): CSSProperties => {
    const sign = side === 'top' ? '' : '-';
    return {
      boxShadow: `inset 0 ${sign}4px 0 0 var(--zego-primary-500), inset 0 ${sign}10px 10px -8px rgba(5,168,79,.6)`,
    };
  };
  const indicatorStyle = (index: number): CSSProperties | undefined => {
    if (dragId === null || dropIndex === null) return undefined;
    if (items[index]?.id === dragId) return undefined; // ไม่แสดงบนแถวที่กำลังลาก
    if (index === dropIndex) return dropLineStyle('top');
    if (dropIndex === items.length && index === items.length - 1) return dropLineStyle('bottom');
    return undefined;
  };

  return { dragId, dragStart, move, indicatorStyle, setRowRef };
}

/* --------------------------------- Drag Handle --------------------------------- */

export function DragHandle({
  dragging,
  onPointerDown,
}: {
  dragging: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
}) {
  return (
    <button
      type="button"
      aria-label="ลากเพื่อสลับลำดับ"
      title="ลากเพื่อสลับลำดับ"
      onPointerDown={onPointerDown}
      style={{ touchAction: 'none' }}
      className={cx(
        'rounded p-1 zego-text-tertiary transition-all',
        'zego-hover-surface',
        // กำลังลากอยู่ — ขยายขึ้นเล็กน้อย + วงแหวนเขียว ให้เห็นชัดว่า "จับอยู่" ต่างจากแค่ hover
        dragging
          ? 'cursor-grabbing scale-125 zego-selected-tint text-[var(--zego-primary-700)] shadow ring-2 ring-[var(--zego-primary-300)]'
          : 'cursor-grab',
      )}
    >
      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden="true">
        <circle cx="5" cy="3" r="1.4" />
        <circle cx="11" cy="3" r="1.4" />
        <circle cx="5" cy="8" r="1.4" />
        <circle cx="11" cy="8" r="1.4" />
        <circle cx="5" cy="13" r="1.4" />
        <circle cx="11" cy="13" r="1.4" />
      </svg>
    </button>
  );
}

/* --------------------------------- เมนูจัดการ --------------------------------- */

export interface RowMenuItem {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}

export function RowMenu({ items, label = 'เมนูจัดการ' }: { items: RowMenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onOutside = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onOutside);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'inline-flex h-8 w-8 items-center justify-center rounded-lg zego-text-tertiary transition-colors',
          'zego-hover-surface',
          open && 'zego-surface-soft-bg zego-text-secondary',
        )}
      >
        <Icon name="more" className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-1 w-max min-w-40 overflow-hidden rounded-xl border zego-border-color zego-surface-bg py-1 shadow-xl"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className={cx(
                'block w-full whitespace-nowrap px-3 py-2 text-left text-xs font-medium transition-colors',
                item.disabled
                  ? 'cursor-not-allowed zego-text-disabled'
                  : item.danger
                    ? 'text-rose-600 hover:bg-rose-50'
                    : 'zego-text-secondary zego-hover-surface',
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
