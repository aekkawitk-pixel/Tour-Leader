'use client';

/**
 * ตารางจัดหัวหน้าทัวร์ (Guide Schedule Timeline) — มุมมองแบบ Excel ZEGO บนฐานข้อมูลจริง
 *
 * • 1 แถว = หัวหน้าทัวร์ 1 คน · คอลัมน์ซ้าย Sticky (ข้อมูลคน) · วันที่ 1–N แนวนอน Sticky ด้านบน (§1)
 * • งาน = แถบต่อเนื่องตามช่วงวัน-เวลา · แสดง Group Code · สีพื้นตามสถานะการจัด (§2/§3)
 * • วันลา/ไม่พร้อม/ติดงาน = แถบลายต่างจากงาน (§4) · คลิกช่องว่างเพื่อจัดงาน (§5) · ลากเปลี่ยนหัวหน้าทัวร์ (§6)
 * • ตรวจงานชน + เวลาพัก (Buffer) อัตโนมัติ (§7) · คลิกแถบเปิด Side Panel รายละเอียด (§8)
 *
 * ข้อมูลทั้งหมดมาจาก store (TourJob / LeaderAvailabilityRecord) — ไม่ใช่ Spreadsheet อิสระ (§12)
 * Timeline สร้างจาก Assignment + Unavailability สด · ไม่แก้วันเดินทางจากที่นี่ (มาจากพีเรียดจริง §2)
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import {
  addDays, addMonths, daysBetween, diffDays, endOfMonth, formatDate, formatDateRange, formatDateTime,
  formatThaiMonthYear, parseDate, startOfMonth, TH_WEEKDAYS_SHORT,
} from '@/lib/format';
import { Button, Callout, Card, cx, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { DateInputBase } from '@/components/ui/DateInput';
import { useWideContent } from '@/components/layout/AppShell';
import { Icon } from '@/components/ui/Icon';
import { Drawer, Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SearchBox } from '@/components/ui/FormField';
import { nextMonthStart, nextMonthStartFromNow } from '@/components/ui/MonthPicker';
import { LEADER_STATUS } from '@/lib/labels';
import { recordTypeLabel, formatRecordSchedule } from '@/lib/logic/availabilityStatus';
import { leaderUnavailability } from '@/lib/logic/leaderAvailability';
import { UNAVAILABLE_LEADER_STATUSES } from '@/lib/logic/leaderJobs';
import { routeCodeFromGroupCode } from '@/lib/logic/groupScore';
import { countryLabel, departsWithin, matchesQuery } from '@/lib/logic/periodFilter';
import { TagMultiSelect } from '@/components/jobs/TagMultiSelect';
import { PeriodOptionCard, type OptionTone } from '@/components/jobs/PeriodOptionCard';
import { BOARD_STATUS, BOARD_STATUS_ORDER, boardStatusMeta, normalizeBoardStatus, periodScheduleDisplay, sectorSummary, boardStatusFromAssignment, checkPeriodConflict, periodRangeRef, sameDayTurnaroundHours, formatGapHours, periodSnapshotOf, detectAssignmentIssues, isNoSellPeriod, type BoardStatus, type ScheduleDisplay, type AssignmentIssue } from '@/lib/logic/guideBoard';
import { can } from '@/lib/permissions';
import { usePreferredGuideOrder } from '@/lib/usePreferredGuideOrder';
import { useExcludedGuides } from '@/lib/useExcludedGuides';
import { useFavoriteGuides } from '@/lib/useFavoriteGuides';
import { remindersInWindow, compensationProgress, cancelledSpansForLeader, cancellationsForLeader } from '@/lib/logic/guideCancellations';
import { getPassportExpiry } from '@/services/tourLeaderMaster';
import { getTourPeriods, getAssignablePeriods, getTourPeriodById, getSaleStatusChange } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments, assignPeriod, reassignPeriod, unassignPeriod, acknowledgeChange, type GuidePeriodAssignment } from '@/services/guideAssignmentStore';
import { passportStatus, passportRemainingText, passportBlocksScheduling, PASSPORT_STATUS_META, PASSPORT_TONE_CLASS } from '@/lib/logic/tourLeaderMaster';
import { getLeaderExpertise, leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { getExpertiseScopes } from '@/services/expertiseScopeStore';
import { buildExpertiseSummary, expertiseSearchText, type ExpertiseSummary } from '@/lib/logic/expertiseSummary';
import type { ExpertiseScope } from '@/lib/logic/expertiseScope';
import { zoneById, zoneCountries } from '@/data/leaders/zoneMaster';
import {
  monthKeyOf, previousMonthKey, hasRoster, getRosterIds,
  addToRoster, removeFromRoster, saveRoster,
} from '@/services/monthRosterStore';
import { suggestRoster, type RosterLeaderInfo } from '@/lib/logic/monthRoster';
import { LEADER_TYPE, LEADER_TYPE_ORDER } from '@/lib/labels';
import { MonthRosterDrawer, type RosterCandidate } from '@/components/jobs/MonthRosterDrawer';
import { SALE_STATUS_LABEL } from '@/data/schedule/saleStatus';
import { getHolidayMap, type Holiday } from '@/services/holidayService';
import { SegmentedControl } from '@/components/ui/Tabs';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { Country, TourRoute } from '@/types';
import type { GuideCancellationRecord, LeaderAvailabilityRecord, LeaderType, TourLeader } from '@/types';

/* ------------------------------ layout / density (§1/§10) ------------------------------
 * Timeline ใช้ CSS Grid: `${guideW}px repeat(daysInMonth, minmax(0,1fr))` ที่ width:100%
 * ทุกวันย่อได้ (minmax 0) → เห็นครบทั้งเดือนในจอเดียว ไม่มี Horizontal Scroll (§2/§8)
 */
type Density = 'compact' | 'normal';
const DENSITY: Record<Density, { guideW: number; evH: number; laneGap: number; rowPad: number; rowMin: number; dayNum: string; dow: string; bar: string; sub: string; tags: number }> = {
  // §2 วันที่ minmax(0,1fr) → เห็นครบทั้งเดือนในจอเดียว ไม่มี h-scroll · §6 แถวเตี้ยลงหลังตัด Tag สถานะ
  compact: { guideW: 220, evH: 30, laneGap: 2, rowPad: 4, rowMin: 70, dayNum: 'text-[12px]', dow: 'text-[9px]', bar: 'text-[9px]', sub: 'text-[8px]', tags: 1 },
  // §1 ลดคอลัมน์ชื่อ (240px) → คืนพื้นที่ให้ช่องวันกว้างขึ้น · §5 เลขวันใหญ่ขึ้น อ่านง่าย
  normal: { guideW: 240, evH: 34, laneGap: 3, rowPad: 5, rowMin: 90, dayNum: 'text-[14px]', dow: 'text-[10px]', bar: 'text-[10px]', sub: 'text-[9px]', tags: 2 },
};
const HEAD_H = 48; // §5 เพิ่ม spacing หัววันที่ให้อ่านง่ายขึ้น

/** เดือนย่อไทย — ใช้กำกับคอลัมน์วันที่ต่อจากเดือนถัดไป (ตอนกรุ๊ปคาบเดือน) */
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** เวลาพัก (Buffer) ระบบใช้ตรวจงานชน — ค่าเดิม 0 ชม. (ไม่แสดงตัวเลือกบนหน้าจอ §3) */
const SYSTEM_BUFFER_HOURS = 0;

type EventKind = 'job' | 'leave' | 'company' | 'unavailable' | 'cancelled';
const RECORD_KIND: Record<string, EventKind> = { sick_leave: 'leave', personal_leave: 'leave', company_work: 'company', unavailable: 'unavailable' };
// หมายเหตุ: bar เก็บเฉพาะ modifier (ไม่รวม 'zego-status-bar' ฐาน) — ผู้เรียกต้องแปะ 'zego-status-bar'
// เพิ่มเองตอนใช้งาน (ดูจุดที่เรียก LEAVE_STYLE[...].bar) เพื่อไม่ให้ค่าตรงกับ BOARD_STATUS[s].bar
// ที่เป็น string เดียวกันแบบ byte-for-byte (LEAVE_STYLE ใช้โทนซ้ำกับบางสถานะของ BOARD_STATUS)
const LEAVE_STYLE: Record<Exclude<EventKind, 'job'>, { bar: string; dot: string; legend: string }> = {
  leave: { bar: 'zego-status-bar--warning', dot: 'zego-dot--warning', legend: 'วันลา' },
  company: { bar: 'zego-status-bar--orange', dot: 'zego-dot--orange', legend: 'ติดงานบริษัท' },
  unavailable: { bar: 'zego-status-bar--slate', dot: 'zego-dot--slate', legend: 'ไม่พร้อมรับงาน' },
  // เดือนที่กรุ๊ปถูกยกเลิก — เดิมเป็นแถบเขียว (คอนเฟิร์มแล้ว) เปลี่ยนเป็นแดงถาวรไว้เป็นร่องรอยในปฏิทิน
  cancelled: { bar: 'zego-status-bar--danger', dot: 'zego-dot--danger', legend: 'กรุ๊ปถูกยกเลิก' },
};
// ลายทแยงสำหรับแถบไม่ว่าง (§4 ต่างจากงานทัวร์ชัดเจน)
const LEAVE_BG: Record<Exclude<EventKind, 'job'>, string> = {
  leave: 'repeating-linear-gradient(45deg,#fef3c7,#fef3c7 5px,#fde68a 5px,#fde68a 10px)',
  company: 'repeating-linear-gradient(45deg,#ffedd5,#ffedd5 5px,#fed7aa 5px,#fed7aa 10px)',
  unavailable: 'repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9 5px,#e2e8f0 5px,#e2e8f0 10px)',
  cancelled: 'repeating-linear-gradient(45deg,#fecdd3,#fecdd3 5px,#fda4af 5px,#fda4af 10px)',
};

interface RowEvent {
  id: string;
  kind: EventKind;
  start: string; // ISO date
  end: string;
  isAllDay: boolean;
  startTime?: string;
  endTime?: string;
  code: string;
  label: string;
  scheduleText: string;
  board?: BoardStatus;
  disp?: ScheduleDisplay; // ข้อมูลย่อบนแถบ (เฉพาะงาน)
  periodId?: string; // อ้างอิง Tour Period Master (§6/§7)
  assignmentId?: string; // อ้างอิง Guide Assignment
  issues?: AssignmentIssue[]; // §9 Master เปลี่ยน/พีเรียดปิด
  record?: LeaderAvailabilityRecord;
  /** kind: 'cancelled' เท่านั้น — วันที่ยกเลิก/ผู้รับผิดชอบกรุ๊ป สำหรับ Tooltip */
  cancelledDate?: string;
  responsibleUser?: string;
  /** kind: 'job' เท่านั้น — รหัสกรุ๊ปเดิมที่กรุ๊ปนี้ถูกระบุว่าใช้ชดเชยให้ (ผู้จัดหัวหน้าทัวร์เป็นคนระบุตอนมอบหมาย) */
  compensatesFor?: string;
}

/* ===================== §4 การกรองงานในหน้าต่างจัดงาน ===================== */

/**
 * งานนี้ออกเดินทางภายในช่วงวันที่ที่เลือกหรือไม่
 *   departure_date >= start && departure_date <= end
 * เทียบด้วย "วันออกเดินทางจริง" ของโปรแกรม — ช่วงวันที่ที่เลือกใช้ค้นหาเท่านั้น
 * ไม่ได้กลายเป็นวันเดินทางของ Assignment ที่สร้างขึ้น
 */

/**
 * บรรทัดที่ 2 ของคอลัมน์หัวหน้าทัวร์ — "ชื่อเล่น: X · รูปแบบการร่วมงาน"
 *
 * ไม่แสดงรหัสหัวหน้าทัวร์บนตารางแล้ว (ข้อมูลยังอยู่ครบในฐานข้อมูลและที่อื่นของระบบ)
 * ไม่มีชื่อเล่น → "ยังไม่ระบุ" · ไม่มีรูปแบบการร่วมงาน → แสดงเฉพาะชื่อเล่น
 * รูปแบบการร่วมงานอ่านจากฟิลด์ leaderType จริง ไม่ใช่ข้อความบนหน้าจอ
 * ใช้ร่วมกันทั้งตารางรายเดือน (Desktop) และการ์ดบนมือถือ เพื่อไม่ให้รูปแบบต่างกัน
 */
function nicknameLine(leader: TourLeader): string {
  const nickname = `ชื่อเล่น: ${leader.nickname?.trim() || 'ยังไม่ระบุ'}`;
  const type = LEADER_TYPE[leader.leaderType]?.label;
  return type ? `${nickname} · ${type}` : nickname;
}

/**
 * งานนี้อยู่บนโปรแกรมที่เป็น NO SELL แต่ยังมีหัวหน้าทัวร์อยู่
 * ใช้กับกรอบเตือน/Tag บนแถบงานและ Tooltip — ไม่ได้ใช้กรองรายชื่อแล้ว
 */
function hasNoSellIssue(e: RowEvent): boolean {
  return (e.issues ?? []).some((i) => i.type === 'NO_SELL');
}

/** จัด lane ภายในแถวหัวหน้าทัวร์ 1 คน — ช่วงที่ทับกันอยู่คนละ lane */
function assignLanes(events: RowEvent[]): Map<string, number> {
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start) || b.end.localeCompare(a.end));
  const laneEnd: string[] = [];
  const map = new Map<string, number>();
  for (const e of sorted) {
    let lane = 0;
    while (lane < laneEnd.length && laneEnd[lane] >= e.start) lane += 1;
    laneEnd[lane] = e.end;
    map.set(e.id, lane);
  }
  return map;
}

/** บรรทัดเพิ่มใน Tooltip สำหรับงานที่โปรแกรมเป็น NO SELL — อ่านผู้เปลี่ยน/เวลาจาก Master จริง */
function noSellTooltipLines(periodId: string | undefined): string[] {
  const ch = periodId ? getSaleStatusChange(periodId) : null;
  return [
    'สถานะขาย: NO SELL',
    ch?.at ? `วันที่เปลี่ยนสถานะ: ${formatDateTime(ch.at)}` : '',
    ch?.by ? `ผู้เปลี่ยนสถานะ: ${ch.by}` : '',
    'กรุณาถอดหัวหน้าทัวร์ออกจากงานนี้',
  ].filter(Boolean);
}

/** Tooltip แถบงาน — ป้ายสถานะใช้ Mapping ชุดเดียวกับสี (§9) · leaderName ส่งมาจากแถวที่กำลัง render */
function eventTooltip(e: RowEvent, leaderName?: string): string {
  if (e.kind === 'cancelled') {
    return [
      `Group Code: ${e.code}`,
      `${e.label}`,
      `เดินทาง: ${e.scheduleText}`,
      `ยกเลิกเมื่อ: ${e.cancelledDate ? formatDate(e.cancelledDate) : '—'}`,
      `ผู้รับผิดชอบกรุ๊ป: ${e.responsibleUser ?? '—'}`,
    ].join('\n');
  }
  if (e.kind === 'job' && e.disp) {
    const d = e.disp;
    return [
      `Group Code: ${d.groupCode}`,
      leaderName ? `หัวหน้าทัวร์: ${leaderName}` : '',
      `เดินทาง: ${e.scheduleText}`,
      `บัส: ${d.bus}`,
      `ประเทศ: ${d.country}`,
      `สนามบินขาออก Sector 1: ${d.depAirport}`,
      `สายการบิน: ${d.airlineCode}`,
      `สถานะการจัด: ${boardStatusMeta(e.board).label}`,
      // §3 งาน NO SELL — บอกให้ชัดว่าต้องลงมือทำอะไร พร้อมที่มาของการเปลี่ยนสถานะ
      ...(hasNoSellIssue(e) ? noSellTooltipLines(e.periodId) : []),
      e.compensatesFor ? `กรุ๊ปนี้ใช้ชดเชยให้: ${e.compensatesFor}` : '',
    ].filter(Boolean).join('\n');
  }
  return [`${e.code} · ${e.label}`, e.scheduleText].filter(Boolean).join('\n');
}

