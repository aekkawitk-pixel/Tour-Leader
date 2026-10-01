'use client';

/**
 * ตารางรายชื่อหัวหน้าทัวร์ — 8 คอลัมน์ อ่านง่าย ไม่แสดงข้อมูลมากเกินไป
 *
 *   # · หัวหน้าทัวร์ · การติดต่อ · ภาษา · ประสบการณ์ · โซน / ประเทศ / เส้นทาง · สถานะ · จัดการ
 *
 * Responsive
 *   ≥ 1024px (lg) — ตาราง (หัวตาราง Sticky · ไม่มี Horizontal Scroll)
 *   < 1024px       — Card List (ยุบข้อมูลรองไว้ใน "ดูเพิ่มเติม")
 *
 * ⚠️ แสดงผลอย่างเดียว — การค้นหา/กรอง/เรียง/แบ่งหน้า ทำที่หน้า page.tsx
 *    `#` = ลำดับตามผลลัพธ์ (startIndex + ตำแหน่งในหน้า) ไม่ใช่ ID ของข้อมูล
 */

import { useMemo, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { LEADER_STATUS, LEADER_TYPE, LEADER_USAGE_STATUS, USAGE_STATUS_TERM } from '@/lib/labels';
import {
  computeAvailabilityStatus,
  type AvailabilityStatusKey,
} from '@/lib/logic/availabilityStatus';
import {
  contactHref,
  leaderLineId,
  leaderPhone,
  orderedLanguages,
} from '@/lib/logic/leaderProfile';
import {
  expertiseLines,
  EXPERTISE_EMPTY_TEXT,
  type ExpertiseLine,
} from '@/lib/logic/expertiseSummary';
import { getExpertiseScopes } from '@/services/expertiseScopeStore';
import { summarizeExperience } from '@/modules/tour-leaders/experience';
import { Avatar, Button, cx, EmptyState, Pill, StatusBadge } from '@/components/ui/Primitives';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { LanguageChip, LanguageLevelTag } from './LanguageBadge';
import { DragHandle, RowMenu, useDragReorder, type RowMenuItem } from './reorderControls';
import { FavoriteStarButton } from './FavoriteStarButton';
import { moveIdToRank } from '@/lib/logic/preferredGuideOrder';
import type { Country, LeaderAvailabilityRecord, TourJob, TourLeader } from '@/types';

export interface LeaderTableProps {
  leaders: TourLeader[];
  countries: Country[];
  /** ใช้คำนวณสถานะประกอบ “ติดงาน” จากงานที่ได้รับมอบหมาย */
  jobs: TourJob[];
  /** ใช้คำนวณสถานะประกอบ “ลา / ติดงานบริษัท / ไม่พร้อมรับงาน” ตามช่วงวัน */
  availabilityRecords: LeaderAvailabilityRecord[];
  today: string;
  /** ลำดับเริ่มต้นของหน้านี้ (สำหรับคอลัมน์ #) */
  startIndex: number;
  /** กำลังโหลด → แสดง Skeleton */
  loading?: boolean;
  canEdit: boolean;
  canChangeStatus: boolean;
  onEdit: (leader: TourLeader) => void;
  onChangeStatus: (leader: TourLeader) => void;
  /** ลบข้อมูล (ระบบใช้การปิดใช้งาน — ไม่ลบถาวร) */
  onDelete: (leader: TourLeader) => void;
  empty: ReactNode;
  /** ไกด์ที่ผู้ใช้คนนี้ปักดาวไว้ — โหลด/บันทึกจากที่เดียวกับหน้า (§ให้เรียงลำดับได้ด้วย ไม่ใช่แค่แสดงดาว) */
  favorited: Set<string>;
  onToggleFavorite: (id: string) => void;
  /**
   * โหมด "ไกด์ของฉัน" — ลากจัดลำดับได้ (สลับคอลัมน์ # เป็นไอคอนลาก)
   * `leaders` ต้องเป็นชุดที่ลากได้ทั้งหมด (ไม่แบ่งหน้า) เพราะลากข้ามหน้าไม่ได้
   */
  reorderable?: boolean;
  onReorder?: (next: TourLeader[]) => void;
}

/* ------------------------------ ตัวช่วยแสดงผล ----------------------------- */

/** ชื่อ–นามสกุล (บรรทัดที่ 1) */
function fullName(leader: TourLeader): string {
  return `${leader.firstName} ${leader.lastName}`.trim();
}

/** ชื่อเล่น (บรรทัดที่ 2) — ไม่มีข้อมูล → “ยังไม่ระบุ” */
function nicknameLabel(leader: TourLeader): string {
  return leader.nickname?.trim() || 'ยังไม่ระบุ';
}

/** รหัสหัวหน้าทัวร์ (บรรทัดที่ 3) — ไม่มีข้อมูล → “ยังไม่มีรหัส” */
function leaderCodeLabel(leader: TourLeader): string {
  return leader.id?.trim() || 'ยังไม่มีรหัส';
}

/**
 * รูปแบบการร่วมงาน (บรรทัดที่ 3) — อ่านจากฟิลด์ leaderType ในโปรไฟล์โดยตรง
 * (§6 “รูปแบบการร่วมงาน” = LEADER_TYPE เดียวกับทั้งระบบ · ห้ามใช้คำว่า “ประเภทหัวหน้าทัวร์” ตรงนี้)
 * ค่าที่ไม่รู้จัก/ยังไม่ได้ระบุ → “ยังไม่ระบุรูปแบบการร่วมงาน”
 */
function leaderTypeLabel(leader: TourLeader): string {
  return LEADER_TYPE[leader.leaderType]?.label ?? 'ยังไม่ระบุรูปแบบการร่วมงาน';
}

/* ------------------------------ เซลล์แต่ละคอลัมน์ --------------------------- */

/**
 * เซลล์ “หัวหน้าทัวร์” — 3 บรรทัด จัดกึ่งกลางแนวตั้งกับรูปโปรไฟล์
 *
 *   1. ชื่อ–นามสกุล            (เข้มและเด่นที่สุด)
 *   2. ชื่อเล่น: [ชื่อเล่น]      (เล็กกว่าชื่อหลักเล็กน้อย)
 *   3. [รหัส] · [รูปแบบการร่วมงาน] (สีเทา เล็กกว่าชื่อเล่นเล็กน้อย)
 *
 * บรรทัดที่ 3 ใช้ flex-wrap — พื้นที่พอจะอยู่บรรทัดเดียว ถ้าไม่พอรูปแบบการร่วมงาน
 * (พร้อม “·”) จะขึ้นบรรทัดใหม่ โดยรหัสยังอยู่บรรทัดเดิม · ไม่ตัดข้อความด้วย ellipsis
 */
function LeaderCell({
  leader,
  favorited,
  onToggleFavorite,
}: {
  leader: TourLeader;
  favorited?: boolean;
  onToggleFavorite?: () => void;
}) {
  const name = fullName(leader);
  return (
    <div className="flex min-w-0 items-center gap-3">
      {onToggleFavorite ? (
        <div className="relative shrink-0">
          <Avatar
            initials={leader.avatarInitials}
            color={leader.avatarColor}
            src={leader.photoUrl}
            alt={`รูปของ ${name}`}
          />
          <FavoriteStarButton
            favorited={!!favorited}
            onToggle={onToggleFavorite}
            name={name}
            size="sm"
            className="absolute -left-1.5 -top-1.5 zego-surface-bg p-0.5 shadow border zego-border-color hover:bg-amber-50"
          />
        </div>
      ) : (
        <Avatar
          initials={leader.avatarInitials}
          color={leader.avatarColor}
          src={leader.photoUrl}
          alt={`รูปของ ${name}`}
        />
      )}
      <div className="min-w-0 flex-1">
        <Link
          href={`/leaders/${leader.id}`}
          onClick={(e) => e.stopPropagation()}
          className="block break-words font-semibold leading-snug zego-text hover:text-[var(--zego-info)] hover:underline"
        >
          {name}
        </Link>
        <p className="break-words text-xs leading-snug zego-text-secondary">
          ชื่อเล่น: {nicknameLabel(leader)}
        </p>
        <p className="flex flex-wrap items-baseline gap-x-1 text-[11px] leading-snug zego-text-tertiary">
          <span>{leaderCodeLabel(leader)}</span>
          <span className="break-words">
            <span aria-hidden="true">·</span>&nbsp;{leaderTypeLabel(leader)}
          </span>
        </p>
        {/* อ่าน usageStatus ไม่ใช่ active — "ระงับการใช้งาน" ยัง active=true แต่จัดงาน/แสดงในการจัดสเก็ตไม่ได้ ต้องเห็นป้าย */}
        {leader.usageStatus !== 'active' && (
          <span className="mt-0.5 inline-block">
            {/* ค่าที่ไม่รู้จัก (ข้อมูลเก่าที่ persist ไว้) ต้องไม่ทำให้ทั้งตารางเรนเดอร์ไม่ขึ้น */}
            <Pill tone="red">{LEADER_USAGE_STATUS[leader.usageStatus]?.label ?? 'ไม่ทราบสถานะ'}</Pill>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * คอลัมน์ "การติดต่อ" — 2 บรรทัดชิดซ้าย ความสูงคงที่ทุกแถว
 *   บรรทัด 1: เบอร์โทรศัพท์ (ตัวอักษรหลัก · กดโทรได้เมื่อมีเบอร์)
 *   บรรทัด 2: LINE: [LINE ID] (เล็กกว่า สีเทารอง) — ไม่มีข้อมูลแสดง "LINE: ยังไม่ระบุ"
 * LINE ID อ่านจากช่องทางติดต่อจริงของแต่ละคน (contacts type 'line')
 */
function ContactCell({ leader }: { leader: TourLeader }) {
  const phone = leaderPhone(leader);
  const lineId = leaderLineId(leader);
  const phoneChannel = leader.contacts.find((c) => c.type === 'phone' && c.value);
  const phoneHref = phoneChannel ? contactHref(phoneChannel) : null;
  const lineText = `LINE: ${lineId ?? 'ยังไม่ระบุ'}`;

  return (
    <div className="min-w-0 space-y-0.5 text-left" onClick={(e) => e.stopPropagation()}>
      {phoneHref ? (
        <a
          href={phoneHref}
          className="block truncate text-sm zego-text-secondary hover:text-[var(--zego-info)] hover:underline"
          title={phone}
        >
          {phone}
        </a>
      ) : (
        <span className="block truncate text-sm zego-text-tertiary">{phone}</span>
      )}
      <span
        className="block truncate text-xs zego-text-tertiary"
        title={lineText}
      >
        {lineText}
      </span>
    </div>
  );
}

function LanguageCell({ leader }: { leader: TourLeader }) {
  const langs = orderedLanguages(leader);
  if (langs.length === 0) return <span className="text-xs zego-text-tertiary">ยังไม่ระบุ</span>;
  const shown = langs.slice(0, 3);
  const extra = langs.length - shown.length;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1">
      {shown.map((l) => (
        <LanguageChip key={l.id} language={l.languageName} skill={l} />
      ))}
      {extra > 0 && (
        <InfoPopover label={`+${extra} ภาษา`} title="ภาษาทั้งหมด">
          <ul className="space-y-2">
            {langs.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <span className="font-medium zego-text">{l.languageName}</span>
                <LanguageLevelTag skill={l} />
              </li>
            ))}
          </ul>
        </InfoPopover>
      )}
    </div>
  );
}

/** แสดงเฉพาะระยะเวลาประสบการณ์รวม (ไม่แสดงตำแหน่ง/ประเภทล่าสุด) */
function ExperienceCell({ leader, today }: { leader: TourLeader; today: string }) {
  const summary = summarizeExperience(leader.employmentHistory, today);
  if (summary.totalMonths === 0) {
    return <span className="text-sm zego-text-tertiary">ยังไม่มีข้อมูล</span>;
  }
  return <span className="text-sm font-medium zego-text">{summary.label}</span>;
}

/**
 * คอลัมน์ "ประเทศที่เชี่ยวชาญ" — ใช้ Expertise Scope ที่ผู้ใช้กำหนดเองเท่านั้น
 *
 * ⚠️ เดิมอ่านจาก leader.routeSkills (ฟิลด์ประวัติการนำทัวร์เดิม) ซึ่งไม่มีอะไรเขียนแล้ว
 *    จึงว่างเสมอและขึ้นข้อความ "ยังไม่มีประสบการณ์นำทัวร์" ที่ไม่ตรงกับชื่อคอลัมน์
 *    ห้ามกลับไปใช้ routeSkills / employmentHistory / งานทัวร์ที่ได้รับมอบหมาย ในคอลัมน์นี้อีก
 */
function CountriesCell({ lines }: { lines: ExpertiseLine[] }) {
  if (lines.length === 0) {
    return <span className="text-xs zego-text-tertiary">{EXPERTISE_EMPTY_TEXT}</span>;
  }
  const shown = lines.slice(0, 2);
  const extra = lines.length - shown.length;
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {shown.map((l) => (
        <div key={l.key} className="min-w-0">
          {/* บรรทัดแรก: โซน · ประเทศ + Tag "หลัก" */}
          <span className="flex min-w-0 items-center gap-1">
            <span className="min-w-0 truncate text-xs font-medium zego-text" title={l.headline}>
              {l.headline}
            </span>
            {l.isPrimary && (
              <span className="shrink-0 rounded zego-badge--info border px-1 py-px text-[10px] font-medium">
                หลัก
              </span>
            )}
          </span>
          {/* บรรทัดสอง: เส้นทาง (ตัวเล็ก สีรอง) */}
          {l.detail && (
            <span className="block truncate text-[11px] zego-text-tertiary" title={l.detail}>
              {l.detail}
            </span>
          )}
        </div>
      ))}
      {extra > 0 && (
        <InfoPopover label={`+${extra} รายการ`} title="โซน / ประเทศ / เส้นทาง ทั้งหมด">
          <ul className="space-y-1.5">
            {lines.map((l) => (
              <li key={l.key}>
                <span className="font-medium zego-text">{l.headline}</span>
                {l.isPrimary && <span className="ml-1 text-[11px] zego-text-info">· หลัก</span>}
                {l.detail && <span className="block zego-text-tertiary">{l.detail}</span>}
              </li>
            ))}
          </ul>
        </InfoPopover>
      )}
    </div>
  );
}

/** สถานะประกอบที่ควรแสดงเพิ่ม (คำนวณตามช่วงวัน — ไม่ใช่สถานะหลัก) */
const DERIVED_KEYS = new Set<AvailabilityStatusKey>(['on_job', 'leave', 'company_work', 'unavailable']);

function StatusCell({
  leader,
  jobs,
  availabilityRecords,
  today,
  canChangeStatus,
  onChangeStatus,
}: {
  leader: TourLeader;
  jobs: TourJob[];
  availabilityRecords: LeaderAvailabilityRecord[];
  today: string;
  canChangeStatus: boolean;
  onChangeStatus: (l: TourLeader) => void;
}) {
  const main = <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />;

  /**
   * สถานะประกอบตามช่วงวัน — ติดงาน (จากงานที่มอบหมายในการจัดสเก็ต) · ลา/ติดงานบริษัท
   * (จากเมนูสถานะและการลา) · แสดงควบคู่สถานะหลัก ไม่เปลี่ยนสถานะหลักอัตโนมัติ
   */
  const derived = computeAvailabilityStatus(leader, jobs, availabilityRecords, today);
  const extra = DERIVED_KEYS.has(derived.key) ? (
    <StatusBadge meta={{ label: derived.label, tone: derived.tone }} size="sm" dot />
  ) : null;

  const clickable = canChangeStatus ? (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChangeStatus(leader);
      }}
      title="เปลี่ยนสถานะรับงาน"
      className="rounded-full"
    >
      {main}
    </button>
  ) : (
    main
  );

  if (!extra) return clickable;
  return (
    <span className="flex flex-wrap items-center gap-1">
      {clickable}
      <span title="สถานะประกอบตามช่วงวัน — ไม่ใช่สถานะหลัก">{extra}</span>
    </span>
  );
}

