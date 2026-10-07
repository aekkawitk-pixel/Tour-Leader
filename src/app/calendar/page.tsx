'use client';

/**
 * ปฏิทินงาน (§5) — อ่านข้อมูลจาก Tour Period Master ชุดเดียวกับตารางโปรแกรม (Source of Truth §1)
 *
 * • 1 Event = 1 พีเรียด · อ้างอิงด้วย periodId · วางตาม startDate · บน Event แสดงเฉพาะ Group Code
 * • คลิก Event → ดึงรายละเอียดล่าสุดจาก Master ด้วย periodId (§5/§13) — ไม่คัดลอกพีเรียดเก็บแยกถาวร
 * • ตัวกรองชุดเดียวกับ List View (ประเทศ/สถานะขาย/สถานะพีเรียด/ค้นหา) · Master เปลี่ยน → สะท้อนทันที
 * • อ่านอย่างเดียว: วันเดินทางมาจากพีเรียดจริง ห้ามลากเปลี่ยนวันที่นี่ (จัดหัวหน้าทัวร์ทำที่ /jobs)
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { addDays, formatDate, formatDateRange, parseDate, TH_WEEKDAYS_SHORT } from '@/lib/format';
import { buildMonthGrid, buildWeekGrid, monthTitle, shiftMonth, shiftWeek } from '@/lib/logic/calendar';
import { Button, Card, cx, EmptyState, PageHeader, StatusBadge } from '@/components/ui/Primitives';
import { SelectInput, SearchBox } from '@/components/ui/FormField';
import { MultiSelect } from '@/components/ui/MultiSelect';
import { SegmentedControl } from '@/components/ui/Tabs';
import { Drawer } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { nextMonthStart, nextMonthStartFromNow } from '@/components/ui/MonthPicker';
import { getAssignablePeriods, getTourPeriods } from '@/services/tourPeriodMaster';
import { getHolidayMap } from '@/services/holidayService';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { periodScheduleDisplay, BOARD_STATUS, boardStatusFromAssignment } from '@/lib/logic/guideBoard';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { SALE_STATUS_LABEL } from '@/data/schedule/saleStatus';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { loadSendOffAssignments } from '@/services/sendOffAssignmentStore';
import { loadManualFlightTimes, type ManualFlightTimes } from '@/services/sendOffFlightTimeStore';
import { loadManualAirports, type ManualAirports } from '@/services/sendOffManualAirportStore';
import { loadSendOffRules } from '@/services/sendOffRulesStore';
import { DEFAULT_SEND_OFF_RULES, type SendOffRules } from '@/lib/logic/sendOffRules';
import { dayOffLookup } from '@/lib/logic/dayOff';
import { buildSendOffJobs, jobStatus as sendOffJobStatus, sendOffPeriodPool, type SendOffJob } from '@/lib/logic/sendOffJobs';
import { sendOffStaffName } from '@/lib/logic/sendOffStaff';
import type { TourPeriodMaster } from '@/data/schedule/masterTypes';
import type { PeriodStatus, SaleStatus } from '@/data/schedule/types';

type View = 'month' | 'week' | 'timeline';

const SALE_CHIP: Record<SaleStatus, string> = {
  SELL: 'zego-badge--success',
  NO_SELL: 'zego-badge--slate',
  CLOSED: 'zego-badge--danger',
};

/** ความสูงแถบด้านบนของแอปที่ sticky อยู่ (px) — ใช้เป็นจุดเริ่มของทุกอย่างที่ต้องเกาะใต้มัน (= --zego-topbar) */
const APP_HEADER_H = 66;

/** ชื่อเดือนย่อ — ใช้กำกับวันหยุดที่อยู่นอกเดือนของตาราง (ต้น/ท้ายตาราง) */
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/*
  พื้นหลัง Event บนปฏิทิน — ไม่ไล่สีตามสถานะการจัดอีกต่อไป (เดิมทำให้ปฏิทินดูเป็นสีสถานะเต็มไปหมด
  โดยไม่มีคำอธิบายสีอยู่ในหน้าแล้ว) เหลือแค่ไอคอน (คนถือธง/เครื่องบิน) ที่ไล่สีตามสถานะจริง
  ส่วนพื้นหลัง Event ใช้สีกลางเดียวกันหมด ต้องคลิกเข้าไปดูรายละเอียดถึงจะเห็นสถานะเป็นตัวหนังสือ
*/
const NEUTRAL_CHIP = 'zego-badge--slate zego-text-secondary';
/** กรุ๊ปที่จัดครบแล้ว — หัวหน้าทัวร์คอนเฟิร์มแล้ว และเจ้าหน้าที่ส่งกรุ๊ปคอนเฟิร์มแล้ว → เขียวทั้งช่อง */
const COMPLETE_CHIP = 'border-emerald-400 bg-emerald-100 text-emerald-900';

/** สีไอคอนตามสถานะจริง — ใช้กับทั้งไอคอนคนถือธงและไอคอนเครื่องบิน (พื้นหลัง Event ไม่ไล่สีตามนี้แล้ว) */
const STATUS_ICON_COLOR: Record<keyof typeof BOARD_STATUS, string> = {
  UNASSIGNED: 'zego-text-tertiary',
  PENDING_CONFIRMATION: 'zego-text-warning',
  CONFIRMED: 'zego-text-success',
  DECLINED: 'zego-text-danger',
  REASSIGN_REQUIRED: 'zego-text-orange',
};


/** Event วางตาม startDate (§5) — 1 พีเรียด = 1 Event ในวันเริ่มเดินทาง */
function groupByStart(rows: TourPeriodMaster[]): Map<string, TourPeriodMaster[]> {
  const map = new Map<string, TourPeriodMaster[]>();
  for (const p of rows) {
    if (!map.has(p.startDate)) map.set(p.startDate, []);
    map.get(p.startDate)!.push(p);
  }
  for (const list of map.values()) list.sort((a, b) => a.groupCode.localeCompare(b.groupCode));
  return map;
}

/**
 * ป้ายรหัสกรุ๊ปที่แสดงทุกมุมมอง — "Group Code (บัส)" รูปแบบเดียวกับหน้าการจัดสเก็ต
 * กรุ๊ป INC กำกับต่อในวงเล็บเดียวกัน ไม่ให้กลายเป็นวงเล็บสองชุดติดกัน · COL เป็นค่าปกติจึงไม่ต้องกำกับ
 */
const groupCodeLabel = (p: TourPeriodMaster) => {
  const tags = [p.bus && p.bus !== '-' ? p.bus : null, p.periodStatus === 'INC' ? 'INC' : null].filter(Boolean);
  return tags.length > 0 ? `${p.groupCode} (${tags.join(' · ')})` : p.groupCode;
};

/**
 * ขนาดตัวอักษรบนแถบตาราง — ปรับตาม "ความกว้างจริงของแถบ" ด้วย container query (cqi = 1% ของความกว้างแถบ)
 *
 * เดิมกำหนดตามจำนวนวันของทริป (ทริป ≤4 วันเหลือ 7px) ซึ่งเล็กเกินอ่านแม้แถบจะกว้างพอบนจอใหญ่
 * ตอนนี้ขยายเต็มที่เท่าที่แถบรับได้ และไม่เล็กกว่าเกณฑ์อ่านได้ — แถบที่แคบจริง ๆ ตัดท้ายด้วย … (ดูเต็มที่ tooltip)
 */
const BAR_FONT = {
  code: 'text-[clamp(10px,9cqi,12px)]',
  sub: 'text-[clamp(9px,8cqi,11px)]',
  icon: 'h-[clamp(9px,8cqi,11px)] w-[clamp(9px,8cqi,11px)]',
};