export function GuideScheduleTimeline() {
  useWideContent(); // §1 ใช้พื้นที่เต็มความกว้าง (Timeline กว้าง) — scroll เฉพาะในกล่อง ไม่ทำให้ทั้งหน้าเลื่อน
  // §6 งานทั้งหมดมาจาก Tour Period Master · Assignment อ้างอิง periodId (ไม่ใช่ TourJob mock)
  const { leaders, appointments, availabilityRecords, countries, routes, today, pushToast, currentUser, guideCancellations, recordGuideGroupCancellation, markGuideCompensated } = useDemo();
  const { order: preferredOrder } = usePreferredGuideOrder();
  const { excluded } = useExcludedGuides();
  const { favorited } = useFavoriteGuides();

  // เปิดจาก "ดูตารางงาน" ของหัวหน้าทัวร์ (/jobs?leader=TL-000001) → กรองเฉพาะคนนั้นตั้งแต่เปิดหน้า
  const params = useSearchParams();
  const leaderParam = params.get('leader');
  /*
    เปิดจากมุมมองรายกรุ๊ป (/jobs?period=<internalId>) → เปิดรายละเอียดกรุ๊ปนั้นให้เลย
    ไม่งั้นผู้ใช้ต้องมาไล่หากรุ๊ปเองในตารางทั้งเดือนซึ่งมีหลายร้อยกรุ๊ป
  */
  const periodParam = params.get('period');
  const router = useRouter();

  /*
    ค่าเริ่มต้น = เดือนปัจจุบัน + 1 เสมอ (เดือนที่กำลังจัดสเก็ตจริง)

    ตั้งค่าตอน mount ไม่ใช่ตอนสร้าง state เพราะหน้านี้ถูก prerender ตอน build
    ถ้าคำนวณจากวันที่จริงตั้งแต่ตอน render จะได้เดือนตอน build ค้างใน HTML แล้วไม่ตรงกับเบราว์เซอร์
    ค่าตั้งต้นจึงใช้วันที่อ้างอิงของ Demo ไปก่อน (คงที่ทั้งสองฝั่ง) แล้วปรับเป็นเดือนจริงทันทีที่เปิดหน้า
  */
  const [cursor, setCursor] = useState(() => nextMonthStart(today));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(nextMonthStartFromNow());
  }, []);
  const [search, setSearch] = useState(leaderParam ?? '');
  /**
   * ตัวกรอง "รูปแบบการร่วมงาน" — เลือกได้หลายแบบพร้อมกัน ([] = ทุกรูปแบบ) กรองทุกคนในตารางเหมือนตัวกรองอื่นบนแถบ
   * ค่าเริ่มต้น = ทุกรูปแบบ — ไม่ซ่อนใครตั้งแต่เปิดหน้า (เดิมตั้งไว้ ประจำ + ทั่วไป ทำให้ไกด์ของฉันบางคนหายโดยไม่รู้ตัว)
   * ค่าอ่านจากฟิลด์ leaderType ของหัวหน้าทัวร์จริง (Master เดียวกับทั้งระบบ) ไม่ใช่ข้อความบนหน้าจอ
   * ⚠️ คนละตัวกับ ROSTER_TYPE_FILTER_DEFAULT ของหน้าต่าง "กำหนดรายชื่อ" ซึ่งยังเลือกทีละแบบ
   */
  const [typeFilter, setTypeFilter] = useState<LeaderType[]>(SCHEDULE_TYPE_FILTER_DEFAULT);
  /** จำนวนหัวหน้าทัวร์ที่ยังใช้งานอยู่ต่อรูปแบบ — คิดจากคนทั้งหมด ไม่ขึ้นกับตัวกรองอื่น */
  const typeCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of LEADER_TYPE_ORDER) m.set(LEADER_TYPE[t].label, 0);
    for (const l of leaders) {
      if (l.usageStatus !== 'active') continue;
      const label = LEADER_TYPE[l.leaderType]?.label;
      if (label) m.set(label, (m.get(label) ?? 0) + 1);
    }
    return m;
  }, [leaders]);
  /** ตัวกรองสถานะการจัดจากชิปสรุป — null = แสดงทุกสถานะ · กดชิปเดิมซ้ำเพื่อยกเลิก */
  const [boardFilter, setBoardFilter] = useState<BoardStatus | null>(null);
  /**
   * กรองด้วยอะไร — เลือกได้ทีละอย่าง
   *   'type'      = รูปแบบการร่วมงาน
   *   'expertise' = ประเทศ/เส้นทางที่เชี่ยวชาญ
   * กลุ่มที่ไม่ได้เลือกจะไม่ถูกนำมากรองเลย (ค่าเดิมยังอยู่ กลับมาสลับใช้ได้)
   * — ตัวกรองที่ซ่อนอยู่แต่ยังทำงานคือสิ่งที่ทำให้คนหายโดยไม่รู้สาเหตุ
   */
  const [filterMode, setFilterMode] = useState<'type' | 'expertise'>('type');

  /** ประเทศ/เส้นทางที่หัวหน้าทัวร์ "เชี่ยวชาญ" ([] = ทุกค่า) — ชุดเดียวกับที่แสดงในแถวและช่องค้นหา */
  const [expCountries, setExpCountries] = useState<string[]>([]);
  const [expRoutes, setExpRoutes] = useState<string[]>([]);
  const [onlyFree, setOnlyFree] = useState(false);
  const [onlyWithJobs, setOnlyWithJobs] = useState(false);
  /**
   * หมวดที่พับไว้ — ค่าเริ่มต้นเปิดทุกหมวด
   * (เดิมพับทุกรูปแบบยกเว้น "หัวหน้าทัวร์ประจำ" เพื่อลดความยาวตาราง แต่ตอนนี้ค่าเริ่มต้นของตาราง
   * แสดงเฉพาะ "ไกด์ของฉัน" ที่ปักดาวไว้อยู่แล้ว รายชื่อจึงสั้นพอไม่ต้องพับซ่อนไว้)
   */
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  // รายชื่อประจำเดือน (§3/§5) — จัดการรายชื่อผ่านปุ่ม "กำหนดรายชื่อ" ในแถบแจ้งเตือนเท่านั้น
  const [rosterRev, setRosterRev] = useState(0);           // สั่งอ่าน roster ใหม่หลังแก้ไข
  // §3 แสดงชั่วคราวจากการค้นหา (ไม่บันทึก) — เปิดจาก ?leader= ให้แสดงคนนั้นแม้ยังไม่อยู่ในรายชื่อเดือนนี้
  const [temporaryIds, setTemporaryIds] = useState<Set<string>>(() => (leaderParam ? new Set([leaderParam]) : new Set()));
  const [rosterOpen, setRosterOpen] = useState(false);     // Drawer จัดการรายชื่อ
  const [assignPrompt, setAssignPrompt] = useState<{ leader: TourLeader; periods: TourPeriodMaster[]; note: string } | null>(null); // §8
  const [removePrompt, setRemovePrompt] = useState<{ leader: TourLeader; jobCount: number } | null>(null); // §9

  // แสดงผลรายเดือนแบบปกติถาวร (ตัด toggle เดือน/สัปดาห์ + ปกติ/กระชับ ออก)
  const cfg = DENSITY.normal;
  // เวลาพัก (Buffer) ยังใช้ตรวจงานชนภายใน — ใช้ค่าระบบเดิม ไม่แสดงตัวเลือกบนหน้าจอ (§3)
  const buffer = SYSTEM_BUFFER_HOURS;

  const [detailPeriodId, setDetailPeriodId] = useState<string | null>(periodParam);
  const [infoLeader, setInfoLeader] = useState<TourLeader | null>(null); // §10 คลิกชื่อ → Side Panel
  /** ไกด์ที่กำลังดูรายละเอียด Reminder การชดเชยงาน (กดจากป้าย "รอชดเชยงาน") */
  const [reminderDetailLeader, setReminderDetailLeader] = useState<TourLeader | null>(null);
  /**
   * เสนอให้ผู้จัดหัวหน้าทัวร์ระบุว่ากรุ๊ปที่เพิ่งมอบหมายเป็นการชดเชยงานที่ถูกยกเลิกหรือไม่
   * ⚠️ ผู้ที่ระบุว่ากรุ๊ปไหนคือกรุ๊ปชดเชยต้องเป็นผู้จัดหัวหน้าทัวร์ตอนมอบหมายงานเท่านั้น — รหัสกรุ๊ปจึงมาจากงานที่จัดจริง
   */
  const [compensatePrompt, setCompensatePrompt] = useState<{
    leader: TourLeader;
    pendingRecords: GuideCancellationRecord[];
    assignedGroups: { code: string; title: string }[];
  } | null>(null);
  const [addTarget, setAddTargetRaw] = useState<{ leader: TourLeader; date: string } | null>(null);
  const [drag, setDrag] = useState<{ assignmentId: string; fromLeaderId: string } | null>(null);
  const [reassign, setReassign] = useState<{ assignment: GuidePeriodAssignment; period: TourPeriodMaster; from: TourLeader | null; to: TourLeader } | null>(null);
  const [assignments, setAssignments] = useState<GuidePeriodAssignment[]>([]);
  /** §5 หน้าต่างยืนยันถอดหัวหน้าทัวร์ (ต้องยืนยันเสมอ — ระบบไม่ถอดเองอัตโนมัติ) */
  const [removeAssign, setRemoveAssign] = useState<{ assignment: GuidePeriodAssignment; period: TourPeriodMaster | null; leaderName: string; cause: string } | null>(null);
  /** หน้าต่างยืนยัน "กรุ๊ปนี้ถูกยกเลิก" — ถอดหัวหน้าทัวร์ + บันทึกประวัติ/Reminder การชดเชยงาน (คนละอย่างกับการถอดปกติ) */
  const [cancelGroupTarget, setCancelGroupTarget] = useState<{ assignment: GuidePeriodAssignment; period: TourPeriodMaster | null; leaderName: string } | null>(null);
  /** §8 ตัวกรอง "งานที่ต้องดำเนินการ" */
  /** §4 แจ้งเตือนเฉพาะผู้ที่มีสิทธิ์จัดหัวหน้าทัวร์ (ผู้จัด/Operation/Admin) */
  const canAssign = can(currentUser.role, 'job.assignLeader');

  // โหลด Guide Assignment (periodId) จาก store ครั้งเดียวตอน mount (client)
  // เฉพาะรายการที่ยังมีผล — งานที่ถอดหัวหน้าทัวร์แล้วต้องไม่ครองช่วงเวลาอีก (ประวัติยังอยู่ในที่เก็บ)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setAssignments(loadActiveGuideAssignments()); }, []);
  // เปลี่ยนเดือน → ล้าง "แสดงชั่วคราว" (แต่ละเดือนมีรายชื่อของตัวเอง §3) · ข้ามรอบแรกเพื่อคงค่าจาก ?leader=
  const mountedCursor = useRef(false);
  useEffect(() => { if (mountedCursor.current) setTemporaryIds(new Set()); mountedCursor.current = true; }, [cursor]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const dayCount = daysBetween(monthStart, monthEnd); // จำนวนวันจริงของเดือน (28/29/30/31)

  // Tour Period Master (Source of Truth §1) — อ่านผ่าน Service · Join ด้วย periodId (§7)
  const allPeriods = useMemo(() => getTourPeriods(), []);
  const periodById = useMemo(() => new Map(allPeriods.map((p) => [p.internalId, p])), [allPeriods]);

  // กรุ๊ปที่เริ่มในเดือนนี้แต่ยังไม่กลับก่อนสิ้นเดือน (คาบไปเดือนถัดไป) → ต่อคอลัมน์วันเพิ่มให้เห็นครบถึงวันกลับ ไม่ตัดครึ่งกรุ๊ปจนอ่านไม่ออก
  const overflowEnd = useMemo(() => {
    let maxEnd = monthEnd;
    for (const a of assignments) {
      const p = periodById.get(a.periodId);
      if (p && p.startDate <= monthEnd && p.endDate > maxEnd) maxEnd = p.endDate;
    }
    const cap = addDays(monthEnd, 21); // กันวันเพิ่มมากเกินไปจากข้อมูลผิดปกติ (ทริปปกติไม่เกิน ~2 สัปดาห์)
    return maxEnd > cap ? cap : maxEnd;
  }, [assignments, periodById, monthEnd]);
  const totalDayCount = dayCount + diffDays(monthEnd, overflowEnd);
  const days = useMemo(
    () => Array.from({ length: totalDayCount }, (_, i) => addDays(monthStart, i)),
    [monthStart, totalDayCount],
  );
  const winStart = days[0];
  const winEnd = days[days.length - 1];
  const gridCols = `${cfg.guideW}px repeat(${days.length}, minmax(0, 1fr))`; // §2 ทุกวันย่อได้ → เห็นครบทั้งเดือน (+ วันคาบเดือนถัดไปถ้ามี) ไม่มี h-scroll

  // วันหยุดของบริษัท — อ่านผ่าน holidayService จุดเดียว (§14) · เดือนที่คาบปีจึงต้องดึงทั้งสองปี
  const holidays = useMemo(
    () => getHolidayMap([...new Set(days.map((d) => Number(d.slice(0, 4))))]),
    [days],
  );
  const assignedPeriodIds = useMemo(() => new Set(assignments.map((a) => a.periodId)), [assignments]);

  // งาน (จาก Assignment + Master) + วันลา ของหัวหน้าทัวร์แต่ละคน → RowEvent ตัดเฉพาะช่วงที่ดู
  const rowsByLeader = useMemo(() => {
    const map = new Map<string, RowEvent[]>();
    const byLeader = new Map<string, GuidePeriodAssignment[]>();
    for (const a of assignments) { if (!byLeader.has(a.tourLeaderId)) byLeader.set(a.tourLeaderId, []); byLeader.get(a.tourLeaderId)!.push(a); }
    for (const leader of leaders) {
      // กรุ๊ปที่ผู้จัดหัวหน้าทัวร์ระบุไว้ว่า "ใช้ชดเชยให้" กรุ๊ปที่ถูกยกเลิกกรุ๊ปไหน — เอาไว้แปะป้ายบนแถบงานกรุ๊ปนั้นโดยตรง
      const compensatesForByGroupCode = new Map(
        cancellationsForLeader(guideCancellations, leader.id)
          .filter((r) => r.compensatedJobId)
          .map((r) => [r.compensatedJobId as string, r.jobId]),
      );
      const jobEvents: RowEvent[] = (byLeader.get(leader.id) ?? [])
        .map((a) => ({ a, p: periodById.get(a.periodId) }))
        .filter((x): x is { a: GuidePeriodAssignment; p: TourPeriodMaster } => !!x.p && x.p.startDate <= winEnd && x.p.endDate >= winStart)
        .map(({ a, p }) => ({
          // §7 ใช้ assignmentId เป็นเอกลักษณ์ของแถบงาน (ไม่ใช่ index) — React จึงไม่นำ node เดิมมาใช้ซ้ำ
          id: a.assignmentId, kind: 'job' as const, start: p.startDate, end: p.endDate, isAllDay: true,
          code: p.groupCode, label: p.displayName, scheduleText: formatDateRange(p.startDate, p.endDate),
          board: boardStatusFromAssignment(a.assignmentStatus), disp: periodScheduleDisplay(p),
          periodId: a.periodId, assignmentId: a.assignmentId, issues: detectAssignmentIssues(a.snapshot, p),
          compensatesFor: compensatesForByGroupCode.get(p.groupCode),
        }));
      const recEvents: RowEvent[] = availabilityRecords
        .filter((r) => r.leaderId === leader.id && r.approval === 'approved' && r.blocksAssignment !== false && r.startDate <= winEnd && r.endDate >= winStart)
        .map((r) => ({
          id: `R-${r.id}`, kind: RECORD_KIND[r.type] ?? 'unavailable', start: r.startDate, end: r.endDate,
          isAllDay: r.isAllDay, startTime: r.isAllDay ? undefined : r.startTime, endTime: r.isAllDay ? undefined : r.endTime,
          code: recordTypeLabel(r), label: recordTypeLabel(r), scheduleText: formatRecordSchedule(r), record: r,
        }));
      // เดือนที่กรุ๊ปถูกยกเลิก — คงร่องรอยไว้ในปฏิทิน (แดง) แทนที่จะหายไปเฉย ๆ เมื่อถอดหัวหน้าทัวร์ออก
      const cancelledEvents: RowEvent[] = cancelledSpansForLeader(guideCancellations, leader.id)
        .filter((r) => r.originalTravelDate <= winEnd && r.originalReturnDate >= winStart)
        .map((r) => ({
          id: `CANCEL-${r.id}`, kind: 'cancelled' as const, start: r.originalTravelDate, end: r.originalReturnDate, isAllDay: true,
          code: r.jobId, label: r.jobTitle, scheduleText: formatDateRange(r.originalTravelDate, r.originalReturnDate),
          cancelledDate: r.cancelledDate, responsibleUser: r.responsibleUser,
        }));
      map.set(leader.id, [...jobEvents, ...recEvents, ...cancelledEvents]);
    }
    return map;
  }, [leaders, assignments, periodById, availabilityRecords, guideCancellations, winStart, winEnd]);

  // §9 การมอบหมายที่ได้รับผลกระทบจาก Master (ทุกเดือน) — พีเรียดเปลี่ยน/ปิดใช้งาน/หาย
  const affected = useMemo(() => {
    const out: { leaderName: string; code: string; assignmentId: string; periodId: string; issues: AssignmentIssue[] }[] = [];
    for (const a of assignments) {
      const p = periodById.get(a.periodId) ?? null;
      const issues = detectAssignmentIssues(a.snapshot, p);
      if (issues.length) {
        const leader = leaders.find((l) => l.id === a.tourLeaderId);
        out.push({ leaderName: leader ? leaderDisplayName(leader) : a.tourLeaderId, code: p?.groupCode ?? a.periodId, assignmentId: a.assignmentId, periodId: a.periodId, issues });
      }
    }
    return out;
  }, [assignments, periodById, leaders]);

  /**
   * §9 การมอบหมายที่ "พีเรียดหายจากต้นทางไปแล้ว" — ต่างจากรายการอื่นตรงที่ทำอะไรกับมันไม่ได้เลย
   * (กดดูรายละเอียดก็ไม่มีพีเรียดให้เปิด · ถอดทีละรายการก็ไม่มีปุ่มในแถวเพราะไม่มีแถวงานให้กด)
   * เกิดได้เมื่อสลับแหล่งข้อมูลพีเรียด แล้วรหัสพีเรียดชุดเดิมไม่มีอยู่ในแหล่งใหม่
   * จึงเปิดทางให้เคลียร์ทั้งชุดในครั้งเดียว — ยังบันทึกเป็นการ "ถอด" ตามปกติ ไม่ลบประวัติทิ้ง
   */
  const orphanAssignments = useMemo(
    () => affected.filter((x) => !periodById.has(x.periodId)),
    [affected, periodById],
  );
  const [confirmClearOrphans, setConfirmClearOrphans] = useState(false);

  const clearOrphanAssignments = () => {
    for (const x of orphanAssignments) {
      unassignPeriod(x.assignmentId, currentUser.name, nowStamp, 'พีเรียดไม่มีอยู่ในแหล่งข้อมูลปัจจุบันแล้ว — เคลียร์รายการค้าง');
    }
    setAssignments(loadActiveGuideAssignments());
    setConfirmClearOrphans(false);
    pushToast('success', `เคลียร์การมอบหมายที่พีเรียดหายจากต้นทางแล้ว ${orphanAssignments.length} รายการ — ประวัติเดิมยังตรวจสอบย้อนหลังได้`);
  };

  /**
   * งานที่โปรแกรมเป็น NO SELL แต่ยังมีหัวหน้าทัวร์ถูกจัดอยู่ — ต้องให้ผู้ใช้ยืนยันถอดเอง
   *
   * ไม่จำกัดเฉพาะเดือนที่กำลังดู เพราะเป็นงานค้างที่ต้องตามเก็บทั้งหมด
   * เรียงตาม §8: ใกล้วันเดินทางที่สุดก่อน (วันที่ผ่านมาแล้ว = เกินกำหนดดำเนินการ จึงขึ้นบนสุด)
   * แล้วจึงเรียงตามเวลาที่เพิ่งเปลี่ยนสถานะล่าสุด
   */
  const noSellPending = useMemo(() => {
    const out = assignments
      .filter((a) => isNoSellPeriod(periodById.get(a.periodId) ?? null))
      .map((a) => {
        const p = periodById.get(a.periodId)!;
        const leader = leaders.find((l) => l.id === a.tourLeaderId) ?? null;
        return {
          assignment: a,
          period: p,
          leader,
          leaderName: leader ? leaderDisplayName(leader) : a.tourLeaderId,
          change: getSaleStatusChange(a.periodId),
          overdue: p.startDate < today,
        };
      });
    return out.sort((x, y) => x.period.startDate.localeCompare(y.period.startDate)
      || (y.change?.at ?? '').localeCompare(x.change?.at ?? ''));
  }, [assignments, periodById, leaders, today]);

  /* -------------------- รายชื่อประจำเดือน (§2/§10/§11/§12) -------------------- */
  const monthKey = monthKeyOf(monthStart);
  const rosterDefined = useMemo(() => { void rosterRev; return hasRoster(monthKey); }, [monthKey, rosterRev]);
  const rosterIds = useMemo(() => { void rosterRev; return getRosterIds(monthKey); }, [monthKey, rosterRev]);
  const rosterSet = useMemo(() => new Set(rosterIds), [rosterIds]);

  const leaderById = useMemo(() => new Map(leaders.map((l) => [l.id, l])), [leaders]);

  // ข้อมูลของแต่ละคนในเดือนที่ดู (§5/§12) — จาก rowsByLeader + สถานะ
  const leaderInfo = useMemo(() => {
    const m = new Map<string, RosterLeaderInfo>();
    for (const l of leaders) {
      const evs = rowsByLeader.get(l.id) ?? [];
      const jobDates = evs.filter((e) => e.kind === 'job').map((e) => e.start).sort();
      m.set(l.id, {
        id: l.id,
        hasJob: jobDates.length > 0,
        firstJobDate: jobDates[0] ?? null,
        jobCount: jobDates.length,
        available: l.status === 'available',
        hasLeave: evs.some((e) => e.kind === 'leave' || e.kind === 'unavailable'),
        unavailableStatus: UNAVAILABLE_LEADER_STATUSES.has(l.status),
      });
    }
    return m;
  }, [leaders, rowsByLeader]);

  // §2 ความเชี่ยวชาญ โซน→ประเทศ→เส้นทาง — อ่านจาก Expertise Scope Store ชุดเดียวกับ Tab ความสามารถ (ไม่คัดลอกซ้ำ)
  const expertiseByLeader = useMemo(() => {
    const m = new Map<string, { summary: ExpertiseSummary; search: string; scopes: ExpertiseScope[] }>();
    for (const l of leaders) {
      const scopes = getExpertiseScopes(l.id);
      m.set(l.id, { summary: buildExpertiseSummary(scopes, countries), search: expertiseSearchText(scopes, countries), scopes });
    }
    return m;
  }, [leaders, countries]);

  /** ชื่อประเทศของ scope (อ่านจาก Country Master) */
  const scopeCountryName = useCallback(
    (countryId: string | null) => (countryId ? countries.find((c) => c.id === countryId)?.nameEn ?? null : null),
    [countries],
  );

  /**
   * เส้นทางที่ scope นี้ครอบคลุม
   * "ทุกเส้นทาง" ไม่ได้เก็บรหัสไว้เลย — ต้องกางจาก Route Master ของประเทศนั้น
   * ไม่งั้นคนที่ระบุ "CHINA · ทุกเส้นทาง" จะไม่มีเส้นทางจีนโผล่ในตัวเลือกสักเส้น
   */
  /**
   * ประเทศทั้งหมดที่ scope นี้ครอบคลุม (id) — ประเทศเจาะจง = 1 ประเทศ
   * "ทุกประเทศในโซน" (รวม "ได้ทุกโซน") ไม่ได้เก็บ countryId → กางจากสมาชิกของโซน
   * ไม่งั้นคนที่ระบุ "Asia › ทุกประเทศ" จะไม่ตรงตัวกรอง JAPAN ทั้งที่ครอบคลุมอยู่
   */
  const scopeCountryIds = useCallback((sc: ExpertiseScope): string[] => {
    if (sc.countryScope === 'specific') return sc.countryId ? [sc.countryId] : [];
    const zone = zoneById(sc.zoneId);
    return zone ? zoneCountries(zone, countries).map((c) => c.id) : [];
  }, [countries]);

  const scopeRouteCodes = useCallback((sc: ExpertiseScope): string[] => {
    if (sc.routeScope !== 'all_routes') return [...sc.routeCodes, ...sc.primaryRouteCodes];
    const ids = new Set(scopeCountryIds(sc));
    return routes.filter((r) => ids.has(r.countryId) && r.code).map((r) => r.code!);
  }, [routes, scopeCountryIds]);

  /**
   * ตัวเลือกของตัวกรองความเชี่ยวชาญ — สร้างจากสิ่งที่หัวหน้าทัวร์ระบุไว้จริง ไม่ใช่ Master ทั้งก้อน
   * เส้นทางถูกจำกัดตามประเทศที่เลือกไว้ด้วย — เลือก CHINA แล้วต้องไม่เห็นเส้นทางญี่ปุ่น
   * (เลือกคู่ที่เป็นไปไม่ได้แล้วได้ 0 คนโดยไม่มีอะไรบอกว่าผิดตรงไหน)
   */
  const expertiseOptions = useMemo(() => {
    const countryNames = new Set<string>();
    /* เส้นทางเก็บแยกตามประเทศไว้ตั้งแต่แรก — รายการเส้นทางล้วนคือ CAN/KIX/PEK ที่ไม่บอกว่าอยู่ประเทศไหน */
    const byCountry = new Map<string, Set<string>>();
    const pickCountry = new Set(expCountries);
    for (const { scopes } of expertiseByLeader.values()) {
      for (const sc of scopes) {
        const name = scopeCountryName(sc.countryId);
        if (name) countryNames.add(name);
        if (!name || (pickCountry.size > 0 && !pickCountry.has(name))) continue;
        const bucket = byCountry.get(name) ?? new Set<string>();
        for (const code of scopeRouteCodes(sc)) bucket.add(code);
        if (bucket.size > 0) byCountry.set(name, bucket);
      }
    }
    const routeGroups = [...byCountry.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([label, codes]) => ({ label, options: [...codes].sort() }));
    return {
      countries: [...countryNames].sort(),
      /* รายการเรียบ — ใช้กับปุ่ม "เลือกทั้งหมด" และการนับ ไม่ได้ใช้วาดรายการ */
      routes: [...new Set(routeGroups.flatMap((g) => g.options))].sort(),
      routeGroups,
    };
  }, [expertiseByLeader, expCountries, scopeCountryName, scopeRouteCodes]);

  /**
   * เชี่ยวชาญตามที่เลือกไว้หรือไม่ — ต้องเข้าเงื่อนไขทั้งประเทศและเส้นทาง "ภายใน scope เดียวกัน"
   * เชี่ยวชาญ CHINA(ทุกเส้นทาง) + JAPAN(KIX) ไม่ถือว่าทำ KIX ในจีนได้
   */
  const matchesExpertise = useCallback((l: TourLeader) => {
    if (filterMode !== 'expertise') return true;
    if (expCountries.length === 0 && expRoutes.length === 0) return true;
    const scopes = expertiseByLeader.get(l.id)?.scopes ?? [];
    return scopes.some((sc) => {
      const names = scopeCountryIds(sc).map(scopeCountryName);
      const okCountry = expCountries.length === 0 || names.some((n) => !!n && expCountries.includes(n));
      if (!okCountry) return false;
      if (expRoutes.length === 0) return true;
      const covered = scopeRouteCodes(sc);
      return expRoutes.some((code) => covered.includes(code));
    });
  }, [filterMode, expCountries, expRoutes, expertiseByLeader, scopeCountryName, scopeCountryIds, scopeRouteCodes]);

  /** เปลี่ยนประเทศแล้วเส้นทางที่เลือกไว้อาจไม่อยู่ในประเทศชุดใหม่ — ถอดออกให้ ไม่ปล่อยค้างแบบมองไม่เห็น */
  const changeExpCountries = (next: string[]) => {
    setExpCountries(next);
    if (next.length === 0 || expRoutes.length === 0) return;
    const pick = new Set(next);
    const allowed = new Set<string>();
    for (const { scopes } of expertiseByLeader.values()) {
      for (const sc of scopes) {
        const name = scopeCountryName(sc.countryId);
        if (!name || !pick.has(name)) continue;
        for (const code of scopeRouteCodes(sc)) allowed.add(code);
      }
    }
    setExpRoutes(expRoutes.filter((code) => allowed.has(code)));
  };

  /**
   * ชุดที่ "แสดง" ในตาราง
   *
   * หัวหน้าทัวร์ที่ผู้ใช้คนนี้ "ปักดาว" ไว้ (ไกด์ของฉัน — ส่วนตัวของแต่ละ User) และสถานะโปรไฟล์เป็น "ใช้งาน"
   *   → แสดงเสมอทุกเดือน ไม่ว่าจะกำหนดรายชื่อเฉพาะเดือนไว้หรือไม่ และไม่ขึ้นกับตัวกรอง "รูปแบบการร่วมงาน"
   *   (ปักดาว = ไกด์ของฉัน = ขึ้นในตารางเสมอ — กติกาเดียวทุกหน้า ไม่ให้คนที่ปักดาวไว้หายโดยไม่รู้สาเหตุ)
   *   ⚠️ ไม่ใช้ "สถานะพร้อมรับงาน" ตัดคนออกตั้งแต่ต้น — คนลา/ติดงานบริษัท/ไม่พร้อม
   *      ต้องเห็นในตารางพร้อมสถานะ เพื่อดูภาระงานทั้งเดือนได้ครบ
   * กำหนดรายชื่อเฉพาะเดือนแล้ว → เพิ่มคนในรายชื่อนั้นเข้ามา "ต่อจาก" คนที่ปักดาว (ใช้เพิ่มคนที่ไม่ได้ปักดาวเป็นรายเดือน)
   *
   * รวมคนที่ "มีงานในเดือนนี้" เสมอ — รักษาประวัติและรายการงานเดิมไว้
   * แม้ภายหลังถูกระงับการใช้งาน/ถอดดาว/ถูกนำออกจากรายชื่อไปแล้ว
   * ตัวกรองที่ผู้ใช้กดเองบนแถบ (ค้นหา · ประเทศ/เส้นทาง · คนว่าง/คนมีงาน · สถานะการจัด) ยังกรองทุกคนตามปกติ
   */
  const isMyGuide = useCallback(
    (l: TourLeader) => favorited.has(l.id) && l.usageStatus === 'active',
    [favorited],
  );

  /** มีคนเข้าเกณฑ์ให้แสดงหรือไม่ (ก่อนใช้ตัวกรองอื่น) — แยก Empty State 2 แบบ */
  const hasDefaultCandidates = useMemo(
    () => leaders.some((l) => isMyGuide(l) || (rosterDefined && rosterSet.has(l.id))),
    [leaders, rosterDefined, rosterSet, isMyGuide],
  );

  const inUniverse = (id: string) => {
    if (leaderInfo.get(id)?.hasJob) return true;
    if (temporaryIds.has(id)) return true;
    if (rosterDefined && rosterSet.has(id)) return true;
    const l = leaderById.get(id);
    return Boolean(l && isMyGuide(l));
  };

  /**
   * ตัวกรองที่เหลือบนแถบเครื่องมือ — เฉพาะคนว่าง / เฉพาะคนมีงาน (เลือกได้ทีละตัว)
   * ตัวกรอง "สถานะหัวหน้าทัวร์" และ "งานที่ต้องดำเนินการ" ถูกนำออกทั้งหมดแล้ว
   * (ตัวสถานะยังใช้ระบายสีแถบงานและแจ้งเตือน NO SELL ตามเดิม — แค่ไม่ใช้กรองรายชื่อ)
   */
  const matchesFilters = (l: TourLeader) => {
    const info = leaderInfo.get(l.id);
    if (onlyWithJobs && !info?.hasJob) return false;
    if (onlyFree && info?.hasJob) return false;
    if (filterMode === 'type' && typeFilter.length > 0 && !typeFilter.includes(l.leaderType)) return false;
    // ไกด์ที่ผู้ใช้คนนี้ตัดออก — ไม่แสดงในรายการทั่วไป ยกเว้นคนที่มีงานอยู่แล้วในช่วงที่ดู (ยังต้องตามงานเดิมได้)
    if (excluded.has(l.id) && !info?.hasJob) return false;
    return true;
  };
  const matchesSearch = (l: TourLeader) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    // ค้นเฉพาะ ชื่อ / นามสกุล / ชื่อเล่น เท่านั้น
    // ประเทศและเส้นทางมีตัวกรองของตัวเองบนแถบนี้แล้ว จึงไม่ปนเข้ามาในช่องค้นหา
    return [l.firstName, l.lastName, l.nickname].join(' ').toLowerCase().includes(q);
  };

  /**
   * §13 ชุดที่ผ่านตัวกรองทั้งหมด "ยกเว้นสถานะการจัด"
   * ใช้เป็นฐานนับจำนวนบนชิป — ตัวเลขจึงไม่เปลี่ยนตามชิปที่เลือก (ไม่งั้นเลือกอันหนึ่งแล้วอันอื่นเป็น 0 หมด)
   */
  const baseLeaders = useMemo(
    () => leaders.filter((l) => inUniverse(l.id) && matchesFilters(l) && matchesSearch(l) && matchesExpertise(l)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leaders, rosterSet, rosterDefined, leaderById, isMyGuide, temporaryIds, leaderInfo, onlyFree, onlyWithJobs, filterMode, typeFilter, search, countries, routes, rowsByLeader, expertiseByLeader, matchesExpertise, excluded],
  );

  /**
   * จำนวนงานแยกตามสถานะการจัด — นับจากงานจริงในเดือนที่เปิดอยู่ ตามตัวกรอง/คำค้นปัจจุบัน
   * อ่านจากฟิลด์ board ของ Assignment (ไม่ใช่ข้อความบนหน้าจอ) และคำนวณใหม่ทุกครั้งที่ข้อมูลเปลี่ยน
   * "ยังไม่ระบุ" = พีเรียดในเดือนนี้ที่ยังไม่มีหัวหน้าทัวร์ จึงนับจาก Master ไม่ใช่จากแถวหัวหน้าทัวร์
   */
  const boardCounts = useMemo(() => {
    const c = { CONFIRMED: 0, PENDING_CONFIRMATION: 0, REASSIGN_REQUIRED: 0, DECLINED: 0, UNASSIGNED: 0 } as Record<BoardStatus, number>;
    for (const l of baseLeaders) {
      for (const e of rowsByLeader.get(l.id) ?? []) {
        if (e.kind === 'job') c[normalizeBoardStatus(e.board)] += 1;
      }
    }
    c.UNASSIGNED = allPeriods.filter((p) => p.startDate <= winEnd && p.endDate >= winStart && !assignedPeriodIds.has(p.internalId)).length;
    return c;
  }, [baseLeaders, rowsByLeader, allPeriods, assignedPeriodIds, winStart, winEnd]);

  /** เลือกชิปแล้วเหลือเฉพาะคนที่มีงานสถานะนั้นในช่วงที่ดู · "ยังไม่ระบุ" ไม่ผูกกับหัวหน้าทัวร์คนใด */
  const shownLeaders = useMemo(() => {
    if (!boardFilter || boardFilter === 'UNASSIGNED') return baseLeaders;
    return baseLeaders.filter((l) => (rowsByLeader.get(l.id) ?? [])
      .some((e) => e.kind === 'job' && normalizeBoardStatus(e.board) === boardFilter));
  }, [baseLeaders, rowsByLeader, boardFilter]);
  const visibleLeaders = shownLeaders; // ใช้กับ mobile/นับ

  /**
   * จำนวนงานที่ได้รับมอบหมายจริงในช่วงที่กำลังดู (นับจาก Assignment ไม่ใช่จากสิ่งที่วาดบนจอ)
   * ใช้แยกให้ชัดว่า "ไม่มีสีเพราะไม่มีงาน" ไม่ใช่ "มีงานแต่สีไม่ขึ้น"
   */
  const assignedJobCount = useMemo(
    () => shownLeaders.reduce((n, l) => n + (rowsByLeader.get(l.id) ?? []).filter((e) => e.kind === 'job').length, 0),
    [shownLeaders, rowsByLeader],
  );

  // §7 คนที่ตรงคำค้นแต่อยู่นอกชุด (ไม่ roster / ไม่มีงาน / ไม่ชั่วคราว) → แสดง banner ให้เพิ่ม
  const searchOutside = useMemo(() => {
    if (!search.trim()) return [];
    return leaders.filter((l) => !inUniverse(l.id) && matchesSearch(l)).slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaders, search, rosterSet, rosterDefined, leaderById, isMyGuide, temporaryIds, leaderInfo, countries, routes, expertiseByLeader]);

  /**
   * แบ่งรายชื่อเป็นหมวดตาม "รูปแบบการร่วมงาน" (Master เดียวกับทั้งระบบ)
   *
   * ลำดับหมวด — หัวหน้าทัวร์ประจำมาก่อนเสมอ จากนั้นเรียงตาม LEADER_TYPE_ORDER ของ Master
   *   (เพิ่ม/แก้/ลบประเภทใน Master แล้วหน้านี้เปลี่ยนตามอัตโนมัติ — ไม่ Hardcode รายชื่อประเภท)
   *   ประเภทที่พบในข้อมูลแต่ไม่มีใน Master จะต่อท้ายไว้ ไม่ให้คนหายจากตาราง
   *
   * ลำดับคนในหมวด: มีงานเดือนนี้ → ว่างและพร้อมรับงาน → ไม่พร้อม/ลา/ติดงานบริษัท
   *   → ปักดาวไว้ → ลำดับไกด์ที่ผู้ใช้คนนี้ตั้งไว้เอง (Preferred Guide List ถ้าตั้งไว้) → ชื่อไทย
   * หมวดที่ไม่มีคนหลังกรองจะไม่ถูกสร้าง (ไม่มี Group Header ที่นับได้ 0 คน)
   */
  const preferredIndex = useMemo(
    () => new Map(preferredOrder.map((id, i) => [id, i])),
    [preferredOrder],
  );
  const typeSections = useMemo(() => {
    const order: string[] = ['regular', ...LEADER_TYPE_ORDER.filter((t) => t !== 'regular')];
    const byType = new Map<string, TourLeader[]>();
    for (const l of shownLeaders) {
      const key = String(l.leaderType);
      const bucket = byType.get(key);
      if (bucket) bucket.push(l);
      else byType.set(key, [l]);
    }
    // ประเภทนอก Master → ต่อท้ายตามที่พบ
    for (const key of byType.keys()) if (!order.includes(key)) order.push(key);

    /** 0 = มีงาน · 1 = ว่างพร้อมรับงาน · 2 = ไม่พร้อม/ลา/ติดงานบริษัท */
    const rank = (l: TourLeader) => {
      const i = leaderInfo.get(l.id);
      if (i?.hasJob) return 0;
      if (i?.unavailableStatus || i?.hasLeave) return 2;
      return i?.available ? 1 : 2;
    };
    const fullName = (l: TourLeader) => `${l.firstName} ${l.lastName}`.trim();
    const preferredRank = (l: TourLeader) => preferredIndex.get(l.id);

    return order
      .map((key) => ({
        id: key,
        label: LEADER_TYPE[key as keyof typeof LEADER_TYPE]?.label ?? 'ยังไม่ระบุรูปแบบการร่วมงาน',
        members: (byType.get(key) ?? []).slice().sort((a, b) => {
          const r = rank(a) - rank(b);
          if (r !== 0) return r;
          const fa = favorited.has(a.id) ? 0 : 1;
          const fb = favorited.has(b.id) ? 0 : 1;
          if (fa !== fb) return fa - fb;
          const pa = preferredRank(a);
          const pb = preferredRank(b);
          if (pa !== undefined && pb !== undefined) return pa - pb;
          if (pa !== undefined) return -1;
          if (pb !== undefined) return 1;
          return fullName(a).localeCompare(fullName(b), 'th');
        }),
      }))
      .filter((s) => s.members.length > 0);
  }, [shownLeaders, leaderInfo, preferredIndex, favorited]);

  // ข้อมูลสำหรับหน้าจัดการรายชื่อ (§3/§4/§5)
  const prevMonthStart = addMonths(monthStart, -1);
  const prevMonthLabel = formatThaiMonthYear(prevMonthStart);
  const previousMonthIds = useMemo(() => { void rosterRev; return getRosterIds(previousMonthKey(monthKey)); }, [monthKey, rosterRev]);

  // คนที่ลาครอบคลุมทั้งเดือน (สำหรับตัดออกจากรายชื่อแนะนำ §5)
  const fullMonthLeaveIds = useMemo(() => {
    const s = new Set<string>();
    for (const l of leaders) {
      const evs = rowsByLeader.get(l.id) ?? [];
      if (evs.some((e) => (e.kind === 'leave' || e.kind === 'unavailable') && e.start <= winStart && e.end >= winEnd)) s.add(l.id);
    }
    return s;
  }, [leaders, rowsByLeader, winStart, winEnd]);

  const suggestedIds = useMemo(
    () => suggestRoster([...leaderInfo.values()], new Set(previousMonthIds), fullMonthLeaveIds),
    [leaderInfo, previousMonthIds, fullMonthLeaveIds],
  );

  /**
   * ผู้ที่เลือกเข้ารายชื่อประจำเดือนได้ = สถานะโปรไฟล์ “ใช้งาน” เท่านั้น
   * ผู้ที่ถูกระงับการใช้งาน/สิ้นสุดการร่วมงานต้องไม่ถูกมอบหมายงานใหม่ (ยังเห็นงานเดิมในตารางได้)
   * ความพร้อมรับงานและวันลาใช้ตรวจความพร้อมตามวัน — ไม่ใช่เงื่อนไขตรงนี้
   * ⚠️ ห้ามใช้รหัสพนักงาน หน่วยงาน หรือวันที่เริ่มงานเป็นเงื่อนไขในการจัดสเก็ต
   */
  const rosterCandidates = useMemo<RosterCandidate[]>(() => leaders.filter((l) => l.usageStatus === 'active').map((l) => {
    const exp = getLeaderExpertise(l, countries, routes);
    const info = leaderInfo.get(l.id)!;
    return {
      id: l.id,
      name: leaderDisplayName(l),
      nickname: l.nickname,
      status: l.status,
      leaderType: l.leaderType,
      expertise: exp.countryRoutes.slice(0, 3).join(' · '),
      leaveText: info.hasLeave ? 'มีวันลา/ช่วงไม่พร้อม' : null,
      info,
      searchText: [l.nickname, l.firstName, l.lastName, l.id, exp.countryRoutes.join(' ')].join(' '),
    };
  }), [leaders, countries, routes, leaderInfo]);

  const step = (dir: -1 | 1) => setCursor(addMonths(cursor, dir));
  const rangeLabel = formatThaiMonthYear(cursor);
  const toggleGroup = (id: string) => setCollapsed((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const hasFilter = search.trim() !== '' || onlyFree || onlyWithJobs || boardFilter !== null
    || (filterMode === 'type' && typeFilter.length > 0)
    || (filterMode === 'expertise' && (expCountries.length > 0 || expRoutes.length > 0));
  const resetFilters = () => {
    setSearch(''); setOnlyFree(false); setOnlyWithJobs(false); setBoardFilter(null);
    setExpCountries([]); setExpRoutes([]); setTypeFilter(SCHEDULE_TYPE_FILTER_DEFAULT);
  };

  /** จัดงานให้ไม่ได้เมื่อหนังสือเดินทางหมดอายุหรือเหลืออายุไม่ถึง 6 เดือน (passportBlocksScheduling) */
  const passportBlocksLeader = (l: TourLeader) => passportBlocksScheduling(passportStatus(getPassportExpiry(l.id), today));
  const passportBlockToast = (l: TourLeader) => pushToast('error', `จัดงานให้ ${leaderDisplayName(l)} ไม่ได้ — หนังสือเดินทางหมดอายุหรือเหลืออายุไม่ถึง 6 เดือน`);
  /** ช่องทางเปิดหน้าต่างมอบหมายงานทุกทาง (คลิกช่องวัน ฯลฯ) ผ่านจุดเดียวนี้ — กันไว้ตรงนี้จึงครอบคลุมทุกจุดที่เรียก setAddTarget */
  const setAddTarget = (t: { leader: TourLeader; date: string } | null) => {
    if (t && passportBlocksLeader(t.leader)) { passportBlockToast(t.leader); return; }
    setAddTargetRaw(t);
  };

  // วางแถบงานลงหัวหน้าทัวร์ใหม่ (§6) — ผ่าน confirm + เหตุผล
  const onDropLeader = (toLeader: TourLeader) => {
    if (!drag || drag.fromLeaderId === toLeader.id) { setDrag(null); return; }
    if (passportBlocksLeader(toLeader)) { setDrag(null); passportBlockToast(toLeader); return; }
    const a = assignments.find((x) => x.assignmentId === drag.assignmentId) ?? null;
    setDrag(null);
    if (!a) return;
    const period = periodById.get(a.periodId);
    if (!period) return;
    setReassign({ assignment: a, period, from: leaders.find((l) => l.id === a.tourLeaderId) ?? null, to: toLeader });
  };

  const nowStamp = `${today}T00:00`;

  /* -------------------- รายชื่อประจำเดือน — handlers (§6-§11/§15) -------------------- */
  const reloadRoster = () => setRosterRev((v) => v + 1);
  // §4/§8 อัปเดตทันทีไม่ reload หน้า — บันทึกแบบเพิ่ม/นำออกเฉพาะส่วน + สั่งอ่านใหม่
  const doSaveRoster = (orderedIds: string[]) => {
    const { added, kept, removed } = saveRoster(monthKey, orderedIds, { by: currentUser.name, at: nowStamp });
    reloadRoster();
    setRosterOpen(false);
    const diff = `เพิ่มใหม่ ${added.length} คน · คงเดิม ${kept.length} คน · นำออก ${removed.length} คน`;
    pushToast('success', `อัปเดตรายชื่อหัวหน้าทัวร์ประจำเดือนเรียบร้อยแล้ว (${diff})`);
  };
  const addLeaderToRoster = (leader: TourLeader, source: 'manual' | 'assigned_job') => {
    addToRoster(monthKey, leader.id, source, { by: currentUser.name, at: nowStamp });
    reloadRoster();
    setTemporaryIds((prev) => { const n = new Set(prev); n.delete(leader.id); return n; });
    pushToast('success', `เพิ่ม ${leaderDisplayName(leader)} เข้ารายชื่อ ${rangeLabel} แล้ว`);
  };
  const showLeaderTemporarily = (leader: TourLeader) => {
    setTemporaryIds((prev) => new Set(prev).add(leader.id));
    pushToast('info', `แสดง ${leaderDisplayName(leader)} ชั่วคราวในเดือนนี้`);
  };
  // §9 นำออกจากรายชื่อ — ไม่ลบงาน/ลา/สถานะ · มีงานให้ย้ายไปกลุ่มนอกชุด
  const requestRemoveFromRoster = (leader: TourLeader) => {
    const jobCount = leaderInfo.get(leader.id)?.jobCount ?? 0;
    if (jobCount > 0) { setRemovePrompt({ leader, jobCount }); return; }
    removeFromRoster(monthKey, leader.id, { by: currentUser.name, at: nowStamp });
    reloadRoster();
    pushToast('info', `นำ ${leaderDisplayName(leader)} ออกจากรายชื่อเดือนนี้แล้ว`);
  };
  const confirmRemoveFromRoster = () => {
    if (!removePrompt) return;
    removeFromRoster(monthKey, removePrompt.leader.id, { by: currentUser.name, at: nowStamp });
    reloadRoster();
    pushToast('info', `นำ ${leaderDisplayName(removePrompt.leader)} ออกแล้ว — งานไม่ถูกลบ ยังแสดงในกลุ่มผู้มีงานนอกชุด`);
    setRemovePrompt(null);
  };

  // §8 มอบหมาย/เปลี่ยน/เปลี่ยนสถานะ/ยกเลิก — เก็บเฉพาะ periodId + snapshot (§7) · อัปเดต state ทันที
  /**
   * มอบหมายหลายกรุ๊ปรวดเดียว — assignPeriod อ่าน/เขียนที่เก็บใหม่ทุกครั้ง วนเรียกจึงไม่ทับกันเอง
   * รายงานผลรวมครั้งเดียว ไม่ยิง Toast ทีละกรุ๊ปจนท่วมจอ
   */
  const performAssignMany = (leader: TourLeader, list: TourPeriodMaster[], note: string) => {
    const failed: string[] = [];
    const succeeded: TourPeriodMaster[] = [];
    let rows: GuidePeriodAssignment[] | null = null;
    for (const period of list) {
      const fresh = getTourPeriodById(period.internalId) ?? period;
      const res = assignPeriod(period.internalId, leader.id, currentUser.name, nowStamp, note || undefined, periodSnapshotOf(fresh));
      if (res.ok) { rows = res.rows; succeeded.push(fresh); }
      else failed.push(`${period.groupCode} (${res.error})`);
    }
    if (rows) setAssignments(rows);
    const done = succeeded.length;
    if (done > 0) pushToast('success', `มอบหมาย ${done} กรุ๊ปให้ ${leaderDisplayName(leader)} แล้ว`);
    if (failed.length > 0) pushToast('error', `มอบหมายไม่สำเร็จ ${failed.length} กรุ๊ป — ${failed.join(' · ')}`);
    setAddTarget(null);

    // ผู้จัดหัวหน้าทัวร์เป็นคนระบุว่ากรุ๊ปไหนคือกรุ๊ปชดเชย — เสนอให้ทันทีถ้าไกด์คนนี้มีงานค้างชดเชยอยู่
    if (succeeded.length > 0) {
      const pending = cancellationsForLeader(guideCancellations, leader.id).filter((r) => r.compensationStatus === 'pending');
      if (pending.length > 0) {
        setCompensatePrompt({
          leader,
          pendingRecords: pending,
          assignedGroups: succeeded.map((p) => ({ code: p.groupCode, title: p.displayName })),
        });
      }
    }
  };

  const doAssignMany = (leader: TourLeader, list: TourPeriodMaster[], note: string) => {
    if (list.length === 0) return;
    if (passportBlocksLeader(leader)) { passportBlockToast(leader); setAddTarget(null); return; }
    // §8 จัดงานให้คนนอกชุดรายชื่อ → ถามครั้งเดียวสำหรับทั้งชุด ไม่ถามซ้ำทีละกรุ๊ป
    if (rosterDefined && !rosterSet.has(leader.id)) {
      setAssignPrompt({ leader, periods: list, note });
      setAddTarget(null);
      return;
    }
    performAssignMany(leader, list, note);
  };
  const doAcknowledge = (assignmentId: string, period: TourPeriodMaster) => {
    setAssignments(acknowledgeChange(assignmentId, periodSnapshotOf(period), currentUser.name, nowStamp));
    pushToast('success', 'รับทราบการเปลี่ยนแปลงและอัปเดตตามต้นทางแล้ว');
  };
  const doReassign = (reason: string) => {
    if (!reassign) return;
    if (passportBlocksLeader(reassign.to)) { passportBlockToast(reassign.to); setReassign(null); return; }
    const fresh = getTourPeriodById(reassign.period.internalId);
    const res = reassignPeriod(reassign.assignment.assignmentId, reassign.to.id, currentUser.name, nowStamp, reason, fresh?.saleStatus);
    if (!res.ok) {
      pushToast('error', res.error);
      setReassign(null);
      return;
    }
    setAssignments(res.rows);
    pushToast('success', `ย้าย ${reassign.period.groupCode} → ${leaderDisplayName(reassign.to)} แล้ว`);
    setReassign(null);
  };
  /** เปิดหน้าต่างยืนยันก่อนเสมอ — ไม่ถอดทันทีจากปุ่มเดียว */
  const askUnassign = (assignmentId: string) => {
    const a = assignments.find((x) => x.assignmentId === assignmentId);
    if (!a) return;
    const p = periodById.get(a.periodId) ?? null;
    const leader = leaders.find((l) => l.id === a.tourLeaderId) ?? null;
    setRemoveAssign({
      assignment: a, period: p,
      leaderName: leader ? leaderDisplayName(leader) : a.tourLeaderId,
      cause: isNoSellPeriod(p) ? 'โปรแกรมเปลี่ยนเป็น NO SELL' : 'ยกเลิกการมอบหมายตามการตัดสินใจของผู้จัด',
    });
  };

  /**
   * ยืนยันถอดหัวหน้าทัวร์ — Record เดิมไม่ถูกลบ (ทำเครื่องหมายว่าถอดแล้วพร้อมผู้ทำ/เวลา/หมายเหตุ)
   * ช่วงเวลาของหัวหน้าทัวร์กลับมาว่างทันทีเพราะ state ตัดรายการที่ถอดแล้วออก (ไม่ต้อง Refresh)
   */
  const doUnassign = (note: string) => {
    if (!removeAssign) return;
    const { assignment, period } = removeAssign;
    const reason = [removeAssign.cause, note.trim()].filter(Boolean).join(' — ');
    unassignPeriod(assignment.assignmentId, currentUser.name, nowStamp, reason, period?.saleStatus);
    setAssignments(loadActiveGuideAssignments());
    pushToast('success', `ถอด ${removeAssign.leaderName} ออกจาก ${period?.groupCode ?? assignment.periodId} แล้ว — ประวัติการจัดเดิมยังตรวจสอบย้อนหลังได้`);
    setRemoveAssign(null);
    setDetailPeriodId(null);
  };

  /** เปิดหน้าต่างยืนยัน "กรุ๊ปนี้ถูกยกเลิก" — แยกจากการถอดหัวหน้าทัวร์ปกติ (askUnassign) */
  const askCancelGroup = (assignmentId: string) => {
    const a = assignments.find((x) => x.assignmentId === assignmentId);
    if (!a) return;
    const p = periodById.get(a.periodId) ?? null;
    const leader = leaders.find((l) => l.id === a.tourLeaderId) ?? null;
    setCancelGroupTarget({
      assignment: a, period: p,
      leaderName: leader ? leaderDisplayName(leader) : a.tourLeaderId,
    });
  };

  /**
   * ยืนยันว่ากรุ๊ปนี้ถูกยกเลิกทั้งหมด — ถอดหัวหน้าทัวร์ออก (เหมือนถอดปกติ) และบันทึกประวัติถูกยกเลิกงาน
   * + ตั้ง Reminder ให้จัดงานชดเชยตั้งแต่เดือนถัดไป — คนละอย่างกับการถอด/สลับคนตามปกติที่ไม่บันทึกประวัตินี้
   */
  const doCancelGroup = (note: string) => {
    if (!cancelGroupTarget) return;
    const { assignment, period, leaderName } = cancelGroupTarget;
    const reason = ['กรุ๊ปถูกยกเลิกทั้งหมด', note.trim()].filter(Boolean).join(' — ');
    unassignPeriod(assignment.assignmentId, currentUser.name, nowStamp, reason, period?.saleStatus);
    setAssignments(loadActiveGuideAssignments());
    void recordGuideGroupCancellation({
      leaderId: assignment.tourLeaderId,
      groupCode: period?.groupCode ?? assignment.periodId,
      periodTitle: period?.displayName ?? assignment.periodId,
      route: period?.route ?? null,
      travelDate: period?.startDate ?? today,
      returnDate: period?.endDate ?? period?.startDate ?? today,
    });
    pushToast('success', `บันทึกว่ากรุ๊ปนี้ถูกยกเลิกแล้ว — ถอด ${leaderName} ออก และตั้งเตือนจัดงานชดเชย`);
    setCancelGroupTarget(null);
    setDetailPeriodId(null);
  };

  return (
    <div className="space-y-3">
      {/* ปรับแต่งรายชื่อเฉพาะเดือน — มุมขวาบน เหนือการ์ดค้นหา/ตัวกรอง */}
      <div className="flex justify-end">
        <Button size="sm" variant="secondary" onClick={() => setRosterOpen(true)}>
          {rosterDefined ? 'แก้ไขรายชื่อเดือนนี้' : 'กำหนดรายชื่อ'}
        </Button>
      </div>

      {/* ---------------- Toolbar / Filters — แถวเดียว: เดือน (ซ้าย) + ค้นหา/ตัวกรอง (§4) ---------------- */}
      {/* overflow-visible — การ์ดตั้งต้นเป็น overflow:hidden ซึ่งตัดกล่องรายการของ dropdown ตัวกรอง (ประเทศ/เส้นทาง/รูปแบบ) ที่ยื่นลงพ้นขอบการ์ด */}
      <Card padded={false} className="overflow-visible">
        {/*
          แถวค้นหา/ตัวกรอง — Desktop กว้างอยู่แถวเดียว (nowrap) · Tablet ลงมาเป็นสองแถวเอง (wrap)
          ลำดับ: เดือน → ค้นหา → กรองด้วย (รูปแบบการร่วมงาน / ประเทศ · เส้นทาง)
                 → คนว่าง/คนมีงาน → (ล้างค่า)
          ปุ่ม "กำหนดรายชื่อ" ย้ายไปอยู่มุมขวาบนเหนือการ์ดนี้แล้ว ไม่อยู่ในแถบนี้
          ช่องค้นหาเป็นตัวเดียวที่ยืด/หดได้ (flex-1) ตัวอื่น shrink-0 จึงไม่ถูกบีบจนข้อความขาด
          ทุก control สูงเท่ากันที่ 38px ผ่าน [&_select]/[&_input] เพื่อไม่ต้องไล่ใส่ทีละอัน
        */}
        <div className="flex flex-wrap items-center gap-2 px-3 py-2 2xl:flex-nowrap [&_input[type=search]]:h-[38px] [&_select]:h-[38px]">
          {/* 1-3 เลือกเดือน */}
          <div className="inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap">
            <button type="button" onClick={() => step(-1)} aria-label="ก่อนหน้า" className="zego-icon-btn zego-hover-surface rounded-md p-1.5"><Icon name="chevronLeft" className="h-4 w-4" /></button>
            <span className="min-w-[6.5rem] text-center text-sm font-semibold zego-text-secondary">{rangeLabel}</span>
            <button type="button" onClick={() => step(1)} aria-label="ถัดไป" className="zego-icon-btn zego-hover-surface rounded-md p-1.5"><Icon name="chevronRight" className="h-4 w-4" /></button>
          </div>

          {/* 5 ค้นหา — ยืดหยุ่นมากที่สุด หดก่อนเพื่อนเมื่อพื้นที่ไม่พอ */}
          <div className="min-w-[9rem] flex-1 basis-[11rem]">
            <SearchBox value={search} onChange={setSearch} placeholder="ค้นหาชื่อ นามสกุล หรือชื่อเล่น" label="ค้นหาหัวหน้าทัวร์" />
          </div>

          {/* 6 สลับว่าจะกรองด้วยอะไร — เลือกได้ทีละอย่าง จึงไม่กินที่ทั้งสองชุดพร้อมกัน */}
          <div className="shrink-0">
            <SegmentedControl
              label="กรองด้วย"
              value={filterMode}
              onChange={setFilterMode}
              options={[
                { value: 'type', label: 'รูปแบบร่วมงาน' },
                { value: 'expertise', label: 'ประเทศ/เส้นทาง' },
              ]}
            />
          </div>

          {filterMode === 'type' && (
          <div className="w-[13rem] shrink-0">
            <TagMultiSelect
              ariaLabel="รูปแบบการร่วมงาน"
              showTags={false}
              summary={typeFilter.length === 0
                ? 'ทุกรูปแบบการร่วมงาน'
                : typeFilter.length === 1
                  ? LEADER_TYPE[typeFilter[0]].label
                  : `${typeFilter.length} รูปแบบ`}
              searchPlaceholder="ค้นหารูปแบบการร่วมงาน…"
              emptyText="ไม่พบรูปแบบที่ค้นหา"
              options={LEADER_TYPE_ORDER.map((t) => LEADER_TYPE[t].label)}
              counts={typeCounts}
              selected={typeFilter.map((t) => LEADER_TYPE[t].label)}
              onChange={(labels) => setTypeFilter(LEADER_TYPE_ORDER.filter((t) => labels.includes(LEADER_TYPE[t].label)))}
            />
          </div>
          )}

          {/*
            7 ประเทศ / เส้นทางที่เชี่ยวชาญ — คุณสมบัติของตัวหัวหน้าทัวร์ (ชุดเดียวกับที่แสดงในแถว
            และที่ช่องค้นหาใช้) ไม่ใช่ประเทศของงานในเดือนนั้น
          */}
          {filterMode === 'expertise' && (
          <>
          <div className="w-[9rem] shrink-0">
            <TagMultiSelect
              ariaLabel="ประเทศที่เชี่ยวชาญ"
              showTags={false}
              summary={expCountries.length === 0
                ? 'ทุกประเทศ'
                : expCountries.length === 1 ? expCountries[0] : `${expCountries.length} ประเทศ`}
              searchPlaceholder="ค้นหาประเทศ…"
              emptyText={expertiseOptions.countries.length === 0
                ? 'ยังไม่มีหัวหน้าทัวร์ที่ระบุประเทศที่เชี่ยวชาญ'
                : 'ไม่พบประเทศที่ค้นหา'}
              options={expertiseOptions.countries}
              selected={expCountries}
              onChange={changeExpCountries}
            />
          </div>

          <div className="w-[8.5rem] shrink-0">
            <TagMultiSelect
              ariaLabel="เส้นทางที่เชี่ยวชาญ"
              showTags={false}
              summary={expRoutes.length === 0
                ? (expCountries.length > 0 ? 'ทุกเส้นทางของประเทศที่เลือก' : 'ทุกเส้นทาง')
                : expRoutes.length <= 2 ? expRoutes.join(', ') : `${expRoutes.length} เส้นทาง`}
              searchPlaceholder="ค้นหาเส้นทาง…"
              emptyText={expertiseOptions.routes.length === 0
                ? 'ยังไม่มีหัวหน้าทัวร์ที่ระบุเส้นทางที่เชี่ยวชาญ'
                : 'ไม่พบเส้นทางที่ค้นหา'}
              options={expertiseOptions.routes}
              groups={expertiseOptions.routeGroups}
              selected={expRoutes}
              onChange={setExpRoutes}
            />
          </div>
          </>
          )}

          {/*
            8-9 คนว่าง / คนมีงาน — เลือกได้ทีละตัว · ข้อความสั้นลง อธิบายเต็มใน tooltip
            ซ้อนสองบรรทัดในคอลัมน์เดียว ประหยัดความกว้างของแถบไปได้ราวครึ่งหนึ่ง
          */}
          <div className="flex shrink-0 flex-col gap-0.5">
            <label title="แสดงเฉพาะหัวหน้าทัวร์ที่ไม่มีงานในช่วงที่เลือก"
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm zego-text-secondary">
              <input type="checkbox" checked={onlyFree} onChange={(e) => { setOnlyFree(e.target.checked); if (e.target.checked) setOnlyWithJobs(false); }} className="zego-border-color h-4 w-4 rounded border" />
              คนว่าง
            </label>
            <label title="แสดงเฉพาะหัวหน้าทัวร์ที่มีงานในช่วงที่เลือก"
              className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm zego-text-secondary">
              <input type="checkbox" checked={onlyWithJobs} onChange={(e) => { setOnlyWithJobs(e.target.checked); if (e.target.checked) setOnlyFree(false); }} className="zego-border-color h-4 w-4 rounded border" />
              คนมีงาน
            </label>
          </div>

          {hasFilter && <Button className="shrink-0 whitespace-nowrap" variant="ghost" size="sm" onClick={resetFilters}>ล้างค่า</Button>}
        </div>
        {/*
          แถบสรุปสถานะการจัด (คลิกเพื่อกรอง) + คำอธิบายสีความพร้อม คั่นด้วยเส้นแนวตั้ง
          • จำนวนนับจากงานจริงในเดือนที่เปิด ตามตัวกรอง/คำค้นปัจจุบัน — ไม่ Hardcode
          • สีจุดใช้ Mapping กลางชุดเดียวกับสีแถบงานบนตาราง (BOARD_STATUS)
          • Mobile เลื่อนแนวนอนได้เฉพาะแถบนี้ (overflow-x-auto) ไม่ทำให้ทั้งหน้าเลื่อน
        */}
        <div className="zego-divider-top flex items-center gap-x-3 gap-y-1 overflow-x-auto px-3 py-1 md:flex-wrap md:overflow-visible">
          <span className="shrink-0 whitespace-nowrap text-[11px] font-medium zego-text-tertiary">สถานะการจัด:</span>
          {BOARD_STATUS_ORDER.map((s) => {
            const on = boardFilter === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={on}
                data-testid="board-chip"
                data-status={s}
                onClick={() => setBoardFilter(on ? null : s)}
                className={cx(
                  'inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] transition-colors',
                  on ? 'zego-badge--info font-medium' : 'zego-surface-bg zego-border-color zego-text-secondary zego-hover-surface',
                )}
              >
                <span className={cx('h-2 w-2 rounded-full', BOARD_STATUS[s].dot)} />
                {BOARD_STATUS[s].label}
                <span className={cx('text-[10px]', on ? 'zego-text-info' : 'zego-text-tertiary')}>{boardCounts[s] ?? 0}</span>
              </button>
            );
          })}

          <span className="mx-0.5 h-3.5 w-px shrink-0 bg-[var(--zego-border-strong)]" />

          {(['leave', 'company', 'unavailable', 'cancelled'] as const).map((k) => (
            <span key={k} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] zego-text-tertiary"><span className="h-2 w-2 rounded-sm" style={{ background: LEAVE_BG[k] }} />{LEAVE_STYLE[k].legend}</span>
          ))}
        </div>
      </Card>

      {/*
        ไม่มีแถบ "ยังไม่ได้กำหนดรายชื่อ" อีกต่อไป — เดือนที่ยังไม่ตั้งค่าจะใช้หัวหน้าทัวร์ประจำ
        ที่สถานะใช้งานเป็นค่าเริ่มต้นทันที · ปรับแต่งรายชื่อได้ที่ปุ่ม "กำหนดรายชื่อ" บนแถบเครื่องมือ
      */}

      {/* §3 ค้นเจอคนนอกชุดรายชื่อ → เพิ่ม/แสดงชั่วคราว */}
      {searchOutside.length > 0 && (
        <Callout tone="blue" title={`พบหัวหน้าทัวร์ที่ยังไม่อยู่ในรายชื่อ ${rangeLabel} ${searchOutside.length} คน`}>
          <ul className="mt-1 space-y-1">
            {searchOutside.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium zego-text">{leaderDisplayName(l)}</span>
                <span className="text-xs zego-text-tertiary">{l.id}</span>
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => addLeaderToRoster(l, 'manual')}>เพิ่มเข้าเดือนนี้</Button>
                  <Button size="sm" variant="ghost" onClick={() => showLeaderTemporarily(l)}>แสดงชั่วคราว</Button>
                </span>
              </li>
            ))}
          </ul>
        </Callout>
      )}

      {/*
        §4 Banner โปรแกรม NO SELL ที่ยังมีหัวหน้าทัวร์อยู่ — ต้องให้ผู้จัดยืนยันถอดเอง
        ระบบไม่ถอดให้อัตโนมัติ · กด "ถอดหัวหน้าทัวร์" เพื่อเปิดหน้าต่างยืนยันทีละรายการ
      */}
      {canAssign && noSellPending.length > 0 && (
        <Callout tone="red" title={`พบ ${noSellPending.length} โปรแกรมที่เปลี่ยนเป็น NO SELL แต่ยังมีหัวหน้าทัวร์ถูกจัดอยู่`}>
          <div className="mt-1 space-y-1.5">
            {noSellPending.slice(0, 5).map((x) => (
              <div key={x.assignment.assignmentId} data-testid="no-sell-row" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-mono font-semibold zego-text">{x.period.groupCode}</span>
                {x.period.bus && x.period.bus !== '-' && <span className="text-xs zego-text-tertiary">({x.period.bus})</span>}
                <span className="zego-text-secondary">{x.leaderName}</span>
                <span className="text-xs zego-text-tertiary">{formatDateRange(x.period.startDate, x.period.endDate)}</span>
                {x.overdue && <span className="zego-badge--danger rounded px-1.5 text-[11px] font-medium">เกินกำหนดดำเนินการ</span>}
                <span className="ml-auto flex gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => setDetailPeriodId(x.period.internalId)}>ดูรายการ</Button>
                  <Button size="sm" variant="danger" onClick={() => setRemoveAssign({
                    assignment: x.assignment, period: x.period, leaderName: x.leaderName,
                    cause: 'โปรแกรมเปลี่ยนเป็น NO SELL',
                  })}>ถอดหัวหน้าทัวร์</Button>
                </span>
              </div>
            ))}
            {noSellPending.length > 5 && (
              <p className="text-xs zego-text-tertiary">และอีก {noSellPending.length - 5} รายการ — ทยอยถอดทีละรายการจนครบ รายการถัดไปจะขึ้นมาแทนที่</p>
            )}
          </div>
        </Callout>
      )}

      {/* §9 แจ้งเตือนเมื่อ Master เปลี่ยน/พีเรียดปิด — ไม่ลบ Assignment อัตโนมัติ · ให้ผู้จัด Review */}
      {affected.length > 0 && (
        <Callout tone="amber" title={`มีการมอบหมายที่ได้รับผลกระทบจากข้อมูลต้นทาง ${affected.length} รายการ — กรุณาตรวจสอบตารางหัวหน้าทัวร์`}>
          <ul className="mt-1 space-y-0.5 text-xs">
            {affected.slice(0, 8).map((x) => (
              <li key={x.assignmentId}>
                <button type="button" className="font-mono font-semibold zego-text-warning underline" onClick={() => setDetailPeriodId(x.periodId)}>{x.code}</button>
                {' '}· {x.leaderName} — {x.issues.map((i) => i.detail ?? i.label).join(' · ')}
              </li>
            ))}
            {affected.length > 8 && <li>… และอีก {affected.length - 8} รายการ</li>}
          </ul>
          {/*
            เคลียร์เฉพาะรายการที่พีเรียดหายจากต้นทางเท่านั้น
            รายการที่พีเรียดยังอยู่ (ข้อมูลเปลี่ยน/ถูกปิด) ต้องให้ผู้จัดตัดสินใจเอง ไม่เคลียร์ให้
          */}
          {canAssign && orphanAssignments.length > 0 && (
            <div className="mt-2">
              <Button size="sm" variant="secondary" onClick={() => setConfirmClearOrphans(true)}>
                เคลียร์รายการที่พีเรียดหายจากต้นทาง ({orphanAssignments.length})
              </Button>
            </div>
          )}
        </Callout>
      )}

      {/* ---------------- Desktop/Tablet Timeline — เห็นครบทั้งเดือน ไม่มี h-scroll (§2) · เลื่อนแนวตั้งเฉพาะรายชื่อ (§7/§8) ---------------- */}
      <div className="zego-card-surface hidden w-full max-w-full overflow-x-hidden overflow-y-auto md:block" style={{ maxHeight: 'calc(100vh - 13rem)', scrollbarGutter: 'stable' }}>
        {/* หัวตาราง (วันที่) — Sticky top */}
        <div className="zego-border-color zego-surface-soft-bg sticky top-0 z-30 border-b" style={{ display: 'grid', gridTemplateColumns: gridCols, height: HEAD_H }}>
          {/* §11 นับตามสิ่งที่แสดงจริง — ไม่โชว์ยอดรวมทั้งระบบ */}
          <div className="zego-border-color sticky left-0 z-10 flex items-center truncate border-r zego-surface-soft-bg px-2 text-xs font-semibold zego-text-tertiary" style={{ gridColumn: '1 / 2' }}
            title={`หัวหน้าทัวร์ที่ผ่านตัวกรองทั้งหมด ${shownLeaders.length} คน`}>
            <span className="truncate">{`${shownLeaders.length} คน`}</span>
          </div>
          {days.map((iso) => {
            const d = parseDate(iso);
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            const holiday = holidays.get(iso);
            const isToday = iso === today;
            const isOverflow = iso > monthEnd; // วันที่ต่อจากกรุ๊ปคาบเดือน — จริงๆ อยู่เดือนถัดไป
            return (
              <div
                key={iso}
                // วันหยุดใช้พื้นชมพูอ่อน แยกจากเสาร์-อาทิตย์ที่เป็นพื้นเทา — ไม่งั้นแดงเหมือนกันจนแยกไม่ออกว่าหยุดเพราะอะไร
                // วันคาบเดือนถัดไปใช้พื้นม่วงอ่อน + เส้นซ้ายหนาที่วันแรก ให้รู้ทันทีว่าข้ามเดือนแล้ว
                title={holiday ? `${formatDate(iso)} — ${holiday.name}` : isOverflow ? `${formatDate(iso)} — เดือนถัดไป` : undefined}
                className={cx('zego-border-color flex min-w-0 flex-col items-center justify-center gap-0.5 border-r last:border-r-0', holiday ? 'bg-rose-50' : isOverflow ? 'bg-indigo-50/60' : weekend && 'zego-surface-soft-bg', isOverflow && iso === addDays(monthEnd, 1) && 'border-l-2 border-l-indigo-300')}
                style={{ padding: '5px 0' }}
              >
                <span className={cx(cfg.dayNum, 'font-semibold leading-none', isToday ? 'zego-today-badge inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-0.5' : holiday ? 'zego-text-danger' : isOverflow ? 'text-indigo-500' : weekend ? 'zego-text-danger' : 'zego-text-secondary')}>{d.getDate()}</span>
                <span className={cx(cfg.dow, 'max-w-full truncate leading-tight', holiday ? 'font-semibold zego-text-danger' : isOverflow ? 'font-semibold text-indigo-400' : weekend ? 'zego-text-danger' : 'zego-text-tertiary')}>
                  {isOverflow ? TH_MONTHS_SHORT[d.getMonth()] : TH_WEEKDAYS_SHORT[d.getDay()]}
                </span>
                {holiday && <span className="sr-only">วันหยุด: {holiday.name}</span>}
              </div>
            );
          })}
        </div>

        {/*
          ว่างเปล่าได้ 2 กรณี
            • มีคนอยู่แล้วแต่ตัวกรองตัดออกหมด → บอกให้ปรับตัวกรอง
            • ไม่มีหัวหน้าทัวร์ตามรูปแบบที่เลือกที่สถานะ "ใช้งาน" เลย → ให้ไปจัดการข้อมูลหัวหน้าทัวร์
          ไม่แสดงข้อความ "ยังไม่ได้กำหนดรายชื่อ" เพราะไม่จำเป็นต้องกำหนดรายชื่อก่อนใช้งาน
        */}
        {/*
          §7 มีรายชื่อแล้วแต่ยังไม่มีงานที่มอบหมายในช่วงนี้ → บอกให้ชัด
          (ไม่สร้างแถบสีหรือข้อมูลตัวอย่างเพื่อให้ดูเหมือนมีสถานะ)
        */}
        {shownLeaders.length > 0 && assignedJobCount === 0 && (
          <p data-testid="no-assignment-note" className="zego-divider-bottom zego-surface-soft-bg px-4 py-2.5 text-center text-xs zego-text-tertiary">
            {rangeLabel} ยังไม่มีงานที่ได้รับมอบหมาย — คลิกช่องวันของหัวหน้าทัวร์เพื่อจัดงาน
          </p>
        )}

        {shownLeaders.length === 0 && (
          <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
            <p className="text-sm zego-text-tertiary">
              {hasDefaultCandidates
                ? 'ไม่พบหัวหน้าทัวร์ตามเงื่อนไขที่เลือก'
                : rosterDefined
                  ? 'ไม่พบหัวหน้าทัวร์ที่อยู่ในสถานะใช้งาน'
                  : 'ยังไม่ได้ปักดาวหัวหน้าทัวร์คนไหนไว้ — ตารางนี้แสดงเฉพาะ "ไกด์ของฉัน" เป็นค่าเริ่มต้น'}
            </p>
            {hasDefaultCandidates ? (
              hasFilter && <Button size="sm" variant="secondary" onClick={resetFilters}>ล้างตัวกรอง</Button>
            ) : rosterDefined ? (
              <Button size="sm" variant="primary" onClick={() => router.push('/leaders')}>
                จัดการข้อมูลหัวหน้าทัวร์
              </Button>
            ) : (
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" variant="primary" onClick={() => router.push('/leaders?fav=1')}>
                  ไปปักดาวไกด์ของฉัน
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setRosterOpen(true)}>
                  กำหนดรายชื่อเดือนนี้เอง
                </Button>
              </div>
            )}
          </div>
        )}

        {/*
          หมวดตาม "รูปแบบการร่วมงาน" — Group Header เตี้ยกว่าแถวคน · พาดเต็มความกว้าง
          z-[2] ต่ำกว่าหัววันที่ (z-30) จึงไม่ทับกันเวลาเลื่อนแนวตั้ง
          ปุ่มพับอยู่ในคอลัมน์รายชื่อและ sticky ซ้ายเหมือนแถวข้อมูล
        */}
        {typeSections.map((section) => {
          // เหลือหมวดเดียว (เช่นกรองรูปแบบเดียว) → เปิดเสมอ ไม่ต้องให้ผู้ใช้กดขยายซ้ำ
          const isCollapsed = typeSections.length > 1 && collapsed.has(section.id);
          return (
            <Fragment key={section.id}>
              <div
                data-testid="schedule-group-header"
                data-group={section.id}
                className="zego-border-color flex w-full items-center border-y bg-[var(--zego-surface-inset)] py-0.5"
              >
                <button
                  type="button"
                  onClick={() => toggleGroup(section.id)}
                  aria-expanded={!isCollapsed}
                  className="sticky left-0 flex items-center gap-1.5 px-2 text-left"
                >
                  <Icon name="chevronDown" className={cx('h-3.5 w-3.5 zego-text-tertiary transition-transform', isCollapsed && '-rotate-90')} />
                  <span className="text-xs font-bold tracking-wide zego-text-secondary">
                    {section.label} ({section.members.length} คน)
                  </span>
                </button>
              </div>
              {!isCollapsed && section.members.map((leader) => (
                <LeaderRow
                  key={leader.id}
                  leader={leader}
                  events={rowsByLeader.get(leader.id) ?? []}
                  days={days} holidays={holidays} winStart={winStart} winEnd={winEnd} monthEnd={monthEnd} today={today} cfg={cfg} gridCols={gridCols} viewMode="month"
                  countries={countries} routes={routes}
                  expertise={expertiseByLeader.get(leader.id)?.summary}
                  // Reminder ชดเชยงาน — มีประวัติถูกยกเลิกงานในเดือนถัดจากที่ถูกยกเลิก (เดือนเดียว) แสดงความคืบหน้าเป็น ทั้งหมด/ชดเชยแล้ว
                  compensationProgress={compensationProgress(guideCancellations, leader.id, monthKey)}
                  onOpenReminder={() => setReminderDetailLeader(leader)}
                  // ปุ่มเพิ่ม/นำออกจากรายชื่อเดือน — ไม่เปลี่ยนรูปแบบการร่วมงานของบุคคล
                  rosterAction={rosterDefined ? (rosterSet.has(leader.id) ? 'remove' : 'add') : null}
                  onRosterAction={() => rosterSet.has(leader.id) ? requestRemoveFromRoster(leader) : addLeaderToRoster(leader, 'manual')}
                  onSelectPeriod={setDetailPeriodId}
                  onOpenInfo={() => setInfoLeader(leader)}
                  onEmptyClick={(date) => setAddTarget({ leader, date })}
                  pickedDate={addTarget?.leader.id === leader.id ? addTarget.date : null}
                  onDragAssignment={(assignmentId) => setDrag({ assignmentId, fromLeaderId: leader.id })}
                  onDropHere={() => onDropLeader(leader)}
                  dragging={!!drag && drag.fromLeaderId !== leader.id}
                />
              ))}
            </Fragment>
          );
        })}
      </div>

      {/* ---------------- Mobile: รายชื่อ → Agenda (§14) ---------------- */}
      <div className="space-y-2 md:hidden">
        {visibleLeaders.length === 0 && <EmptyState title="ไม่พบหัวหน้าทัวร์" description="ลองปรับตัวกรอง" />}
        {visibleLeaders.map((leader) => (
          <MobileLeaderCard key={leader.id} leader={leader} events={rowsByLeader.get(leader.id) ?? []} monthLabel={formatThaiMonthYear(cursor)} onSelectPeriod={setDetailPeriodId} />
        ))}
      </div>

      {/* ---------------- Side Panels ---------------- */}
      <PeriodDetailPanel
        period={detailPeriodId ? periodById.get(detailPeriodId) ?? null : null}
        assignment={detailPeriodId ? assignments.find((a) => a.periodId === detailPeriodId) ?? null : null}
        leaders={leaders} onClose={() => setDetailPeriodId(null)}
        onUnassign={askUnassign} onCancelGroup={askCancelGroup} onAcknowledge={doAcknowledge}
      />
      <LeaderInfoPanel leader={infoLeader} onClose={() => setInfoLeader(null)} countries={countries} routes={routes} today={today}
        assignments={infoLeader ? assignments.filter((a) => a.tourLeaderId === infoLeader.id) : []} periodById={periodById} records={availabilityRecords} />

      {addTarget && (
        <AddAssignmentPanel
          // เปิดใหม่ (คนละคน/คนละวัน) = เริ่มต้นใหม่ทุกช่อง — คำค้นหาและตัวกรองไม่ค้างจากครั้งก่อน
          key={`${addTarget.leader.id}-${addTarget.date}`}
          leader={addTarget.leader} date={addTarget.date}
          // §3 ใช้ monthStart/monthEnd จริงของปฏิทิน ไม่ใช่ winStart/winEnd ที่ต่อวันคาบเดือนไว้ — ให้ยังคง "เลือกข้ามเดือนไม่ได้" แม้ตารางจะแสดงวันเกินเดือนก็ตาม
          monthStart={monthStart} monthEnd={monthEnd} monthLabel={rangeLabel}
          periods={allPeriods} assignedPeriodIds={assignedPeriodIds}
          leaderAssignments={assignments.filter((a) => a.tourLeaderId === addTarget.leader.id)} periodById={periodById}
          appointments={appointments} records={availabilityRecords} buffer={buffer}
          onClose={() => setAddTarget(null)}
          onAssignMany={(list, note) => doAssignMany(addTarget.leader, list, note)}
        />
      )}

      {reassign && <ReassignDialog data={reassign} onClose={() => setReassign(null)} onConfirm={doReassign} />}

      {/* §3/§4/§5 จัดการรายชื่อประจำเดือน */}
      <MonthRosterDrawer
        key={rosterOpen ? `roster-${monthKey}-${rosterRev}` : 'roster-closed'}
        open={rosterOpen}
        onClose={() => setRosterOpen(false)}
        isEdit={rosterDefined}
        monthLabel={rangeLabel}
        previousMonthLabel={prevMonthLabel}
        candidates={rosterCandidates}
        initialSelected={rosterIds}
        previousMonthIds={previousMonthIds}
        suggestedIds={suggestedIds}
        favorited={favorited}
        onSave={doSaveRoster}
      />

      {/* §5 ยืนยันถอดหัวหน้าทัวร์ — แสดงข้อมูลงานครบก่อนตัดสินใจ + บันทึกผู้ทำ/เวลา/หมายเหตุ */}
      <RemoveLeaderDialog
        key={removeAssign?.assignment.assignmentId ?? 'none'}
        data={removeAssign}
        actor={currentUser.name}
        at={nowStamp}
        onCancel={() => setRemoveAssign(null)}
        onConfirm={doUnassign}
      />

      {/* กรุ๊ปนี้ถูกยกเลิกทั้งหมด — ถอดหัวหน้าทัวร์ + บันทึกประวัติ/Reminder การชดเชยงาน (คนละปุ่มกับถอดปกติ) */}
      <CancelGroupDialog
        key={`cancel-${cancelGroupTarget?.assignment.assignmentId ?? 'none'}`}
        data={cancelGroupTarget}
        actor={currentUser.name}
        at={nowStamp}
        onCancel={() => setCancelGroupTarget(null)}
        onConfirm={doCancelGroup}
      />

      {/* รายละเอียดกรุ๊ปที่ถูกยกเลิก + ความคืบหน้าการชดเชย — กดจากป้าย "รอชดเชยงาน"/"ชดเชยครบแล้ว" บนแถวหัวหน้าทัวร์ */}
      <Modal
        open={!!reminderDetailLeader}
        onClose={() => setReminderDetailLeader(null)}
        size="sm"
        title="กรุ๊ปที่ถูกยกเลิก — ความคืบหน้าการชดเชย"
        description={reminderDetailLeader ? leaderDisplayName(reminderDetailLeader) : ''}
        footer={<Button variant="secondary" onClick={() => setReminderDetailLeader(null)}>ปิด</Button>}
      >
        {reminderDetailLeader && (
          <ul className="space-y-2">
            {remindersInWindow(guideCancellations, reminderDetailLeader.id, monthKey).map((r) => (
              <li key={r.id} className="zego-border-color rounded-lg border px-3 py-2.5 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium zego-text">{r.jobId} <span className="font-normal zego-text-tertiary">· {r.jobTitle}</span></p>
                    <p className="mt-0.5 text-xs zego-text-tertiary">เดินทาง {formatDate(r.originalTravelDate)}–{formatDate(r.originalReturnDate)}</p>
                    <p className="mt-0.5 text-xs zego-text-warning">ถูกยกเลิกเมื่อ {formatDate(r.cancelledDate)} · ผู้รับผิดชอบกรุ๊ป {r.responsibleUser}</p>
                    {r.compensationStatus === 'compensated' && (
                      <p className="mt-0.5 text-xs zego-text-success">ชดเชยแล้วด้วย {r.compensatedJobId ?? '—'}{r.compensatedAt ? ` · ${formatDate(r.compensatedAt)}` : ''}</p>
                    )}
                  </div>
                  <span className={cx('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium', r.compensationStatus === 'compensated' ? 'zego-badge--success' : 'zego-badge--warning')}>
                    {r.compensationStatus === 'compensated' ? 'ชดเชยแล้ว' : 'รอชดเชย'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Modal>

      {/* ผู้จัดหัวหน้าทัวร์ระบุว่ากรุ๊ปที่เพิ่งมอบหมายเป็นการชดเชยงานที่ถูกยกเลิกกรุ๊ปไหน */}
      <CompensateAssignmentDialog
        key={compensatePrompt ? `compensate-${compensatePrompt.leader.id}-${compensatePrompt.assignedGroups.map((g) => g.code).join(',')}` : 'compensate-none'}
        data={compensatePrompt}
        onSkip={() => setCompensatePrompt(null)}
        onConfirm={async (recordId, groupCode) => {
          await markGuideCompensated(recordId, groupCode);
          setCompensatePrompt(null);
        }}
      />

      {/* §8 จัดงานให้คนนอกชุดรายชื่อ — 3 ทางเลือก */}
      <Modal
        open={!!assignPrompt}
        onClose={() => setAssignPrompt(null)}
        title="หัวหน้าทัวร์นอกรายชื่อเดือนนี้"
        description={assignPrompt ? `${leaderDisplayName(assignPrompt.leader)} ยังไม่อยู่ในรายชื่อเดือน ${rangeLabel} ต้องการเพิ่มเข้าในรายชื่อเดือนนี้ด้วยหรือไม่` : ''}
        footer={<Button variant="ghost" onClick={() => setAssignPrompt(null)}>ยกเลิก</Button>}
      >
        {assignPrompt && (
          <div className="space-y-2">
            <button type="button" onClick={() => { addLeaderToRoster(assignPrompt.leader, 'assigned_job'); performAssignMany(assignPrompt.leader, assignPrompt.periods, assignPrompt.note); setAssignPrompt(null); }}
              className="zego-selected-border zego-selected-tint zego-hover-selected w-full rounded-lg border-2 p-3 text-left">
              <span className="block text-sm font-semibold zego-text">เพิ่มเข้าเดือนนี้และจัดงาน</span>
              <span className="block text-xs zego-text-tertiary">
                เพิ่มเข้ารายชื่อประจำเดือน แล้วมอบหมาย {assignPrompt.periods.map((x) => x.groupCode).join(' · ')}
              </span>
            </button>
            <button type="button" onClick={() => { performAssignMany(assignPrompt.leader, assignPrompt.periods, assignPrompt.note); setAssignPrompt(null); }}
              className="zego-border-color zego-hover-surface w-full rounded-lg border p-3 text-left">
              <span className="block text-sm font-semibold zego-text">จัดงานโดยไม่เพิ่มเข้ารายชื่อ</span>
              <span className="block text-xs zego-text-tertiary">มอบหมายงานอย่างเดียว — จะแสดงในกลุ่ม “มีงานในเดือนนี้ — นอกชุดรายชื่อ”</span>
            </button>
          </div>
        )}
      </Modal>

      {/* §9 เตือนก่อนนำคนมีงานออก */}
      <ConfirmDialog
        open={confirmClearOrphans}
        onClose={() => setConfirmClearOrphans(false)}
        onConfirm={clearOrphanAssignments}
        title="เคลียร์การมอบหมายที่พีเรียดหายจากต้นทาง"
        message={`จะถอดหัวหน้าทัวร์ออกจาก ${orphanAssignments.length} รายการที่อ้างถึงพีเรียดซึ่งไม่มีอยู่ในแหล่งข้อมูลปัจจุบันแล้ว · ประวัติการจัดเดิมยังตรวจสอบย้อนหลังได้ ไม่ได้ลบทิ้ง`}
        confirmLabel={`เคลียร์ ${orphanAssignments.length} รายการ`}
        tone="danger"
      />

      <ConfirmDialog
        open={!!removePrompt}
        onClose={() => setRemovePrompt(null)}
        onConfirm={confirmRemoveFromRoster}
        title="นำออกจากรายชื่อเดือนนี้"
        message={removePrompt ? `${leaderDisplayName(removePrompt.leader)} มีงานอยู่ ${removePrompt.jobCount} กรุ๊ป การนำออกจะไม่ลบงาน และระบบจะยังแสดงในกลุ่มผู้มีงานนอกชุดรายชื่อ` : ''}
        confirmLabel="นำออก (ไม่ลบงาน)"
        tone="primary"
      />
    </div>
  );
}

/* ================================ Leader Row (CSS Grid) ================================ */

function LeaderRow({ leader, events, days, holidays, winStart, winEnd, monthEnd, today, cfg, gridCols, viewMode, countries, routes, expertise, rosterAction, onRosterAction, onSelectPeriod, onOpenInfo, onEmptyClick, onDragAssignment, onDropHere, dragging, pickedDate, compensationProgress: progress, onOpenReminder }: {
  leader: TourLeader; events: RowEvent[]; days: string[]; holidays: Map<string, Holiday>; winStart: string; winEnd: string; monthEnd: string; today: string;
  cfg: (typeof DENSITY)[Density]; gridCols: string; viewMode: 'month' | 'week'; countries: Country[]; routes: TourRoute[];
  expertise?: ExpertiseSummary;
  rosterAction?: 'add' | 'remove' | null; onRosterAction?: () => void;
  onSelectPeriod: (periodId: string) => void; onOpenInfo: () => void; onEmptyClick: (date: string) => void; onDragAssignment: (assignmentId: string) => void; onDropHere: () => void; dragging: boolean;
  /** §9 วันที่ที่กำลังจัดงานอยู่ของแถวนี้ — ไฮไลต์ชั่วคราวจนกว่าจะปิดหน้าต่าง */
  pickedDate?: string | null;
  /** ความคืบหน้าการชดเชยงานในเดือนที่กำลังดู (เดือนถัดไปจากที่ถูกยกเลิกเท่านั้น) — { total, compensated } เช่น 2/1 */
  compensationProgress?: { total: number; compensated: number } | null;
  onOpenReminder?: () => void;
}) {
  const lanes = useMemo(() => assignLanes(events), [events]);
  const usedLanes = Math.max(1, events.reduce((m, e) => Math.max(m, (lanes.get(e.id) ?? 0) + 1), 0));
  const suspended = leader.usageStatus !== 'active';
  const exp = useMemo(() => getLeaderExpertise(leader, countries, routes), [leader, countries, routes]);
  // §1 3 บรรทัด: ชื่อ (ชื่อเล่น) · โซน · ประเทศ (เส้นทาง) — ความเชี่ยวชาญจาก Expertise Scope
  // §10 คำเตือนหนังสือเดินทาง (แสดงสถานะเท่านั้น — ไม่แสดงเลขเอกสาร)
  const passExpiry = getPassportExpiry(leader.id);
  const passSt = passportStatus(passExpiry, today);
  const passWarn = passSt === 'EXPIRED' || passSt === 'EXPIRING_WITHIN_30_DAYS' || passSt === 'EXPIRING_WITHIN_90_DAYS';
  /** หมดอายุ/เหลืออายุไม่ถึง 6 เดือน — ปิดช่องจัดงานทั้งแถว (เทา คลิกไม่ได้) แทนการเปิดแล้วเด้ง Toast ปฏิเสธ */
  const passBlocked = passportBlocksScheduling(passSt);

  return (
    <div
      className="zego-divider-bottom"
      // filler 1fr บน/ล่าง → คอลัมน์หัวหน้าทัวร์ (gridRow 1/-1) สูงเต็มแถว ข้อความไม่ถูกตัด · แถบงานยังอยู่กึ่งกลาง
      style={{ display: 'grid', gridTemplateColumns: gridCols, gridTemplateRows: `1fr repeat(${usedLanes}, ${cfg.evH}px) 1fr`, minHeight: cfg.rowMin, rowGap: cfg.laneGap, paddingTop: cfg.rowPad, paddingBottom: cfg.rowPad }}
      onDragOver={(e) => dragging && e.preventDefault()} onDrop={onDropHere}
    >
      {/*
        คอลัมน์หัวหน้าทัวร์ — Sticky ซ้าย
        บรรทัด 1: ชื่อ–นามสกุล · บรรทัด 2: ชื่อเล่น · รูปแบบการร่วมงาน (ดู nicknameLine)
        ตามด้วยโซน/ประเทศที่เชี่ยวชาญเดิม — สถานะรายวันแสดงในแถบปฏิทินด้านขวา
      */}
      <div data-testid="leader-name-cell" data-leader={leader.id} className={cx('zego-border-color sticky left-0 z-[3] flex min-w-0 flex-col justify-center gap-0.5 border-r px-2 py-0.5', dragging ? 'zego-selected-tint' : 'zego-surface-bg')} style={{ gridColumn: '1 / 2', gridRow: '1 / -1' }}>
        {/* บรรทัด 1: ชื่อ–นามสกุล + ปุ่มเพิ่ม/นำออกจากรายชื่อเดือนนี้ (§6/§9) */}
        <div className="flex min-w-0 items-center gap-1">
          <button type="button" onClick={onOpenInfo} title={exp.fullName} className="block min-w-0 flex-1 truncate text-left text-sm font-semibold zego-text hover:text-[var(--zego-primary-700)] hover:underline">
            {exp.fullName}
          </button>
          {rosterAction && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onRosterAction?.(); }}
              aria-label={rosterAction === 'add' ? `เพิ่ม ${exp.displayName} เข้ารายชื่อเดือนนี้` : `นำ ${exp.displayName} ออกจากรายชื่อเดือนนี้`}
              title={rosterAction === 'add' ? 'เพิ่มเข้ารายชื่อเดือนนี้' : 'นำออกจากรายชื่อเดือนนี้'}
              className={cx('shrink-0 rounded p-0.5', rosterAction === 'add' ? 'text-[var(--zego-primary-600)] hover:bg-[var(--zego-primary-50)]' : 'zego-text-disabled hover:bg-rose-50 hover:text-rose-500')}
            >
              <Icon name={rosterAction === 'add' ? 'plus' : 'x'} className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {/* บรรทัด 2: ชื่อเล่น · รูปแบบการร่วมงาน (บรรทัดเดียว · Ellipsis + Tooltip เมื่อยาวเกิน) */}
        <span className="truncate text-[11px] zego-text-secondary" title={nicknameLine(leader)}>
          {nicknameLine(leader)}
        </span>

        {/* โซน (§2) — ซ่อนเมื่อไม่มีโซน · ประเทศ (เส้นทาง) (§3) · Ellipsis + Tooltip */}
        {expertise?.hasData ? (
          <>
            {expertise.zoneLine && (
              <span className="truncate text-[11px] zego-text-tertiary" title={expertise.zoneTooltip}>{expertise.zoneLine}</span>
            )}
            <span className="truncate text-[11px] zego-text-secondary" title={expertise.countryTooltip}>{expertise.countryLine}</span>
          </>
        ) : (
          <span className="truncate text-[11px] zego-text-disabled">ยังไม่ระบุโซน ประเทศ หรือเส้นทาง</span>
        )}
        {/* Warning หนังสือเดินทาง (สถานะเท่านั้น §2/§10) */}
        {passWarn && (
          <span className={cx('inline-flex w-fit items-center gap-1 rounded px-1 text-[10px] font-medium', passSt === 'EXPIRED' ? 'zego-badge--danger' : 'zego-badge--warning')} title="สถานะหนังสือเดินทาง">
            <Icon name="warning" className="h-2.5 w-2.5" />{passSt === 'EXPIRED' ? 'Passport หมดอายุ' : `Passport ${passportRemainingText(passExpiry, today)}`}
          </span>
        )}
        {/* Reminder — มีประวัติถูกยกเลิกงานในเดือนถัดจากที่ถูกยกเลิกและยังไม่ได้รับงานชดเชย · กดดูรายละเอียดได้ */}
        {progress && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpenReminder?.(); }}
            title="กดดูรายละเอียดกรุ๊ปที่ถูกยกเลิก — เลข = ทั้งหมด/ชดเชยแล้ว"
            className={cx(
              'inline-flex w-fit items-center gap-1 rounded px-1 text-[10px] font-medium',
              progress.compensated >= progress.total
                ? 'zego-badge--success'
                : 'zego-badge--warning',
            )}
          >
            <Icon name={progress.compensated >= progress.total ? 'check' : 'warning'} className="h-2.5 w-2.5" />
            {progress.compensated >= progress.total ? 'ชดเชยครบแล้ว' : 'รอชดเชยงาน'} {progress.total}/{progress.compensated}
          </button>
        )}
      </div>

      {/* พื้นหลังช่องวัน (คลิกช่องว่างเพื่อจัดงาน §5) — grid item ต่อวัน span ทุก lane */}
      {days.map((iso, i) => {
        const d = parseDate(iso);
        const weekend = d.getDay() === 0 || d.getDay() === 6;
        const holiday = holidays.get(iso);
        const isOverflow = iso > monthEnd; // วันคาบเดือนถัดไป — แสดงไว้ให้เห็นกรุ๊ปที่ยังไม่กลับเท่านั้น จัดงานใหม่จากที่นี่ไม่ได้ (§3 เลือกข้ามเดือนไม่ได้)
        return (
          <button key={iso} type="button"
            disabled={isOverflow || passBlocked}
            aria-label={
              isOverflow ? `วันที่ ${formatDate(iso)} อยู่นอกเดือนกันยายน 2569 — จัดงานจากหน้านี้ไม่ได้`
                : passBlocked ? `จัดงานให้ ${leaderDisplayName(leader)} ไม่ได้ — หนังสือเดินทางหมดอายุหรือเหลืออายุไม่ถึง 6 เดือน`
                  : `จัดงานให้ ${leaderDisplayName(leader)} วันที่ ${formatDate(iso)}${holiday ? ` (วันหยุด: ${holiday.name})` : ''}`
            }
            title={
              isOverflow ? `${formatDate(iso)} — เดือนถัดไป จัดงานจากหน้านี้ไม่ได้`
                : passBlocked ? 'หนังสือเดินทางหมดอายุหรือเหลืออายุไม่ถึง 6 เดือน — จัดงานให้ไม่ได้'
                  : holiday ? `${formatDate(iso)} — ${holiday.name}` : undefined
            }
            onClick={isOverflow || passBlocked ? undefined : () => onEmptyClick(iso)}
            data-picked={iso === pickedDate ? 'true' : undefined}
            className={cx('zego-border-color min-w-0 border-r last:border-r-0',
              (isOverflow || passBlocked) ? 'cursor-not-allowed' : 'hover:bg-[var(--zego-primary-50)]',
              isOverflow ? 'bg-indigo-50/30' : passBlocked ? 'bg-[var(--zego-surface-inset)]' : (holiday ? 'bg-rose-50/60' : weekend && 'zego-surface-soft-bg'),
              iso === today && 'zego-today-tint',
              // §9 ไฮไลต์ช่องที่กำลังจัดงานอยู่ ให้รู้ว่ากำลังจัดให้วันไหน
              iso === pickedDate && 'zego-selected-tint ring-2 ring-inset ring-[var(--zego-primary-500)]')}
            style={{ gridColumn: `${i + 2} / ${i + 3}`, gridRow: '1 / -1' }} />
        );
      })}

      {/* แถบงาน / วันลา — วางด้วย grid-column (§5) · Group Code เด่น + ข้อมูล Sector 1 บรรทัด 2 (§) */}
      {events.map((e) => {
        const segStart = e.start > winStart ? e.start : winStart;
        const segEnd = e.end < winEnd ? e.end : winEnd;
        const startIdx = diffDays(winStart, segStart); // 0-based ในหน้าต่างที่ดู
        const endIdx = diffDays(winStart, segEnd);
        const span = endIdx - startIdx + 1;
        const lane = lanes.get(e.id) ?? 0;
        const contFromPrev = e.start < winStart;
        const contToNext = e.end > winEnd;
        const isJob = e.kind === 'job';
        const leaveKind = e.kind === 'job' ? 'unavailable' : e.kind;
        // สีแถบงาน = สถานะการจัดเท่านั้น (ผ่าน Mapping กลาง — ค่าที่ไม่รู้จักตกเป็น "ยังไม่ระบุ" ไม่ใช่ไม่มีสี)
        // วันลา/ติดงานบริษัท/ไม่พร้อมรับงาน ใช้ชุดสีคนละชุด ไม่ปะปนกับสถานะการจัด
        const style = isJob ? boardStatusMeta(e.board).bar : `zego-status-bar ${LEAVE_STYLE[leaveKind].bar}`;
        const noSell = isJob && hasNoSellIssue(e); // เตือนซ้อนบนสีสถานะการจัด ไม่แทนที่สีเดิม
        // ระดับรายละเอียดตามความกว้าง (§ month: ≥4→เต็ม · 2-3→ย่อ · 1→เฉพาะ Group Code · week: เต็มเสมอ)
        const detail: 'full' | 'mid' | 'min' = !isJob ? 'min' : viewMode === 'week' || span >= 4 ? 'full' : span >= 2 ? 'mid' : 'min';
        const d = e.disp;
        const line2 = d ? (detail === 'full' ? `${d.country} · ${d.depAirport} · ${d.airlineCode}` : `${d.depAirport} · ${d.airlineCode}`) : '';
        return (
          <button
            key={e.id} type="button" draggable={isJob}
            onDragStart={isJob ? () => e.assignmentId && onDragAssignment(e.assignmentId) : undefined}
            onClick={(ev) => { ev.stopPropagation(); if (isJob && e.periodId) onSelectPeriod(e.periodId); }}
            title={eventTooltip(e, leaderDisplayName(leader))}
            style={{ gridColumn: `${startIdx + 2} / ${endIdx + 3}`, gridRow: `${lane + 2}`, background: isJob ? undefined : LEAVE_BG[leaveKind], zIndex: 1, marginInline: 1 }}
            className={cx('flex min-w-0 flex-col justify-center overflow-hidden rounded-md px-1 py-0.5 text-left leading-tight border transition hover:brightness-95', style,
              // NO SELL = กรอบแดงเตือน "เพิ่มเติม" — สีสถานะการจัดเดิมยังอยู่ ไม่ถูกแทนที่
              noSell && 'ring-2 ring-rose-500',
              isJob ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer', contFromPrev ? 'rounded-l-none' : '', contToNext ? 'rounded-r-none' : '')}
          >
            {/* บรรทัด 1: Group Code (บัส) เด่นสุด — Ellipsis เมื่อพื้นที่ไม่พอ (§4/§5) */}
            <span className={cx('flex min-w-0 items-center font-bold', cfg.bar)}>
              {contFromPrev && <span className="shrink-0 pr-0.5 opacity-70">◂</span>}
              {noSell
                ? <span className="shrink-0 pr-0.5 zego-text-danger" title="โปรแกรม NO SELL — กรุณาถอดหัวหน้าทัวร์ออกจากงานนี้">⚠</span>
                : e.issues && e.issues.length > 0 && <span className="shrink-0 pr-0.5 zego-text-danger" title="ข้อมูลต้นทางเปลี่ยน/พีเรียดปิด — ตรวจสอบ">⚠</span>}
              {/* กรุ๊ปนี้ถูกระบุว่าใช้ชดเชยกรุ๊ปที่ถูกยกเลิก — ให้เห็นบนแถบเลยว่ากรุ๊ปไหนคือกรุ๊ปชดเชย */}
              {e.compensatesFor && <Icon name="check" className="h-2.5 w-2.5 shrink-0 pr-0.5 zego-text-success" />}
              <span className="min-w-0 truncate">{e.code}{isJob && d && d.bus && d.bus !== '-' ? ` (${d.bus})` : ''}</span>
              {noSell && span >= 2 && (
                <span data-testid="no-sell-tag" className="ml-1 shrink-0 rounded bg-[var(--zego-danger)] px-1 text-[9px] font-bold leading-4 text-white">NO SELL</span>
              )}
              {e.compensatesFor && span >= 2 && (
                <span className="ml-1 shrink-0 rounded bg-[var(--zego-success)] px-1 text-[9px] font-bold leading-4 text-white" title={`ชดเชยให้: ${e.compensatesFor}`}>ชดเชย</span>
              )}
              {contToNext && <span className="shrink-0 pl-0.5 opacity-70">▸</span>}
            </span>
            {/* บรรทัด 2: ประเทศ · สนามบิน Sector 1 · สายการบิน (เล็กกว่า/สีรอง · Ellipsis) */}
            {isJob && detail !== 'min' && line2 && <span className={cx('min-w-0 truncate opacity-70', cfg.sub)}>{line2}</span>}
          </button>
        );
      })}
      {suspended && <div className="pointer-events-none" style={{ gridColumn: '2 / -1', gridRow: '1 / -1', background: 'rgba(248,250,252,0.4)' }} title="ระงับการใช้งาน" />}
    </div>
  );
}

/* ======================= §5 ยืนยันถอดหัวหน้าทัวร์ ======================= */

/**
 * ต้องยืนยันทุกครั้ง — ระบบไม่ถอดหัวหน้าทัวร์อัตโนมัติแม้โปรแกรมจะเป็น NO SELL แล้ว
 * แสดงข้อมูลงานให้ครบก่อนตัดสินใจ และเก็บผู้ดำเนินการ/เวลา/หมายเหตุไว้ตรวจย้อนหลัง
 */
function RemoveLeaderDialog({ data, actor, at, onCancel, onConfirm }: {
  data: { assignment: GuidePeriodAssignment; period: TourPeriodMaster | null; leaderName: string; cause: string } | null;
  actor: string;
  at: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  // ช่องหมายเหตุเริ่มว่างทุกครั้งที่เปิดรายการใหม่ — ผู้เรียกใส่ key ตาม assignmentId ให้ remount
  const [note, setNote] = useState('');
  if (!data) return null;
  const p = data.period;
  const change = p ? getSaleStatusChange(p.internalId) : null;
  return (
    <Modal
      open
      onClose={onCancel}
      title="ยืนยันการถอดหัวหน้าทัวร์"
      description="ยืนยันการถอดหัวหน้าทัวร์ออกจากโปรแกรมนี้ เนื่องจากโปรแกรมมีสถานะ NO SELL หรือไม่"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>ยกเลิก</Button>
          <Button variant="danger" onClick={() => onConfirm(note)}>ยืนยันถอดหัวหน้าทัวร์</Button>
        </>
      }
    >
      <dl className="zego-border-color divide-y divide-[var(--zego-border-soft)] rounded-xl border">
        {[
          ['Group Code', p?.groupCode ?? data.assignment.periodId],
          ['ชื่อโปรแกรม', p?.displayName ?? '—'],
          ['วันเดินทาง', p ? formatDateRange(p.startDate, p.endDate) : '—'],
          ['หัวหน้าทัวร์ปัจจุบัน', data.leaderName],
          ['สาเหตุ', data.cause],
          ['สถานะขายปัจจุบัน', p?.saleStatus ?? '—'],
          ['เปลี่ยนสถานะขายเมื่อ', change?.at ? `${formatDateTime(change.at)}${change.by ? ` โดย ${change.by}` : ''}` : '—'],
          ['ผู้ดำเนินการถอด', `${actor} · ${formatDateTime(at)}`],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3 px-3 py-2 text-sm">
            <dt className="w-40 shrink-0 zego-text-tertiary">{k}</dt>
            <dd className="min-w-0 flex-1 zego-text">{v}</dd>
          </div>
        ))}
      </dl>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium zego-text-tertiary">หมายเหตุการถอด (ถ้ามี)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          aria-label="หมายเหตุการถอด"
          className="zego-border-color w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="เช่น แจ้งหัวหน้าทัวร์ทางโทรศัพท์แล้ว" />
      </label>
      <p className="mt-2 text-xs zego-text-tertiary">
        ประวัติการจัดเดิมจะถูกเก็บไว้ทั้งหมด ไม่ถูกลบออกจากระบบ · ช่วงเวลานี้ของหัวหน้าทัวร์จะกลับมาว่างทันที
      </p>
    </Modal>
  );
}

/**
 * ยืนยัน "กรุ๊ปนี้ถูกยกเลิกทั้งหมด" — คนละอย่างกับ RemoveLeaderDialog (ถอด/สลับคนตามปกติ)
 * นอกจากถอดหัวหน้าทัวร์แล้ว ระบบจะบันทึกประวัติถูกยกเลิกงาน + ตั้งเตือนให้จัดงานชดเชยตั้งแต่เดือนถัดไป
 */
function CancelGroupDialog({ data, actor, at, onCancel, onConfirm }: {
  data: { assignment: GuidePeriodAssignment; period: TourPeriodMaster | null; leaderName: string } | null;
  actor: string;
  at: string;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState('');
  if (!data) return null;
  const p = data.period;
  return (
    <Modal
      open
      onClose={onCancel}
      title="กรุ๊ปนี้ถูกยกเลิกทั้งหมด"
      description="ใช้เมื่อกรุ๊ป/งานทั้งหมดถูกยกเลิก (ไม่ใช่แค่เปลี่ยนหัวหน้าทัวร์) — ต่างจาก “ยกเลิกการมอบหมาย” ที่เป็นแค่ปรับการจัดงาน"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>ยกเลิก</Button>
          <Button variant="danger" onClick={() => onConfirm(note)}>ยืนยันว่ากรุ๊ปนี้ถูกยกเลิก</Button>
        </>
      }
    >
      <div className="zego-badge--warning rounded-lg border px-3 py-2 text-xs">
        ระบบจะ (1) ถอดหัวหน้าทัวร์ออกจากกรุ๊ปนี้ (2) บันทึกประวัติว่าไกด์ถูกยกเลิกงาน และ (3) เตือนให้จัดงานชดเชยตั้งแต่เดือนถัดไป
        จนกว่าจะทำเครื่องหมายว่าชดเชยแล้ว (ดูได้ที่หน้าโปรไฟล์ไกด์)
      </div>
      <dl className="zego-border-color mt-3 divide-y divide-[var(--zego-border-soft)] rounded-xl border">
        {[
          ['Group Code', p?.groupCode ?? data.assignment.periodId],
          ['ชื่อโปรแกรม', p?.displayName ?? '—'],
          ['วันเดินทาง', p ? formatDateRange(p.startDate, p.endDate) : '—'],
          ['หัวหน้าทัวร์ปัจจุบัน', data.leaderName],
          ['ผู้ดำเนินการ', `${actor} · ${formatDateTime(at)}`],
        ].map(([k, v]) => (
          <div key={k} className="flex gap-3 px-3 py-2 text-sm">
            <dt className="w-40 shrink-0 zego-text-tertiary">{k}</dt>
            <dd className="min-w-0 flex-1 zego-text">{v}</dd>
          </div>
        ))}
      </dl>
      <label className="mt-3 block">
        <span className="mb-1 block text-xs font-medium zego-text-tertiary">หมายเหตุ (ถ้ามี)</span>
        <input value={note} onChange={(e) => setNote(e.target.value)}
          aria-label="หมายเหตุการยกเลิกกรุ๊ป"
          className="zego-border-color w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="เช่น ลูกค้ายกเลิกกรุ๊ปเนื่องจากจำนวนไม่ถึง" />
      </label>
    </Modal>
  );
}

/**
 * เสนอให้ผู้จัดหัวหน้าทัวร์ระบุว่ากรุ๊ปที่เพิ่งมอบหมายเป็นการชดเชยงานที่ถูกยกเลิกกรุ๊ปไหน (ถ้าไกด์คนนี้มีค้างอยู่)
 * ⚠️ ตั้งใจให้ทำที่นี่จุดเดียว — ผู้จัดหัวหน้าทัวร์เป็นคนเลือกจากกรุ๊ปที่จัดจริง ไม่ใช่พิมพ์รหัสเองจากหน้าโปรไฟล์ไกด์
 */
function CompensateAssignmentDialog({ data, onSkip, onConfirm }: {
  data: {
    leader: TourLeader;
    pendingRecords: GuideCancellationRecord[];
    assignedGroups: { code: string; title: string }[];
  } | null;
  onSkip: () => void;
  onConfirm: (recordId: string, groupCode: string) => void;
}) {
  // ผู้เรียกใส่ key ตาม leader.id ให้ remount ทุกครั้งที่เปิดรายการใหม่ — ค่าเริ่มต้นจึงว่าง/เลือกอันแรกทุกครั้ง
  const [recordId, setRecordId] = useState(data?.pendingRecords[0]?.id ?? '');
  const [groupCode, setGroupCode] = useState(data?.assignedGroups[0]?.code ?? '');
  if (!data) return null;
  return (
    <Modal
      open
      onClose={onSkip}
      size="sm"
      title="ทำเครื่องหมายว่าเป็นงานชดเชยหรือไม่?"
      description={`${leaderDisplayName(data.leader)} มีงานค้างชดเชย ${data.pendingRecords.length} กรุ๊ป`}
      footer={
        <>
          <Button variant="ghost" onClick={onSkip}>ไม่ใช่ตอนนี้</Button>
          <Button variant="success" onClick={() => recordId && groupCode && onConfirm(recordId, groupCode)}>
            ยืนยันว่าเป็นการชดเชย
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium zego-text-tertiary">กรุ๊ปที่ถูกยกเลิก (ที่จะชดเชยให้)</span>
          <select value={recordId} onChange={(e) => setRecordId(e.target.value)} className="zego-border-color w-full rounded-lg border px-3 py-2 text-sm">
            {data.pendingRecords.map((r) => (
              <option key={r.id} value={r.id}>{r.jobId} · {r.jobTitle} ({formatDate(r.originalTravelDate)})</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium zego-text-tertiary">กรุ๊ปที่จัดในครั้งนี้ (ใช้เป็นงานชดเชย)</span>
          <select value={groupCode} onChange={(e) => setGroupCode(e.target.value)} className="zego-border-color w-full rounded-lg border px-3 py-2 text-sm">
            {data.assignedGroups.map((g) => (
              <option key={g.code} value={g.code}>{g.code} · {g.title}</option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}

/* ================================ Mobile card ================================ */

function MobileLeaderCard({ leader, events, monthLabel, onSelectPeriod }: { leader: TourLeader; events: RowEvent[]; monthLabel: string; onSelectPeriod: (periodId: string) => void }) {
  const [open, setOpen] = useState(false);
  const sorted = [...events].sort((a, b) => a.start.localeCompare(b.start));
  const jobCount = events.filter((e) => e.kind === 'job').length;
  return (
    <div className="zego-border-color zego-surface-bg rounded-xl border p-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-2 text-left">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5"><span className="font-semibold zego-text">{leaderDisplayName(leader)}</span><StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" dot /></div>
          <span className="text-xs zego-text-tertiary">{monthLabel} · {jobCount} งาน</span>
        </div>
        <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 zego-text-tertiary transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul className="zego-divider-top mt-2 space-y-1.5 pt-2">
          {sorted.length === 0 && <li className="py-3 text-center text-xs zego-text-tertiary">ไม่มีงาน/วันลาในเดือนนี้</li>}
          {sorted.map((e) => {
            const lk = e.kind === 'job' ? 'unavailable' : e.kind;
            return (
            <li key={e.id}>
              <button type="button" disabled={e.kind !== 'job'} onClick={() => e.periodId && onSelectPeriod(e.periodId)}
                className={cx('flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left text-xs border', e.kind === 'job' ? boardStatusMeta(e.board).bar : `zego-status-bar ${LEAVE_STYLE[lk].bar}`)}
                style={{ background: e.kind === 'job' ? undefined : LEAVE_BG[lk] }}>
                <span className="flex items-center gap-2">
                  {e.compensatesFor && <Icon name="check" className="h-3 w-3 shrink-0 zego-text-success" />}
                  <span className="font-bold">{e.code}{e.disp && e.disp.bus && e.disp.bus !== '-' ? ` (${e.disp.bus})` : ''}</span>
                  {e.compensatesFor && <span className="shrink-0 rounded bg-[var(--zego-success)] px-1 text-[9px] font-bold leading-4 text-white">ชดเชย</span>}
                  <span className="ml-auto shrink-0 opacity-70">{e.scheduleText}</span>
                </span>
                {e.disp && <span className="text-[11px] opacity-70">{e.disp.country} · {e.disp.depAirport} · {e.disp.airlineCode}</span>}
              </button>
            </li>
          );})}
        </ul>
      )}
    </div>
  );
}

/** ค่าเริ่มต้นตัวกรองรูปแบบการร่วมงานของหน้า Schedule — ทุกรูปแบบ (ไม่ซ่อนใครตั้งแต่เปิดหน้า) */
const SCHEDULE_TYPE_FILTER_DEFAULT: LeaderType[] = [];

/* ================================ Add panel (§5) ================================ */

function AddAssignmentPanel({ leader, date, monthStart, monthEnd, monthLabel, periods, assignedPeriodIds, leaderAssignments, periodById, appointments, records, buffer, onClose, onAssignMany }: {
  leader: TourLeader; date: string; periods: TourPeriodMaster[]; assignedPeriodIds: Set<string>;
  /** §3 ขอบเขตวันที่ = เดือนที่กำลังเปิดในหน้า Schedule (เลือกข้ามเดือนไม่ได้) */
  monthStart: string; monthEnd: string; monthLabel: string;
  leaderAssignments: GuidePeriodAssignment[]; periodById: Map<string, TourPeriodMaster>;
  appointments: import('@/types').Appointment[]; records: LeaderAvailabilityRecord[];
  buffer: number; onClose: () => void;
  /** มอบหมายหลายกรุ๊ปรวดเดียว — หน้าต่างนี้เลือกได้มากกว่า 1 กรุ๊ป */
  onAssignMany: (periods: TourPeriodMaster[], note: string) => void;
}) {
  /** §2 ค่าเริ่มต้น = วันที่ที่คลิก ทั้งวันเริ่มและวันสิ้นสุด · §1 ประเทศเริ่มต้น = ทุกประเทศ (ว่าง) */
  const [from, setFrom] = useState(date);
  const [to, setTo] = useState(date);
  const [countries, setCountries] = useState<string[]>([]);
  const [routes, setRoutes] = useState<string[]>([]);
  /**
   * กรุ๊ปที่เลือกไว้ — เก็บทั้งก้อนพีเรียด ไม่ใช่แค่ id
   * เปลี่ยนตัวกรองแล้วกรุ๊ปที่เลือกไว้อาจหลุดจากรายการ แต่ต้องยังนับและตรวจทับซ้อนได้อยู่
   */
  const [picked, setPicked] = useState<Map<string, TourPeriodMaster>>(new Map());
  const [confirmMany, setConfirmMany] = useState(false);
  /** ค้นหางาน — queryInput = สิ่งที่พิมพ์ · query = ค่าที่ใช้กรองจริง (debounce 350ms) */
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQuery(queryInput.trim()), 350);
    return () => clearTimeout(t);
  }, [queryInput]);
  /** กด Enter = ใช้คำค้นทันที ไม่ต้องรอ debounce */
  const commitQuery = () => setQuery(queryInput.trim());
  const clearQuery = () => { setQueryInput(''); setQuery(''); };

  // วันลา/ไม่พร้อม/นัดหมาย ของหัวหน้าทัวร์ (ไม่รวมงานทัวร์ — ตรวจงานทัวร์ด้วยพีเรียดที่จัดไว้) — ตรวจงานชน §8
  const leaveWindows = useMemo(() => leaderUnavailability(leader.id, [], appointments, records), [leader.id, appointments, records]);
  const assignedRanges = useMemo(() => leaderAssignments.map((a) => periodById.get(a.periodId)).filter(Boolean).map((p) => periodRangeRef(p!)), [leaderAssignments, periodById]);
  const blocked = UNAVAILABLE_LEADER_STATUSES.has(leader.status);

  /**
   * "แสดงทั้งเดือน" — คิดจากค่าช่วงวันที่ปัจจุบัน ไม่เก็บเป็น state แยก
   * แก้วันที่เองแล้วติ๊กหลุดเองโดยอัตโนมัติ จึงไม่มีทางค้างสถานะที่ไม่ตรงกับช่องวันที่
   */
  const wholeMonth = from === monthStart && to === monthEnd;
  const toggleWholeMonth = () => {
    if (wholeMonth) { setFrom(date); setTo(date); }
    else { setFrom(monthStart); setTo(monthEnd); }
  };

  /** §5 ตรวจช่วงวันที่ — ต้องอยู่ในเดือนที่กำลังจัดสเก็ต และเริ่มต้องไม่เกินสิ้นสุด */
  const rangeError = !from || !to
    ? 'กรุณาเลือกช่วงวันที่ให้ครบ'
    : from < monthStart || to > monthEnd
      ? `กรุณาเลือกช่วงวันที่ภายในเดือน${monthLabel}`
      : to < from
        ? 'วันที่สิ้นสุดต้องไม่น้อยกว่าวันที่เริ่มต้น'
        : null;

  /**
   * กองงานตั้งต้นของตัวกรอง — ยังไม่ระบุหัวหน้าทัวร์ · อยู่ในช่วงวันที่ · ตรงคำค้น
   * ใช้เป็นฐานนับจำนวนของทั้งช่องประเทศและช่องเส้นทาง (ยังไม่ตัดด้วยตัวเองสองช่องนั้น)
   */
  const basePool = useMemo(() => {
    if (rangeError) return [];
    return getAssignablePeriods()
      .filter((p) => !assignedPeriodIds.has(p.internalId))
      .filter((p) => departsWithin(p, from, to))
      .filter((p) => matchesQuery(p, query));
  }, [assignedPeriodIds, from, to, query, rangeError]);

  /** §1 รายชื่อประเทศจากข้อมูลจริงใน Tour Period Master (ไม่ Hardcode) */
  const countryOptions = useMemo(
    () => [...new Set(getAssignablePeriods().map((p) => p.countryName).filter(Boolean))].sort(),
    [],
  );

  /** จำนวนงานต่อประเทศ — นับภายใต้ตัวกรองเส้นทางที่ตั้งอยู่ (ไม่นับตัวเองซ้ำ) */
  const countryCounts = useMemo(() => {
    const routePick = new Set(routes);
    const m = new Map<string, number>();
    for (const p of basePool) {
      if (routePick.size > 0 && !routePick.has(routeCodeFromGroupCode(p.groupCode) ?? '')) continue;
      if (!p.countryName) continue;
      m.set(p.countryName, (m.get(p.countryName) ?? 0) + 1);
    }
    // ประเทศที่ไม่มีงานต้องขึ้นเลข 0 ให้เห็น ไม่ใช่ปล่อยว่างจนอ่านไม่ออกว่ามีหรือไม่มี
    for (const c of countryOptions) if (!m.has(c)) m.set(c, 0);
    return m;
  }, [basePool, routes, countryOptions]);

  /**
   * เส้นทางที่เลือกได้ = เฉพาะของประเทศที่เลือกไว้ (ไม่เลือกประเทศ = ทุกเส้นทาง)
   * เดิมรายการเส้นทางไม่ขึ้นกับประเทศ จึงประกอบเงื่อนไขที่เป็นไปไม่ได้ง่ายมาก
   * (เช่นประเทศ JAPAN + เส้นทาง CAN ของจีน → 0 รายการ โดยไม่มีอะไรบอกว่าผิดตรงไหน)
   *
   * รหัสเส้นทาง = 3 ตัวหน้าของ Group Code เหมือนที่หน้ารายงาน/ปฏิทินใช้
   * (field route ใน Master ยังเป็น null ทั้งหมด เพราะ CSV ต้นทางไม่มีคอลัมน์นี้)
   */
  const routeByCountry = useMemo(() => {
    const countByRoute = new Map<string, Map<string, number>>();
    for (const p of getAssignablePeriods()) {
      const code = routeCodeFromGroupCode(p.groupCode);
      if (!code || !p.countryName) continue;
      if (!countByRoute.has(code)) countByRoute.set(code, new Map());
      const m = countByRoute.get(code)!;
      m.set(p.countryName, (m.get(p.countryName) ?? 0) + 1);
    }
    // เส้นทางที่พบในหลายประเทศให้ยึดประเทศที่พบบ่อยที่สุด (ต้นทางไม่ได้ผูก 1:1 เสมอ)
    const owner = new Map<string, string>();
    for (const [code, m] of countByRoute) {
      owner.set(code, [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]);
    }
    return owner;
  }, []);

  /** เส้นทางที่เข้าเงื่อนไขประเทศปัจจุบัน — ใช้ทั้งเป็นตัวเลือกและใช้ตัดค่าที่เลือกค้างไว้ */
  const allowedRoutes = useMemo(() => {
    const pickCountry = new Set(countries);
    return [...routeByCountry.entries()]
      .filter(([, country]) => pickCountry.size === 0 || pickCountry.has(country))
      .map(([code]) => code)
      .sort();
  }, [routeByCountry, countries]);

  const routeGroups = useMemo(() => {
    const byCountry = new Map<string, string[]>();
    for (const code of allowedRoutes) {
      const country = routeByCountry.get(code) ?? 'อื่น ๆ';
      byCountry.set(country, [...(byCountry.get(country) ?? []), code]);
    }
    return [...byCountry.entries()]
      .map(([label, codes]) => ({ label, options: codes.sort() }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allowedRoutes, routeByCountry]);

  /** จำนวนงานต่อเส้นทาง — นับภายใต้ตัวกรองประเทศที่ตั้งอยู่ */
  const routeCounts = useMemo(() => {
    const pickCountry = new Set(countries);
    const m = new Map<string, number>();
    for (const p of basePool) {
      if (pickCountry.size > 0 && !pickCountry.has(p.countryName)) continue;
      const code = routeCodeFromGroupCode(p.groupCode);
      if (!code) continue;
      m.set(code, (m.get(code) ?? 0) + 1);
    }
    for (const code of allowedRoutes) if (!m.has(code)) m.set(code, 0);
    return m;
  }, [basePool, countries, allowedRoutes]);

  /**
   * เปลี่ยนประเทศแล้วเส้นทางที่เลือกไว้อาจใช้ไม่ได้ — ถอดออกให้พร้อมบอกว่าถอดอะไรไป
   * ทำในตัวจัดการเหตุการณ์ ไม่ทำใน effect (กันเรนเดอร์ซ้อนและกฎ set-state-in-effect)
   */
  const [droppedRoutes, setDroppedRoutes] = useState<string[]>([]);
  const changeCountries = (next: string[]) => {
    setCountries(next);
    const pickCountry = new Set(next);
    const stillOk = routes.filter((code) => pickCountry.size === 0 || pickCountry.has(routeByCountry.get(code) ?? ''));
    setDroppedRoutes(routes.filter((code) => !stillOk.includes(code)));
    if (stillOk.length !== routes.length) setRoutes(stillOk);
  };

  /**
   * §9 งานที่เลือกจัดได้ — ต้องผ่านทุกเงื่อนไขพร้อมกัน
   *   • getAssignablePeriods ตัด NO SELL / ปิดใช้งาน / ข้อมูลไม่ถูกต้อง ออกให้แล้ว
   *   • ยังไม่มีหัวหน้าทัวร์ (assignedPeriodIds มาจากรายการที่ยังมีผล — ที่ถอดแล้วไม่นับ)
   *   • วันออกเดินทางอยู่ในช่วงที่เลือก · ประเทศตรงกับที่เลือก (ว่าง = ทุกประเทศ)
   * คำนวณใหม่ทุกครั้งที่ตัวกรองเปลี่ยน — ไม่นำผลของช่วงเดิมมาปนกับช่วงใหม่
   */
  const candidates = useMemo(() => {
    if (rangeError) return [];
    const pick = new Set(countries);
    const routePick = new Set(routes);
    return getAssignablePeriods()
      .filter((p) => !assignedPeriodIds.has(p.internalId))
      .filter((p) => departsWithin(p, from, to))
      .filter((p) => pick.size === 0 || pick.has(p.countryName))
      .filter((p) => routePick.size === 0 || routePick.has(routeCodeFromGroupCode(p.groupCode) ?? ''))
      .filter((p) => matchesQuery(p, query))
      .map((p) => ({ p, check: checkPeriodConflict(periodRangeRef(p), assignedRanges, leaveWindows, buffer) }))
      .sort((a, b) => a.p.startDate.localeCompare(b.p.startDate) || a.p.groupCode.localeCompare(b.p.groupCode))
      .slice(0, 80);
  }, [assignedPeriodIds, assignedRanges, leaveWindows, buffer, from, to, countries, routes, query, rangeError]);

  void periods;

  /**
   * รายการงานแบ่งเป็นหมวดตามเส้นทาง — เรียงหัวข้อตามรหัสเส้นทาง (A→Z) ให้กวาดตาหาได้
   * ภายในหมวดยังเรียงตามวันออกเดินทางเหมือนเดิม
   */
  const candidateGroups = useMemo(() => {
    const byRoute = new Map<string, typeof candidates>();
    for (const c of candidates) {
      const code = routeCodeFromGroupCode(c.p.groupCode) ?? 'อื่น ๆ';
      byRoute.set(code, [...(byRoute.get(code) ?? []), c]);
    }
    return [...byRoute.entries()]
      .map(([code, list]) => ({ code, list, country: list[0]?.p.countryName ?? '' }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [candidates]);

  /*
    ลากหัวข้อเส้นทางในรายการผลลัพธ์ไปวางที่ช่องตัวกรอง
      วางที่ "เส้นทาง" = กรองเส้นทางนั้น · วางที่ "ประเทศ" = กรองประเทศนั้น
    ทางคีย์บอร์ดใช้การกดที่หัวข้อแทน (Enter/Space = กรองเส้นทางนั้น) — ลากวางเป็นทางลัดเสริม
    ไม่ใช่ทางเดียวที่ทำได้ คนที่ใช้คีย์บอร์ดหรือจอสัมผัสจึงไม่ตกขบวน
  */
  const [dragFacet, setDragFacet] = useState<{ route: string; country: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<'country' | 'route' | null>(null);

  const readFacet = (e: React.DragEvent): { route: string; country: string } | null => {
    try {
      const raw = e.dataTransfer.getData('application/x-facet') || e.dataTransfer.getData('text/plain');
      const v = raw ? JSON.parse(raw) : null;
      return v && typeof v.route === 'string' ? v : dragFacet;
    } catch { return dragFacet; }
  };

  const addRouteFilter = (route: string, country: string) => {
    /* เส้นทางที่หย่อนมาต้องไม่ถูกตัวกรองประเทศตัดทิ้งทันที — เติมประเทศให้ด้วยถ้ายังไม่มี */
    if (countries.length > 0 && !countries.includes(country)) setCountries([...countries, country]);
    setRoutes((prev) => (prev.includes(route) ? prev : [...prev, route]));
    setDroppedRoutes([]);
  };

  const dropProps = (target: 'country' | 'route') => ({
    onDragOver: (e: React.DragEvent) => { if (dragFacet) { e.preventDefault(); setDropTarget(target); } },
    onDragLeave: () => setDropTarget((t) => (t === target ? null : t)),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      const facet = readFacet(e);
      setDropTarget(null);
      setDragFacet(null);
      if (!facet) return;
      if (target === 'country') changeCountries(countries.includes(facet.country) ? countries : [...countries, facet.country]);
      else addRouteFilter(facet.route, facet.country);
    },
  });

  const pickedList = useMemo(
    () => [...picked.values()].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.groupCode.localeCompare(b.groupCode)),
    [picked],
  );

  /**
   * ทับซ้อนกันเองในชุดที่เลือก — คนเดียวไปสองกรุ๊ปพร้อมกันไม่ได้
   * ตรวจทุกคู่ (ชุดที่เลือกมีไม่กี่รายการ) แล้วคืนเป็น periodId → รหัสกรุ๊ปที่ชนกัน
   *
   * §7 ชนกันแค่วันต่อวันแต่เวลาบินไม่ซ้อนกัน (ลงเครื่องแล้วขึ้นเครื่องอีกกรุ๊ปวันเดียวกัน)
   * ไม่ถือว่าชน — แยกไปเป็นคำเตือนพร้อมชั่วโมงที่ห่างกัน ให้ผู้จัดตัดสินใจเอง
   */
  const { overlapWithin, turnaroundWithin } = useMemo(() => {
    const overlap = new Map<string, string[]>();
    const turnaround: { codes: string; hours: number }[] = [];
    for (let i = 0; i < pickedList.length; i += 1) {
      for (let j = i + 1; j < pickedList.length; j += 1) {
        const a = pickedList[i];
        const b = pickedList[j];
        if (a.startDate > b.endDate || a.endDate < b.startDate) continue;
        const gap = sameDayTurnaroundHours(periodRangeRef(a), periodRangeRef(b));
        if (gap !== null) {
          turnaround.push({ codes: `${a.groupCode} → ${b.groupCode}`, hours: gap });
          continue;
        }
        overlap.set(a.internalId, [...(overlap.get(a.internalId) ?? []), b.groupCode]);
        overlap.set(b.internalId, [...(overlap.get(b.internalId) ?? []), a.groupCode]);
      }
    }
    return { overlapWithin: overlap, turnaroundWithin: turnaround };
  }, [pickedList]);

  /** คำเตือนของกรุ๊ปที่เลือกไว้ (เทียบกับงานเดิม/วันลา) — ใช้สรุปก่อนยืนยัน */
  const pickedWarnings = useMemo(
    () => pickedList
      .map((pd) => ({ pd, check: checkPeriodConflict(periodRangeRef(pd), assignedRanges, leaveWindows, buffer) }))
      .filter((x) => x.check.verdict === 'warn'),
    [pickedList, assignedRanges, leaveWindows, buffer],
  );

  const hasOverlap = overlapWithin.size > 0;

  const togglePick = (period: TourPeriodMaster) => {
    setPicked((prev) => {
      const next = new Map(prev);
      if (next.has(period.internalId)) next.delete(period.internalId);
      else next.set(period.internalId, period);
      return next;
    });
  };

  const submit = () => {
    if (pickedList.length === 0 || hasOverlap) return;
    if (pickedWarnings.length > 0) { setConfirmMany(true); return; }
    onAssignMany(pickedList, '');
  };

  const VLABEL: Record<string, string> = { ok: 'จัดได้', warn: 'ควรตรวจสอบ', blocked: 'จัดไม่ได้' };

  return (
    <Drawer open onClose={onClose} title={`จัดงานให้ ${leaderDisplayName(leader)}`} description={`เลือกงานจาก Tour Period Master · วันที่ที่คลิกใช้สำหรับค้นหาเท่านั้น`}>
      {blocked && <div className="zego-badge--danger mb-3 rounded-lg border px-3 py-2 text-sm">หัวหน้าทัวร์สถานะ “{LEADER_STATUS[leader.status].label}” — โปรดตรวจสอบก่อนมอบหมาย</div>}

      {/* §2 หัวหน้าทัวร์ถูกเลือกไว้แล้วจากแถวที่คลิก — เปลี่ยนคนที่นี่ไม่ได้ (ปิดหน้าต่างแล้วคลิกแถวอื่น) */}
      <dl className="zego-border-color zego-surface-soft-bg mb-3 rounded-xl border px-3 py-2 text-sm">
        <div className="flex gap-2">
          <dt className="w-24 shrink-0 zego-text-tertiary">หัวหน้าทัวร์</dt>
          <dd className="min-w-0 flex-1 font-medium zego-text">{leaderDisplayName(leader)}</dd>
        </div>
      </dl>

      {/*
        §6 แถวตัวกรอง — Desktop: ประเทศ / ช่วงวันที่ อยู่แถวเดียวกัน ช่องละ ~50%
        Tablet–Mobile: เรียงแนวตั้งเต็มความกว้าง · ทุก Input สูง 38px เท่ากัน
        เปลี่ยนค่าแล้วกรองทันที ไม่ต้องกดปุ่มค้นหา
      */}
      <div className="mb-3 grid items-start gap-4 md:grid-cols-[42%_1fr]">
        <div className="grid gap-3 sm:grid-cols-2">
          <div
            {...dropProps('country')}
            className={cx('rounded-lg', dragFacet && 'ring-2 ring-dashed ring-offset-2', dragFacet && (dropTarget === 'country' ? 'ring-[var(--zego-primary-500)]' : 'ring-[var(--zego-border-strong)]'))}
          >
            <span className="mb-1 flex h-5 items-center overflow-hidden whitespace-nowrap text-xs font-medium zego-text-tertiary">
              ประเทศ
              {dragFacet && <span className="ml-1 font-normal zego-text-info">วางที่นี่เพื่อกรองประเทศ</span>}
            </span>
            <TagMultiSelect
              ariaLabel="ประเทศ"
              summary={countryLabel(countries)}
              searchPlaceholder="ค้นหาประเทศ…"
              emptyText="ไม่พบประเทศที่ค้นหา"
              options={countryOptions}
              counts={countryCounts}
              selected={countries}
              onChange={changeCountries}
            />
          </div>
          <div
            {...dropProps('route')}
            className={cx('rounded-lg', dragFacet && 'ring-2 ring-dashed ring-offset-2', dragFacet && (dropTarget === 'route' ? 'ring-[var(--zego-primary-500)]' : 'ring-[var(--zego-border-strong)]'))}
          >
            <span className="mb-1 flex h-5 items-center overflow-hidden whitespace-nowrap text-xs font-medium zego-text-tertiary">
              เส้นทาง
              {dragFacet && <span className="ml-1 font-normal zego-text-info">วางที่นี่เพื่อกรองเส้นทาง</span>}
            </span>
            <TagMultiSelect
              ariaLabel="เส้นทาง"
              summary={routes.length === 0 ? 'ทุกเส้นทาง' : routes.length <= 2 ? routes.join(', ') : `${routes.length} เส้นทาง`}
              searchPlaceholder="ค้นหาเส้นทาง…"
              emptyText="ไม่พบเส้นทางที่ค้นหา"
              options={allowedRoutes}
              groups={routeGroups}
              counts={routeCounts}
              selected={routes}
              onChange={(next) => { setRoutes(next); setDroppedRoutes([]); }}
            />
            {/* คำอธิบายอยู่ใต้ช่อง ไม่ใช่ในแถว Label — ข้อความยาวจะได้ไม่ดันช่องเลือกให้ต่ำกว่าช่องอื่น */}
            {!dragFacet && countries.length > 0 && (
              <p className="mt-1 text-[11px] zego-text-tertiary">เฉพาะเส้นทางของประเทศที่เลือก</p>
            )}
            {droppedRoutes.length > 0 && (
              <p role="status" className="mt-1 text-[11px] zego-text-warning">
                ถอด {droppedRoutes.join(', ')} ออกแล้ว — ไม่ได้อยู่ในประเทศที่เลือก
              </p>
            )}
          </div>
        </div>
        {/*
          กลุ่มวันที่ — Label เดียวคลุมทั้งช่วง · ใช้ DateInputBase (ไม่มีแถว Label ในตัว)
          เพื่อให้ขอบบน/ล่างตรงกับช่องประเทศพอดี · flex-nowrap กันตกบรรทัดบน Desktop
          ข้อความกำกับเดือนอยู่ใต้กลุ่ม จึงไม่ดันแนวของ Input
        */}
        <div className="min-w-[15rem]">
          <span className="mb-1 flex h-5 items-center overflow-hidden whitespace-nowrap text-xs font-medium zego-text-tertiary">วันที่เดินทาง</span>
          <div className="flex flex-nowrap items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <DateInputBase aria-label="วันที่เริ่มเดินทาง" value={from} onChange={setFrom} min={monthStart} max={monthEnd} className="h-[38px]" />
            </div>
            <span aria-hidden="true" className="shrink-0 zego-text-tertiary">–</span>
            <div className="min-w-0 flex-1">
              <DateInputBase aria-label="วันที่สิ้นสุดเดินทาง" value={to} onChange={setTo} min={from || monthStart} max={monthEnd} className="h-[38px]" />
            </div>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] zego-text-secondary">
              <input
                type="checkbox"
                checked={wholeMonth}
                onChange={toggleWholeMonth}
                className="zego-border-color h-3.5 w-3.5 rounded border"
              />
              แสดงทั้งเดือน
            </label>
            <p className="text-[11px] zego-text-tertiary">เลือกได้เฉพาะภายในเดือน{monthLabel}</p>
          </div>
        </div>
      </div>
      {rangeError && (
        <p role="alert" data-testid="range-error" className="zego-badge--danger mb-3 rounded-lg border px-3 py-2 text-sm">{rangeError}</p>
      )}

      {/* ค้นหางาน — ทำงานร่วมกับตัวกรองประเทศและช่วงวันที่ ไม่ใช่แทนที่ */}
      <div className="mb-3">
        <span className="mb-1 flex h-5 items-center overflow-hidden whitespace-nowrap text-xs font-medium zego-text-tertiary">ค้นหางาน</span>
        <SearchBox
          value={queryInput}
          onChange={setQueryInput}
          onClear={clearQuery}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitQuery(); } }}
          label="ค้นหา Group Code หรือชื่อโปรแกรม"
          placeholder="ค้นหา Group Code หรือชื่อโปรแกรม…"
        />
      </div>

      {/* §8 หัวข้อสั้น + ข้อมูลรองบอกเงื่อนไขที่กรองอยู่ */}
      <div className="mb-2">
        <p className="text-sm font-semibold zego-text">งานที่ยังไม่ระบุหัวหน้าทัวร์</p>
        <p data-testid="assign-summary" className="text-xs zego-text-tertiary">
          พบ {candidates.length} รายการ · {formatDate(from)}–{formatDate(to)} · {countryLabel(countries)}
          {routes.length > 0 && ` · เส้นทาง ${routes.join(', ')}`}
          {query && ` · ค้นหา: ${query}`}
        </p>
        <p className="text-[11px] zego-text-tertiary">โปรแกรม NO SELL ไม่ถูกนำมาแสดง</p>
      </div>

      {/* §10 ไม่พบงานตามเงื่อนไข — บอกให้ชัดพร้อมทางออก ไม่แอบแสดงงานวัน/ประเทศอื่น */}
      {candidates.length === 0 ? (
        <div data-testid="assign-empty" className="zego-border-color rounded-xl border border-dashed px-4 py-8 text-center">
          <p className="text-sm zego-text-tertiary">{query ? 'ไม่พบงานที่ตรงกับคำค้นหา' : 'ไม่พบงานที่ยังไม่ระบุหัวหน้าทัวร์'}</p>
          <p className="mt-0.5 text-xs zego-text-tertiary">
            {query
              ? `ไม่พบ Group Code หรือชื่อโปรแกรม “${query}” ภายใต้ประเทศและช่วงวันที่ที่เลือก`
              : `ช่วงวันที่ ${formatDate(from)}–${formatDate(to)} · ประเทศ ${countryLabel(countries)}`}
          </p>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {query && <Button size="sm" variant="secondary" onClick={clearQuery}>ล้างคำค้นหา</Button>}
            {countries.length > 0 && <Button size="sm" variant="secondary" onClick={() => changeCountries([])}>เลือกทุกประเทศ</Button>}
            {routes.length > 0 && <Button size="sm" variant="secondary" onClick={() => { setRoutes([]); setDroppedRoutes([]); }}>เลือกทุกเส้นทาง</Button>}
            {!wholeMonth && <Button size="sm" variant="secondary" onClick={toggleWholeMonth}>แสดงทั้งเดือน</Button>}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {candidateGroups.map((group) => (
            <section key={group.code}>
              {/*
                หัวข้อเส้นทาง — ติดบนขณะเลื่อน จะได้รู้ตลอดว่ากำลังดูเส้นทางไหน
                กด (หรือ Enter/Space) = กรองเส้นทางนี้ทันที · ลากไปวางที่ช่องตัวกรองเพื่อเลือกว่าจะกรองประเทศหรือเส้นทาง
              */}
              <div
                role="button"
                tabIndex={0}
                draggable
                aria-label={`กรองเฉพาะเส้นทาง ${group.code}${group.country ? ` (${group.country})` : ''} — ลากไปวางที่ช่องประเทศหรือเส้นทางได้`}
                onClick={() => addRouteFilter(group.code, group.country)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); addRouteFilter(group.code, group.country); }
                }}
                onDragStart={(e) => {
                  const facet = { route: group.code, country: group.country };
                  e.dataTransfer.setData('application/x-facet', JSON.stringify(facet));
                  e.dataTransfer.setData('text/plain', JSON.stringify(facet));
                  e.dataTransfer.effectAllowed = 'copy';
                  setDragFacet(facet);
                }}
                onDragEnd={() => { setDragFacet(null); setDropTarget(null); }}
                className="sticky top-0 z-10 -mx-1 mb-1.5 flex cursor-grab items-center justify-between gap-2 rounded-lg bg-[var(--zego-surface-inset)] px-3 py-1.5 backdrop-blur hover:bg-[var(--zego-surface-soft)] active:cursor-grabbing"
              >
                <span className="flex min-w-0 items-baseline gap-2">
                  <Icon name="menu" aria-hidden="true" className="h-3 w-3 shrink-0 self-center zego-text-tertiary" />
                  <span className="font-mono text-sm font-bold zego-text">{group.code}</span>
                  {group.country && <span className="truncate text-[11px] zego-text-tertiary">{group.country}</span>}
                </span>
                <span className="shrink-0 text-[11px] zego-text-tertiary">{group.list.length} กรุ๊ป</span>
              </div>
              <ul className="space-y-2">
                {group.list.map(({ p, check }) => {
            const isPicked = picked.has(p.internalId);
            const clash = overlapWithin.get(p.internalId);
            return (
              <li key={p.internalId}>
                <PeriodOptionCard
                  period={p}
                  picked={isPicked}
                  disabled={check.verdict === 'blocked'}
                  warned={Boolean(clash)}
                  badge={{ label: VLABEL[check.verdict], tone: check.verdict as OptionTone }}
                  tailLine="ยังไม่ระบุหัวหน้าทัวร์"
                  onToggle={() => togglePick(p)}
                  notes={
                    <>
                      {check.reason && (
                        <p className="mt-0.5 text-[11px] zego-text-warning">
                          {check.verdict === 'blocked'
                            ? `หัวหน้าทัวร์มีงานหรือสถานะไม่พร้อมรับงานทับซ้อนกับช่วง ${formatDateRange(p.startDate, p.endDate)} — ${check.reason}`
                            : check.reason}
                        </p>
                      )}
                      {clash && (
                        <p className="mt-0.5 text-[11px] font-medium zego-text-danger">
                          วันเดินทางทับซ้อนกับกรุ๊ปที่เลือกไว้: {clash.join(' · ')}
                        </p>
                      )}
                    </>
                  }
                />
              </li>
                );
              })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/*
        แถบสรุป — ติดท้ายหน้าต่างเสมอ เลื่อนรายการยาว ๆ แล้วยังกดมอบหมายได้โดยไม่ต้องเลื่อนกลับ
        กรุ๊ปที่เลือกไว้แต่หลุดจากตัวกรองปัจจุบันก็ยังอยู่ในชิป — ไม่มีของที่เลือกค้างแบบมองไม่เห็น
      */}
      {pickedList.length > 0 && (
        /* z-20 — ต้องสูงกว่าหัวข้อเส้นทางที่เป็น sticky z-10 ไม่งั้นหัวข้อจะพาดทับแถบสรุปตอนเลื่อน */
        <div className="sticky bottom-0 z-20 -mx-1 mt-3 zego-border-color zego-surface-bg rounded-xl border p-3 shadow-lg backdrop-blur">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold zego-text">เลือกไว้ {pickedList.length} กรุ๊ป</p>
            <span className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setPicked(new Map())}>ล้างที่เลือก</Button>
              <Button size="sm" variant="primary" disabled={hasOverlap} onClick={submit}>
                มอบหมาย {pickedList.length} กรุ๊ป
              </Button>
            </span>
          </div>

          <div className="flex flex-wrap gap-1">
            {pickedList.map((pd) => (
              <span key={pd.internalId}
                className={cx(
                  'inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium',
                  overlapWithin.has(pd.internalId) ? 'zego-badge--danger' : 'zego-badge--info',
                )}>
                {pd.groupCode}
                <button type="button" aria-label={`นำ ${pd.groupCode} ออก`} onClick={() => togglePick(pd)} className="hover:text-[var(--zego-text)]">×</button>
              </span>
            ))}
          </div>

          {hasOverlap && (
            <p role="alert" data-testid="pick-overlap" className="zego-badge--danger mt-2 rounded-lg border px-3 py-2 text-xs">
              มีกรุ๊ปที่วันเดินทางทับซ้อนกันเอง — หัวหน้าทัวร์คนเดียวรับพร้อมกันไม่ได้ กรุณาเอาออกให้เหลือชุดที่ไม่ชนกัน
            </p>
          )}
          {turnaroundWithin.length > 0 && (
            <div className="zego-badge--warning mt-2 rounded-lg border px-3 py-2 text-xs">
              <p className="font-medium">เดินทางวันเดียวกัน — โปรดพิจารณาว่าเวลาห่างพอหรือไม่</p>
              <ul className="mt-0.5 space-y-0.5">
                {turnaroundWithin.map((x) => (
                  <li key={x.codes}>{x.codes} — ลงเครื่องแล้วขึ้นเครื่องอีกกรุ๊ปห่างกัน {formatGapHours(x.hours)}</li>
                ))}
              </ul>
            </div>
          )}

          {!hasOverlap && pickedWarnings.length > 0 && (
            <p className="zego-badge--warning mt-2 rounded-lg border px-3 py-2 text-xs">
              {pickedWarnings.length} กรุ๊ปมีคำเตือน — จะให้ยืนยันอีกครั้งก่อนบันทึก
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmMany} onClose={() => setConfirmMany(false)} tone="primary" confirmLabel="ยืนยันมอบหมาย"
        title="ยืนยันการมอบหมาย (มีคำเตือน)"
        message={`${pickedWarnings.map((w) => `${w.pd.groupCode} — ${w.check.reason ?? 'พบคำเตือน'}`).join('\n')}\nต้องการมอบหมายทั้ง ${pickedList.length} กรุ๊ปให้ ${leaderDisplayName(leader)} ต่อหรือไม่?`}
        onConfirm={() => { onAssignMany(pickedList, ''); setConfirmMany(false); }}
      />
    </Drawer>
  );
}

/* ================================ Period Detail panel (§13 · จาก Master ด้วย periodId) ================================ */

function PeriodDetailPanel({ period, assignment, leaders, onClose, onUnassign, onCancelGroup, onAcknowledge }: {
  period: TourPeriodMaster | null; assignment: GuidePeriodAssignment | null; leaders: TourLeader[]; onClose: () => void;
  onUnassign: (assignmentId: string) => void;
  /** กรุ๊ปนี้ถูกยกเลิกทั้งหมด — ถอด + บันทึกประวัติ/Reminder (คนละอย่างกับ onUnassign) */
  onCancelGroup: (assignmentId: string) => void;
  onAcknowledge: (assignmentId: string, period: TourPeriodMaster) => void;
}) {
  const leader = assignment ? leaders.find((l) => l.id === assignment.tourLeaderId) ?? null : null;
  const board = boardStatusFromAssignment(assignment?.assignmentStatus);
  const disp = period ? periodScheduleDisplay(period) : null;
  const issues = period && assignment ? detectAssignmentIssues(assignment.snapshot, period) : [];
  const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('th-TH'));
  return (
    <Drawer open={!!period} onClose={onClose} title={period ? period.groupCode : ''} description={period?.displayName}
      footer={period && (
        <div className="flex flex-wrap gap-2">
          {/* มอบหมายแล้ว = คอนเฟิร์มทันที (ไม่มีขั้นตอนรอคอนเฟิร์มอีกต่อไป) — เหลือแค่ 2 ปุ่ม: ยกเลิกหัวหน้าทัวร์ (บันทึกประวัติ+เตือนชดเชย) และยกเลิกการมอบหมาย (แค่ปรับการจัดงาน) */}
          {assignment && (
            <button
              type="button"
              onClick={() => onCancelGroup(assignment.assignmentId)}
              title="กรุ๊ป/งานทั้งหมดถูกยกเลิก — บันทึกประวัติไกด์ถูกยกเลิกงานและตั้งเตือนจัดงานชดเชย"
              className="zego-badge--warning inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors"
            >
              <Icon name="warning" className="h-4 w-4" />
              ยกเลิกหัวหน้าทัวร์
            </button>
          )}
          {assignment && <Button variant="danger" size="sm" onClick={() => onUnassign(assignment.assignmentId)}>ยกเลิกการมอบหมาย</Button>}
        </div>
      )}>
      {period && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge meta={BOARD_STATUS[board]} />
            <span className="zego-badge--slate rounded border px-2 py-0.5 text-xs">ขาย: {SALE_STATUS_LABEL[period.saleStatus]}</span>
            <span className="zego-badge--violet rounded border px-2 py-0.5 text-xs">{period.periodStatus}</span>
            <span className="zego-badge--slate rounded border px-2 py-0.5 text-xs">periodId: {period.internalId}</span>
          </div>
          {/* §9 แจ้งเตือนเมื่อข้อมูลต้นทางเปลี่ยน — ไม่ลบอัตโนมัติ · ให้ผู้จัดรับทราบ */}
          {issues.length > 0 && assignment && (
            <div className="zego-badge--warning rounded-lg border px-3 py-2 text-xs">
              <p className="mb-1 font-semibold">ข้อมูลต้นทางเปลี่ยน — โปรดตรวจสอบ (§9)</p>
              <ul className="list-inside list-disc space-y-0.5">{issues.map((i, k) => <li key={k}>{i.detail ?? i.label}</li>)}</ul>
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => onAcknowledge(assignment.assignmentId, period)}>รับทราบและอัปเดตตามต้นทาง</Button>
                <Button variant="danger" size="sm" onClick={() => onUnassign(assignment.assignmentId)}>ยกเลิกการมอบหมาย</Button>
              </div>
            </div>
          )}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Field label="Group Code" value={period.groupCode} mono />
            <Field label="Program Code" value={period.programCode ?? '—'} mono />
            <Field label="ชื่อรายการทัวร์" value={period.displayName} className="col-span-2" />
            <Field label="ประเทศ" value={period.countryName} />
            <Field label="บัส" value={disp!.bus} />
            <Field label="สนามบินขาออก (Sector 1)" value={disp!.depAirport} mono />
            <Field label="สายการบิน (Sector 1)" value={disp!.airlineCode} mono />
            {period.sectors.length === 0 ? (
              <Field label="เที่ยวบิน" value="ไม่มีข้อมูลเที่ยวบินจากต้นทาง" className="col-span-2" />
            ) : (
              <div className="col-span-2">
                <p className="text-[11px] font-medium zego-text-tertiary">เที่ยวบิน ({period.sectors.length} ช่วง)</p>
                <ul className="mt-0.5 space-y-0.5">
                  {period.sectors.map((sec) => (
                    <li key={`${sec.sectorSequence}-${sec.flightNumber}`} className="flex items-center gap-1.5 text-sm zego-text-secondary">
                      <Icon name="plane" className="h-3.5 w-3.5 shrink-0 zego-text-tertiary" />
                      {/* บอกว่าช่วงนี้เป็นขาไปหรือขากลับ — ทัวร์ที่เข้าเมืองหนึ่งออกอีกเมืองดูจากรหัสสนามบินอย่างเดียวไม่ออก */}
                      <span className="w-8 shrink-0 text-right text-xs zego-text-tertiary">{sec.sectorType === 'INBOUND' ? 'กลับ' : 'ไป'}</span>
                      <span className="font-mono font-medium">{sectorSummary(sec) || '—'}</span>
                      {sec.airlineCode && <span className="text-xs zego-text-tertiary">{sec.airlineCode}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Field label="วันเดินทาง" value={formatDate(period.startDate)} />
            <Field label="วันกลับ" value={formatDate(period.endDate)} />
            <Field label="ราคา" value={`${num(period.price)} ${period.currency}`} />
            <Field label="ราคาวีซ่า" value={num(period.visaPrice)} />
            <Field label="ที่นั่ง (ทั้งหมด/จอง/เหลือ)" value={`${num(period.seatTotal)} / ${num(period.seatBooked)} / ${num(period.seatRemaining)}`} className="col-span-2" />
            {/* ข้อความเต็มถ้ามี · ไม่มีก็แสดงแค่ประเภทกรุ๊ป — ข้อความอื่นอยู่ที่ "หมายเหตุจากระบบ" บรรทัดถัดไป */}
            <Field label="INC / COL" value={period.periodStatusDetail ?? period.periodStatus} className="col-span-2" />
            <Field label="หมายเหตุจากระบบ" value={period.systemNote ?? '—'} className="col-span-2" />
            <Field label="คอมมิชชั่น" value={period.commission ?? '—'} />
            <Field label="แหล่งข้อมูล" value={period.sourceSystem} />
          </dl>
          {/* ข้อมูลการจัด (จาก Guide Assignment · อ้าง periodId §7) */}
          <div>
            <p className="mb-1.5 text-xs font-semibold zego-text-tertiary">การจัดหัวหน้าทัวร์</p>
            {assignment ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Field label="หัวหน้าทัวร์" value={leader ? leaderDisplayName(leader) : assignment.tourLeaderId} />
                <Field label="สถานะการจัด" value={BOARD_STATUS[board].label} />
                <Field label="ผู้มอบหมาย" value={assignment.assignedBy} />
                <Field label="วันที่มอบหมาย" value={formatDate(assignment.assignedAt)} />
                {assignment.note && <Field label="หมายเหตุ" value={assignment.note} className="col-span-2" />}
              </dl>
            ) : <p className="text-sm zego-text-tertiary">ยังไม่มีหัวหน้าทัวร์</p>}
          </div>
        </div>
      )}
    </Drawer>
  );
}

function Field({ label, value, mono, className }: { label: string; value: string; mono?: boolean; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs zego-text-tertiary">{label}</dt>
      <dd className={cx('font-medium zego-text', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}

/* ================================ Leader Info Panel (§10) ================================ */

function LeaderInfoPanel({ leader, onClose, countries, routes, today, assignments, periodById, records }: {
  leader: TourLeader | null; onClose: () => void; countries: Country[]; routes: TourRoute[]; today: string;
  assignments: GuidePeriodAssignment[]; periodById: Map<string, TourPeriodMaster>; records: LeaderAvailabilityRecord[];
}) {
  if (!leader) return null;
  const exp = getLeaderExpertise(leader, countries, routes);
  const passSt = passportStatus(getPassportExpiry(leader.id), today);
  const leaderPeriods = assignments.map((a) => periodById.get(a.periodId)).filter((p): p is TourPeriodMaster => !!p).sort((a, b) => a.startDate.localeCompare(b.startDate));
  const leave = records.filter((r) => r.leaderId === leader.id && r.approval === 'approved');

  return (
    <Drawer open onClose={onClose} title={exp.displayName} description={exp.fullName}>
      <div className="space-y-4">
        {/* สถานะ + Passport (ไม่แสดงเลขเอกสาร §3) */}
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge meta={LEADER_STATUS[leader.status]} />
          <span className={cx('rounded px-2 py-0.5 text-xs font-medium ring-1 ring-inset', PASSPORT_TONE_CLASS[PASSPORT_STATUS_META[passSt].tone])}>หนังสือเดินทาง: {PASSPORT_STATUS_META[passSt].label}</span>
        </div>

        <ChipSection title="ประเทศที่เชี่ยวชาญ" items={exp.countries} empty="ยังไม่ระบุประเทศ" />
        <ChipSection title="เส้นทางที่เชี่ยวชาญ" items={exp.routes} empty="ยังไม่ระบุเส้นทาง" />
        <ChipSection title="ประเภททัวร์ / กลุ่มลูกค้า" items={exp.tourTypes} empty="ยังไม่ระบุประเภททัวร์" />
        <ChipSection title="ทักษะและความถนัด" items={exp.skills} empty="ยังไม่ระบุทักษะ" />
        <ChipSection title="ความถนัดพิเศษ" items={exp.specialSkills} empty="—" />

        {leader.cautions && (
          <div>
            <p className="mb-1 text-xs font-semibold zego-text-tertiary">ข้อจำกัดในการรับงาน</p>
            <p className="zego-badge--warning rounded-lg border px-3 py-2 text-sm">{leader.cautions}</p>
          </div>
        )}

        <div>
          <p className="mb-1.5 text-xs font-semibold zego-text-tertiary">ตารางงาน ({leaderPeriods.length})</p>
          {leaderPeriods.length === 0 ? <p className="text-sm zego-text-tertiary">ยังไม่มีงานที่มอบหมาย</p> : (
            <ul className="space-y-1 text-sm">
              {leaderPeriods.slice(0, 12).map((p) => (
                <li key={p.internalId} className="zego-border-color flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5">
                  <span className="min-w-0 truncate"><span className="font-mono text-xs font-semibold">{p.groupCode}</span> · {p.countryName}</span>
                  <span className="shrink-0 text-xs zego-text-tertiary">{formatDateRange(p.startDate, p.endDate)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold zego-text-tertiary">วันลา / ช่วงไม่พร้อม ({leave.length})</p>
          {leave.length === 0 ? <p className="text-sm zego-text-tertiary">ไม่มี</p> : (
            <ul className="space-y-1 text-sm zego-text-secondary">
              {leave.map((r) => <li key={r.id}>{recordTypeLabel(r)} · {formatRecordSchedule(r)}</li>)}
            </ul>
          )}
        </div>

        <p className="text-xs zego-text-tertiary">ดูข้อมูลส่วนบุคคล/หนังสือเดินทางแบบเต็มได้ที่หน้ารายละเอียดหัวหน้าทัวร์ (จำกัดสิทธิ์)</p>
      </div>
    </Drawer>
  );
}

function ChipSection({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold zego-text-tertiary">{title}</p>
      {items.length === 0 ? <p className="text-sm zego-text-disabled">{empty}</p> : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((it) => <span key={it} className="zego-badge--slate rounded-full border px-2 py-0.5 text-xs">{it}</span>)}
        </div>
      )}
    </div>
  );
}

/* ================================ Reassign confirm (§6) ================================ */

function ReassignDialog({ data, onClose, onConfirm }: { data: { assignment: GuidePeriodAssignment; period: TourPeriodMaster; from: TourLeader | null; to: TourLeader }; onClose: () => void; onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  return (
    <Drawer open onClose={onClose} title="เปลี่ยนหัวหน้าทัวร์" description={data.period.groupCode}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>ยกเลิก</Button>
          <Button variant="primary" disabled={reason.trim() === ''} onClick={() => onConfirm(reason.trim())}>ยืนยันการเปลี่ยน</Button>
        </div>
      }>
      <div className="space-y-4">
        <div className="zego-border-color rounded-xl border p-3 text-sm">
          <p className="zego-text-secondary">{data.period.displayName}</p>
          <p className="mt-1 text-xs zego-text-tertiary">{data.period.countryName} · {formatDateRange(data.period.startDate, data.period.endDate)}</p>
        </div>
        <div className="flex items-center justify-between gap-2 text-sm">
          <div className="flex-1 rounded-lg zego-surface-soft-bg p-2 text-center"><p className="text-xs zego-text-tertiary">จากหัวหน้าทัวร์</p><p className="font-medium zego-text-secondary">{data.from ? leaderDisplayName(data.from) : 'ยังไม่ระบุ'}</p></div>
          <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-tertiary" />
          <div className="flex-1 rounded-lg bg-[#f1f7fd] p-2 text-center"><p className="text-xs zego-text-info">เป็นหัวหน้าทัวร์</p><p className="font-medium zego-text-info">{leaderDisplayName(data.to)}</p></div>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium zego-text-tertiary">เหตุผลการเปลี่ยน (จำเป็น)</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="zego-border-color w-full rounded-lg border px-3 py-2 text-sm" placeholder="เช่น หัวหน้าทัวร์เดิมติดภารกิจกะทันหัน" />
        </label>
        <p className="text-xs zego-text-tertiary">ระบบจะบันทึกการเปลี่ยนแปลงนี้ไว้ใน Audit Log (ผู้ดำเนินการ · เวลา · เหตุผล) และหัวหน้าทัวร์ใหม่ต้องคอนเฟิร์มอีกครั้ง</p>
      </div>
    </Drawer>
  );
}