/** สร้างรายการเมนู "จัดการ" ตามสิทธิ์ */
function buildManageItems(
  leader: TourLeader,
  opts: {
    canEdit: boolean;
    canChangeStatus: boolean;
    onView: (l: TourLeader) => void;
    onViewHistory: (l: TourLeader) => void;
    onManageStatus: (l: TourLeader) => void;
    onManageLeave: (l: TourLeader) => void;
    onEdit: (l: TourLeader) => void;
    onChangeStatus: (l: TourLeader) => void;
    onDelete: (l: TourLeader) => void;
  },
): RowMenuItem[] {
  const items: RowMenuItem[] = [{ label: 'ดูรายละเอียด', onClick: () => opts.onView(leader) }];
  // §3 เปิดหน้าโปรไฟล์แทนการเปิดฟอร์มแก้ไขซ้ำ — ผู้ใช้เลือกกดแก้ไขใน Card ที่ต้องการเอง
  if (opts.canEdit) items.push({ label: 'ดูและจัดการข้อมูล', onClick: () => opts.onEdit(leader) });
  items.push({ label: USAGE_STATUS_TERM, onClick: () => opts.onManageStatus(leader) });
  items.push({ label: 'วันลาและช่วงไม่พร้อม', onClick: () => opts.onManageLeave(leader) });
  items.push({ label: 'ดูโปรแกรมทัวร์', onClick: () => opts.onViewHistory(leader) });
  if (opts.canChangeStatus) {
    items.push({ label: 'เปลี่ยนสถานะ', onClick: () => opts.onChangeStatus(leader) });
    items.push({ label: 'ลบข้อมูล', onClick: () => opts.onDelete(leader), danger: true });
  }
  return items;
}

