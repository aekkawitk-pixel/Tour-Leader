'use client';

/** Modal และ Drawer — ปิดด้วย Escape ได้ กัก focus ไว้ภายใน และล็อกการเลื่อนหน้าจอ */

import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button, cx } from './Primitives';
import { Icon } from './Icon';

function useDismissable(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);

  /* เก็บ onClose ไว้ใน ref — ผู้เรียกส่ง arrow function ใหม่ทุก render
     ถ้าผูก effect ไว้กับ onClose ตรง ๆ effect จะ teardown/setup ใหม่ทุกครั้งที่พิมพ์
     แล้ว focus จะถูกดึงกลับไปที่ปุ่มแรกของ Modal (พิมพ์ได้แค่ตัวอักษรเดียว) */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const handleKey = useCallback(
    (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;

      const focusables = ref.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    },
    [],
  );

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    document.addEventListener('keydown', handleKey);
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      const focusables = ref.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      focusables?.[0]?.focus();
    }, 30);

    return () => {
      document.removeEventListener('keydown', handleKey);
      document.body.style.overflow = '';
      window.clearTimeout(timer);
      previous?.focus?.();
    };
  }, [open, handleKey]);

  return ref;
}

/**
 * วาด Modal/Drawer ที่ document.body — ไม่ใช่ในต้นไม้ของหน้า
 *
 * เนื้อหาหน้าอยู่ใน main.zego-main ที่มี z-index:1 (เปิด stacking context ของตัวเอง) ต่อให้ Modal ตั้ง z-160
 * ก็ยังอยู่ "ใต้" แถบด้านบนของแอป (z-70 นอก main) — หน้าต่างที่สูงเกือบเต็มจอจึงมุดหัวเรื่องไปใต้แถบ
 * Portal ออกไปที่ body ทำให้ z-160 เทียบกับ chrome ของแอปจริง · Modal ซ้อนกันยังเรียงถูก (เปิดทีหลังต่อท้าย body)
 * React event (onClick ฯลฯ) ยังไหลตามต้นไม้ component เดิม จึงไม่กระทบพฤติกรรมอื่น
 */
function toBody(node: ReactNode) {
  return typeof document === 'undefined' ? node : createPortal(node, document.body);
}

