'use client';

/**
 * แท็บ "ภาพรวม" — Dashboard สรุปข้อมูลหัวหน้าทัวร์ (§4–§9)
 *
 * ⚠️ หน้าสรุปเท่านั้น — ดึงจากข้อมูลต้นทางจริงทั้งหมด ไม่มี state/ข้อมูลซ้ำ (§2/§12)
 *   ไม่มี Profile Header ในแท็บนี้ (§2) — ชื่อ/รหัส/ประเภท/สถานะ/ติดต่อ/คะแนนย่อ อยู่ที่ Profile Header ด้านบนของหน้าเท่านั้น
 *   Passport → Passport Book · โซน/ประเทศ/เส้นทาง+ภาษา/ทักษะ → ความเชี่ยวชาญ
 *   สถานะ/วันลา → Availability · งาน → Schedule (Assignment×Period) · คะแนน → แบบสอบถาม (useLeaderScoreSummary)
 *
 * Layout (3 แถว):
 *   ตัวเลขสรุป 4 ช่อง (แตะไปแท็บต้นทาง · จอเล็ก 4 ช่องแถวเดียวแบบย่อ)
 *   ตารางงานที่กำลังจะถึง | ปฏิทินความพร้อมรับงานและการลา | คะแนนและผลงาน
 *   ความเชี่ยวชาญ | ภาษาและทักษะ | เอกสารสำคัญ + ประสบการณ์และประวัติการทำงาน
 * จอเล็กเรียงตามลำดับเดียวกันเป็นคอลัมน์เดียว
 */

import 'flag-icons/css/flag-icons.min.css';
import { useMemo, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { useLeaderScoreSummary } from '@/lib/useLeaderScoreSummary';
import { Button, Card, Callout, cx, EmptyState, Pill, StatusBadge } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LEADER_STATUS, TOUR_SKILL_LEVEL } from '@/lib/labels';
import { diffDays, formatDate, formatDateTime } from '@/lib/format';
import { getExpertiseScopes } from '@/services/expertiseScopeStore';
import { getGroupExpertise } from '@/services/groupExpertiseStore';
import { groupExpertiseName, isAllGroups } from '@/lib/logic/groupExpertise';
import { zoneById } from '@/data/leaders/zoneMaster';
import { getTourLeaderById, getIdentityDocument } from '@/services/tourLeaderMaster';
import { getPassportBooks } from '@/services/passportBookStore';
import { isMasterPassportHidden } from '@/services/masterPassportHidden';
import { buildPassportCards, masterIdentityToCard } from '@/lib/logic/passportCardModel';
import { can } from '@/lib/permissions';
import { passportStatus, PASSPORT_STATUS_META, passportRemainingText } from '@/lib/logic/tourLeaderMaster';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { BOARD_STATUS, boardStatusFromAssignment } from '@/lib/logic/guideBoard';
import { resolveDestination } from '@/lib/logic/destinations';
import type { ExpertiseScope } from '@/lib/logic/expertiseScope';
import type { LeaderScoreSummary } from '@/lib/logic/leaderScoreSummary';
import type { TourLeader } from '@/types';

/**
 * ปุ่มไปยังแท็บต้นทาง (§2) — แสดงข้อความเมื่อการ์ดกว้างพอ (container query ของ SectionHead)
 * การ์ดแคบ (จอเล็ก / คอลัมน์แคบ) เหลือแค่ลูกศร — ไม่ให้ชื่อการ์ดถูกบีบจนตัดบรรทัด
 */
function GoTo({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button size="sm" variant="secondary" icon="chevronRight" aria-label={label} title={label} onClick={onClick}>
      <span className="hidden whitespace-nowrap @sm:inline">{label}</span>
    </Button>
  );
}

/** ลิงก์ข้อความสีเขียว + ลูกศร (ดูทั้งหมด / ดูปฏิทินการลา) */
function TextLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-emerald-700 hover:underline">
      {children}<Icon name="chevronRight" className="h-4 w-4" />
    </button>
  );
}

type Tone = 'green' | 'amber' | 'blue' | 'red' | 'slate';
const TONE_TILE: Record<Tone, { icon: string; value: string }> = {
  green: { icon: 'bg-emerald-50 text-emerald-600', value: 'text-emerald-700' },
  amber: { icon: 'bg-amber-50 text-amber-600', value: 'zego-text' },
  blue: { icon: 'bg-sky-50 text-sky-600', value: 'zego-text' },
  red: { icon: 'bg-red-50 text-red-600', value: 'text-red-700' },
  slate: { icon: 'zego-surface-soft-bg zego-text-secondary', value: 'zego-text' },
};