/* --------------------------------- ตาราง --------------------------------- */

const COLS: { key: string; label: string; className: string; center?: boolean }[] = [
  { key: 'no', label: '#', className: 'w-10', center: true },
  { key: 'leader', label: 'หัวหน้าทัวร์', className: 'min-w-[180px]' },
  { key: 'contact', label: 'การติดต่อ', className: 'w-[168px]' },
  { key: 'lang', label: 'ภาษา', className: 'w-[150px]' },
  { key: 'exp', label: 'ประสบการณ์', className: 'w-[140px]' },
  { key: 'countries', label: 'โซน / ประเทศ / เส้นทาง', className: 'w-[170px]' },
  { key: 'status', label: 'สถานะ', className: 'w-[116px]' },
  { key: 'actions', label: 'จัดการ', className: 'w-[56px]', center: true },
];

export function LeaderTable({
  leaders,
  countries,
  jobs,
  availabilityRecords,
  today,
  startIndex,
  loading = false,
  canEdit,
  canChangeStatus,
  onEdit,
  onChangeStatus,
  onDelete,
  empty,
  favorited,
  onToggleFavorite,
  reorderable = false,
  onReorder,
}: LeaderTableProps) {
  const router = useRouter();
  const reorder = useDragReorder<TourLeader>(leaders, onReorder ?? (() => {}));

  /** กรอกเลขอันดับตรง ๆ แทนการลาก — เร็วกว่าตอนมีไกด์ในลิสต์หลายสิบคน */
  const jumpToRank = (id: string, rank1: number) => {
    const byId = new Map(leaders.map((l) => [l.id, l]));
    const nextIds = moveIdToRank(leaders.map((l) => l.id), id, rank1);
    onReorder?.(nextIds.map((nid) => byId.get(nid)!));
  };

  /**
   * ประเทศที่เชี่ยวชาญของแต่ละคน — อ่านจาก Expertise Scope Store ชุดเดียวกับ
   * Card "โซน ประเทศ และเส้นทางที่เชี่ยวชาญ" ในหน้ารายละเอียด (ไม่คัดลอกข้อมูลซ้ำ)
   */
  const linesByLeader = useMemo(() => {
    const m = new Map<string, ExpertiseLine[]>();
    for (const l of leaders) m.set(l.id, expertiseLines(getExpertiseScopes(l.id), countries));
    return m;
  }, [leaders, countries]);

  const onView = (leader: TourLeader) => router.push(`/leaders/${leader.id}`);
  const onViewHistory = (leader: TourLeader) => router.push(`/leaders/${leader.id}?tab=tourJobs`);
  const onManageStatus = (leader: TourLeader) => router.push(`/leaders/${leader.id}?tab=status`);
  const onManageLeave = (leader: TourLeader) => router.push(`/leaders/${leader.id}?tab=leave`);

  const menuOpts = {
    canEdit,
    canChangeStatus,
    onView,
    onViewHistory,
    onManageStatus,
    onManageLeave,
    onEdit,
    onChangeStatus,
    onDelete,
  };

  if (loading) return <LeaderTableSkeleton />;
  if (leaders.length === 0) return <>{empty}</>;

  return (
    <>
      {/* ---------- จอ ≥ 1024px: ตาราง ---------- */}
      {/*
        overflow-x-auto + min-w บนตาราง — คอลัมน์ทั้งหมดรวมกันต้องการอย่างน้อย 1020px
        (ผลรวมความกว้างที่ประกาศไว้ใน COLS) ถ้าพื้นที่แคบกว่านั้น (เช่นหลังปรับ AppShell ไปใช้
        --zego-sidebar ที่กว้างกว่า w-64 เดิม) ตารางจะเลื่อนแนวนอนแทนการบีบคอลัมน์ "หัวหน้าทัวร์"
        จนชื่อขึ้นบรรทัดทีละตัวอักษร (ปัญหาที่คอมเมนต์ข้างล่างเคยกันไว้เฉพาะโหมดลากจัดลำดับเท่านั้น)
      */}
      <div className="hidden w-full max-w-full overflow-x-auto rounded-xl border zego-border-color zego-surface-bg shadow-sm lg:block">
        <table className="w-full min-w-[1020px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b zego-border-color zego-surface-soft-bg text-left">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(
                    'sticky top-0 z-10 zego-surface-soft-bg px-3 py-2.5 text-xs font-semibold uppercase tracking-wide zego-text-tertiary',
                    // คอลัมน์ # ต้องกว้างขึ้นตอนลากจัดลำดับได้ — ไอคอนลากกับช่องกรอกอันดับอยู่บรรทัดเดียวกัน
                    // ดึงพื้นที่มาจากคอลัมน์ "การติดต่อ" แทน กันไม่ให้คอลัมน์ "หัวหน้าทัวร์" ถูกบีบจนชื่อขึ้นบรรทัดทีละตัวอักษร
                    reorderable && c.key === 'no'
                      ? 'w-20'
                      : reorderable && c.key === 'contact'
                        ? 'w-[130px]'
                        : c.className,
                    c.center && 'text-center',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-[var(--zego-border-soft)]">
            {leaders.map((leader, i) => (
              <tr
                key={leader.id}
                ref={reorderable ? reorder.setRowRef(leader.id) : undefined}
                style={reorderable ? reorder.indicatorStyle(i) : undefined}
                tabIndex={0}
                role="button"
                aria-label={`เปิดรายละเอียดของ ${fullName(leader)}`}
                onClick={() => onView(leader)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onView(leader);
                  }
                }}
                className={cx(
                  'cursor-pointer align-middle transition-colors',
                  'zego-hover-surface',
                  // แถวที่กำลังลาก — จางลง + พื้นเขียวเข้มกว่า hover ปกติ ให้เห็นชัดว่า "คนนี้ถูกยกขึ้นมา"
                  // (ใช้โทนเขียวเดียวกับเส้นตำแหน่งวางใน reorderControls.tsx ที่ย้ายมาใช้ zego-primary แล้ว)
                  reorder.dragId === leader.id
                    ? 'zego-selected-tint opacity-70 outline outline-2 -outline-offset-2 outline-dashed outline-[var(--zego-primary-400)]'
                    : leader.active
                      ? 'zego-surface-bg'
                      : 'zego-surface-soft-bg',
                )}
              >
                <td
                  className="px-3 py-3 text-center text-sm tabular-nums zego-text-tertiary"
                  onClick={(e) => reorderable && e.stopPropagation()}
                >
                  {reorderable ? (
                    <div className="flex items-center justify-center gap-1">
                      <RankInput
                        key={i}
                        rank={i + 1}
                        max={leaders.length}
                        label={`ย้าย ${fullName(leader)} ไปอันดับที่`}
                        onCommit={(next) => jumpToRank(leader.id, next)}
                      />
                      <DragHandle dragging={reorder.dragId === leader.id} onPointerDown={reorder.dragStart(leader.id)} />
                    </div>
                  ) : (
                    startIndex + i + 1
                  )}
                </td>
                <td className="px-3 py-3">
                  <LeaderCell
                    leader={leader}
                    favorited={favorited.has(leader.id)}
                    onToggleFavorite={() => onToggleFavorite(leader.id)}
                  />
                </td>
                <td className="px-3 py-3">
                  <ContactCell leader={leader} />
                </td>
                <td className="px-3 py-3">
                  <LanguageCell leader={leader} />
                </td>
                <td className="px-3 py-3">
                  <ExperienceCell leader={leader} today={today} />
                </td>
                <td className="px-3 py-3">
                  <CountriesCell lines={linesByLeader.get(leader.id) ?? []} />
                </td>
                <td className="px-3 py-3">
                  <StatusCell
                    leader={leader}
                    jobs={jobs}
                    availabilityRecords={availabilityRecords}
                    today={today}
                    canChangeStatus={canChangeStatus}
                    onChangeStatus={onChangeStatus}
                  />
                </td>
                <td className="px-3 py-3 text-center" onClick={(e) => e.stopPropagation()}>
                  <RowMenu items={buildManageItems(leader, menuOpts)} label="จัดการหัวหน้าทัวร์" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- จอ < 1024px: Card List ---------- */}
      <ul className="space-y-3 lg:hidden">
        {leaders.map((leader, i) => (
          <LeaderCardMobile
            key={leader.id}
            leader={leader}
            countries={countries}
            jobs={jobs}
            availabilityRecords={availabilityRecords}
            today={today}
            no={startIndex + i + 1}
            canChangeStatus={canChangeStatus}
            onChangeStatus={onChangeStatus}
            menuItems={buildManageItems(leader, menuOpts)}
            favorited={favorited.has(leader.id)}
            onToggleFavorite={() => onToggleFavorite(leader.id)}
            reorderable={reorderable}
            dragging={reorder.dragId === leader.id}
            onDragStart={reorder.dragStart(leader.id)}
            setRowRef={reorder.setRowRef(leader.id)}
            indicatorStyle={reorder.indicatorStyle(i)}
            total={leaders.length}
            onJumpToRank={(rank1) => jumpToRank(leader.id, rank1)}
          />
        ))}
      </ul>
    </>
  );
}

/* ------------------------------ การ์ด (มือถือ) ---------------------------- */

function LeaderCardMobile({
  leader,
  countries,
  jobs,
  availabilityRecords,
  today,
  no,
  canChangeStatus,
  onChangeStatus,
  menuItems,
  favorited,
  onToggleFavorite,
  reorderable = false,
  dragging = false,
  onDragStart,
  setRowRef,
  indicatorStyle,
  total,
  onJumpToRank,
}: {
  leader: TourLeader;
  countries: Country[];
  jobs: TourJob[];
  availabilityRecords: LeaderAvailabilityRecord[];
  today: string;
  no: number;
  canChangeStatus: boolean;
  onChangeStatus: (l: TourLeader) => void;
  menuItems: RowMenuItem[];
  favorited: boolean;
  onToggleFavorite: () => void;
  reorderable?: boolean;
  dragging?: boolean;
  onDragStart?: (e: ReactPointerEvent) => void;
  setRowRef?: (el: HTMLElement | null) => void;
  indicatorStyle?: CSSProperties;
  /** จำนวนทั้งหมดในลิสต์ที่ลากได้ — ใช้เป็นเพดานของช่องกรอกอันดับ */
  total?: number;
  onJumpToRank?: (rank1: number) => void;
}) {
  const summary = summarizeExperience(leader.employmentHistory, today);

  return (
    <li
      ref={reorderable ? setRowRef : undefined}
      style={reorderable ? indicatorStyle : undefined}
      className={cx(
        'rounded-xl border p-4 shadow-sm transition-all',
        // การ์ดที่กำลังลาก — ยกขึ้น (เงา+ขยาย) + ขอบประ ให้เห็นชัดว่า "คนนี้ถูกยกขึ้นมา"
        // (ใช้โทนเขียวเดียวกับ DragHandle ใน reorderControls.tsx ที่ย้ายมาใช้ zego-primary แล้ว)
        dragging
          ? 'scale-[1.02] zego-selected-border border-dashed zego-selected-tint opacity-90 shadow-lg ring-2 ring-[var(--zego-primary-300)]'
          : cx('zego-border-color', leader.active ? 'zego-surface-bg' : 'zego-surface-soft-bg'),
      )}
    >
      <div className="flex items-start gap-3">
        {reorderable ? (
          // จอแคบไม่พอให้อยู่บรรทัดเดียวกันแบบตาราง Desktop — ซ้อนแนวตั้งแทน กันชื่อถูกบีบจนขึ้นบรรทัดทีละตัวอักษร
          <div className="flex shrink-0 flex-col items-center gap-1">
            <RankInput
              key={no}
              rank={no}
              max={total ?? no}
              label={`ย้าย ${fullName(leader)} ไปอันดับที่`}
              onCommit={(next) => onJumpToRank?.(next)}
            />
            <DragHandle dragging={dragging} onPointerDown={(e) => onDragStart?.(e)} />
          </div>
        ) : (
          <span className="mt-1 text-xs font-semibold tabular-nums zego-text-tertiary">{no}</span>
        )}
        <div className="min-w-0 flex-1">
          <LeaderCell leader={leader} favorited={favorited} onToggleFavorite={onToggleFavorite} />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusCell
            leader={leader}
            jobs={jobs}
            availabilityRecords={availabilityRecords}
            today={today}
            canChangeStatus={canChangeStatus}
            onChangeStatus={onChangeStatus}
          />
          <RowMenu items={menuItems} label="จัดการหัวหน้าทัวร์" />
        </div>
      </div>

      <dl className="mt-3 space-y-2 zego-divider-top pt-3 text-sm">
        <CardRow label="โทร">
          <ContactCell leader={leader} />
        </CardRow>
        <CardRow label="ภาษา">
          <LanguageCell leader={leader} />
        </CardRow>
        <CardRow label="ประเทศ">
          <CountriesCell lines={expertiseLines(getExpertiseScopes(leader.id), countries)} />
        </CardRow>
        <CardRow label="ประสบการณ์">
          <span className="zego-text-secondary">
            {summary.totalMonths === 0 ? 'ยังไม่มีข้อมูล' : summary.label}
          </span>
        </CardRow>
      </dl>

      <div className="mt-3 flex items-center justify-end zego-divider-top pt-3">
        <Link
          href={`/leaders/${leader.id}`}
          className="rounded-lg px-3 py-1.5 text-xs font-medium zego-text-info border zego-border-color zego-hover-surface"
        >
          ดูรายละเอียด
        </Link>
      </div>
    </li>
  );
}

function CardRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-2">
      <dt className="w-24 shrink-0 zego-text-tertiary">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

/* ------------------------------ Skeleton Loading -------------------------- */

function LeaderTableSkeleton() {
  const rows = Array.from({ length: 8 });
  return (
    <>
      <div className="hidden w-full overflow-x-auto rounded-xl border zego-border-color zego-surface-bg shadow-sm lg:block">
        <table className="w-full min-w-[1020px] table-fixed text-sm">
          <thead>
            <tr className="border-b zego-border-color zego-surface-soft-bg text-left">
              {COLS.map((c) => (
                <th
                  key={c.key}
                  className={cx(
                    'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide zego-text-tertiary',
                    c.className,
                    c.center && 'text-center',
                  )}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--zego-border-soft)]">
            {rows.map((_, i) => (
              <tr key={i}>
                <td className="px-3 py-4">
                  <Bar className="mx-auto h-4 w-4" />
                </td>
                <td className="px-3 py-4">
                  {/* 3 บรรทัด — ให้ความสูงแถวตรงกับข้อมูลจริง (ชื่อ · ชื่อเล่น · รหัส+รูปแบบ) */}
                  <div className="flex items-center gap-3">
                    <Bar className="h-9 w-9 rounded-full" />
                    <div className="flex-1 space-y-1.5">
                      <Bar className="h-3.5 w-3/4" />
                      <Bar className="h-3 w-1/2" />
                      <Bar className="h-2.5 w-2/3" />
                    </div>
                  </div>
                </td>
                {COLS.slice(2).map((c) => (
                  <td key={c.key} className="px-3 py-4">
                    <Bar className="h-3.5 w-4/5" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-3 lg:hidden">
        {rows.slice(0, 4).map((_, i) => (
          <li key={i} className="rounded-xl border zego-border-color zego-surface-bg p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <Bar className="h-9 w-9 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Bar className="h-3.5 w-2/3" />
                <Bar className="h-3 w-1/3" />
                <Bar className="h-2.5 w-1/2" />
              </div>
            </div>
            <div className="mt-3 space-y-2 zego-divider-top pt-3">
              <Bar className="h-3 w-full" />
              <Bar className="h-3 w-3/4" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

function Bar({ className }: { className?: string }) {
  return <span className={cx('block animate-pulse rounded zego-skeleton', className)} />;
}

/* ------------------------------- Empty State ------------------------------ */

/** Empty state มาตรฐานของตารางนี้ */
export function LeaderTableEmpty({
  hasFilter,
  onReset,
  onAdd,
  onImport,
}: {
  hasFilter: boolean;
  onReset: () => void;
  onAdd?: () => void;
  onImport?: () => void;
}) {
  return (
    <EmptyState
      icon={hasFilter ? 'search' : 'users'}
      title={hasFilter ? 'ไม่พบหัวหน้าทัวร์ที่ตรงกับเงื่อนไข' : 'ยังไม่มีข้อมูลหัวหน้าทัวร์'}
      description={
        hasFilter
          ? 'ลองปรับคำค้นหาหรือล้างตัวกรอง แล้วค้นหาอีกครั้ง'
          : 'เพิ่มข้อมูลหัวหน้าทัวร์ใหม่ หรือนำเข้าข้อมูลจากไฟล์เพื่อเริ่มใช้งาน'
      }
      action={
        hasFilter ? (
          <Button variant="secondary" onClick={onReset}>
            ล้างตัวกรอง
          </Button>
        ) : onAdd || onImport ? (
          <div className="flex flex-wrap items-center justify-center gap-2">
            {onAdd && (
              <Button variant="primary" icon="plus" onClick={onAdd}>
                เพิ่มหัวหน้าทัวร์
              </Button>
            )}
            {onImport && (
              <Button variant="secondary" icon="download" onClick={onImport}>
                นำเข้าข้อมูล
              </Button>
            )}
          </div>
        ) : undefined
      }
    />
  );
}

/* ------------------------------ ช่องกรอกอันดับ ----------------------------- */

/**
 * ช่องกรอกเลขอันดับตอนลากจัดลำดับได้ — ใช้ค่าเริ่มต้น (uncontrolled) แล้วยืนยันตอนออกจากช่อง/กด Enter เท่านั้น
 * กันไม่ให้กรอกเลขสองหลัก (เช่น "15") แล้วกระโดดไปอันดับ 1 ก่อนตั้งแต่ยังพิมพ์ไม่จบ
 */
function RankInput({
  rank,
  max,
  label,
  onCommit,
}: {
  rank: number;
  max: number;
  label: string;
  onCommit: (next: number) => void;
}) {
  const commit = (raw: string) => {
    const next = Number(raw);
    if (Number.isFinite(next) && next >= 1 && next <= max && next !== rank) onCommit(next);
  };

  return (
    <input
      type="number"
      min={1}
      max={max}
      defaultValue={rank}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit(e.currentTarget.value);
          e.currentTarget.blur();
        }
      }}
      aria-label={label}
      className="w-11 shrink-0 rounded border zego-border-color py-1 text-center text-xs font-semibold tabular-nums zego-text-secondary"
    />
  );
}