export default function CalendarPage() {
  const { leaders, today, currentUser } = useDemo();

  /*
   * ค่าเริ่มต้น = เงื่อนไขเดียวกับเมนูการจัดสเก็ต — เดือนถัดไปจากวันที่จริงของเครื่องผู้ใช้ (nextMonthStartFromNow)
   * ตั้งใน useEffect ตอน mount — หน้านี้ถูก prerender ตอน build ถ้าคำนวณตอน render จะได้เดือนตอน build ค้างไว้
   */
  const [startMonth, setStartMonth] = useState(() => nextMonthStart(today));
  const todayDate = parseDate(startMonth);
  const [view, setView] = useState<View>('month');
  const [cursor, setCursor] = useState({ year: todayDate.getFullYear(), month: todayDate.getMonth() });
  const [weekAnchor, setWeekAnchor] = useState(startMonth);
  /** หัวคอลัมน์วัน (ใน sticky) เลื่อนแนวนอนตามตัวปฏิทินบนจอแคบ */
  const gridHeadRef = useRef<HTMLDivElement>(null);
  const syncHeadScroll = (e: UIEvent<HTMLDivElement>) => {
    if (gridHeadRef.current) gridHeadRef.current.scrollLeft = e.currentTarget.scrollLeft;
  };
  useEffect(() => {
    const m = nextMonthStartFromNow();
    const d = parseDate(m);
    /* eslint-disable react-hooks/set-state-in-effect */
    setStartMonth(m);
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setWeekAnchor(m);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  const [country, setCountry] = useState<string[]>([]); // [] = ทุกประเทศ · เลือกได้มากกว่า 1
  // ค่าเริ่มต้น SELL + CLOSED — ซ่อน NO_SELL (พีเรียดที่ไม่เปิดขายแล้ว) ไว้ก่อน · [] = ทั้งหมด
  const [sale, setSale] = useState<SaleStatus[]>(['SELL', 'CLOSED']);
  const [period, setPeriod] = useState<'all' | PeriodStatus>('all'); // ประเภทกรุ๊ปมีแค่ INC/COL
  const [search, setSearch] = useState('');
  // ตัวกรองการจัดหัวหน้าทัวร์ — ข้อมูลคนละแหล่งกับ Master จึงกรองฝั่ง client (§14)
  const [assignState, setAssignState] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [leaderPick, setLeaderPick] = useState<string[]>([]); // [] = ทุกคนที่ถูกจัดแล้ว
  // ตัวกรองการจัดเจ้าหน้าที่ส่งกรุ๊ป — คู่ขนานกับหัวหน้าทัวร์ด้านบน กรองอิสระจากกัน
  const [sendOffState, setSendOffState] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [staffPick, setStaffPick] = useState<string[]>([]); // [] = ทุกคนที่ถูกจัดแล้ว

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dayOpen, setDayOpen] = useState<string | null>(null); // วันที่ ISO ที่กางรายการกรุ๊ปทั้งวันอยู่

  const [assignments] = useState(() => (typeof window !== 'undefined' ? loadActiveGuideAssignments() : []));
  const assignmentByPeriod = useMemo(() => new Map(assignments.map((a) => [a.periodId, a])), [assignments]);

  /*
   * ข้อมูลเจ้าหน้าที่ส่งกรุ๊ป — คนละสถานะ/คนละ Store กับหัวหน้าทัวร์ (§ดูหมายเหตุด้านล่าง)
   * เดิมปฏิทินนี้ไม่รู้จักข้อมูลนี้เลย ทำให้ดูไม่ออกว่ากรุ๊ปไหน "จัดครบ" จริง — มีแต่หัวหน้าทัวร์ก็ยังไปสนามบินไม่ได้ถ้าไม่มีคนไปส่ง
   */
  const [sendOffStaffList] = useState(() => (typeof window !== 'undefined' ? loadSendOffStaff() : []));
  const [sendOffAssignments] = useState(() => (typeof window !== 'undefined' ? loadSendOffAssignments() : []));
  const [manualFlightTimes] = useState<ManualFlightTimes>(() => (typeof window !== 'undefined' ? loadManualFlightTimes() : {}));
  const [manualAirports] = useState<ManualAirports>(() => (typeof window !== 'undefined' ? loadManualAirports() : {}));
  const [sendOffRules] = useState<SendOffRules>(() => (typeof window !== 'undefined' ? loadSendOffRules() : DEFAULT_SEND_OFF_RULES));
  const sendOffStaffById = useMemo(() => new Map(sendOffStaffList.map((s) => [s.id, s])), [sendOffStaffList]);

  /*
   * หัวหน้าทัวร์เห็นเฉพาะงานของตัวเอง — กรองที่ชุดข้อมูลตั้งต้นจุดเดียว
   * ทั้งปฏิทิน ตัวกรอง และรายการรายวันอ่านต่อจากชุดนี้ จึงไม่มีทางหลุดงานคนอื่นออกทางใดทางหนึ่ง
   */
  const ownScope = ownLeaderScope(currentUser);
  const ownPeriodIds = useMemo(() => {
    if (ownScope === null) return null;
    return new Set(assignments.filter((a) => a.tourLeaderId === ownScope).map((a) => a.periodId));
  }, [ownScope, assignments]);
  const scopeToOwn = useCallback(
    (rows: TourPeriodMaster[]) => (ownPeriodIds === null ? rows : rows.filter((p) => ownPeriodIds.has(p.internalId))),
    [ownPeriodIds],
  );

  const allPeriods = useMemo(() => scopeToOwn(getTourPeriods()), [scopeToOwn]);
  const countries = useMemo(() => [...new Set(allPeriods.map((p) => p.countryName))].sort((a, b) => a.localeCompare(b)), [allPeriods]);

  /** หัวหน้าทัวร์ของพีเรียด — ต้องมีทั้ง Assignment และตัวหัวหน้าทัวร์จริงใน Master */
  const leaderOf = useCallback(
    (p: TourPeriodMaster) => {
      const a = assignmentByPeriod.get(p.internalId);
      return a ? leaders.find((l) => l.id === a.tourLeaderId) ?? null : null;
    },
    [assignmentByPeriod, leaders],
  );

  // ตัวกรองชุดเดียวกับ List View (§5) — Query จาก Master ผ่าน Service
  const masterFiltered = useMemo(() => scopeToOwn(getTourPeriods({
    countryName: country,
    saleStatus: sale.length > 0 ? sale : undefined,
    periodStatus: period === 'all' ? undefined : period,
    // ค้นเฉพาะรหัสกรุ๊ปกับโปรแกรม — ไม่ให้ INC/หมายเหตุระบบมาติดผลค้นหา
    groupOrProgram: search.trim() || undefined,
  })), [country, sale, period, search, scopeToOwn]);

  const monthCells = useMemo(() => buildMonthGrid(cursor.year, cursor.month, today), [cursor, today]);
  const weekCells = useMemo(() => buildWeekGrid(weekAnchor, today), [weekAnchor, today]);

  // วันหยุดของบริษัท — อ่านผ่าน holidayService จุดเดียว (§14) · ตารางเดือนคาบปีได้จึงดึงทุกปีที่ปรากฏ
  const holidays = useMemo(() => {
    const years = new Set([...monthCells, ...weekCells].map((c) => Number(c.date.slice(0, 4))));
    return getHolidayMap([...years]);
  }, [monthCells, weekCells]);
  const sendOffDayOffOf = useMemo(() => dayOffLookup(holidays), [holidays]);

  /**
   * งานเจ้าหน้าที่ส่งกรุ๊ปของทุกพีเรียดที่เห็นได้ในหน้านี้ — คำนวณชุดเดียวกับที่เมนู "การจัดสเก็ต" ใช้
   * (sendOffPeriodPool ตัดพีเรียดที่ไม่เปิดขาย/ไม่ผ่านตรวจออกไปเอง ให้เหลือเฉพาะกรุ๊ปที่ต้องมีคนไปส่งจริง ๆ
   * พีเรียดที่ไม่อยู่ใน map นี้ = ไม่ต้องมีคนไปส่ง ไม่ใช่ "ขาด")
   */
  const sendOffJobByPeriod = useMemo(() => {
    const assignableIds = new Set(getAssignablePeriods().map((p) => p.internalId));
    const periods = sendOffPeriodPool({ periods: allPeriods, assignablePeriodIds: assignableIds, assignments: sendOffAssignments });
    const jobs = buildSendOffJobs({
      periods, assignments: sendOffAssignments, staffById: sendOffStaffById,
      manualTimes: manualFlightTimes, manualAirports, rules: sendOffRules, dayOffOf: sendOffDayOffOf,
    });
    /*
      กรุ๊ปใหญ่บางกรุ๊ปมีเจ้าหน้าที่ส่งกรุ๊ปได้มากกว่า 1 คน — buildSendOffJobs จึงคืนได้หลายรายการต่อพีเรียด
      หน้าปฏิทินมีที่แสดงแค่ไอคอน/ป้ายเดียวต่อวัน จึงต้องเลือกตัวแทนตัวเดียว: คอนเฟิร์มแล้วชนะรอคอนเฟิร์มเสมอ
      (ถ้ามีอย่างน้อยหนึ่งคนคอนเฟิร์ม ก็ถือว่ากรุ๊ปนี้ "มีคนไปส่งแล้วจริง" ทั้งที่บางคนอาจยังรอคอนเฟิร์มอยู่)
    */
    const rank = (j: SendOffJob) => (j.assignment?.status === 'CONFIRMED' ? 2 : j.assignment ? 1 : 0);
    const byPeriod = new Map<string, SendOffJob>();
    for (const j of jobs) {
      const existing = byPeriod.get(j.period.internalId);
      if (!existing || rank(j) > rank(existing)) byPeriod.set(j.period.internalId, j);
    }
    return byPeriod;
  }, [allPeriods, sendOffAssignments, sendOffStaffById, manualFlightTimes, manualAirports, sendOffRules, sendOffDayOffOf]);

  /** เจ้าหน้าที่ส่งกรุ๊ปของพีเรียด — null = ไม่มีคนไปส่ง (ปฏิเสธแล้วก็ถือว่ายังไม่มี) · undefined = พีเรียดนี้ไม่ต้องมีคนไปส่ง */
  const sendOffOf = useCallback(
    (p: TourPeriodMaster): SendOffJob | undefined => sendOffJobByPeriod.get(p.internalId),
    [sendOffJobByPeriod],
  );
  /** นับว่า "จัดครบแล้ว" เฉพาะที่คอนเฟิร์มแล้วจริง — ที่ยังรอคอนเฟิร์มยังไม่นับว่าจบงาน (ใช้กับตัวเลขสรุปเท่านั้น ไม่ใช่ป้ายชื่อ) */
  const hasSendOff = (job: SendOffJob | undefined): boolean => job?.assignment?.status === 'CONFIRMED';

  /**
   * ช่วงที่กำลังแสดง "ก่อน" กรองการจัดหัวหน้าทัวร์ — ใช้สร้างรายชื่อในตัวกรองเท่านั้น
   * ต้องคำนวณจากชุดก่อนกรอง ไม่งั้นพอเลือกคนหนึ่ง รายชื่อจะยุบเหลือคนนั้นคนเดียวจนเลือกคนอื่นต่อไม่ได้
   */
  const rangeBeforeAssignFilter = useMemo(() => {
    const byStart = groupByStart(masterFiltered);
    // มุมมองรายการและตารางใช้ช่วงเดือนเดียวกับมุมมองเดือน — ทุกแท็บจึงพูดถึงช่วงเวลาเดียวกันเสมอ
    const cells = view === 'week' ? weekCells : monthCells;
    return cells.filter((c) => c.inMonth).flatMap((c) => byStart.get(c.date) ?? []);
  }, [view, masterFiltered, monthCells, weekCells]);

  /**
   * รายชื่อในตัวกรอง = เฉพาะหัวหน้าทัวร์ที่ "ถูกจัดกับรหัสกรุ๊ปในช่วงที่ดูอยู่" เท่านั้น
   * (ไม่ใช่หัวหน้าทัวร์ทั้ง 352 คน — รายชื่อที่ไม่เกี่ยวข้องจะได้ไม่ท่วมกล่อง)
   * คนที่ถูกเลือกค้างไว้จะคงอยู่ในรายการเสมอแม้ช่วงใหม่ไม่มีงาน จะได้เห็นว่าทำไมปฏิทินว่างและกดออกได้
   */
  const leaderOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of rangeBeforeAssignFilter) {
      const a = assignmentByPeriod.get(p.internalId);
      if (a) count.set(a.tourLeaderId, (count.get(a.tourLeaderId) ?? 0) + 1);
    }
    for (const id of leaderPick) if (!count.has(id)) count.set(id, 0);
    return [...count]
      .map(([id, n]) => {
        const l = leaders.find((x) => x.id === id);
        return { value: id, name: l ? leaderDisplayName(l) : id, jobs: n };
      })
      .filter((o) => leaders.some((l) => l.id === o.value))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      .map((o) => ({ value: o.value, label: `${o.name} (${o.jobs})` }));
  }, [rangeBeforeAssignFilter, assignmentByPeriod, leaders, leaderPick]);

  /** รายชื่อในตัวกรองฝั่งเจ้าหน้าที่ส่งกรุ๊ป — คู่ขนานกับ leaderOptions ด้านบน (นับเฉพาะที่จัดแล้ว ไม่นับปฏิเสธ) */
  const staffOptions = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of rangeBeforeAssignFilter) {
      const job = sendOffOf(p);
      if (hasSendOff(job) && job?.staff) count.set(job.staff.id, (count.get(job.staff.id) ?? 0) + 1);
    }
    for (const id of staffPick) if (!count.has(id)) count.set(id, 0);
    return [...count]
      .map(([id, n]) => {
        const s = sendOffStaffById.get(id);
        return { value: id, name: s ? sendOffStaffName(s) : id, jobs: n };
      })
      .filter((o) => sendOffStaffById.has(o.value))
      .sort((a, b) => a.name.localeCompare(b.name, 'th'))
      .map((o) => ({ value: o.value, label: `${o.name} (${o.jobs})` }));
  }, [rangeBeforeAssignFilter, sendOffOf, sendOffStaffById, staffPick]);

  /** กรองการจัดหัวหน้าทัวร์ + เจ้าหน้าที่ส่งกรุ๊ป — ทำฝั่ง client เพราะข้อมูลการจัดไม่ได้อยู่ใน Master (§14) */
  const filtered = useMemo(() => {
    let rows = masterFiltered;
    if (assignState === 'assigned') rows = rows.filter((p) => leaderOf(p));
    else if (assignState === 'unassigned') rows = rows.filter((p) => !leaderOf(p));
    if (leaderPick.length > 0) {
      const picked = new Set(leaderPick);
      rows = rows.filter((p) => {
        const a = assignmentByPeriod.get(p.internalId);
        return !!a && picked.has(a.tourLeaderId);
      });
    }
    if (sendOffState === 'assigned') rows = rows.filter((p) => hasSendOff(sendOffOf(p)));
    else if (sendOffState === 'unassigned') rows = rows.filter((p) => { const job = sendOffOf(p); return !!job && !hasSendOff(job); });
    if (staffPick.length > 0) {
      const picked = new Set(staffPick);
      rows = rows.filter((p) => {
        const job = sendOffOf(p);
        return !!job?.staff && picked.has(job.staff.id);
      });
    }
    return rows;
  }, [masterFiltered, assignState, leaderPick, leaderOf, assignmentByPeriod, sendOffState, staffPick, sendOffOf]);

  const periodsByStart = useMemo(() => groupByStart(filtered), [filtered]);
  /* เรียงจากชุดที่อยู่ในช่วงที่เลือกเท่านั้น — ประกาศหลัง visiblePeriods ที่เป็นตัวกำหนดช่วง */

  /** วันสุดท้ายของเดือนที่เลือก — ใช้แยกว่าคอลัมน์ไหนเป็นวันที่ยืดออกไปเดือนถัดไป */
  const monthLastDay = useMemo(() => {
    const days = monthCells.filter((c) => c.inMonth);
    return days[days.length - 1]?.date ?? '';
  }, [monthCells]);

  /**
   * สรุปจำนวนกรุ๊ปของ "สิ่งที่เห็นอยู่ตอนนี้" — นับเฉพาะวันของเดือนที่เลือก
   * ตรงกับแถบที่วาดจริงในตาราง เพราะช่องวันต้น/ท้ายเดือนข้างเคียงถูกเว้นว่างไว้แล้ว
   */
  const visiblePeriods = useMemo(() => {
    const cells = view === 'week' ? weekCells : monthCells;
    return cells.filter((c) => c.inMonth).flatMap((c) => periodsByStart.get(c.date) ?? []);
  }, [view, monthCells, weekCells, periodsByStart]);

  const listPeriods = useMemo(
    () => [...visiblePeriods].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.groupCode.localeCompare(b.groupCode)),
    [visiblePeriods],
  );

  /** 1 แถว = 1 กรุ๊ป เรียงตามวันออกเดินทาง — ไม่มีการซ้อนชั้น จึงอ่านช่วงวันของแต่ละกรุ๊ปได้ชัด */
  const timelineRows = useMemo(
    () => [...visiblePeriods].sort((a, b) => a.startDate.localeCompare(b.startDate) || a.groupCode.localeCompare(b.groupCode)),
    [visiblePeriods],
  );

  /**
   * คอลัมน์ของมุมมองตาราง — วันของเดือนที่เลือก แล้ว "ยืดต่อ" ไปจนถึงวันเดินทางกลับที่ไกลที่สุด
   * กรุ๊ปที่กลับข้ามเดือนจึงเห็นแถบจนจบทริป ไม่ถูกตัดที่สิ้นเดือน
   */
  const timelineDays = useMemo(() => {
    const days = monthCells.filter((c) => c.inMonth).map((c) => c.date);
    if (days.length === 0) return days;
    const maxEnd = timelineRows.reduce((m, p) => (p.endDate > m ? p.endDate : m), monthLastDay);
    for (let d = addDays(monthLastDay, 1); d <= maxEnd; d = addDays(d, 1)) days.push(d);
    return days;
  }, [monthCells, timelineRows, monthLastDay]);
  const timelineCols = `repeat(${timelineDays.length}, minmax(0, 1fr))`;

  /** สรุปตามสีของแถบ — จัดหัวหน้าทัวร์แล้ว / ยังไม่จัด */
  const visibleAssignCounts = useMemo(() => {
    let assigned = 0;
    for (const p of visiblePeriods) if (leaderOf(p)) assigned += 1;
    return { assigned, unassigned: visiblePeriods.length - assigned };
  }, [visiblePeriods, leaderOf]);

  /**
   * สรุปฝั่งเจ้าหน้าที่ส่งกรุ๊ป — applicable = พีเรียดที่ต้องมีคนไปส่งจริง (ตัด NO_SELL/ไม่ผ่านตรวจออกแล้ว)
   * นับแยกจาก visiblePeriods.length เพราะบางกรุ๊ปไม่ต้องมีคนไปส่งเลย นับรวมจะทำให้ "ยังไม่จัด" ดูเยอะเกินจริง
   */
  const visibleSendOffCounts = useMemo(() => {
    let applicable = 0;
    let assigned = 0;
    for (const p of visiblePeriods) {
      const job = sendOffOf(p);
      if (!job) continue;
      applicable += 1;
      if (hasSendOff(job)) assigned += 1;
    }
    return { applicable, assigned, unassigned: applicable - assigned };
  }, [visiblePeriods, sendOffOf]);

  /**
   * ผลที่ตรงตัวกรองแต่ไม่อยู่ในช่วงที่กำลังแสดง
   *
   * มุมมองเดือน/สัปดาห์วาดเฉพาะกรุ๊ปที่ "ออกเดินทาง" ในช่วงนั้น ค้น Group Code หรือชื่อโปรแกรม
   * ของกรุ๊ปเดือนอื่นจึงได้ปฏิทินว่างเปล่า ทั้งที่หัวข้อด้านบนบอกว่าพบ — ดูเหมือนค้นไม่เจอ
   * จึงต้องบอกว่าพบที่ไหนและกระโดดไปได้ (ไม่ย้ายเองอัตโนมัติ เพราะพิมพ์ยังไม่จบก็เด้งไปมา)
   */
  const offRange = useMemo(() => {
    if (filtered.length === 0) return null;
    const visibleIds = new Set(visiblePeriods.map((p) => p.internalId));
    const outside = filtered
      .filter((p) => !visibleIds.has(p.internalId))
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
    if (outside.length === 0) return null;
    // ไม่มีคำค้นและปฏิทินก็มีของอยู่แล้ว = เดือนอื่นมีงานเป็นเรื่องปกติ ไม่ต้องเตือน
    if (!search.trim() && visiblePeriods.length > 0) return null;
    return { count: outside.length, target: outside[0] };
  }, [filtered, visiblePeriods, search]);

  /** พาไปยังช่วงที่พบผลลัพธ์แรก — เดือน/สัปดาห์ตามมุมมองที่เปิดอยู่ */
  const goToMatch = (startDate: string) => {
    setCursor({ year: Number(startDate.slice(0, 4)), month: Number(startDate.slice(5, 7)) - 1 });
    setWeekAnchor(startDate);
  };

  /** Group Code ซ้ำกันได้ (§1) — แสดงคู่กันเมื่อไม่เท่าจำนวนกรุ๊ป จะได้ไม่เข้าใจผิดว่านับซ้ำ */
  const visibleGroupCodes = useMemo(() => new Set(visiblePeriods.map((p) => p.groupCode)).size, [visiblePeriods]);

  const selected = selectedId ? allPeriods.find((p) => p.internalId === selectedId) ?? null : null;

  /** กรุ๊ปทั้งหมดของวันที่กำลังกางอยู่ — ผ่านตัวกรองชุดเดียวกับปฏิทิน จึงตรงกับที่เห็นในช่องวัน */
  const dayPeriodsOpen = dayOpen ? periodsByStart.get(dayOpen) ?? [] : [];
  const dayAssignedCount = dayPeriodsOpen.filter((p) => leaderOf(p)).length;
  const daySendOffApplicable = dayPeriodsOpen.filter((p) => sendOffOf(p)).length;
  const daySendOffAssignedCount = dayPeriodsOpen.filter((p) => hasSendOff(sendOffOf(p))).length;

  const goToday = () => { setCursor({ year: todayDate.getFullYear(), month: todayDate.getMonth() }); setWeekAnchor(startMonth); };

  /*
    สลับมุมมองแล้วต้องยังอยู่ที่ช่วงเวลาเดิม

    มุมมองเดือนใช้ cursor ส่วนมุมมองสัปดาห์ใช้ weekAnchor คนละตัวกัน
    ถ้าไม่ผูกกันตอนสลับ จะเลื่อนไปดูกันยายนในมุมมองเดือน แล้วกดสัปดาห์
    กลับเด้งไปสัปดาห์ของสิงหาคม (ค่าตั้งต้นที่ไม่เคยขยับ) — ดูเหมือนตัวกรองไม่ตรงเดือนที่เลือก
  */
  const monthStartISO = `${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}-01`;
  const changeView = (next: View) => {
    if (next === 'week' && weekAnchor.slice(0, 7) !== monthStartISO.slice(0, 7)) {
      setWeekAnchor(monthStartISO);
    } else if (next === 'month' && view === 'week' && weekAnchor.slice(0, 7) !== monthStartISO.slice(0, 7)) {
      // เลื่อนสัปดาห์ข้ามเดือนไปแล้วค่อยกลับมุมมองเดือน — ต้องได้เดือนที่กำลังดูอยู่ ไม่ใช่เดือนเดิมก่อนเลื่อน
      setCursor({ year: Number(weekAnchor.slice(0, 4)), month: Number(weekAnchor.slice(5, 7)) - 1 });
    }
    setView(next);
  };


  const renderChip = (p: TourPeriodMaster) => {
    const leader = leaderOf(p);
    const status = boardStatusFromAssignment(assignmentByPeriod.get(p.internalId)?.assignmentStatus);
    const assignedLabel = leader
      ? `${BOARD_STATUS[status].label}: ${leaderDisplayName(leader)}`
      : 'ยังไม่มีหัวหน้าทัวร์';
    const sendOffJob = sendOffOf(p);
    const sendOffStatus = sendOffJob ? sendOffJobStatus(sendOffJob) : 'UNASSIGNED';
    const sendOffLabel = !sendOffJob ? null : sendOffJob.staff ? `เจ้าหน้าที่ส่งกรุ๊ป ${BOARD_STATUS[sendOffStatus].label}: ${sendOffStaffName(sendOffJob.staff)}` : 'ยังไม่มีคนไปส่ง';
    // จัดครบ = หัวหน้าทัวร์คอนเฟิร์มแล้ว + เจ้าหน้าที่ส่งกรุ๊ปคอนเฟิร์มแล้ว (รอคอนเฟิร์มยังไม่นับ)
    const complete = !!leader && status === 'CONFIRMED' && hasSendOff(sendOffJob);
    return (
      <button
        key={p.internalId}
        type="button"
        onClick={(e) => { e.stopPropagation(); setSelectedId(p.internalId); }}
        title={[`${groupCodeLabel(p)} — ${p.displayName}`, complete ? 'จัดครบแล้ว (หัวหน้าทัวร์ + เจ้าหน้าที่ส่งกรุ๊ป)' : null, assignedLabel, sendOffLabel, `ขาย: ${SALE_STATUS_LABEL[p.saleStatus]}`].filter(Boolean).join(' · ')}
        className={cx(
          // 8.5px + ระยะขอบแคบ — ป้ายยาวขึ้นเพราะมี (บัส) ต่อท้าย ตัวใหญ่กว่านี้ถูกตัดตั้งแต่จอ 1280 · ผู้ใช้ขอให้เล็กลงจาก 9px
          'flex w-full items-center gap-0.5 rounded border px-1 py-0.5 text-left text-[8.5px] font-medium transition hover:brightness-95',
          complete ? COMPLETE_CHIP : NEUTRAL_CHIP,
        )}
      >
        {/* ไอคอนคนถือธง = สถานะจริงของหัวหน้าทัวร์ · ไอคอนเครื่องบิน = สถานะจริงของเจ้าหน้าที่ส่งกรุ๊ป — สีต้องตรงกับ Tag ในหน้าต่างรายละเอียด ไม่บังคับให้เท่ากัน */}
        <Icon
          name="guide"
          className={cx('h-2.5 w-2.5 shrink-0', STATUS_ICON_COLOR[status])}
        />
        {/* ไม่แสดงไอคอนเครื่องบินถ้ากรุ๊ปนี้ไม่ต้องมีคนไปส่ง (เช่น NO_SELL) */}
        {sendOffJob && (
          <Icon
            name="plane"
            className={cx('h-2.5 w-2.5 shrink-0', STATUS_ICON_COLOR[sendOffStatus])}
          />
        )}
        <span className="sr-only">{[assignedLabel, sendOffLabel].filter(Boolean).join(' · ')}</span>
        <span className="min-w-0 truncate font-mono font-semibold">{groupCodeLabel(p)}</span>
      </button>
    );
  };

  const dayCell = (cell: { date: string; inMonth: boolean; isToday: boolean }, tall: boolean) => {
    // แสดงเฉพาะกรุ๊ปของเดือนที่เลือก — ช่องวันต้น/ท้ายเดือนข้างเคียงเว้นว่างไว้
    const dayPeriods = cell.inMonth ? periodsByStart.get(cell.date) ?? [] : [];
    const limit = tall ? 6 : 3;
    const dayNumber = parseDate(cell.date).getDate();
    const openAllLabel = `ดูกรุ๊ปทั้งหมดของวันที่ ${formatDate(cell.date)} (${dayPeriods.length} กรุ๊ป)`;
    // ทำเครื่องหมายวันหยุดเฉพาะวันของเดือนที่เลือก — วันนอกเดือนมีจุดแต่ไม่มีบรรทัดสรุปจะยิ่งงง
    const holiday = cell.inMonth ? holidays.get(cell.date) : undefined;
    const dow = parseDate(cell.date).getDay();
    const weekend = cell.inMonth && (dow === 0 || dow === 6);
    // วันหยุดนักขัตฤกษ์และเสาร์-อาทิตย์ = พื้นแดงจาง (นักขัตฤกษ์มีจุดแดง + ตัวเลขหนาแยกให้เห็น) · วันนอกเดือน = พื้นเทา
    const dayNumClass = cell.isToday ? '' : holiday ? 'font-semibold text-rose-600' : weekend ? 'text-rose-500' : cell.inMonth ? 'zego-text-secondary' : 'zego-text-disabled';
    return (
      <div key={cell.date} className={cx('zego-border-color flex flex-col gap-1 border-b border-r p-1.5', tall ? 'min-h-32' : 'min-h-24', holiday || weekend ? 'bg-rose-100' : cell.inMonth ? 'zego-surface-bg' : 'zego-surface-soft-bg')}>
        {/* วันที่กดได้เมื่อวันนั้นมีกรุ๊ป — เปิดรายการกรุ๊ปทั้งหมดของวัน (รวมตัวที่ไม่ได้แสดงในช่อง) */}
        <div className="flex items-center gap-1">
          {dayPeriods.length > 0 ? (
            <button
              type="button"
              onClick={() => setDayOpen(cell.date)}
              title={holiday ? `${holiday.name} · ${openAllLabel}` : openAllLabel}
              aria-label={holiday ? `วันหยุด ${holiday.name} · ${openAllLabel}` : openAllLabel}
              className={cx(
                'zego-day-num-btn flex h-6 w-6 items-center justify-center rounded-full text-xs transition',
                cell.isToday ? 'zego-today-badge font-bold' : dayNumClass,
              )}
            >
              {dayNumber}
            </button>
          ) : (
            <span
              title={holiday ? `${formatDate(cell.date)} — ${holiday.name}` : undefined}
              className={cx('flex h-6 w-6 items-center justify-center rounded-full text-xs', cell.isToday ? 'zego-today-badge font-bold' : dayNumClass)}
            >
              {dayNumber}
            </span>
          )}
          {/* จุดแดงหลังวันที่ = วันหยุด · ชื่อไปอยู่ในสรุปใต้ตาราง จะได้ไม่กินพื้นที่แถบกรุ๊ปในช่อง */}
          {holiday && (
            <span
              title={`${formatDate(cell.date)} — ${holiday.name}`}
              className="h-2 w-2 shrink-0 rounded-full bg-rose-500 ring-2 ring-rose-200"
            >
              <span className="sr-only">วันหยุด: {holiday.name}</span>
            </span>
          )}
        </div>
        <div className="flex flex-col gap-0.5">
          {dayPeriods.slice(0, limit).map((p) => renderChip(p))}
          {dayPeriods.length > limit && (
            <button
              type="button"
              onClick={() => setDayOpen(cell.date)}
              title={openAllLabel}
              className="zego-text-info rounded px-1 text-left text-[9px] font-medium underline-offset-2 hover:underline"
            >
              +{dayPeriods.length - limit} พีเรียด · ดูทั้งหมด
            </button>
          )}
        </div>
      </div>
    );
  };

  /**
   * สรุปวันหยุดใต้ตาราง — ในช่องวันเหลือแค่จุดแดง ชื่อวันหยุดมาอ่านที่นี่แทน
   * ข้อมูลมาจากเมนู "วันหยุด" ผ่าน holidayService ชุดเดียวกับจุดแดงในตาราง
   *
   * นับเฉพาะวันของเดือนที่เลือก (inMonth) — วันต้น/ท้ายเดือนข้างเคียงที่โผล่ในตารางไม่เอามาสรุป
   * กำกับชื่อเดือนต่อเมื่อช่วงที่แสดงคาบ 2 เดือน (มุมมองสัปดาห์) ไม่งั้นเลขวันที่กำกวม
   */
  const holidaySummary = (cells: { date: string; inMonth: boolean }[]) => {
    const rows = cells
      .filter((c) => c.inMonth)
      .map((c) => ({ date: c.date, holiday: holidays.get(c.date) }))
      .filter((r): r is { date: string; holiday: NonNullable<typeof r.holiday> } => !!r.holiday);
    if (rows.length === 0) return null;
    const spansTwoMonths = new Set(cells.filter((c) => c.inMonth).map((c) => c.date.slice(0, 7))).size > 1;
    return (
      <div className="zego-divider-top zego-surface-soft-bg px-4 py-2.5">
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium zego-text-tertiary">
          <span aria-hidden="true" className="h-2 w-2 rounded-full bg-rose-500 ring-2 ring-rose-200" />
          วันหยุด {rows.length} วัน
        </p>
        <ul className="space-y-0.5">
          {rows.map(({ date, holiday }) => {
            const d = parseDate(date);
            const label = spansTwoMonths ? `${d.getDate()} ${TH_MONTHS_SHORT[d.getMonth()]}` : `${d.getDate()}`;
            return (
              <li key={date} className="zego-text-secondary text-xs">
                <span className="font-semibold text-rose-600">{label}</span>
                <span className="mx-1 zego-text-tertiary">=</span>
                {holiday.name}
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  return (
    <>
      <PageHeader title="ปฏิทินงาน" description={`อ่านจาก Tour Period Master · แสดง ${filtered.length} พีเรียด · สีของแถบแทนสถานะจัดหัวหน้าทัวร์ (ไอคอนคน) · ไอคอนเครื่องบินแทนสถานะเจ้าหน้าที่ส่งกรุ๊ป`} />

      {/* ตัวกรอง (ชุดเดียวกับตารางโปรแกรม §5) */}
      <Card className="mb-5">
        <div className="grid items-end gap-3 lg:grid-cols-4">
          <div className="lg:col-span-1"><SearchBox value={search} onChange={setSearch} placeholder="ค้นหา Group Code / โปรแกรม" label="ค้นหาพีเรียด" /></div>
          <MultiSelect label="ประเทศ" value={country} onChange={setCountry} allLabel="ทุกประเทศ" options={countries.map((c) => ({ value: c, label: c }))} />
          <MultiSelect label="สถานะขาย" value={sale} onChange={(v) => setSale(v as SaleStatus[])} allLabel="ทั้งหมด" options={(['SELL', 'NO_SELL', 'CLOSED'] as SaleStatus[]).map((s) => ({ value: s, label: SALE_STATUS_LABEL[s] }))} />
          <SelectInput label="ประเภทกรุ๊ป" value={period} onChange={(e) => setPeriod(e.target.value as typeof period)} options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'INC', label: 'INC' }, { value: 'COL', label: 'COL' }]} />
        </div>

        {/*
          แถวที่สอง — กรองจากข้อมูลการจัด (คนละแหล่งกับ 4 ช่องบน จึงแยกแถวให้เห็นชัด)
          4 ช่องเท่ากัน: สถานะ/ตัวคน ของหัวหน้าทัวร์ และเจ้าหน้าที่ส่งกรุ๊ป — กรองอิสระจากกันได้ทั้งคู่
          items-start: ทุกช่องมี Label ครบ จึงชิดบนแล้วตรงแนวกันเอง — ถ้าใช้ items-end
          ข้อความ hint ใต้ช่องเลือกคนจะดันช่องนั้นสูงขึ้นจนเหลื่อมกับช่องข้าง ๆ
        */}
        <div className="zego-divider-top mt-3 grid items-start gap-3 pt-3 lg:grid-cols-4">
          <SelectInput
            label="สถานะหัวหน้าทัวร์"
            value={assignState}
            onChange={(e) => setAssignState(e.target.value as typeof assignState)}
            options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'assigned', label: 'จัดแล้ว' }, { value: 'unassigned', label: 'ยังไม่จัด' }]}
          />
          <MultiSelect
            label="หัวหน้าทัวร์ที่ถูกจัด"
            value={leaderPick}
            onChange={setLeaderPick}
            allLabel="ทุกคน"
            options={leaderOptions}
            disabled={assignState === 'unassigned' || leaderOptions.length === 0}
            hint={
              assignState === 'unassigned'
                ? 'กำลังดูเฉพาะกรุ๊ปที่ยังไม่จัด'
                : leaderOptions.length === 0
                  ? 'ยังไม่มีคนถูกจัดในช่วงนี้'
                  : `${leaderOptions.length} คนในช่วงนี้ · วงเล็บ = จำนวนกรุ๊ป`
            }
          />
          <SelectInput
            label="สถานะเจ้าหน้าที่ส่งกรุ๊ป"
            value={sendOffState}
            onChange={(e) => setSendOffState(e.target.value as typeof sendOffState)}
            options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'assigned', label: 'จัดแล้ว' }, { value: 'unassigned', label: 'ยังไม่จัด' }]}
          />
          <MultiSelect
            label="เจ้าหน้าที่ส่งกรุ๊ปที่ถูกจัด"
            value={staffPick}
            onChange={setStaffPick}
            allLabel="ทุกคน"
            options={staffOptions}
            disabled={sendOffState === 'unassigned' || staffOptions.length === 0}
            hint={
              sendOffState === 'unassigned'
                ? 'กำลังดูเฉพาะกรุ๊ปที่ยังไม่จัด'
                : staffOptions.length === 0
                  ? 'ยังไม่มีคนถูกจัดในช่วงนี้'
                  : `${staffOptions.length} คนในช่วงนี้ · วงเล็บ = จำนวนกรุ๊ป`
            }
          />
        </div>
      </Card>

      {/* แถบควบคุมมุมมอง */}
      <Card padded={false} className="overflow-x-clip">
        {offRange && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2.5">
            <p className="min-w-0 text-sm text-amber-900">
              {visiblePeriods.length === 0
                ? `พบ ${offRange.count.toLocaleString('th-TH')} กรุ๊ปที่ตรงกับที่ค้นหา แต่ไม่มีกรุ๊ปใดออกเดินทางในช่วงที่แสดงอยู่`
                : `อีก ${offRange.count.toLocaleString('th-TH')} กรุ๊ปที่ตรงกับที่ค้นหาอยู่นอกช่วงที่แสดง`}
              {' '}
              <span className="text-amber-800">
                · รายการแรกอยู่ {monthTitle(Number(offRange.target.startDate.slice(0, 4)), Number(offRange.target.startDate.slice(5, 7)) - 1)}
              </span>
            </p>
            <span className="flex shrink-0 flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => goToMatch(offRange.target.startDate)}>
                ไปยังกรุ๊ปแรกที่พบ
              </Button>
            </span>
          </div>
        )}
        {/*
          แถบเดือน/จำนวน/ปุ่มมุมมอง + แถวเลขวันที่ ติดค้างไว้เป็นก้อนเดียวกันตอนเลื่อน

          รวมไว้ในกล่อง sticky อันเดียว จึงไม่ต้องวัดความสูงของแถบบนด้วย JS
          (วัดแล้วค่าค้างได้เมื่อแถบตกบรรทัด ทำให้แถวเลขวันที่ไปซ่อนใต้แถบหรือมีช่องว่างคั่น)
          z-30 — สูงกว่าแถบงานในตาราง และต่ำกว่าแถบด้านบนของแอป (z-40)
        */}
        <div className="sticky z-30 zego-surface-bg" style={{ top: APP_HEADER_H }}>
        <div className="zego-divider-bottom flex flex-wrap items-center justify-between gap-3 zego-surface-bg px-4 py-3">
          <div className="flex items-center gap-2">
            <button type="button" aria-label="ก่อนหน้า" onClick={() => (view === 'week' ? setWeekAnchor((a) => shiftWeek(a, -1)) : setCursor((c) => shiftMonth(c.year, c.month, -1)))} className="zego-text-secondary rounded-lg p-1.5 zego-hover-surface"><Icon name="chevronLeft" className="h-4 w-4" /></button>
            <button type="button" aria-label="ถัดไป" onClick={() => (view === 'week' ? setWeekAnchor((a) => shiftWeek(a, 1)) : setCursor((c) => shiftMonth(c.year, c.month, 1)))} className="zego-text-secondary rounded-lg p-1.5 zego-hover-surface"><Icon name="chevronRight" className="h-4 w-4" /></button>
            <h2 className="ml-1 text-base font-semibold zego-text">
              {view === 'week' ? `สัปดาห์ ${formatDate(weekCells[0].date)} – ${formatDate(weekCells[6].date)}` : monthTitle(cursor.year, cursor.month)}
            </h2>
            <Button variant="ghost" size="sm" onClick={goToday}>เดือนเริ่มต้น</Button>
          </div>

          {/* สรุปจำนวนกรุ๊ปของช่วงที่กำลังแสดง — อัปเดตตามตัวกรองและมุมมอง เขียนย่อเป็น "จัดแล้ว/ทั้งหมด" ให้อยู่บรรทัดเดียวเสมอ */}
          <div
            aria-live="polite"
            className="zego-border-color zego-surface-soft-bg flex min-w-0 flex-1 items-center justify-center gap-x-3 overflow-x-auto whitespace-nowrap rounded-lg border px-3 py-1.5"
          >
            <span className="zego-text shrink-0 text-sm font-semibold">
              {visiblePeriods.length.toLocaleString('th-TH')} กรุ๊ป
              <span className="ml-1 font-normal zego-text-tertiary">
                {view === 'week' ? 'ในสัปดาห์นี้' : 'ในเดือนนี้'}
              </span>
            </span>
            {visiblePeriods.length > 0 && (
              <>
                <span aria-hidden="true" className="shrink-0 zego-text-disabled">·</span>
                <span className="flex shrink-0 items-center gap-1 text-xs zego-text-secondary">
                  <Icon name="guide" className="h-3 w-3 zego-text-success" />
                  หัวหน้าทัวร์ {visibleAssignCounts.assigned.toLocaleString('th-TH')}/{visiblePeriods.length.toLocaleString('th-TH')}
                </span>
                {/* เจ้าหน้าที่ส่งกรุ๊ป — คนละสถานะกับหัวหน้าทัวร์ด้านบน แยกไอคอนเครื่องบินให้ไม่สับสนกัน */}
                {visibleSendOffCounts.applicable > 0 && (
                  <span className="flex shrink-0 items-center gap-1 text-xs zego-text-secondary">
                    <Icon name="plane" className="h-3 w-3 zego-text-success" />
                    คนไปส่ง {visibleSendOffCounts.assigned.toLocaleString('th-TH')}/{visibleSendOffCounts.applicable.toLocaleString('th-TH')}
                  </span>
                )}
                {visibleGroupCodes !== visiblePeriods.length && (
                  <span className="shrink-0 text-xs zego-text-tertiary">({visibleGroupCodes.toLocaleString('th-TH')} Group Code)</span>
                )}
              </>
            )}
          </div>

          <SegmentedControl label="เลือกมุมมองปฏิทิน" value={view} onChange={changeView} options={[{ value: 'month', label: 'เดือน' }, { value: 'week', label: 'สัปดาห์' }, { value: 'timeline', label: 'ตาราง' }]} />
        </div>

        {/*
          หัวคอลัมน์วันของมุมมองเดือน/สัปดาห์ — อยู่ในกล่อง sticky เดียวกับแถบด้านบน (เหมือนมุมมองตาราง)
          เดิมอยู่นอกกล่อง พอเลื่อนลงหัวคอลัมน์หายและแถวแรกของปฏิทินมุดไปใต้แถบ
          จอแคบตัวปฏิทินเลื่อนแนวนอนได้ → หัวคอลัมน์เลื่อนตาม (syncHeadScroll) ไม่งั้นคอลัมน์ไม่ตรงกัน
        */}
        {(view === 'month' || view === 'week') && (
          <div ref={gridHeadRef} className="overflow-x-hidden">
            <div className="min-w-[42rem]">
              {view === 'month' ? (
                <div className="zego-border-color zego-surface-soft-bg grid grid-cols-7 border-b">
                  {TH_WEEKDAYS_SHORT.map((d, i) => <div key={d} className={cx('zego-border-color border-r px-2 py-2 text-center text-xs font-semibold last:border-r-0', i === 0 || i === 6 ? 'bg-rose-100 text-rose-600' : 'zego-text-tertiary')}>{d}</div>)}
                </div>
              ) : (
                <div className="zego-border-color zego-surface-soft-bg grid grid-cols-7 border-b">
                  {weekCells.map((cell) => (
                    <div key={cell.date} className={cx('zego-border-color border-r px-2 py-2 text-center last:border-r-0', [0, 6].includes(parseDate(cell.date).getDay()) && 'bg-rose-100')}>
                      <p className={cx('text-xs font-semibold', [0, 6].includes(parseDate(cell.date).getDay()) ? 'text-rose-500' : 'zego-text-tertiary')}>{TH_WEEKDAYS_SHORT[parseDate(cell.date).getDay()]}</p>
                      <p className={cx('text-sm', cell.isToday ? 'font-bold zego-text-info' : 'zego-text-secondary')}>{formatDate(cell.date)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* แถวเลขวันที่ของมุมมองตาราง — อยู่ในกล่อง sticky เดียวกับแถบด้านบน จึงเลื่อนตามกันเสมอ */}
        {/* หัวตาราง: 1 คอลัมน์ต่อวัน — ไม่มีคอลัมน์ซ้าย เพราะรหัสกรุ๊ปอยู่บนแถบแล้ว */}
        {view === 'timeline' && listPeriods.length > 0 && timelineDays.length > 0 && (
          <div className="zego-border-color zego-surface-soft-bg grid border-b" style={{ gridTemplateColumns: timelineCols }}>
            {timelineDays.map((iso) => {
              const d = parseDate(iso);
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              const holiday = holidays.get(iso);
              const spill = iso > monthLastDay; // วันที่ยืดออกไปเดือนถัดไป
              return (
                <div
                  key={iso}
                  title={holiday ? `${formatDate(iso)} — ${holiday.name}` : spill ? formatDate(iso) : undefined}
                  className={cx('zego-border-color flex min-w-0 flex-col items-center justify-center border-r py-1 last:border-r-0', holiday || weekend ? 'bg-rose-100' : spill && 'bg-indigo-50/60')}
                >
                  <span className={cx('text-xs font-semibold leading-none', iso === today ? 'zego-today-badge inline-flex h-5 min-w-5 items-center justify-center rounded-full' : holiday ? 'text-rose-600' : weekend ? 'text-rose-500' : spill ? 'zego-text-tertiary' : 'zego-text-secondary')}>{d.getDate()}</span>
                  {/* วันของเดือนถัดไปกำกับชื่อเดือนแทนชื่อวัน ไม่งั้นเลข 1 ต่อจาก 31 อ่านแล้วสับสน */}
                  <span className={cx('max-w-full truncate text-[10px] leading-tight', holiday ? 'font-semibold text-rose-500' : spill ? 'font-medium zego-text-tertiary' : weekend ? 'text-rose-400' : 'zego-text-disabled')}>
                    {spill ? TH_MONTHS_SHORT[d.getMonth()] : TH_WEEKDAYS_SHORT[d.getDay()]}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        </div>

        {view === 'month' && (
          <div className="overflow-x-auto" onScroll={syncHeadScroll}>
            <div className="min-w-[42rem]">
              <div className="zego-border-color grid grid-cols-7 border-l">{monthCells.map((cell) => dayCell(cell, false))}</div>
            </div>
            {holidaySummary(monthCells)}
          </div>
        )}

        {view === 'week' && (
          <div className="overflow-x-auto" onScroll={syncHeadScroll}>
            <div className="min-w-[42rem]">
              <div className="zego-border-color grid grid-cols-7 border-l">{weekCells.map((cell) => dayCell(cell, true))}</div>
            </div>
            {holidaySummary(weekCells)}
          </div>
        )}

        {/*
          มุมมองตาราง — 1 แถว = 1 กรุ๊ป · แถบลากจากวันออกเดินทางถึงวันเดินทางกลับ
          แถวละกรุ๊ปจึงไม่มีแถบซ้อนกัน อ่านช่วงวันได้ตรง ๆ ต่างจากตารางเดือนที่ช่องวันเดียวมีได้ถึง 29 กรุ๊ป
        */}
        {view === 'timeline' && (
          listPeriods.length === 0 || timelineDays.length === 0 ? (
            <div className="p-4">
              <EmptyState icon="calendar" title="ไม่พบพีเรียดตามเงื่อนไขที่เลือก" description="ลองปรับตัวกรองด้านบน" />
            </div>
          ) : (
            /*
              เลื่อนด้วยหน้าเว็บอย่างเดียว — ไม่มีกล่องเลื่อนซ้อนข้างใน

              เดิมกล่องนี้เลื่อนแนวตั้งเองพร้อมกับที่หน้าเว็บก็เลื่อนได้ กลายเป็นแถบเลื่อนสองชั้น
              ผู้ใช้ต้องเดาว่ากำลังเลื่อนอันไหนอยู่ · หัววันที่ยังคงอยู่โดย sticky เกาะใต้แถบด้านบนของแอปแทน
              ไม่กำหนดความกว้างขั้นต่ำ — คอลัมน์ยืดหดพอดีพื้นที่เสมอ จึงไม่มีแถบเลื่อนแนวนอน
            */
            <div className="w-full max-w-full overflow-x-clip">
              <div>
                {timelineRows.map((p) => {
                  const leader = leaderOf(p);
                  const startIdx = Math.max(0, timelineDays.indexOf(p.startDate));
                  const lastIdx = timelineDays.indexOf(p.endDate);
                  const endIdx = lastIdx === -1 ? timelineDays.length - 1 : lastIdx; // จบหลังสิ้นเดือน → ตัดที่วันสุดท้าย
                  const openRight = p.endDate > timelineDays[timelineDays.length - 1];
                  const assignedLabel = leader ? `จัดหัวหน้าทัวร์แล้ว: ${leaderDisplayName(leader)}` : 'ยังไม่มีหัวหน้าทัวร์';
                  const leaderStatus = boardStatusFromAssignment(assignmentByPeriod.get(p.internalId)?.assignmentStatus);
                  const sendOffJob = sendOffOf(p);
                  const sendOffLabel = !sendOffJob ? null : sendOffJob.staff ? `จัดคนไปส่งแล้ว: ${sendOffStaffName(sendOffJob.staff)}` : 'ยังไม่มีคนไปส่ง';
                  const sendOffStatus = sendOffJob ? sendOffJobStatus(sendOffJob) : 'UNASSIGNED';
                  return (
                    <div key={p.internalId} className="zego-border-color grid border-b last:border-b-0" style={{ gridTemplateColumns: timelineCols }}>
                      {/* พื้นหลังรายวัน — วางในแถวเดียวกับแถบ แถบจึงทับอยู่ด้านบน */}
                      {timelineDays.map((iso, i) => {
                        const d = parseDate(iso);
                        const weekend = d.getDay() === 0 || d.getDay() === 6;
                        const holiday = holidays.get(iso);
                        const spill = iso > monthLastDay;
                        return (
                          <div
                            key={iso}
                            style={{ gridColumn: `${i + 1} / ${i + 2}`, gridRow: '1' }}
                            className={cx('zego-border-color min-h-[44px] border-r last:border-r-0', holiday || weekend ? 'bg-rose-100/70' : spill && 'bg-indigo-50/40', iso === today && 'zego-today-tint')}
                          />
                        );
                      })}

                      {/* แถบ 2 บรรทัด: รหัสกรุ๊ปอยู่บน ชื่อหัวหน้าทัวร์อยู่ล่าง · ทริปสั้นย่อฟอนต์ให้ข้อความครบ */}
                      <button
                        type="button"
                        onClick={() => setSelectedId(p.internalId)}
                        title={[`${groupCodeLabel(p)} — ${p.displayName}`, `เดินทาง ${formatDateRange(p.startDate, p.endDate)}`, assignedLabel, sendOffLabel, `ขาย: ${SALE_STATUS_LABEL[p.saleStatus]}`].filter(Boolean).join(' · ')}
                        style={{ gridColumn: `${startIdx + 1} / ${endIdx + 2}`, gridRow: '1' }}
                        className={cx(
                          '@container z-10 m-0.5 flex min-w-0 flex-col justify-center overflow-hidden rounded border px-1 py-0.5 text-left transition hover:brightness-95',
                          NEUTRAL_CHIP,
                          openRight && 'mr-0 rounded-r-none',
                        )}
                      >
                        <span className="flex w-full min-w-0 items-center gap-0.5">
                          {/* รหัสกรุ๊ปห้ามถูกตัด — แถบแคบให้ขึ้นบรรทัดใหม่ (ตัดตรงขีดกลาง) แทนการย่อฟอนต์จนอ่านไม่ออก */}
                          <span className={cx('line-clamp-2 min-w-0 break-words font-mono font-bold leading-tight', BAR_FONT.code)}>{groupCodeLabel(p)}</span>
                          {openRight && <span aria-hidden="true" className="ml-auto shrink-0 opacity-60">▸</span>}
                        </span>
                        <span className="flex w-full min-w-0 items-center gap-0.5">
                          <Icon name="guide" className={cx('shrink-0', BAR_FONT.icon, STATUS_ICON_COLOR[leaderStatus])} />
                          <span className={cx('min-w-0 truncate leading-tight opacity-80', BAR_FONT.sub)}>
                            {leader ? leaderDisplayName(leader) : 'ยังไม่จัดหัวหน้าทัวร์'}
                          </span>
                          {/* ไอคอนเครื่องบิน = สถานะจริงของเจ้าหน้าที่ส่งกรุ๊ป (คนละสีกับหัวหน้าทัวร์ได้) — ย่อเหลือแค่ไอคอนเพราะพื้นที่แถบจำกัด รายละเอียดดูที่ tooltip/Drawer */}
                          {sendOffJob && (
                            <Icon
                              name="plane"
                              className={cx('ml-auto shrink-0', BAR_FONT.icon, STATUS_ICON_COLOR[sendOffStatus])}
                            />
                          )}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </Card>

      {/* รายการกรุ๊ปทั้งหมดของวันที่กด — เห็นครบทุกกรุ๊ป ไม่ถูกตัดด้วย "+N พีเรียด" ในช่องปฏิทิน */}
      <Drawer
        open={!!dayOpen}
        onClose={() => setDayOpen(null)}
        title={dayOpen ? `กรุ๊ปวันที่ ${formatDate(dayOpen)}` : ''}
        description={dayOpen
          ? `${dayPeriodsOpen.length} กรุ๊ป · หัวหน้าทัวร์แล้ว ${dayAssignedCount}/${dayPeriodsOpen.length}`
            + (daySendOffApplicable > 0 ? ` · คนไปส่งแล้ว ${daySendOffAssignedCount}/${daySendOffApplicable}` : '')
            + ' — เลือกกรุ๊ปเพื่อดูรายละเอียด'
          : undefined}
      >
        <ul className="space-y-2">
          {dayPeriodsOpen.map((p) => {
            const leader = leaderOf(p);
            const leaderStatus = boardStatusFromAssignment(assignmentByPeriod.get(p.internalId)?.assignmentStatus);
            const sendOffJob = sendOffOf(p);
            const sendOffStatus = sendOffJob ? sendOffJobStatus(sendOffJob) : 'UNASSIGNED';
            // จัดครบ (หัวหน้าทัวร์ + เจ้าหน้าที่ส่งกรุ๊ป คอนเฟิร์มแล้วทั้งคู่) → เขียวทั้งแถว ตรงกับชิปบนปฏิทิน
            const complete = !!leader && leaderStatus === 'CONFIRMED' && hasSendOff(sendOffJob);
            return (
              <li key={p.internalId}>
                <button
                  type="button"
                  onClick={() => { setSelectedId(p.internalId); setDayOpen(null); }}
                  className={cx(
                    'flex w-full flex-wrap items-center gap-3 rounded-lg border px-4 py-3 text-left transition',
                    complete ? `${COMPLETE_CHIP} hover:brightness-95` : 'zego-border-color zego-hover-surface',
                  )}
                >
                  <Icon name="guide" className="h-4 w-4 shrink-0 opacity-70" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium"><span className="font-mono font-bold">{groupCodeLabel(p)}</span> · {p.displayName}</p>
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 truncate text-xs zego-text-tertiary">
                      <span>{p.countryName} · {formatDateRange(p.startDate, p.endDate)}</span>
                      <span className="flex items-center gap-1">
                        <Icon name="guide" className={cx('h-3 w-3 shrink-0', STATUS_ICON_COLOR[leaderStatus])} />
                        {leader
                          ? `${leaderDisplayName(leader)} (${BOARD_STATUS[leaderStatus].label})`
                          : 'ยังไม่มีหัวหน้าทัวร์'}
                      </span>
                      {sendOffJob && (
                        <span className="flex items-center gap-1">
                          <Icon name="plane" className={cx('h-3 w-3 shrink-0', STATUS_ICON_COLOR[sendOffStatus])} />
                          {sendOffJob.staff
                            ? `${sendOffStaffName(sendOffJob.staff)} (${BOARD_STATUS[sendOffStatus].label})`
                            : 'ยังไม่มีคนไปส่ง'}
                        </span>
                      )}
                    </p>
                  </div>
                  <span className={cx('shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-medium', SALE_CHIP[p.saleStatus])}>{SALE_STATUS_LABEL[p.saleStatus]}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Drawer>

      {/* Drawer รายละเอียด — ดึงจาก Master ด้วย periodId (§5/§13) */}
      <PeriodDrawer
        period={selected}
        assignment={selected ? assignmentByPeriod.get(selected.internalId) ?? null : null}
        sendOffJob={selected ? sendOffOf(selected) ?? null : null}
        leaders={leaders}
        onClose={() => setSelectedId(null)}
      />
    </>
  );
}

function PeriodDrawer({ period, assignment, sendOffJob, leaders, onClose }: {
  period: TourPeriodMaster | null;
  assignment: ReturnType<typeof loadActiveGuideAssignments>[number] | null;
  /** งานเจ้าหน้าที่ส่งกรุ๊ปของพีเรียดนี้ — null = ไม่ต้องมีคนไปส่ง (ไม่ใช่ "ขาด") */
  sendOffJob: SendOffJob | null;
  leaders: ReturnType<typeof useDemo>['leaders'];
  onClose: () => void;
}) {
  const disp = period ? periodScheduleDisplay(period) : null;
  const board = boardStatusFromAssignment(assignment?.assignmentStatus);
  const leader = assignment ? leaders.find((l) => l.id === assignment.tourLeaderId) ?? null : null;
  const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('th-TH'));

  return (
    <>
    <Drawer open={!!period} onClose={onClose} title={period ? period.groupCode : ''} description={period?.displayName}
      footer={period && (
        <>
          <Button variant="secondary" onClick={onClose}>ปิด</Button>
        </>
      )}>
      {period && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge meta={BOARD_STATUS[board]} />
            <span className="zego-surface-soft-bg zego-text-secondary rounded px-2 py-0.5 text-xs">ขาย: {SALE_STATUS_LABEL[period.saleStatus]}</span>
            <span className="rounded bg-violet-50 px-2 py-0.5 text-xs text-violet-700 ring-1 ring-violet-200">{period.periodStatus}</span>
            <span className="zego-surface-soft-bg zego-text-tertiary rounded px-2 py-0.5 text-xs">periodId: {period.internalId}</span>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Row label="Group Code" value={period.groupCode} mono />
            <Row label="Program Code" value={period.programCode ?? '—'} mono />
            <Row label="ชื่อรายการทัวร์" value={period.displayName} full />
            <Row label="ประเทศ" value={period.countryName} />
            <Row label="บัส" value={disp!.bus} />
            <Row label="สนามบินขาออก (Sector 1)" value={disp!.depAirport} mono />
            <Row label="สายการบิน (Sector 1)" value={disp!.airlineCode} mono />
            <Row label="วันเดินทาง" value={formatDateRange(period.startDate, period.endDate)} full />
            <Row label="ราคา" value={`${num(period.price)} ${period.currency}`} />
            <Row label="ราคาวีซ่า" value={num(period.visaPrice)} />
            <Row label="ที่นั่ง (ทั้งหมด/จอง/เหลือ)" value={`${num(period.seatTotal)} / ${num(period.seatBooked)} / ${num(period.seatRemaining)}`} full />
            {/* ข้อความเต็มถ้ามี · ไม่มีก็แสดงแค่ประเภทกรุ๊ป — ข้อความอื่นของ CSV ไปที่ "หมายเหตุจากระบบ" */}
            <Row label="INC / COL" value={period.periodStatusDetail ?? period.periodStatus} full />
            <Row label="หมายเหตุจากระบบ" value={period.systemNote ?? '—'} full />
            <Row
              label="หัวหน้าทัวร์"
              value={leader ? (
                <span className="flex flex-wrap items-center gap-2">
                  {leaderDisplayName(leader)}
                  <StatusBadge meta={BOARD_STATUS[board]} size="sm" />
                </span>
              ) : 'ยังไม่มีหัวหน้าทัวร์'}
            />
            {sendOffJob && (
              <Row
                label="เจ้าหน้าที่ส่งกรุ๊ป"
                value={sendOffJob.staff ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {sendOffStaffName(sendOffJob.staff)}
                    <StatusBadge meta={BOARD_STATUS[sendOffJobStatus(sendOffJob)]} size="sm" />
                  </span>
                ) : 'ยังไม่มีคนไปส่ง'}
              />
            )}
            <Row label="แหล่งข้อมูล" value={period.sourceSystem} />
          </dl>
        </div>
      )}
    </Drawer>
    </>
  );
}

function Row({ label, value, mono, full }: { label: string; value: ReactNode; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? 'col-span-2' : undefined}>
      <dt className="text-xs zego-text-disabled">{label}</dt>
      <dd className={cx('zego-text font-medium', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}