/** ตัวเลขสรุป 1 ช่อง — แตะเพื่อไปแท็บต้นทาง · จอเล็กย่อเป็นไอคอน + ค่า (ชื่อช่องอยู่ใน title/aria-label) */
function KpiTile({
  icon, tone, label, value, sub, footer, chevron, onClick,
}: { icon: IconName; tone: Tone; label: string; value: ReactNode; sub?: string; footer?: ReactNode; chevron?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="zego-card-surface flex min-w-0 flex-col items-center gap-1.5 px-1.5 py-2.5 text-center transition hover:ring-1 hover:ring-emerald-200 sm:flex-row sm:gap-3.5 sm:px-4 sm:py-4 sm:text-left"
    >
      <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-xl sm:h-12 sm:w-12', TONE_TILE[tone].icon)}>
        <Icon name={icon} className="h-5 w-5 sm:h-6 sm:w-6" />
      </span>
      <span className="flex w-full min-w-0 flex-col sm:flex-1">
        <span className="hidden truncate text-sm zego-text-tertiary sm:block">{label}</span>
        <span className={cx('truncate text-[11px] font-semibold sm:text-xl', TONE_TILE[tone].value)}>{value}</span>
        {sub && <span className="hidden truncate text-xs zego-text-tertiary sm:block">{sub}</span>}
        {footer}
      </span>
      {chevron && <Icon name="chevronRight" className="hidden h-4 w-4 shrink-0 zego-text-tertiary sm:block" />}
    </button>
  );
}

