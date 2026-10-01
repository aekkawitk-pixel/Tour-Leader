'use client';

/** ชิ้นส่วน UI พื้นฐาน: Button, Card, Badge, Avatar, EmptyState, Skeleton, PageHeader */

import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import { type StatusMeta, type ToneKey } from '@/lib/labels';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/* --------------------------------- Button -------------------------------- */

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md';

/**
 * zego-button base = ปุ่มขอบ/พื้นกลาง (แทน "secondary" เดิม) — ไม่มี modifier แปลว่าปุ่มธรรมดา
 * "success" ใช้สีเขียวเดียวกับ "primary" โดยตั้งใจ — zego มีปุ่มเน้นสีเดียว (เขียว = สีแบรนด์หลัก)
 * ไม่ได้แยกปุ่ม "การกระทำหลัก" กับ "ยืนยันสำเร็จ" เป็นคนละสีเหมือนชุดสี Tailwind เดิม (primary เคยเป็นน้ำเงิน)
 */
const VARIANT: Record<Variant, string> = {
  primary: 'zego-button--primary',
  success: 'zego-button--primary',
  secondary: '',
  ghost: 'zego-button--ghost',
  danger: 'zego-button--danger',
};

const SIZE: Record<Size, string> = {
  sm: 'zego-button--sm',
  md: '',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  loading = false,
  children,
  className,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        'zego-button',
        VARIANT[variant],
        SIZE[size],
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...rest}
    >
      {loading ? (
        <span
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
          aria-hidden="true"
        />
      ) : (
        icon && <Icon name={icon} className="h-4 w-4" />
      )}
      {children}
    </button>
  );
}

/* ---------------------------------- Card --------------------------------- */

export function Card({
  children,
  className,
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section
      className={cx(
        // min-w-0 กัน grid/flex item ขยายตามความกว้างของตารางจนดันหน้าจอ
        'zego-card-surface min-w-0',
        padded && 'zego-card-pad',
        className,
      )}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="zego-text text-base font-semibold">{title}</h2>
        {description && <p className="zego-text-secondary mt-0.5 text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* --------------------------------- Badge --------------------------------- */

/** โทนสำรองเมื่อ meta หาย/โทนไม่รู้จัก — ป้ายเดียวต้องไม่ทำให้ทั้งหน้าพัง */
const UNKNOWN_META: StatusMeta = { label: 'ไม่ทราบสถานะ', tone: 'slate' };

/**
 * ป้ายสถานะ — `meta` มักมาจากการ lookup ตาราง label ด้วยค่าจากข้อมูล เช่น `LEADER_STATUS[leader.status]`
 * ถ้าค่านั้นไม่มีในตาราง (ข้อมูลเก่าที่ persist ไว้ก่อนแก้ชนิดข้อมูล) lookup จะได้ undefined
 * → ใช้ค่าสำรองแทนการอ่าน `.tone` ของ undefined ซึ่งทำให้ทั้งหน้าเรนเดอร์ไม่ขึ้น
 */
export function StatusBadge({
  meta,
  size = 'md',
  dot = true,
}: {
  meta: StatusMeta | undefined | null;
  size?: Size;
  dot?: boolean;
}) {
  const safe = meta ?? UNKNOWN_META;
  return (
    <span
      className={cx(
        'zego-badge whitespace-nowrap',
        size === 'sm' && 'zego-badge--sm',
        TONE_ZEGO_BADGE[safe.tone] ?? TONE_ZEGO_BADGE.slate,
      )}
    >
      {dot && <span className="zego-badge__dot" aria-hidden="true" />}
      {safe.label}
    </span>
  );
}

export function Pill({ children, tone = 'slate' }: { children: ReactNode; tone?: ToneKey }) {
  return <span className={cx('zego-badge', TONE_ZEGO_BADGE[tone])}>{children}</span>;
}

/* --------------------------------- Avatar -------------------------------- */

/**
 * รูปประจำตัว — ถ้ามี `src` (Data URL จาก Demo) จะแสดงรูป
 * ถ้าไม่มี จะ fallback เป็นอักษรย่อชื่อบนพื้นสี
 */
export function Avatar({
  initials,
  color = 'bg-slate-600',
  size = 'md',
  src,
  alt,
}: {
  initials: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  src?: string | null;
  alt?: string;
}) {
  const dims = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-16 w-16 text-xl',
    xl: 'h-24 w-24 text-3xl',
  }[size];

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- Data URL จาก Demo ใช้ next/image ไม่ได้
      <img
        src={src}
        alt={alt ?? 'รูปประจำตัวหัวหน้าทัวร์'}
        className={cx('zego-avatar-ring shrink-0 rounded-full object-cover', dims)}
      />
    );
  }

  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        color,
        dims,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/* ------------------------------ CopyButton ------------------------------- */

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // เบราว์เซอร์บางตัวไม่อนุญาต clipboard — Demo ไม่ถือเป็นข้อผิดพลาด
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label ?? `คัดลอก ${value}`}
      title={copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors',
        copied ? 'zego-badge--success' : 'zego-icon-btn zego-hover-surface',
      )}
    >
      <Icon name={copied ? 'check' : 'file'} className="h-3 w-3" />
      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
    </button>
  );
}

/* ------------------------------- EmptyState ------------------------------ */

export function EmptyState({
  icon = 'info',
  title,
  description,
  action,
}: {
  icon?: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <span className="zego-icon-well flex h-12 w-12 items-center justify-center rounded-full">
        <Icon name={icon} className="h-6 w-6" />
      </span>
      <div>
        <p className="zego-text text-sm font-semibold">{title}</p>
        {description && <p className="zego-text-secondary mt-1 text-sm">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/* -------------------------------- Skeleton ------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('zego-skeleton animate-pulse rounded-lg', className)} />;
}

export function PageLoading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/* ------------------------------- PageHeader ------------------------------ */

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="zego-text text-xl font-bold sm:text-2xl">{title}</h1>
        {description && <p className="zego-text-secondary mt-1 text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* -------------------------------- Callout -------------------------------- */

export function Callout({
  tone = 'amber',
  title,
  children,
}: {
  tone?: ToneKey;
  title: string;
  children?: ReactNode;
}) {
  const icon: IconName = tone === 'red' || tone === 'amber' ? 'warning' : 'info';
  return (
    <div className={cx('flex gap-3 rounded-lg border p-3 text-sm', TONE_ZEGO_BADGE[tone])}>
      <Icon name={icon} className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-semibold">{title}</p>
        {children && <div className="mt-0.5 opacity-90">{children}</div>}
      </div>
    </div>
  );
}