/* --------------------------------- Modal --------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}) {
  const ref = useDismissable(open, onClose);
  if (!open) return null;

  const width = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
  }[size];
  /**
   * กำหนดซ้ำเป็น px ตรง ๆ ผ่าน inline style (คู่กับ class max-w-* ด้านบน) — เผื่อกรณี build/deploy บางที่
   * (เช่น Tailwind ไม่ gen class นี้ครบ หรือ cascade layer ชนกัน) ทำให้ max-w-* ไม่มีผลจริง แผงจะกว้างเกิน
   * ตั้งใจ inline style ชนะทุกกรณีเสมอเพราะ specificity สูงสุด ไม่ต้องพึ่ง Tailwind pipeline อีกชั้น
   */
  const widthPx = { sm: 448, md: 672, lg: 896, xl: 1152 }[size];

  return toBody(
    // z-160 = Z_MODAL ใน @/lib/z-index — จัดชั้นเดียวกับ .zego-command ของ zego (ฉากหลังใช้ .zego-backdrop z:150 ของ zego เอง)
    // min-[981px]:left-[var(--zego-sidebar)] — ที่ ≥981px sidebar เป็นคอลัมน์ถาวร (ไม่ใช่ overlay) จึง "กิน" พื้นที่จริง
    // ต้องเลื่อนขอบซ้ายของ fixed context ให้พ้น sidebar ก่อน justify-center จะได้จัดกึ่งกลางเทียบกับพื้นที่เนื้อหาที่มองเห็นจริง
    // ไม่ใช่กึ่งกลาง viewport ทั้งหมด (ต่ำกว่า 980px sidebar ยุบเป็น overlay ลอยทับ จึงคงจัดกึ่งกลางเต็มจอตามเดิม — ตรงกับ breakpoint ของ zego เอง)
    <div className="fixed inset-0 z-[160] flex items-end justify-center sm:items-center min-[981px]:left-[var(--zego-sidebar)]">
      <div className="zego-backdrop zego-is-open" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        /*
          z-[151]: ต้องสูงกว่า .zego-backdrop (z:150 ของ zego เอง — ตายตัวมาจาก class) เพราะพี่น้องกัน
          ในบริบทการจัดชั้นเดียวกัน (wrapper ข้างนอกเปิด stacking context ใหม่ด้วย fixed+z-[160])
          ถ้าแผงมี z ต่ำกว่า backdrop จะถูก backdrop-filter:blur ของฉากหลังทับเบลอทั้งแผง (เนื้อหาในแผงอ่านไม่ออก)

          isolate: z-index สูงกว่าเพียงอย่างเดียวไม่พอกับ Chrome บางเวอร์ชัน — backdrop-filter:blur ของ
          .zego-backdrop (พี่น้องกัน) ยังเบลอ/ทับขอบมุมโค้งบนซ้ายของแผงได้ตอน compositing (โดยเฉพาะตัวอักษร
          บรรทัดแรกของ header ที่ชิดมุมโค้งที่สุด) ทั้งที่ z-index/DOM ถูกต้องทุกจุด — isolate เปิด stacking
          context ใหม่ให้แผงตัดขาดจาก backdrop-filter ของพี่น้องแน่นอน ไม่ใช่พึ่ง z-index อย่างเดียว

          transform-gpu: isolate อย่างเดียวยังไม่พอ — ยืนยันจากการทดสอบจริงว่าอาการหายไปเฉพาะตอน DevTools
          "ปิด" อยู่ (เปิด DevTools ค้างไว้แล้วไม่เกิด) ซึ่งเป็นลายเซ็นคลาสสิกของบั๊ก GPU rasterization/compositing
          ของ Chrome เอง (DevTools เปิดอยู่มักบังคับ path การ render ที่ต่างออกไป) ไม่ใช่แค่ปัญหาระดับ CSS
          stacking context — บังคับให้แผงนี้ขึ้น GPU layer ของตัวเองแยกจาก backdrop-filter ของพี่น้องด้วย
          transform:translate3d(0,0,0) กันปัญหาการ rasterize ผิดพลาดตรงขอบมุมโค้งซ้ำอีกชั้น
        */
        className={cx('zego-card-surface isolate transform-gpu relative z-[151] flex max-h-[92vh] w-full flex-col rounded-t-2xl sm:rounded-2xl', width)}
        style={{ maxWidth: widthPx, isolation: 'isolate', transform: 'translateZ(0)' }}
      >
        <header className="zego-divider-bottom flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <h2 className="zego-text text-base font-semibold">{title}</h2>
            {description && <p className="zego-text-secondary mt-0.5 text-sm">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดหน้าต่าง"
            className="zego-icon-btn zego-hover-surface rounded-lg p-1.5"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>

        {/* กันที่แถบเลื่อนไว้ตลอด — เนื้อหาสั้น/ยาว (เช่น สลับตัวกรอง) ความกว้างไม่เปลี่ยน ข้อความไม่ขยับตัดบรรทัดใหม่ */}
        <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">{children}</div>

        {footer && (
          <footer className="zego-divider-top zego-surface-soft-bg flex flex-wrap justify-end gap-2 rounded-b-2xl px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
  );
}

/* --------------------------------- Drawer -------------------------------- */

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** md = max-w-2xl (ค่าเริ่มต้น) · xl = แผงกว้างสำหรับตาราง/เปรียบเทียบ */
  size?: 'md' | 'xl';
}) {
  const ref = useDismissable(open, onClose);
  if (!open) return null;

  return toBody(
    // z-160 = Z_MODAL ใน @/lib/z-index — จัดชั้นเดียวกับ .zego-command ของ zego (ฉากหลังใช้ .zego-backdrop z:150 ของ zego เอง)
    <div className="fixed inset-0 z-[160]">
      <div className="zego-backdrop zego-is-open" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        /* z-[151] + isolate + transform-gpu: เหตุผลเดียวกับใน Modal ด้านบน — กัน backdrop-filter:blur ของพี่น้อง
           ทับเบลอขอบแผง ทั้งระดับ stacking context (isolate) และระดับ GPU compositing (transform-gpu) */
        className={cx(
          'zego-card-surface isolate transform-gpu absolute inset-y-0 right-0 z-[151] flex w-full flex-col rounded-none',
          size === 'xl' ? 'max-w-5xl' : 'max-w-2xl',
        )}
        /* max-w-* ซ้ำเป็น inline style ตรง ๆ — เหตุผลเดียวกับใน Modal ด้านบน กัน Tailwind pipeline ไม่ gen class */
        style={{ maxWidth: size === 'xl' ? 1024 : 672, isolation: 'isolate', transform: 'translateZ(0)' }}
      >
        <header className="zego-divider-bottom flex items-start justify-between gap-4 px-5 py-4">
          <div>
            <h2 className="zego-text text-base font-semibold">{title}</h2>
            {description && <p className="zego-text-secondary mt-0.5 text-sm">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิดแผงข้อมูล"
            className="zego-icon-btn zego-hover-surface rounded-lg p-1.5"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        </header>
        {/* กันที่แถบเลื่อนไว้ตลอด — เนื้อหาสั้น/ยาว (เช่น สลับตัวกรอง) ความกว้างไม่เปลี่ยน ข้อความไม่ขยับตัดบรรทัดใหม่ */}
        <div className="flex-1 overflow-y-auto px-5 py-4 [scrollbar-gutter:stable]">{children}</div>
        {footer && (
          <footer className="zego-divider-top zego-surface-soft-bg flex flex-wrap justify-end gap-2 px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
  );
}

/* ----------------------------- ConfirmDialog ----------------------------- */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  tone = 'danger',
  loading = false,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: 'danger' | 'primary' | 'success';
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            ยกเลิก
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="zego-text-secondary whitespace-pre-line text-sm leading-relaxed">{message}</p>
    </Modal>
  );
}