/** หัวการ์ด — ไอคอน + ชื่อ (+ คำอธิบาย) ทางซ้าย ปุ่ม/ลิงก์ทางขวา */
function SectionHead({ icon, title, description, action }: { icon: IconName; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="@container mb-3 flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-semibold zego-text @sm:text-base">
          <Icon name={icon} className="h-5 w-5 shrink-0 text-emerald-600" />{title}
        </h2>
        {description && <p className="mt-0.5 text-sm zego-text-secondary">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** ดาว 5 ดวง เติมตามสัดส่วน (เช่น 4.7 = 4 ดวงเต็ม + ดวงที่ 5 เติม 70%) */
function Stars({ value, className = 'h-4 w-4' }: { value: number; className?: string }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value.toFixed(1)} จาก 5 ดาว`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-flex">
            <Icon name="star" className={cx(className, 'text-amber-200')} filled />
            <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Icon name="star" className={cx(className, 'text-amber-400')} filled />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** ธงประเทศ (flag-icons — Windows แสดงธงแบบ emoji ไม่ได้) · หาไม่เจอ = ไอคอนเครื่องบิน */
function Flag({ alpha2 }: { alpha2?: string }) {
  return alpha2
    ? <span className={`fi fi-${alpha2} shrink-0 rounded-sm shadow-sm`} style={{ width: 28, height: 20 }} aria-hidden="true" />
    : <span className="flex h-5 w-7 shrink-0 items-center justify-center zego-text-tertiary"><Icon name="plane" className="h-4 w-4" /></span>;
}

const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** กล่องวันที่ของงาน: '08-11' / 'ต.ค. 26' · ข้ามเดือน → 'ต.ค.–พ.ย. 26' (ปี ค.ศ. 2 หลัก ตามมาตรฐาน DD/MM/YY) */
function dateBlock(start: string, end: string): { days: string; month: string } {
  const [sy, sm, sd] = start.split('-');
  const [ey, em, ed] = end.split('-');
  const mStart = TH_MONTHS_SHORT[Number(sm) - 1];
  const mEnd = TH_MONTHS_SHORT[Number(em) - 1];
  return {
    days: start === end ? sd : `${sd}-${ed}`,
    month: sm === em && sy === ey ? `${mStart} ${sy.slice(-2)}` : `${mStart}–${mEnd} ${ey.slice(-2)}`,
  };
}

/* ------------------------------ ปฏิทินความพร้อมรายเดือน ------------------------------ */

const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];
type DayKind = 'job' | 'leave' | 'free';
const DAY_STYLE: Record<DayKind, string> = {
  job: 'bg-emerald-600 font-semibold text-white',
  leave: 'bg-amber-100 font-semibold text-amber-800',
  free: 'zego-text-secondary',
};

/**
 * ปฏิทิน 1 เดือน — มีงาน (ทริปที่มอบหมาย) / ลา·ไม่พร้อม (วันลาที่อนุมัติแล้ว) / ว่างงาน
 * วันที่มีทั้งงานและวันลา นับเป็นมีงาน · วันนี้มีกรอบ
 */
function MonthCalendar({ month, today, kindOf, onPrev, onNext }: {
  month: string; // 'YYYY-MM'
  today: string;
  kindOf: (iso: string) => DayKind;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const count = new Date(y, m, 0).getDate();
  const days = Array.from({ length: count }, (_, i) => `${month}-${String(i + 1).padStart(2, '0')}`);
  const kinds = days.map(kindOf);
  const total = (k: DayKind) => kinds.filter((x) => x === k).length;
  const nav = 'rounded-lg p-1 zego-text-secondary zego-hover-surface';
  return (
    <div>
      <div className="mb-2 flex items-center justify-between rounded-lg zego-surface-soft-bg px-2 py-1">
        <button type="button" onClick={onPrev} aria-label="เดือนก่อนหน้า" className={nav}><Icon name="chevronLeft" className="h-4 w-4" /></button>
        <span className="text-sm font-semibold zego-text">{TH_MONTHS_FULL[m - 1]} {y}</span>
        <button type="button" onClick={onNext} aria-label="เดือนถัดไป" className={nav}><Icon name="chevronRight" className="h-4 w-4" /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {WEEKDAYS.map((d) => <span key={d} className="py-1 zego-text-tertiary">{d}</span>)}
        {Array.from({ length: lead }, (_, i) => <span key={`b${i}`} />)}
        {days.map((iso, i) => (
          <span
            key={iso}
            className={cx('flex h-8 items-center justify-center rounded-lg tabular-nums', DAY_STYLE[kinds[i]], iso === today && 'ring-2 ring-emerald-500 ring-offset-1')}
          >
            {i + 1}
          </span>
        ))}
      </div>
      <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs zego-text-secondary">
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600" />มีงาน ({total('job')} วัน)</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm border zego-border-color" />ว่างงาน ({total('free')} วัน)</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-300" />ลา / ไม่พร้อม ({total('leave')} วัน)</span>
      </p>
    </div>
  );
}

/* ------------------------------ กราฟ (SVG ล้วน — ไม่มีไลบรารีกราฟในโปรเจกต์) ------------------------------ */

/** แนวโน้มคะแนนรายเดือน (เต็ม 5) — เดือนที่ไม่มีผลประเมินไม่มีจุด และเส้นข้ามไป */
function TrendLine({ monthly }: { monthly: LeaderScoreSummary['monthly'] }) {
  const W = 260;
  const H = 120;
  const pad = { l: 22, r: 8, t: 8, b: 20 };
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / Math.max(1, monthly.length - 1);
  const y = (v: number) => pad.t + ((5 - v) * (H - pad.t - pad.b)) / 5;
  const pts = monthly.map((m, i) => (m.avg === null ? null : { x: x(i), y: y(m.avg) })).filter((p): p is { x: number; y: number } => !!p);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-32 w-full" role="img" aria-label="แนวโน้มคะแนนรายเดือน">
      {[0, 2.5, 5].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="stroke-[var(--zego-border-soft)]" strokeDasharray="3 3" />
          <text x={pad.l - 5} y={y(v) + 3} textAnchor="end" className="fill-[var(--zego-text-tertiary)] text-[9px]">{v}</text>
        </g>
      ))}
      {pts.length > 1 && <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#16a34a" strokeWidth="2" />}
      {pts.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="3.5" fill="#16a34a" className="stroke-white" strokeWidth="1.5" />)}
      {monthly.map((m, i) => (
        <text key={m.month} x={x(i)} y={H - 4} textAnchor="middle" className="fill-[var(--zego-text-tertiary)] text-[9px]">
          {TH_MONTHS_SHORT[Number(m.month.slice(5)) - 1]}
        </text>
      ))}
    </svg>
  );
}

/** แท่งสัดส่วนแนวนอน: (ธง) · ชื่อ · แท่ง · % — ธงเฉพาะแบบแยกตามประเทศ (key = ISO alpha-2) */
function ShareBars({ items, withFlag = false }: { items: { key: string; label: string; pct: number }[]; withFlag?: boolean }) {
  return (
    <ul className="space-y-2">
      {items.map((it, i) => (
        <li key={it.key} className={cx('grid items-center gap-3 text-sm', withFlag ? 'grid-cols-[1.75rem_5rem_minmax(0,1fr)_2.5rem]' : 'grid-cols-[6rem_minmax(0,1fr)_2.5rem]')}>
          {withFlag && <Flag alpha2={/^[A-Z]{2}$/.test(it.key) ? it.key.toLowerCase() : undefined} />}
          <span className="truncate zego-text-secondary">{it.label}</span>
          <span className="h-3.5 overflow-hidden rounded zego-surface-soft-bg">
            <span className={cx('block h-full rounded', i === 0 ? 'bg-emerald-600' : i === 1 ? 'bg-emerald-400' : 'bg-slate-300')} style={{ width: `${it.pct}%` }} />
          </span>
          <span className="text-right tabular-nums zego-text-secondary">{it.pct}%</span>
        </li>
      ))}
    </ul>
  );
}

/** ธงของภาษา (ประเทศหลักที่ใช้ภาษานั้น) — ไม่รู้จัก = ไอคอนแชต */
const LANGUAGE_FLAG: Record<string, string> = { EN: 'gb', JA: 'jp', KO: 'kr', ZH: 'cn', VI: 'vn', FR: 'fr', IT: 'it', DE: 'de', RU: 'ru', ES: 'es', TH: 'th' };

/** ระยะเวลาเป็น "X ปี Y เดือน" */
function durationText(from: string, to: string): string {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  if (months < 0) months = 0;
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (y === 0 && m === 0) return 'ไม่ถึง 1 เดือน';
  return [y > 0 ? `${y} ปี` : '', m > 0 ? `${m} เดือน` : ''].filter(Boolean).join(' ');
}

export function LeaderOverviewTab({
  leader,
  onGoTab,
}: {
  leader: TourLeader;
  /** เปิดแท็บต้นทาง (§2) */
  onGoTab: (tab: string) => void;
}) {
  const router = useRouter();
  const { countries, availabilityRecords, today, currentUser } = useDemo();
  const [showAllScopes, setShowAllScopes] = useState(false);
  const [shareBy, setShareBy] = useState<'region' | 'country' | 'route'>('region');
  const [calMonth, setCalMonth] = useState(today.slice(0, 7));
  const shiftMonth = (n: number) => setCalMonth((cur) => {
    const [y, m] = cur.split('-').map(Number);
    const d = new Date(y, m - 1 + n, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  /* ---------------- ความเชี่ยวชาญ (§4) — จาก Expertise Scope ---------------- */
  const scopes = useMemo(() => getExpertiseScopes(leader.id), [leader.id]);
  const groupCodes = useMemo(() => getGroupExpertise(leader.id), [leader.id]);
  const countryName = (id: string | null) => (id ? (countries.find((c) => c.id === id)?.nameEn ?? id) : '');
  const countryNameTh = (id: string | null) => (id ? (countries.find((c) => c.id === id)?.nameTh || countryName(id)) : '');

  /* ---------------- งานจาก Schedule (§6) + วันลา ---------------- */
  const work = useMemo(() => {
    const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
    const mine = loadActiveGuideAssignments()
      .filter((a) => a.tourLeaderId === leader.id)
      .map((a) => periodById.get(a.periodId))
      .filter((p): p is NonNullable<typeof p> => !!p);

    const year = today.slice(0, 4);
    const month = today.slice(0, 7);
    const thisMonth = mine.filter((p) => p.startDate.slice(0, 7) === month || p.endDate.slice(0, 7) === month);
    const thisYear = mine.filter((p) => p.startDate.slice(0, 4) === year);
    const approved = availabilityRecords.filter((r) => r.leaderId === leader.id && r.approval === 'approved');
    // งานล่าสุด = ทริปที่จบแล้วล่าสุด
    const lastJob = mine.filter((p) => p.endDate < today).sort((a, b) => b.endDate.localeCompare(a.endDate))[0] ?? null;
    return { mine, thisMonth, thisYear, approved, lastJob };
  }, [leader.id, today, availabilityRecords]);
  const dayKind = (iso: string) =>
    work.mine.some((p) => p.startDate <= iso && p.endDate >= iso) ? 'job' as const
      : work.approved.some((r) => r.startDate <= iso && r.endDate >= iso) ? 'leave' as const
        : 'free' as const;

  /* ---------------- ตารางงานที่กำลังจะถึง (§7) — งานปัจจุบัน + อนาคต พร้อมสถานะการจัด (การ์ดแสดง 5 รายการแรก) ---------------- */
  const upcomingJobs = useMemo(() => {
    const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
    return loadActiveGuideAssignments()
      .filter((a) => a.tourLeaderId === leader.id)
      .map((a) => {
        const p = periodById.get(a.periodId);
        if (!p) return null;
        return { id: a.assignmentId, period: p, board: boardStatusFromAssignment(a.assignmentStatus) };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .filter((x) => x.period.endDate >= today) // ยังไม่จบ (กำลังเดินทาง/กำลังจะถึง)
      .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  }, [leader.id, today]);

  /* ---------------- คะแนน (§7) — จากแบบสอบถาม × ประวัติงานจริง (เต็ม 5) ---------------- */
  const scores = useLeaderScoreSummary(leader.id);

  /* ---------------- Passport / เอกสาร (§8) ---------------- */
  /* เอกสารประจำตัวเป็นข้อมูลอ่อนไหว — ตรวจสิทธิ์ก่อนรวมเอกสารจาก documentStore */
  const canViewIdentity = can(currentUser.role, 'passport.view');
  const documents = useLeaderDocumentsView(leader, canViewIdentity);
  /*
    วันหมดอายุต้องมาจากเล่มหลักชุดเดียวกับแท็บ "เอกสารประจำตัว"
    เดิมอ่าน getPassportExpiry ซึ่งมาจากไฟล์นำเข้าอย่างเดียว — เพิ่ม/ต่ออายุเล่มในระบบแล้ว
    หน้านี้ยังค้างวันเดิม (ค่าจากไฟล์นำเข้าถูกรวมอยู่ใน buildPassportCards อยู่แล้ว)
  */
  const passExpiry = useMemo(() => {
    const books = canViewIdentity ? getPassportBooks(leader.id) : [];
    const master = canViewIdentity && !isMasterPassportHidden(leader.id)
      ? masterIdentityToCard(getTourLeaderById(leader.id), getIdentityDocument(leader.id, canViewIdentity), today)
      : null;
    const cards = buildPassportCards(books, master, today);
    const primary = cards.find((c) => c.isPrimary) ?? cards[0] ?? null;
    return primary?.fields.expiryDate || null;
  }, [leader.id, today, canViewIdentity]);
  const passSt = passportStatus(passExpiry, today);
  const passDaysLeft = passExpiry ? diffDays(today, passExpiry) : null;
  const docsExpiring = documents.filter((d) => {
    if (!d.expiresAt) return false;
    const left = diffDays(today, d.expiresAt);
    return left >= 0 && left <= 120;
  });
  const docsExpired = documents.filter((d) => d.expiresAt && diffDays(today, d.expiresAt) < 0);

  /*
    หมวด customer_group แสดงเป็น "ประเภทกรุ๊ปที่ถนัด" ในการ์ดความเชี่ยวชาญอยู่แล้ว
    การ์ดนี้จึงต้องเหลือเฉพาะ work_skill ให้ตรงกับแท็บ "ความเชี่ยวชาญและทักษะ"
  */
  const workSkills = leader.tourSkills.filter((s) => s.category === 'work_skill');

  const scopeLines = showAllScopes ? scopes : scopes.slice(0, 4);
  const hiddenScopes = scopes.length - scopeLines.length;
  // ประเทศที่เชี่ยวชาญ — นับเป็น "ประเทศ" ได้เมื่อทุกบรรทัดระบุประเทศ (บรรทัด "ทุกประเทศในโซน" นับเป็นรายการ)
  const scopeUnit = scopes.every((s) => s.countryScope !== 'all_zone_countries') ? 'ประเทศ' : 'รายการ';
  const scopeNames = scopes.map((s) => (s.countryScope === 'all_zone_countries' ? zoneById(s.zoneId ?? '')?.nameEn ?? 'ทุกโซน' : countryNameTh(s.countryId)));
  // อัปเดตสถานะรับงานล่าสุด — รายการล่าสุดของประวัติหมวดความพร้อม (ไม่มี = วันแก้ไขโปรไฟล์ล่าสุด)
  const statusUpdatedAt = leader.auditLog.find((a) => a.category === 'workStatus')?.at ?? leader.updatedAt;
  const shareItems = scores.share[shareBy];

  /** 1 บรรทัดของความเชี่ยวชาญ: โซน (ทุกประเทศ) หรือ ประเทศ (เส้นทาง) + Tag หลัก (§4) */
  const ScopeLine = ({ s }: { s: ExpertiseScope }) => {
    const zone = s.zoneId ? zoneById(s.zoneId) : null;
    const allCountries = s.countryScope === 'all_zone_countries';
    const routes = s.routeScope === 'all_routes' ? 'ทุกเส้นทาง' : s.routeCodes.join(', ');
    return (
      <li className="rounded-lg border zego-border-color px-3 py-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {allCountries ? (
            <>
              <span className="zego-text-secondary">{zone?.nameEn ?? 'ทุกโซน'}</span>
              {s.isPrimaryZone && <Pill tone="blue">โซนหลัก</Pill>}
              <span className="text-xs zego-text-tertiary">ทุกประเทศ ({routes})</span>
            </>
          ) : (
            <>
              <span className="font-semibold zego-text">{countryName(s.countryId)}</span>
              {s.isPrimaryCountry && <Pill tone="green">ประเทศหลัก</Pill>}
              <span className="text-xs zego-text-tertiary">({routes})</span>
            </>
          )}
        </p>
        {s.primaryRouteCodes.length > 0 && (
          <p className="mt-1 flex flex-wrap items-center gap-1">
            {s.primaryRouteCodes.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-mono font-semibold zego-badge--warning">
                {c} <span className="font-sans font-normal">เส้นทางหลัก</span>
              </span>
            ))}
          </p>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ============ แถว 1: ตัวเลขสรุป 4 ช่อง — แตะเพื่อไปแท็บต้นทาง · จอเล็ก 4 ช่องแถวเดียว ============ */}
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
        <KpiTile
          icon="briefcase"
          tone={leader.status === 'available' ? 'green' : 'slate'}
          label="สถานะรับงาน"
          value={LEADER_STATUS[leader.status].label}
          sub={statusUpdatedAt ? `อัปเดตล่าสุด ${formatDateTime(statusUpdatedAt)}` : undefined}
          onClick={() => onGoTab('status')}
        />
        <KpiTile
          icon="calendar"
          tone="amber"
          label="งานที่กำลังจะถึง"
          value={`${upcomingJobs.length} กรุ๊ป`}
          sub={`เดือนนี้ ${work.thisMonth.length} | ทั้งปี ${work.thisYear.length}`}
          onClick={() => onGoTab('schedule')}
        />
        <KpiTile
          icon="mapPin"
          tone="blue"
          label="ประเทศที่เชี่ยวชาญ"
          value={`${scopes.length} ${scopeUnit}`}
          footer={scopeNames.length > 0 && (
            <span className="mt-1 hidden flex-wrap gap-1 sm:flex">
              {scopeNames.slice(0, 3).map((n, i) => <span key={i} className="rounded-md zego-surface-soft-bg px-2 py-0.5 text-[11px] zego-text-secondary">{n}</span>)}
              {scopeNames.length > 3 && <span className="px-1 text-[11px] zego-text-tertiary">+{scopeNames.length - 3}</span>}
            </span>
          )}
          onClick={() => onGoTab('skills')}
        />
        <KpiTile
          icon="file"
          tone={passSt === 'EXPIRED' ? 'red' : 'amber'}
          label="Passport คงเหลือ"
          value={passDaysLeft === null ? '—' : passDaysLeft < 0 ? 'หมดอายุแล้ว' : `${passDaysLeft} วัน`}
          sub={passExpiry ? `หมดอายุ ${formatDate(passExpiry)}` : undefined}
          chevron
          onClick={() => onGoTab('idDocs')}
        />
      </div>

      {/* ============ แถว 2: ตารางงาน | ปฏิทินความพร้อม | คะแนน ============ */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,0.9fr)]">
        {/* ---- ตารางงานที่กำลังจะถึง ---- */}
        <Card className="lg:col-span-2 xl:col-span-1">
          <SectionHead
            icon="plane"
            title="ตารางงานที่กำลังจะถึง"
            action={upcomingJobs.length > 0 && <TextLink onClick={() => onGoTab('schedule')}>ดูทั้งหมด ({upcomingJobs.length})</TextLink>}
          />
          {upcomingJobs.length === 0 ? (
            <EmptyState
              icon="calendar"
              title="ยังไม่มีงานที่กำลังจะถึง"
              description="เมื่อจัดงานให้หัวหน้าทัวร์รายนี้ในหน้าการจัดสเก็ต จะแสดงที่นี่"
              action={<Button size="sm" variant="secondary" icon="calendar" onClick={() => router.push(`/jobs?leader=${leader.id}`)}>ไปหน้าการจัดสเก็ต</Button>}
            />
          ) : (
            <ul className="space-y-2">
              {upcomingJobs.slice(0, 5).map(({ id, period, board }, i) => {
                const block = dateBlock(period.startDate, period.endDate);
                const route = [period.departureAirportCode, period.arrivalAirportCode].filter(Boolean).join(' → ') || period.route;
                return (
                  // จอเล็กแสดง 3 รายการแรก
                  <li key={id} className={cx(i >= 3 && 'max-sm:hidden')}>
                    <button
                      type="button"
                      onClick={() => onGoTab('schedule')}
                      className="flex w-full items-center gap-3 rounded-xl border border-l-4 zego-border-color border-l-emerald-500 px-3 py-2.5 text-left transition zego-hover-surface"
                    >
                      <span className="w-14 shrink-0 rounded-lg zego-surface-soft-bg px-1 py-1.5 text-center tabular-nums sm:w-16">
                        <span className="block text-sm font-semibold zego-text">{block.days}</span>
                        <span className="block text-xs zego-text-secondary">{block.month}</span>
                      </span>
                      <Flag alpha2={resolveDestination(period.countryName, period.groupCode).alpha2} />
                      <span className="min-w-0 flex-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-semibold zego-text">{period.groupCode}</span>
                          {period.startDate <= today && period.endDate >= today && <Pill tone="green">กำลังเดินทาง</Pill>}
                        </span>
                        <span className="block truncate text-xs zego-text-tertiary">{route || (period.countryName || '—').toUpperCase()}</span>
                        {period.displayName && <span className="hidden truncate text-xs zego-text-tertiary sm:block">{period.displayName}</span>}
                      </span>
                      {/* สถานะ — จอเล็กไม่แสดง (เหลือลูกศร) */}
                      <span className="hidden shrink-0 sm:block">{board ? <StatusBadge meta={BOARD_STATUS[board]} size="sm" /> : <span className="zego-text-disabled">—</span>}</span>
                      <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-tertiary" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ---- ความพร้อมรับงานและการลา — ปฏิทินรายเดือน ---- */}
        <Card>
          <SectionHead
            icon="calendar"
            title="ความพร้อมรับงานและการลา"
            action={<GoTo label="จัดการการลา" onClick={() => onGoTab('leave')} />}
          />
          <MonthCalendar month={calMonth} today={today} kindOf={dayKind} onPrev={() => shiftMonth(-1)} onNext={() => shiftMonth(1)} />
        </Card>

        {/* ---- คะแนนและประวัติผลงาน ---- */}
        <Card>
          <SectionHead
            icon="star"
            title="คะแนนและประวัติผลงาน"
            action={<GoTo label="ดูประวัติผลงาน" onClick={() => onGoTab('tourJobs')} />}
          />
          {scores.reviews === 0 ? (
            <EmptyState
              icon="star"
              title="ยังไม่มีข้อมูลคะแนน"
              description={scores.groups > 0
                ? `เดินทางแล้ว ${scores.groups} กรุ๊ป — ยังไม่มีแบบสอบถามตอบกลับ`
                : 'เมื่อมีกรุ๊ปที่เดินทางแล้วและมีแบบสอบถาม จะสรุปที่นี่'}
            />
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-4xl font-bold tabular-nums zego-text">{scores.overall!.toFixed(1)}<span className="text-base font-normal zego-text-tertiary"> / 5.0</span></p>
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  <Stars value={scores.overall!} className="h-5 w-5" />
                  <span className="text-xs zego-text-tertiary">จาก {scores.reviews} รีวิว</span>
                </p>
              </div>
              <ul className="space-y-1.5 text-xs">
                {scores.stars.map((s) => (
                  <li key={s.star} className="grid grid-cols-[2rem_minmax(0,1fr)_2.5rem] items-center gap-2">
                    <span className="inline-flex items-center gap-0.5 zego-text-secondary">{s.star}<Icon name="star" className="h-3 w-3 text-amber-400" filled /></span>
                    <span className="h-2 overflow-hidden rounded-full zego-surface-soft-bg">
                      <span className={cx('block h-full rounded-full', s.star >= 4 ? 'bg-emerald-500' : s.star === 3 ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${s.pct}%` }} />
                    </span>
                    <span className="text-right tabular-nums zego-text-secondary">{s.pct}%</span>
                  </li>
                ))}
              </ul>
              <div className="rounded-xl border zego-border-color p-3">
                <p className="mb-1 text-xs font-semibold zego-text">แนวโน้มคะแนนรายเดือน</p>
                <TrendLine monthly={scores.monthly} />
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ============ แถว 3: ความเชี่ยวชาญ | ภาษาและทักษะ | (เอกสารสำคัญ + ประสบการณ์) ============ */}
      <div className="grid gap-4 sm:gap-5 lg:grid-cols-2 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)_minmax(0,1.1fr)]">
        {/* ---- ประเทศและเส้นทางที่เชี่ยวชาญ (§5) ---- */}
        <Card>
          <SectionHead
            icon="mapPin"
            title="ประเทศและเส้นทางที่เชี่ยวชาญ"
            action={<GoTo label="จัดการความเชี่ยวชาญ" onClick={() => onGoTab('skills')} />}
          />
          {/* §5 ประเภทกรุ๊ปที่ถนัด — ย้ายมาจาก Profile Header เดิม (เป็นข้อมูลด้านความเชี่ยวชาญ) */}
          {groupCodes.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-medium zego-text-tertiary">ประเภทกรุ๊ปที่ถนัด:</span>
              {isAllGroups(groupCodes)
                ? <Pill tone="green">ทุกประเภท</Pill>
                : groupCodes.map((c) => <Pill key={c} tone="blue">{groupExpertiseName(c)}</Pill>)}
            </div>
          )}
          {/* สัดส่วนประสบการณ์จริง — จากกรุ๊ปที่เดินทางแล้ว (ไม่มีประวัติ = แสดงเฉพาะที่ระบุไว้) */}
          {scores.groups > 0 && (
            <div className="mb-4">
              <div className="mb-3 flex gap-1 border-b zego-border-color" role="tablist" aria-label="สัดส่วนตาม">
                {([['region', 'ตามภูมิภาค'], ['country', 'ตามประเทศ'], ['route', 'ตามเส้นทาง']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    role="tab"
                    aria-selected={shareBy === k}
                    onClick={() => setShareBy(k)}
                    className={cx('-mb-px border-b-2 px-3 py-1.5 text-sm transition', shareBy === k ? 'border-emerald-600 font-semibold text-emerald-700' : 'border-transparent zego-text-secondary hover:text-emerald-700')}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {shareItems.length === 0
                ? <p className="text-xs zego-text-disabled">ยังไม่มีข้อมูลเส้นทาง</p>
                : <ShareBars items={shareItems} withFlag={shareBy === 'country'} />}
              <p className="mt-2 text-[11px] zego-text-tertiary">สัดส่วนจาก {scores.groups} กรุ๊ปที่เดินทางแล้ว</p>
            </div>
          )}
          {scopes.length === 0 ? (
            <EmptyState icon="plane" title="ยังไม่ระบุโซน ประเทศ หรือเส้นทาง" description="เพิ่มได้ที่แท็บความเชี่ยวชาญและทักษะ" />
          ) : (
            <>
              {scores.groups > 0 && <p className="mb-2 text-xs font-medium zego-text-tertiary">ที่ระบุไว้</p>}
              <ul className="space-y-2">{scopeLines.map((s) => <ScopeLine key={s.id} s={s} />)}</ul>
              {hiddenScopes > 0 && (
                <button type="button" onClick={() => setShowAllScopes(true)} className="mt-2 text-xs font-medium zego-text-info hover:underline">
                  อีก {hiddenScopes} รายการ
                </button>
              )}
            </>
          )}
        </Card>

        {/* ---- ภาษาและทักษะ (§6) ---- */}
        <Card>
          <SectionHead
            icon="chat"
            title="ภาษาและทักษะ"
            description={`${leader.languages.length} ภาษา · ${workSkills.length} ทักษะ`}
            action={<GoTo label="จัดการทักษะ" onClick={() => onGoTab('skills')} />}
          />
          <p className="mb-2 text-sm font-semibold zego-text">ภาษา</p>
          {leader.languages.length === 0 ? (
            <p className="mb-4 text-sm zego-text-disabled">ไม่มีข้อมูล</p>
          ) : (
            <ul className="mb-4 space-y-2">
              {leader.languages.map((l) => (
                <li key={l.id} className="flex items-center gap-3 rounded-xl bg-sky-50/70 px-3 py-2.5">
                  <Flag alpha2={LANGUAGE_FLAG[l.languageCode]} />
                  <span className="leading-tight">
                    <span className="block text-sm font-semibold zego-text">{l.languageName}{!l.isNativeLanguage && <span className="ml-1">{l.levelCode}</span>}</span>
                    <span className="block text-xs zego-text-tertiary">{l.isNativeLanguage ? 'ภาษาแม่' : l.levelName}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mb-2 text-sm font-semibold zego-text">ทักษะอื่น ๆ</p>
          {workSkills.length === 0 ? (
            <p className="text-sm zego-text-disabled">ไม่มีข้อมูล</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {workSkills.map((s) => (
                <span key={s.id} title={TOUR_SKILL_LEVEL[s.level].label} className="inline-flex items-center gap-1 rounded-full border border-emerald-200 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <Icon name="check" className="h-3.5 w-3.5" />{s.name}
                </span>
              ))}
            </div>
          )}
        </Card>

        <div className="flex flex-col gap-4 sm:gap-5 lg:col-span-2 xl:col-span-1">
          {/* ---- เอกสารสำคัญและวันหมดอายุ (§9) — แสดงเฉพาะสถานะ ไม่แสดงเลข Passport ---- */}
          <Card>
            <SectionHead
              icon="file"
              title="เอกสารสำคัญและวันหมดอายุ"
              action={<GoTo label="ดูเอกสารและ Passport" onClick={() => onGoTab('idDocs')} />}
            />
            {(passSt === 'EXPIRED' || passSt.startsWith('EXPIRING')) && (
              <div className="mb-3">
                <Callout tone={passSt === 'EXPIRED' ? 'red' : 'amber'} title={`หนังสือเดินทาง: ${PASSPORT_STATUS_META[passSt].label}`}>
                  {passportRemainingText(passExpiry, today)}
                </Callout>
              </div>
            )}
            <dl className="divide-y divide-[var(--zego-border-soft)] text-sm">
              <div className="flex items-center gap-3 pb-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600"><Icon name="file" className="h-5 w-5" /></span>
                <dt className="flex flex-1 flex-wrap items-center gap-2 font-medium zego-text">Passport <StatusBadge meta={PASSPORT_STATUS_META[passSt]} size="sm" /></dt>
                <dd className="text-right text-xs zego-text-secondary">
                  {passExpiry ? `หมดอายุ ${formatDate(passExpiry)}` : '—'}
                  {passDaysLeft !== null && passDaysLeft >= 0 && <span className="block zego-text-tertiary">(เหลือ {passDaysLeft} วัน)</span>}
                </dd>
              </div>
              <div className="flex items-center gap-3 pt-2.5">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg zego-surface-soft-bg zego-text-secondary"><Icon name="list" className="h-5 w-5" /></span>
                <dt className="flex-1 font-medium zego-text">เอกสารทั้งหมด</dt>
                <dd className="flex flex-wrap items-center justify-end gap-1.5 text-xs zego-text-secondary">
                  {docsExpiring.length > 0 && <Pill tone="amber">ใกล้หมดอายุ {docsExpiring.length}</Pill>}
                  {docsExpired.length > 0 && <Pill tone="red">หมดอายุ {docsExpired.length}</Pill>}
                  {documents.length} รายการ
                </dd>
              </div>
            </dl>
          </Card>

          {/* ---- ประสบการณ์และประวัติการทำงาน — ประสบการณ์นับจากวันเริ่มร่วมงาน ---- */}
          <Card className="flex-1">
            <SectionHead
              icon="briefcase"
              title="ประสบการณ์และประวัติการทำงาน"
              action={<TextLink onClick={() => onGoTab('tourJobs')}>ดูทั้งหมด</TextLink>}
            />
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 text-sm">
              <div>
                <p className="text-xs zego-text-tertiary">ประสบการณ์รวม</p>
                <p className="text-lg font-semibold zego-text">{leader.joinedAt ? durationText(leader.joinedAt, today) : '—'}</p>
                {leader.joinedAt && <p className="text-[11px] zego-text-tertiary">เริ่มร่วมงาน {formatDate(leader.joinedAt)}</p>}
              </div>
              <button type="button" onClick={() => onGoTab('tourJobs')} className="flex min-w-0 items-center gap-2 border-l zego-border-color pl-3 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block text-xs zego-text-tertiary">งานล่าสุด</span>
                  {work.lastJob ? (
                    <>
                      <span className="block truncate font-semibold zego-text">{work.lastJob.groupCode}{work.lastJob.displayName ? ` · ${work.lastJob.displayName}` : ''}</span>
                      <span className="block text-xs zego-text-tertiary">{formatDate(work.lastJob.startDate)} - {formatDate(work.lastJob.endDate)}</span>
                    </>
                  ) : <span className="block zego-text-disabled">ยังไม่มีงานที่จบแล้ว</span>}
                </span>
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-tertiary" />
              </button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
