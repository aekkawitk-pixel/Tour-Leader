'use client';

/**
 * ตารางจัดเจ้าหน้าที่ส่งกรุ๊ป — โหมดที่ 2 ของเมนู "การจัดสเก็ต"
 *
 * แต่ละช่องวันแสดงแค่ "สัญลักษณ์ปริมาณงาน" (เลขกลมสี + ⚠️) — ไม่วาดชื่อกรุ๊ป/แท่งงานในตารางแล้ว
 * เพราะเจ้าหน้าที่ส่งกรุ๊ป 1 คนรับผิดชอบได้หลายสิบกรุ๊ป/เดือน ถ้าวาดรายละเอียดทุกกรุ๊ปในตาราง
 * (ไม่ว่าจะเป็นแท่งยาวคร่อมวันหรือป้ายเรียงในช่องวัน) จะรกจนกวาดตาไม่ออกกับข้อมูลจริง
 * (ทดสอบกับเคส 42 กรุ๊ป/เดือน/คน) ตารางนี้จึงมีหน้าที่แค่ "บอกว่าวันไหนงานหนัก/มีปัญหาบ้าง"
 * ส่วนรายละเอียดกรุ๊ป (รหัสกรุ๊ป/เวลา/ประเทศ/สนามบิน) กดที่ช่องวันเพื่อเปิดรายการทั้งวันแทน
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { addDays, daysBetween, endOfMonth, formatDate, parseDate, startOfMonth, TH_WEEKDAYS_SHORT } from '@/lib/format';
import { Button, Card, cx, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Modal, ConfirmDialog } from '@/components/ui/Modal';
import { SearchBox, TextInput } from '@/components/ui/FormField';
import { MonthPicker, nextMonthStart, nextMonthStartFromNow } from '@/components/ui/MonthPicker';
import { formatThaiMonthYear } from '@/lib/format';
import { airportLabel } from '@/lib/logic/airportLabel';
import { useWideContent } from '@/components/layout/AppShell';
import { canEditSendOffSchedule } from '@/lib/permissions';
import { getAssignablePeriods, getTourPeriods } from '@/services/tourPeriodMaster';
import { getHolidayMap } from '@/services/holidayService';
import { dayOffLookup } from '@/lib/logic/dayOff';
import { loadSendOffStaff } from '@/services/sendOffStaffStore';
import { assignSendOff, confirmSendOff, loadSendOffAssignments, unassignSendOff, unconfirmSendOff, type SendOffAssignment } from '@/services/sendOffAssignmentStore';
import { loadManualFlightTimes, setManualFlightTime, type ManualFlightTimes } from '@/services/sendOffFlightTimeStore';
import { loadManualAirports, setManualAirport, type ManualAirports } from '@/services/sendOffManualAirportStore';
import { loadMonthlyCaps, monthlyCapFor, setMonthlyCap, type MonthlyCaps } from '@/services/sendOffMonthlyCapStore';
import { loadSendOffLeave } from '@/services/sendOffStaffLeaveStore';
import { leaveCoversDate, type SendOffLeaveRecord } from '@/lib/logic/sendOffStaffLeave';
import {
  canSendOffByStatus, checkSendOff, sendOffStaffName,
  SEND_OFF_STAFF_STATUS, SEND_OFF_STAFF_TYPE, SEND_OFF_STAFF_TYPE_ORDER,
  type SendOffStaff, type SendOffStaffType,
} from '@/lib/logic/sendOffStaff';
import { buildSendOffJobs, chipTime, jobArrival, jobIssue, jobOverlapWarning, jobStatus, rulesSummary, sendOffPeriodPool, type SendOffJob } from '@/lib/logic/sendOffJobs';
import { DEFAULT_SEND_OFF_RULES, type SendOffRules } from '@/lib/logic/sendOffRules';
import { planAutoAssignSendOff, summarizeAutoAssign, type AutoAssignJobInput, type AutoAssignResult, type AutoAssignStaffInput } from '@/lib/logic/sendOffAutoAssign';
import { loadSendOffRules } from '@/services/sendOffRulesStore';
import { CHECK_TONE } from '@/components/jobs/SendOffStaffPicker';
import { AddSendOffPanel } from '@/components/jobs/AddSendOffPanel';
import { SendOffAgenda } from '@/components/jobs/SendOffAgenda';
import { SegmentedControl } from '@/components/ui/Tabs';
import { Icon } from '@/components/ui/Icon';
import { InfoPopover } from '@/components/ui/InfoPopover';
import { BOARD_STATUS } from '@/lib/logic/guideBoard';

/* ------------------------------ layout ------------------------------
 * `${NAME_W}px repeat(วันในเดือน, minmax(${DAY_MIN_W}px, 1fr))` — แต่ละวันกว้างอย่างน้อย DAY_MIN_W
 * เพื่อให้พอดีกับป้ายกรุ๊ป 2 บรรทัด (รหัสกรุ๊ป+บัส / สนามบิน+เวลานัด+เวลาบิน) ไม่ตัดคำจนอ่านไม่ออก
 * ผลคือทั้งเดือนกว้างเกินจอ → กล่องตารางมี Horizontal Scroll (คอลัมน์ชื่อยังตรึงซ้ายไว้)
 * (อัปเดต: เปลี่ยนจากตารางกว้างเกินจอ+สกอลบาร์ มาเป็น "แสดงทีละ VISIBLE_DAYS วัน" แทน — ดูรายละเอียดที่ dayOffset ด้านล่าง)
 */
const NAME_W = 180;
/** จำนวนวันที่แสดงพร้อมกันในหน้าเดียว — เลื่อนหน้าต่างวันด้วยปุ่มลูกศร ไม่ใช้สกอลบาร์ */
const VISIBLE_DAYS = 7;
const HEAD_H = 48;
const ROW_MIN = 62;
/** ความสูงป้ายกรุ๊ปหนึ่งใบโดยประมาณ (2 บรรทัด text-[9px] + padding) ใช้คำนวณความสูงแถวรวม */
const CHIP_H = 26;
const CHIP_GAP = 2;
const CELL_PAD_Y = 8;
/**
 * จำนวนป้ายที่วาดตรง ๆ ในช่องวันมากสุด — เกินกว่านี้ยุบเป็น "+N" แทน (กดช่องเปิดรายการทั้งวันได้อยู่แล้ว)
 * ถ้าไม่จำกัด วันที่มีหลายสิบกรุ๊ปกองอยู่คนเดียว (เช่น พีคซีซั่น) จะดัน rowHeight ให้สูงลิ่ว แล้วบังคับทุกแถว
 * ทุกวันทั้งเดือนสูงตามไปด้วย (ดู maxJobsInCell) จนตารางส่วนใหญ่กลายเป็นที่ว่างเปล่า
 */
const MAX_CHIPS_PER_DAY = 3;

/**
 * สีป้ายงาน = สถานะการจัด — ใช้คลาสชุดเดียวกับแท่งงานของตารางหัวหน้าทัวร์
 * (BOARD_STATUS[...].bar มีทั้งพื้น ขอบ และแถบสีด้านซ้าย) สองตารางจึงอ่านเหมือนกัน
 */
/** ชิปในแถบสรุปของเดือน — ขนาด/รูปทรงเดียวกับชิป "สถานะการจัด" ของตารางหัวหน้าทัวร์ */
const SUMMARY_CHIP = 'inline-flex h-[22px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] transition-colors disabled:cursor-default';

function statusBar(status: 'CONFIRMED' | 'PENDING_CONFIRMATION' | 'UNASSIGNED'): string {
  return BOARD_STATUS[status].bar;
}

/** ทำเครื่องหมายไว้ในรายการที่ Auto Assign สร้าง — ให้รู้ว่าเป็นร่างเบื้องต้น ยังไม่ได้ผ่านตาคน ต้องตรวจซ้ำ */
const AUTO_ASSIGN_NOTE = 'จัดอัตโนมัติ (ร่างเบื้องต้น — ปรับเปลี่ยนได้ตามปกติ)';

export function SendOffScheduleTimeline() {
  useWideContent();
  const { today, currentUser, pushToast } = useDemo();
  // สิทธิ์แก้ตารางนี้ผูกกับตัวบุคคล (Schedule Administrator คนเดียว) ไม่ใช่ตามบทบาทเหมือนตารางหัวหน้าทัวร์
  const canAssign = canEditSendOffSchedule(currentUser);

  /*
    ค่าเริ่มต้น = เดือนปัจจุบัน + 1 เสมอ (เดือนที่กำลังจัดสเก็ตจริง)
    ตั้งค่าตอน mount ไม่ใช่ตอนสร้าง state เพราะหน้านี้ถูก prerender ตอน build
    ถ้าคำนวณจากวันที่จริงตั้งแต่ตอน render จะได้เดือนตอน build ค้างใน HTML แล้วไม่ตรงกับเบราว์เซอร์
  */
  const [cursor, setCursor] = useState(() => nextMonthStart(today));
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCursor(nextMonthStartFromNow());
  }, []);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<SendOffStaffType | null>(null);
  /**
   * ตาราง = กวาดตาหาช่องว่างของแต่ละคน · รายการ = อ่านรายละเอียดของงานที่จัดไปแล้ว
   * ช่องวันบนตารางกว้าง 55px ใส่ได้แค่เวลา จึงต้องมีอีกทางให้ดูของครบ
   */
  const [pickedView, setView] = useState<'board' | 'agenda'>('board');
  /** คนที่ไม่มีสิทธิ์จัดเจ้าหน้าที่ส่งกรุ๊ป ดูได้เฉพาะมุมมองตาราง (ไม่มีปุ่มสลับเป็นรายการ) */
  const view = canAssign ? pickedView : 'board';
  const [staff, setStaff] = useState<SendOffStaff[]>([]);
  const [assignments, setAssignments] = useState<SendOffAssignment[]>([]);

  /**
   * แถวของใครที่กำลังจัดกรุ๊ปให้ พร้อมวันที่ที่คลิก — null = ยังไม่ได้เปิดหน้าต่าง
   * ทิศทางเดียวกับตารางหัวหน้าทัวร์: เลือกคนจากแถวก่อน แล้วค่อยเลือกกรุ๊ปในหน้าต่าง
   */
  const [addTarget, setAddTarget] = useState<{ staff: SendOffStaff; date: string } | null>(null);
  const [detail, setDetail] = useState<SendOffJob | null>(null);
  /** หน้าต่างสรุปงานรายบุคคลของเดือนที่ดูอยู่ — เปิดจากชื่อในคอลัมน์ซ้าย */
  const [staffSummary, setStaffSummary] = useState<SendOffStaff | null>(null);
  /** รายการกรุ๊ปทั้งวัน — เปิดจากปุ่ม "+N" ในช่องที่มีงานเกินกว่าจะวาดครบ */
  const [dayList, setDayList] = useState<{ date: string; staffId: string } | null>(null);
  /** กดเลข "ต้องตรวจ"/"ทับซ้อน" ในแถบสรุป → เปิดรายการว่าเป็นกรุ๊ปไหนบ้าง ไม่ต้องไล่หาเองทั้งตาราง */
  const [issueListKind, setIssueListKind] = useState<'issue' | 'overlap' | 'unassigned' | null>(null);
  /** ชิปสถานะ (คอนเฟิร์มแล้ว / รอคอนเฟิร์ม) — กรองให้เหลือเจ้าหน้าที่ที่มีงานสถานะนั้น · null = ทุกคน · กดซ้ำเพื่อยกเลิก */
  const [statusFilter, setStatusFilter] = useState<'CONFIRMED' | 'PENDING_CONFIRMATION' | null>(null);
  /** เวลาเครื่องออกที่กรอกเอง — ใช้เฉพาะกรุ๊ปที่ยังไม่มีเที่ยวบินในระบบ */
  const [manualTimes, setManualTimes] = useState<ManualFlightTimes>({});
  /** สนามบินขาไปที่กรอกเอง — คู่กับเวลาเครื่องออก ใช้เมื่อกรุ๊ปมาจาก CSV จึงไม่มีสนามบินให้ตรวจกฎ */
  const [manualAirports, setManualAirports] = useState<ManualAirports>({});
  /** เพดานกรุ๊ปต่อเดือนที่ตั้งไว้ — เฉพาะเดือนนั้น ๆ เท่านั้น ไม่มีค่าเริ่มต้นข้ามเดือน (กดที่ "X/Y กรุ๊ป" ข้างชื่อเพื่อตั้ง) */
  const [monthlyCaps, setMonthlyCaps] = useState<MonthlyCaps>({});
  /** เจ้าหน้าที่ที่กำลังตั้งเพดานเดือนนี้ให้ — null = ยังไม่ได้เปิดหน้าต่าง */
  const [capEditing, setCapEditing] = useState<SendOffStaff | null>(null);
  const [capDraft, setCapDraft] = useState('');
  /** เปิดหน้าต่างตั้งเพดานทีเดียวทุกคน — ไม่ต้องกดทีละคน */
  const [capBulkOpen, setCapBulkOpen] = useState(false);
  /** staffId -> ค่าที่กำลังแก้ในหน้าต่างตั้งเพดานรวม, ว่าง = ไม่จำกัด */
  const [capBulkDraft, setCapBulkDraft] = useState<Record<string, string>>({});
  /** เงื่อนไขการจัดที่ผู้จัดตั้งไว้ — ปรับได้ที่เมนูเจ้าหน้าที่ส่งกรุ๊ป แท็บ "เงื่อนไขการจัด" */
  const [rules, setRules] = useState<SendOffRules>(DEFAULT_SEND_OFF_RULES);
  /** วันลาที่ขอไว้ (จากหน้าโปรไฟล์เจ้าหน้าที่) — ใช้เตือนในตารางว่าวันไหนคนนี้ลาอยู่ */
  const [leaves, setLeaves] = useState<SendOffLeaveRecord[]>([]);

  // ทะเบียนรายชื่อกับการจัดอยู่ใน localStorage → อ่านฝั่ง client เท่านั้น
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStaff(loadSendOffStaff());
    setAssignments(loadSendOffAssignments());
    setManualTimes(loadManualFlightTimes());
    setManualAirports(loadManualAirports());
    setMonthlyCaps(loadMonthlyCaps());
    setRules(loadSendOffRules());
    setLeaves(loadSendOffLeave());
  }, []);

  /** วันลาที่ "คอนเฟิร์มแล้ว" เท่านั้นถือว่ามีผลจริง — ที่ยังรอคอนเฟิร์ม/ถูกปฏิเสธ/ยกเลิกไปแล้วไม่ต้องเตือน */
  const approvedLeaveByStaff = useMemo(() => {
    const m = new Map<string, SendOffLeaveRecord[]>();
    for (const r of leaves) {
      if (r.status !== 'approved') continue;
      m.set(r.staffId, [...(m.get(r.staffId) ?? []), r]);
    }
    return m;
  }, [leaves]);

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  /** เพดานกรุ๊ปของคนนี้ในเดือนที่กำลังดูอยู่ — null = ไม่จำกัด (ไม่เคยตั้งไว้เดือนนี้) */
  const capOf = useCallback(
    (staffId: string) => monthlyCapFor(monthlyCaps, staffId, monthStart),
    [monthlyCaps, monthStart],
  );
  const dayCount = daysBetween(monthStart, monthEnd);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => addDays(monthStart, i)),
    [monthStart, dayCount],
  );

  /*
    แสดงทีละ VISIBLE_DAYS วัน (ไม่ใช่ทั้งเดือนพร้อมสกอลบาร์) — ปุ่มลูกศรเลื่อนหน้าต่างนี้ไปทีละ VISIBLE_DAYS วัน
    เดิมเคยลองทำแบบ "ตารางกว้างเกินจอ + สกอลบาร์ + sticky คอลัมน์ชื่อ" แต่ position:sticky ผิดเพี้ยนไม่เกาะซ้าย
    เมื่อสกอลไกลเกินราวความกว้าง 1 หน้าจอ (เจอทั้งใน demo และเบราว์เซอร์จริงของผู้ใช้ ไม่ใช่แค่บั๊กเครื่องมือทดสอบ)
    การ "แสดงแค่ 7 วันในแต่ละครั้ง" ตัดปัญหานี้ทิ้งไปเลย เพราะไม่มีเนื้อหาส่วนไหนกว้างเกินจอให้ต้องสกอลอีก
  */
  const [dayOffset, setDayOffset] = useState(0);
  useEffect(() => {
    // เปลี่ยนเดือน → กลับไปเริ่มที่วันที่ 1 ของเดือนนั้นเสมอ
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDayOffset(0);
  }, [monthStart]);
  const maxDayOffset = Math.max(0, dayCount - VISIBLE_DAYS);
  const clampedDayOffset = Math.min(dayOffset, maxDayOffset);
  const visibleDays = useMemo(
    () => days.slice(clampedDayOffset, clampedDayOffset + VISIBLE_DAYS),
    [days, clampedDayOffset],
  );

  /* วันหยุดของปีที่เดือนนี้คาบเกี่ยว — เดือนธันวาคมคาบไปปีถัดไปไม่ได้ แต่เผื่อไว้ให้ครบ */
  const holidays = useMemo(
    () => getHolidayMap([parseDate(monthStart).getFullYear(), parseDate(monthEnd).getFullYear()]),
    [monthStart, monthEnd],
  );

  /* วันหยุด (เสาร์-อาทิตย์ + ที่ตั้งไว้ในเมนูวันหยุด) — พนักงานจัดได้เท่าประจำในวันเหล่านี้ */
  const dayOffOf = useMemo(() => dayOffLookup(holidays), [holidays]);
  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  /**
   * งานไปส่งของเดือนนี้ — คัดด้วย "วันที่ต้องไปส่ง" ไม่ใช่วันออกเดินทาง
   *
   * เที่ยวบินดึกมากทำให้ต้องไปตั้งแต่คืนก่อน วันไปส่งจึงคร่อมเดือนได้ทั้งสองทาง
   * ถ้าคัดด้วยวันออกเดินทาง กรุ๊ปที่ออกวันที่ 1 เวลา 02:00 จะถูกนับเข้าเดือนนี้
   * แต่วันไปส่งตกเดือนก่อน → ไม่มีช่องให้วาดป้าย งานหายไปจากตารางทั้งที่ยังนับอยู่ในยอดรวม
   * จึงดึงพีเรียดเผื่อหัวท้ายข้างละวัน แล้วค่อยคัดด้วยวันไปส่งอีกชั้น
   */
  const jobs = useMemo<SendOffJob[]>(() => {
    const from = addDays(monthStart, -1);
    const to = addDays(monthEnd, 1);
    const assignableIds = new Set(getAssignablePeriods().map((p) => p.internalId));
    const periods = sendOffPeriodPool({
      /*
        คัดด้วยวันออกเดินทางอย่างเดียว ไม่ใช้ตัวกรอง monthStart ของ getTourPeriods (ซึ่งต้องมี endDate ด้วย) —
        พีเรียดจาก Zego บางตัวไม่มีวันกลับ จะหลุดจากตารางทั้งที่หน้าต่างเลือกกรุ๊ป (คัดด้วย startDate) ยังให้เลือกได้
        ผลคือจัดแล้วขึ้น "สำเร็จ" แต่ไม่มีป้ายบนตารางและกดยืนยันไม่ได้
      */
      periods: getTourPeriods().filter((p) => p.startDate >= from && p.startDate <= to),
      assignablePeriodIds: assignableIds,
      assignments,
    });
    return buildSendOffJobs({ periods, assignments, staffById, manualTimes, manualAirports, rules, dayOffOf })
      .filter((j) => j.dutyDate >= monthStart && j.dutyDate <= monthEnd);
  }, [assignments, monthStart, monthEnd, staffById, manualTimes, manualAirports, rules, dayOffOf]);

  /** กรุ๊ปที่ยังไม่มีคนไปส่ง — แถวแรกของตาราง เพราะคือสิ่งที่ต้องเห็นก่อนอย่างอื่น */
  const unassigned = useMemo(() => jobs.filter((j) => !j.assignment), [jobs]);

  /**
   * งานที่ยังเป็นผลจาก Auto Assignment ตรง ๆ (ยังไม่ถูกปรับด้วยมือ) — กลุ่มที่ปุ่ม "เคลียร์ที่จัดอัตโนมัติ" ล้างให้
   * เกณฑ์คัดดูที่ note เท่านั้น (ไม่เกี่ยวกับสถานะรอคอนเฟิร์ม/คอนเฟิร์มแล้ว) —
   * ถ้าผู้จัดถอด/ย้ายคนด้วยมือไปแล้ว รายการใหม่จะไม่มี note นี้ ปุ่มนี้จึงไม่แตะอีก
   */
  const autoAssigned = useMemo(
    () => jobs.filter((j) => j.assignment?.note === AUTO_ASSIGN_NOTE),
    [jobs],
  );

  /** จำนวนกรุ๊ปที่คอนเฟิร์มแล้วจริง ๆ — งานที่ยังรอคอนเฟิร์มไม่นับรวมตรงนี้ (ดู pendingCount) */
  const confirmedCount = useMemo(() => jobs.filter((j) => j.assignment?.status === 'CONFIRMED').length, [jobs]);
  /** จำนวนกรุ๊ปที่จัดคนแล้วแต่ยังรอผู้จัดกดยืนยัน */
  const pendingCount = useMemo(() => jobs.filter((j) => j.assignment?.status === 'PENDING_CONFIRMATION').length, [jobs]);

  /** งานที่มีเรื่องต้องตรวจ — ตัวเลขในแถบสรุปคือสิ่งที่ผู้จัดต้องลงมือทำต่อ กดตัวเลขดูรายชื่อกรุ๊ปได้ (ดู issueListKind) */
  const issueJobs = useMemo(() => jobs.filter((j) => jobIssue(j) !== null), [jobs]);
  /** เวลานัดทับซ้อนกับงานอื่นของคนเดียวกัน (สนามบินเดียวกัน จัดได้ตามนโยบาย) — ไม่ใช่ปัญหา แค่ต้องรู้ไว้เตรียมตัว แยกจาก issueJobs */
  const overlapJobs = useMemo(() => jobs.filter((j) => jobOverlapWarning(j) !== null), [jobs]);

  /** งานของแต่ละคน — รวมทั้งที่รอคอนเฟิร์มและคอนเฟิร์มแล้ว (ใช้วาดช่องวัน/กันตารางชนกันเอง) */
  const jobsByStaff = useMemo(() => {
    const m = new Map<string, SendOffJob[]>();
    for (const j of jobs) {
      if (!j.assignment) continue;
      const list = m.get(j.assignment.staffId) ?? [];
      list.push(j);
      m.set(j.assignment.staffId, list);
    }
    return m;
  }, [jobs]);

  /**
   * จำนวนกรุ๊ปที่ "คอนเฟิร์มแล้ว" ของแต่ละคน — ใช้กับเพดานกรุ๊ปต่อเดือนและป้าย "X/Y กรุ๊ป" เท่านั้น
   * งานที่ยังรอคอนเฟิร์มไม่นับเข้าเพดาน (ต่างจาก jobsByStaff ด้านบนที่ใช้วาดตาราง/กันชนตารางซึ่งต้องนับรวมทุกสถานะ)
   */
  const confirmedCountByStaff = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) {
      if (j.assignment?.status !== 'CONFIRMED') continue;
      m.set(j.assignment.staffId, (m.get(j.assignment.staffId) ?? 0) + 1);
    }
    return m;
  }, [jobs]);

  /** จำนวนกรุ๊ปที่ "รอคอนเฟิร์ม" ของแต่ละคน — ใช้ทั้งบอกจำนวนที่แถวและกรองรายชื่อในหน้าต่างยืนยันรายบุคคล */
  const pendingCountByStaff = useMemo(() => {
    const m = new Map<string, number>();
    for (const j of jobs) {
      if (j.assignment?.status !== 'PENDING_CONFIRMATION') continue;
      m.set(j.assignment.staffId, (m.get(j.assignment.staffId) ?? 0) + 1);
    }
    return m;
  }, [jobs]);

  /** รายชื่อที่แสดง — ตัดคนที่ปิดการใช้งานและไม่มีงานในเดือนนี้ออก ไม่งั้นตารางยาวโดยเปล่าประโยชน์ */
  const shownStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => {
      if (typeFilter && s.staffType !== typeFilter) return false;
      if (statusFilter === 'CONFIRMED' && !(confirmedCountByStaff.get(s.id))) return false;
      if (statusFilter === 'PENDING_CONFIRMATION' && !(pendingCountByStaff.get(s.id))) return false;
      if (!canSendOffByStatus(s.status) && (jobsByStaff.get(s.id)?.length ?? 0) === 0) return false;
      if (!q) return true;
      return `${sendOffStaffName(s)} ${s.nickname ?? ''}`.toLowerCase().includes(q);
    });
  }, [staff, typeFilter, search, jobsByStaff, statusFilter, confirmedCountByStaff, pendingCountByStaff]);

  const grouped = useMemo(
    () => SEND_OFF_STAFF_TYPE_ORDER.map((t) => ({ type: t, rows: shownStaff.filter((s) => s.staffType === t) })),
    [shownStaff],
  );

  const typeCounts = useMemo(() => {
    const m = new Map<SendOffStaffType, number>();
    for (const t of SEND_OFF_STAFF_TYPE_ORDER) m.set(t, 0);
    for (const s of staff) if (canSendOffByStatus(s.status)) m.set(s.staffType, (m.get(s.staffType) ?? 0) + 1);
    return m;
  }, [staff]);

  // เห็นแค่ VISIBLE_DAYS วันพอดีจอเสมอ ไม่มีคอลัมน์ไหนกว้างเกิน จึงไม่ต้องมี Horizontal Scroll เลย
  const gridCols = `${NAME_W}px repeat(${visibleDays.length}, 1fr)`;

  /**
   * จำนวนกรุ๊ปมากสุดที่ไปกองอยู่ในช่องเดียว (คนใดคนหนึ่ง วันใดวันหนึ่ง) ทั้งเดือน (ไม่ใช่แค่หน้าต่าง 7 วันที่เห็นอยู่)
   * ต้องคิดจากทั้งเดือนเพื่อให้ความสูงแถวคงที่ตลอด — ถ้าคิดจากแค่วันที่เห็น ณ ตอนนั้น พอเลื่อนหน้าไปวันอื่นที่มีงานแน่น/บางกว่า
   * ความสูงแถวจะเปลี่ยนไปมา ทำให้ตัวอักษรขยับ ใช้ค่านี้บังคับให้ทุกแถวสูงเท่ากันคงที่ทุกหน้า
   * ตัดเพดานที่ MAX_CHIPS_PER_DAY — ช่องที่มีมากกว่านั้นยุบเป็น "+N" แทน (ดู dayCell) จึงไม่ต้องคิดความสูงตามจำนวนจริง
   * ไม่งั้นวันพีคซีซั่นวันเดียวจะดันให้ทุกแถวทั้งเดือนสูงลิ่วตามไปด้วย
   */
  const maxJobsInCell = useMemo(() => {
    let max = 0;
    for (const s of shownStaff) {
      const counts = new Map<string, number>();
      for (const j of jobsByStaff.get(s.id) ?? []) {
        counts.set(j.dutyDate, (counts.get(j.dutyDate) ?? 0) + 1);
      }
      for (const c of counts.values()) if (c > max) max = c;
    }
    return Math.min(max, MAX_CHIPS_PER_DAY);
  }, [shownStaff, jobsByStaff]);

  const rowHeight = Math.max(
    ROW_MIN,
    maxJobsInCell * CHIP_H + Math.max(0, maxJobsInCell - 1) * CHIP_GAP + CELL_PAD_Y,
  );

  /** เลื่อนหน้าต่างวันไปทีละ VISIBLE_DAYS วัน — คลิกจนสุดต้น/ท้ายเดือนแล้วปุ่มจะ disable ไปเอง */
  const goToPage = useCallback((dir: 1 | -1) => {
    setDayOffset((o) => Math.min(maxDayOffset, Math.max(0, o + dir * VISIBLE_DAYS)));
  }, [maxDayOffset]);

  /*
    กดลูกศรซ้าย/ขวาที่คีย์บอร์ดเพื่อเปลี่ยนหน้าต่างวันได้ทันที ไม่ต้องคลิกโฟกัสช่องในตารางก่อน
    (เดิมผูก onKeyDown ไว้ที่ช่องตาราง แต่คลิกช่องที่มีงานจะเปิด modal ทันที โฟกัสเลยหลุดออกจากตาราง
    ทำให้กดลูกศรแล้วไม่มีอะไรเกิดขึ้น — ใช้ window listener แทนเพื่อให้กดได้จากทุกที่ในหน้านี้)
    ยกเว้นตอนกำลังพิมพ์อยู่ในช่องค้นหา/ฟอร์ม ไม่งั้นพิมพ์เลข/ลูกศรในช่องจะไปเปลี่ยนหน้าตารางโดยไม่ตั้งใจ
  */
  useEffect(() => {
    if (view !== 'board') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); goToPage(-1); } else if (e.key === 'ArrowRight') { e.preventDefault(); goToPage(1); }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [view, goToPage]);

  /**
   * จัดหลายกรุ๊ปรวดเดียว — assignSendOff อ่าน/เขียนที่เก็บใหม่ทุกครั้ง วนเรียกจึงไม่ทับกันเอง
   * เวลาที่ต้องไปถึงคำนวณใหม่ทีละกรุ๊ป ไม่ใช้ค่าเดียวร่วมกัน
   */
  const doAssignMany = (s: SendOffStaff, periods: { internalId: string; groupCode: string; startDate: string }[]) => {
    let rows = assignments;
    let done = 0;
    try {
      for (const period of periods) {
        /* jobs คิดลำดับ "เวลาจริงชนะค่าที่กรอกเอง" ไว้ให้แล้ว — ใช้ค่านั้นก่อนเสมอ */
        const flightTime = jobs.find((j) => j.period.internalId === period.internalId)?.flightTime
          ?? manualTimes[period.internalId]
          ?? null;
        const dutyJob = jobs.find((j) => j.period.internalId === period.internalId);
        const check = checkSendOff(s.staffType, flightTime, {
          leadHours: rules.leadHours,
          workStart: rules.employeeWorkStart,
          workEnd: rules.employeeWorkEnd,
          isDayOff: Boolean(dutyJob?.dayOff),
        });
        rows = assignSendOff({
          periodId: period.internalId,
          staffId: s.id,
          arrivalTime: check.arrivalTime,
          dayOffset: check.dayOffset,
          by: currentUser.name,
          at: new Date().toISOString().slice(0, 16),
        });
        done += 1;
      }
      setAssignments(rows);
      setAddTarget(null);
      pushToast('success', `จัด ${done} กรุ๊ปให้ ${sendOffStaffName(s)} แล้ว (รอคอนเฟิร์ม — คุยกับเจ้าหน้าที่แล้วค่อยกดยืนยัน)`);
      /*
        กรุ๊ปที่จัดแล้วแต่ "วันที่ต้องไปส่ง" ไม่อยู่ในเดือนนี้ (เช่นเครื่องออกตี 1 ของวันที่ 1 → ต้องไปตั้งแต่คืนวันที่ 30 เดือนก่อน)
        จะไม่มีป้ายบนตารางเดือนนี้ — บอกให้รู้ว่าไปอยู่วันไหน ไม่ปล่อยให้เข้าใจว่าจัดไม่ติด
      */
      const offBoard = periods.filter((p) => !jobs.some((j) => j.period.internalId === p.internalId));
      if (offBoard.length > 0) {
        // วันไปส่งคิดผ่าน buildSendOffJobs ตัวเดียวกับตาราง — หน้าจอไม่อ่านเวลาบินเอง เลขจะได้ตรงกันเสมอ
        const offIds = new Set(offBoard.map((p) => p.internalId));
        const where = buildSendOffJobs({
          periods: getTourPeriods().filter((x) => offIds.has(x.internalId)),
          assignments: [],
          staffById,
          manualTimes,
          manualAirports,
          rules,
          dayOffOf,
        }).map((j) => `${j.period.groupCode} (ไปส่ง ${formatDate(j.dutyDate)})`).join(', ');
        pushToast('warning', `${offBoard.length} กรุ๊ปไม่ได้แสดงบนตารางเดือนนี้`, `${where} — วันที่ต้องไปส่งอยู่นอกเดือนที่กำลังดู เลื่อนไปเดือนนั้นเพื่อดูและกดยืนยัน`);
      }
    } catch (e) {
      setAssignments(rows);
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /** บันทึกเวลาเครื่องออกที่กรอกเอง — กรอกจากในรายการได้เลย หน้าต่างไม่ต้องปิด */
  const saveFlightTime = (periodId: string, time: string) => {
    try {
      setManualTimes(setManualFlightTime(periodId, time));
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /** บันทึกสนามบินขาไปที่กรอกเอง — คู่กับเวลาเครื่องออก ใช้เมื่อกรุ๊ปมาจาก CSV จึงไม่มีสนามบินให้ตรวจกฎ */
  const saveAirport = (periodId: string, code: string) => {
    try {
      setManualAirports(setManualAirport(periodId, code));
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /** ตั้ง/ล้างเพดานกรุ๊ปของคนนี้เฉพาะเดือนที่กำลังดูอยู่ — value = null ล้างกลับเป็นไม่จำกัด */
  const saveMonthlyCap = (staffId: string, value: number | null) => {
    try {
      setMonthlyCaps(setMonthlyCap(staffId, monthStart, value));
      pushToast('success', value !== null ? `ตั้งเพดาน ${value} กรุ๊ปของเดือนนี้แล้ว` : 'ล้างเพดานเดือนนี้แล้ว — กลับเป็นไม่จำกัด');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
    setCapEditing(null);
  };

  /** เปิดหน้าต่างตั้งเพดานรวม — ดึงค่าปัจจุบันของทุกคน (ไม่กรองตาม search/typeFilter ของตารางหลัก) มาตั้งเป็นค่าตั้งต้น */
  const openCapBulk = () => {
    const draft: Record<string, string> = {};
    for (const s of staff) {
      const cap = capOf(s.id);
      draft[s.id] = cap != null ? String(cap) : '';
    }
    setCapBulkDraft(draft);
    setCapBulkOpen(true);
  };

  /** บันทึกเพดานของทุกคนพร้อมกัน — ช่องว่างหรือค่าไม่ถูกต้อง = ไม่จำกัด */
  const saveCapBulk = () => {
    try {
      let result = loadMonthlyCaps();
      for (const s of staff) {
        const raw = capBulkDraft[s.id]?.trim() ?? '';
        const value = raw === '' || Number(raw) < 0 || !Number.isFinite(Number(raw)) ? null : Math.round(Number(raw));
        result = setMonthlyCap(s.id, monthStart, value);
      }
      setMonthlyCaps(result);
      pushToast('success', 'บันทึกเพดานเดือนนี้ของทุกคนแล้ว');
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
    setCapBulkOpen(false);
  };

  const doUnassign = (job: SendOffJob) => {
    if (!job.assignment) return;
    try {
      setAssignments(unassignSendOff(job.assignment.assignmentId));
      setDetail(null);
      pushToast('success', `ถอดคนไปส่ง ${job.period.groupCode} แล้ว — กลับไปอยู่แถวยังไม่มีคนไปส่ง`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /** ยืนยันว่าเจ้าหน้าที่รับงานแล้ว — กดหลังคุยกับเจ้าหน้าที่นอกระบบ (โทร/LINE) เสร็จเท่านั้น */
  const doConfirm = (job: SendOffJob) => {
    if (!job.assignment) return;
    try {
      setAssignments(confirmSendOff(job.assignment.assignmentId, currentUser.name, new Date().toISOString().slice(0, 16)));
      pushToast('success', `ยืนยันรับงาน ${job.period.groupCode} แล้ว`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /**
   * ยืนยันงานที่รอคอนเฟิร์มพร้อมกันหลายกรุ๊ป — ไม่ระบุ staffIds = ทุกคนในเดือนที่กำลังดู, ระบุ = เฉพาะคนที่เลือกไว้
   * ใช้เมื่อคุยกับเจ้าหน้าที่ครบทุกคน/ทุกคนที่เลือกไว้แล้วเท่านั้น ไม่ใช่ทางลัดข้ามขั้นคุยจริง
   */
  const confirmAllPending = (staffIds?: string[]) => {
    const idSet = staffIds ? new Set(staffIds) : null;
    const targets = jobs.filter((j) => j.assignment?.status === 'PENDING_CONFIRMATION' && (!idSet || idSet.has(j.assignment.staffId)));
    if (targets.length === 0) return;
    let rows = assignments;
    const at = new Date().toISOString().slice(0, 16);
    try {
      for (const j of targets) rows = confirmSendOff(j.assignment!.assignmentId, currentUser.name, at);
      setAssignments(rows);
      pushToast('success', idSet
        ? `ยืนยันรับงานของ ${idSet.size} คนแล้ว รวม ${targets.length} กรุ๊ป`
        : `ยืนยันงานที่รอคอนเฟิร์มทั้งหมด ${targets.length} กรุ๊ปแล้ว`);
    } catch (e) {
      setAssignments(rows);
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /** ยกเลิกคอนเฟิร์ม กลับไปเป็นรอคอนเฟิร์ม — ใช้เมื่อกดยืนยันผิดคนหรือเจ้าหน้าที่กลับคำทีหลัง ไม่ใช่การถอดคน */
  const doUnconfirm = (job: SendOffJob) => {
    if (!job.assignment) return;
    try {
      setAssignments(unconfirmSendOff(job.assignment.assignmentId));
      pushToast('success', `ยกเลิกคอนเฟิร์ม ${job.period.groupCode} แล้ว — กลับไปเป็นรอคอนเฟิร์ม`);
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /**
   * ยกเลิกคอนเฟิร์มพร้อมกันหลายกรุ๊ป — ไม่ระบุ staffIds = ทุกคนในเดือนที่กำลังดู, ระบุ = เฉพาะคนที่เลือกไว้
   * กลับไปเป็นรอคอนเฟิร์มเท่านั้น ไม่ใช่ถอดคนออก — คนที่จัดไว้ยังเป็นคนเดิม
   */
  const unconfirmSelected = (staffIds?: string[]) => {
    const idSet = staffIds ? new Set(staffIds) : null;
    const targets = jobs.filter((j) => j.assignment?.status === 'CONFIRMED' && (!idSet || idSet.has(j.assignment.staffId)));
    if (targets.length === 0) return;
    let rows = assignments;
    try {
      for (const j of targets) rows = unconfirmSendOff(j.assignment!.assignmentId);
      setAssignments(rows);
      pushToast('success', idSet
        ? `ยกเลิกคอนเฟิร์มของ ${idSet.size} คนแล้ว รวม ${targets.length} กรุ๊ป`
        : `ยกเลิกคอนเฟิร์มทั้งหมด ${targets.length} กรุ๊ปแล้ว`);
    } catch (e) {
      setAssignments(rows);
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
  };

  /**
   * Auto Assignment — กระจายกรุ๊ปที่ยังไม่มีคนไปส่งของเดือนที่กำลังดูให้เจ้าหน้าที่ทุกคนใกล้เคียงกันที่สุด
   * ผลลัพธ์เป็น "ร่างเบื้องต้น" เท่านั้น — จัดแล้วเริ่มที่รอคอนเฟิร์มเหมือนจัดมือทุกกรุ๊ป ต้องกดยืนยันทีละกรุ๊ปอีกที
   * (หรือปรับ/ย้ายคนเองต่อได้ทุกจุดในตารางนี้ก่อนก็ได้)
   */
  const [autoAssignPreview, setAutoAssignPreview] = useState<{ result: AutoAssignResult; staffCount: number } | null>(null);
  /**
   * กรุ๊ปที่ "จัดอัตโนมัติ" ได้ — เฉพาะสถานะขาย CLOSED (ปิดขายแล้ว รายชื่อนิ่ง เดินทางแน่) ที่ยังไม่มีคนไปส่ง
   * SELL (ยังเปิดขาย อาจไม่ได้เดินทาง) ไม่จัดอัตโนมัติ — จัดเองทีละกรุ๊ปได้ตามปกติ
   */
  const autoCandidates = useMemo(() => unassigned.filter((j) => j.period.saleStatus === 'CLOSED'), [unassigned]);

  const openAutoAssign = () => {
    const eligibleStaff = staff.filter((s) => canSendOffByStatus(s.status));
    const staffInputs: AutoAssignStaffInput[] = eligibleStaff.map((s) => ({
      id: s.id,
      staffType: s.staffType,
      status: s.status,
      existingJobs: (jobsByStaff.get(s.id) ?? [])
        .filter((j) => j.slot)
        .map((j) => ({ slot: j.slot!, dutyDate: j.dutyDate })),
      leaveDates: new Set(days.filter((iso) => (approvedLeaveByStaff.get(s.id) ?? []).some((r) => leaveCoversDate(r, iso)))),
      maxGroupsPerMonth: capOf(s.id),
      confirmedThisMonth: confirmedCountByStaff.get(s.id) ?? 0,
    }));
    const jobInputs: AutoAssignJobInput[] = autoCandidates.map((j) => ({
      periodId: j.period.internalId,
      dutyDate: j.dutyDate,
      flightTime: j.flightTime,
      isDayOff: Boolean(j.dayOff),
      dayOffLabel: j.dayOff?.label,
      slot: j.slot,
    }));
    const result = planAutoAssignSendOff(jobInputs, staffInputs, rules);
    if (result.plan.length === 0) {
      /*
        กรุ๊ปที่ไม่มีเวลาเครื่องออก (เช่นนำเข้าจาก CSV ซึ่งไม่มีข้อมูล Sector) จัดอัตโนมัติไม่ได้โดยตั้งใจ — ต้องบอกเหตุผลนี้ตรง ๆ
        ไม่งั้นผู้จัดจะเข้าใจผิดว่าชนเวลางาน/วันลา ทั้งที่จริงแค่ต้องกรอกเวลาเครื่องออกก่อน
      */
      const noTime = autoCandidates.filter((j) => !j.flightTime).length;
      if (autoCandidates.length === 0) {
        pushToast('info', 'ไม่มีกรุ๊ปสถานะขาย CLOSED ที่ยังไม่มีคนไปส่งในเดือนนี้', 'จัดอัตโนมัติจัดเฉพาะกรุ๊ปที่ปิดขายแล้ว (CLOSED) — กรุ๊ปอื่นจัดเองทีละกรุ๊ปได้');
      } else if (noTime === autoCandidates.length) {
        pushToast('warning',
          `จัดอัตโนมัติไม่ได้ — ทั้ง ${noTime} กรุ๊ปยังไม่มีเวลาเครื่องออก`,
          'ระบบคำนวณเวลาที่ต้องไปถึงสนามบินไม่ได้ (ข้อมูลจาก CSV ไม่มีเที่ยวบิน) — กรอกเวลาเครื่องออกในหน้าต่างเลือกกรุ๊ปก่อน หรือจัดคนเองทีละกรุ๊ป');
      } else {
        pushToast('warning',
          'จัดอัตโนมัติไม่ได้เลย — ต้องจัดเอง',
          `กรุ๊ปที่เหลือชนเวลางาน/วันลา หรือชนกับงานที่มีอยู่แล้วทั้งหมด${noTime > 0 ? ` · ${noTime} กรุ๊ปในนั้นยังไม่มีเวลาเครื่องออก` : ''}`);
      }
      return;
    }
    setAutoAssignPreview({ result, staffCount: eligibleStaff.length });
  };

  const confirmAutoAssign = () => {
    if (!autoAssignPreview) return;
    const { result } = autoAssignPreview;
    let rows = assignments;
    const at = new Date().toISOString().slice(0, 16);
    try {
      for (const item of result.plan) {
        rows = assignSendOff({
          periodId: item.periodId,
          staffId: item.staffId,
          arrivalTime: item.arrivalTime,
          dayOffset: item.dayOffset,
          by: currentUser.name,
          at,
          note: AUTO_ASSIGN_NOTE,
        });
      }
      setAssignments(rows);
      /*
        ตารางแสดงทีละ VISIBLE_DAYS วัน — กรุ๊ปที่จัดได้อาจอยู่นอกช่วงที่เปิดอยู่ทั้งหมด (เช่นเปิด 1–7 แต่กรุ๊ปอยู่กลางเดือน)
        ผู้จัดจะเห็นตารางว่างเปล่าเหมือนจัดไม่สำเร็จ → เลื่อนไปช่วงที่มีกรุ๊ปแรกที่เพิ่งจัดให้เลย
      */
      const planned = new Set(result.plan.map((p) => p.periodId));
      const firstDate = unassigned.filter((j) => planned.has(j.period.internalId)).map((j) => j.dutyDate).sort()[0];
      const firstIdx = firstDate ? days.indexOf(firstDate) : -1;
      if (firstIdx >= 0) setDayOffset(Math.min(maxDayOffset, Math.floor(firstIdx / VISIBLE_DAYS) * VISIBLE_DAYS));
      const dates = [...new Set(unassigned.filter((j) => planned.has(j.period.internalId)).map((j) => formatDate(j.dutyDate)))].sort();
      pushToast('success', summarizeAutoAssign(result, autoAssignPreview.staffCount),
        dates.length > 0 ? `วันไปส่ง: ${dates.join(', ')} — กดลูกศรขวาบนตารางเพื่อดูช่วงวันถัดไป` : undefined);
    } catch (e) {
      setAssignments(rows);
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
    setAutoAssignPreview(null);
  };

  /** ยืนยันงานที่รอคอนเฟิร์มทั้งเดือนพร้อมกันทีเดียว — เปิดกล่องยืนยันก่อนเสมอเพราะกระทบหลายคน/หลายกรุ๊ปพร้อมกัน */
  const [confirmAllOpen, setConfirmAllOpen] = useState(false);

  /** เปิดหน้าต่างยืนยันรายบุคคล — เลือกได้มากกว่า 1 คน แล้วยืนยันงานที่รอคอนเฟิร์มของทุกคนที่เลือกพร้อมกันทีเดียว */
  const [confirmPickOpen, setConfirmPickOpen] = useState(false);
  const [confirmPickIds, setConfirmPickIds] = useState<Set<string>>(new Set());

  const toggleConfirmPick = (staffId: string) => {
    setConfirmPickIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId); else next.add(staffId);
      return next;
    });
  };

  const submitConfirmPick = () => {
    confirmAllPending([...confirmPickIds]);
    setConfirmPickOpen(false);
  };

  /** ยกเลิกคอนเฟิร์มทั้งเดือนพร้อมกันทีเดียว — เปิดกล่องยืนยันก่อนเสมอเพราะกระทบหลายคน/หลายกรุ๊ปพร้อมกัน */
  const [unconfirmAllOpen, setUnconfirmAllOpen] = useState(false);

  /** เปิดหน้าต่างยกเลิกคอนเฟิร์มรายบุคคล — เลือกได้มากกว่า 1 คน แล้วยกเลิกคอนเฟิร์มของทุกคนที่เลือกพร้อมกันทีเดียว */
  const [unconfirmPickOpen, setUnconfirmPickOpen] = useState(false);
  const [unconfirmPickIds, setUnconfirmPickIds] = useState<Set<string>>(new Set());

  const toggleUnconfirmPick = (staffId: string) => {
    setUnconfirmPickIds((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId); else next.add(staffId);
      return next;
    });
  };

  const submitUnconfirmPick = () => {
    unconfirmSelected([...unconfirmPickIds]);
    setUnconfirmPickOpen(false);
  };

  /**
   * ล้างงานที่ยังเป็นผลจาก Auto Assignment ตรง ๆ ทั้งหมด — กลับไปเป็น "ยังไม่มีคนไปส่ง" ทุกกรุ๊ป
   * ใช้เมื่อผลลัพธ์อัตโนมัติไม่ถูกใจ อยากเริ่มจัดใหม่ทั้งหมดแทนที่จะถอดคนทีละกรุ๊ป
   */
  const [clearAutoAssignConfirm, setClearAutoAssignConfirm] = useState(false);

  const confirmClearAutoAssign = () => {
    let rows = assignments;
    try {
      for (const j of autoAssigned) {
        if (!j.assignment) continue;
        rows = unassignSendOff(j.assignment.assignmentId);
      }
      setAssignments(rows);
      pushToast('success', `ล้างงานที่จัดอัตโนมัติแล้ว ${autoAssigned.length} กรุ๊ป — กลับไปเป็นยังไม่มีคนไปส่ง`);
    } catch (e) {
      setAssignments(rows);
      pushToast('error', e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    }
    setClearAutoAssignConfirm(false);
  };

  /**
   * ช่องวันหนึ่งช่องของแถวหนึ่ง — กรุ๊ปที่จัดคนแล้ววาดเป็นป้ายย่อ สูงสุด MAX_CHIPS_PER_DAY ใบ ที่เหลือยุบเป็น "+N"
   * (กดที่ช่องเปิดรายการทั้งวันดูครบได้อยู่แล้ว) กรุ๊ปที่มีเรื่องต้องตรวจ (issue/overlap) ถูกดันขึ้นมาก่อนเสมอ
   * ไม่ให้หลุดไปอยู่หลัง "+N" จนไม่มีใครเห็น — ทุกแถวสูงเท่ากันหมด ตามจำนวนป้ายที่วาดจริง (มีเพดานที่ MAX_CHIPS_PER_DAY
   * จึงไม่มีวันสูงเกินไปแม้บางวันจะมีงานกองอยู่เป็นสิบ ๆ กรุ๊ป — ดู rowHeight ด้านบน)
   * ป้ายบรรทัดเดียว: รหัสกรุ๊ป (บัส) ตัวหนา + สนามบิน, เวลาเครื่องออก ตัวจาง
   * ทั้งช่อง (รวมป้าย) เป็นพื้นที่คลิกเดียวกัน — มีงาน → เปิดรายการกรุ๊ปทั้งวัน (ดูรายละเอียด/จัดคนได้จากในนั้น)
   * ไม่มีงาน → คลิกเพื่อจัดกรุ๊ปใหม่ให้วันนั้น
   * วันที่คนนี้ลาอยู่ (คอนเฟิร์มแล้วจากหน้าโปรไฟล์) ขึ้นป้าย "ลา" ให้เห็นเลย — ถ้ามีงานจัดซ้อนช่วงลาด้วยจะขึ้นเตือนสีแดงแทน
   */
  const dayCell = (iso: string, staffId: string, list: SendOffJob[], onEmptyClick?: () => void) => {
    const d = parseDate(iso);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    const holiday = holidays.get(iso);
    const inDay = list.filter((j) => j.dutyDate === iso);
    const onLeave = (approvedLeaveByStaff.get(staffId) ?? []).some((r) => leaveCoversDate(r, iso));
    const leaveConflict = onLeave && inDay.length > 0;
    /* ลาอยู่และยังไม่มีงาน → ปิดการคลิกจัดกรุ๊ปใหม่ (ยังกดดูรายละเอียดวันที่มีงานอยู่แล้วได้ตามปกติ เผื่อต้องเปลี่ยนคน) */
    const blockedByLeave = onLeave && inDay.length === 0;
    const onClick = inDay.length > 0 ? () => setDayList({ date: iso, staffId }) : blockedByLeave ? undefined : onEmptyClick;
    /* กรุ๊ปที่มีเรื่องต้องตรวจ (issue/overlap) ต้องเห็นก่อนเสมอ — ห้ามหลุดไปอยู่หลัง "+N" เพราะยุบไปแล้วจะไม่มีใครสังเกตว่ามีปัญหาค้าง */
    const sortedInDay = inDay.length > MAX_CHIPS_PER_DAY
      ? [...inDay].sort((a, b) => Number(!!(jobIssue(b) ?? jobOverlapWarning(b))) - Number(!!(jobIssue(a) ?? jobOverlapWarning(a))))
      : inDay;
    const visibleInDay = sortedInDay.slice(0, MAX_CHIPS_PER_DAY);
    const hiddenInDayCount = sortedInDay.length - visibleInDay.length;
    return (
      <div
        key={iso}
        onClick={onClick}
        role={onClick ? 'button' : undefined}
        tabIndex={onClick ? 0 : undefined}
        onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
        aria-label={inDay.length > 0
          ? `ดูกรุ๊ปวันที่ ${formatDate(iso)} — ${inDay.length} กรุ๊ป${onLeave ? ' (ลาอยู่)' : ''}`
          : blockedByLeave ? `ลาอยู่วันที่ ${formatDate(iso)} — จัดกรุ๊ปไม่ได้`
            : onEmptyClick ? `จัดกรุ๊ปวันที่ ${formatDate(iso)}` : undefined}
        title={[holiday ? `${formatDate(iso)} — ${holiday.name}` : null, onLeave ? 'ลาวันนี้ (คอนเฟิร์มแล้ว)' : null].filter(Boolean).join(' · ') || undefined}
        className={cx('zego-border-color min-w-0 space-y-0.5 overflow-hidden border-r px-0.5 py-1 last:border-r-0',
          onClick && 'cursor-pointer hover:bg-[var(--zego-primary-50)]',
          leaveConflict ? 'bg-rose-100/70 ring-1 ring-inset ring-rose-400' : onLeave ? 'bg-violet-50/70' : holiday ? 'bg-rose-50/60' : weekend && 'zego-surface-soft-bg')}
      >
        {onLeave && (
          <span className={cx(
            'block truncate rounded px-1 py-px text-[8px] font-semibold border',
            leaveConflict ? 'zego-badge--danger' : 'bg-[var(--zego-text)] text-[var(--zego-surface)] border-[var(--zego-text)]',
          )}>
            {leaveConflict ? '! ลา แต่มีงาน' : 'ลา'}
          </span>
        )}
        {visibleInDay.map((j) => {
          const issue = jobIssue(j);
          const overlap = !issue ? jobOverlapWarning(j) : null;
          return (
          <div
            key={j.period.internalId}
            title={issue ?? overlap ?? undefined}
            className={cx(
              'relative block w-full overflow-hidden rounded-md px-1 py-px text-left leading-tight ring-1',
              statusBar(jobStatus(j)),
              issue ? 'ring-2 ring-rose-500' : overlap && 'ring-2 ring-orange-400',
            )}
          >
            {/* เครื่องหมายปัญหาลอยที่มุม ไม่แทรกกินความกว้างข้อความ — ช่องแคบแค่ 9px รหัสกรุ๊ปยาว ๆ ตัดคำง่ายอยู่แล้ว */}
            {issue ? (
              <span aria-label="มีเรื่องต้องตรวจ" className="absolute -right-0.5 -top-1 font-bold text-[10px] leading-none zego-text-danger">!</span>
            ) : overlap && (
              <span aria-label="เวลานัดทับซ้อน" className="absolute -right-0.5 -top-1 text-[10px] leading-none zego-text-orange">⚠</span>
            )}
            <span className="block truncate text-[9px] font-normal">
              {j.period.groupCode}{j.period.bus && j.period.bus !== '-' ? ` (${j.period.bus})` : ''}
            </span>
            {/* นัด = เวลาที่ต้องถึงสนามบิน (เลขหลักที่ต้องดู) ไม่ใช่เวลาเครื่องออก — เดิมเผลอโชว์เวลาเครื่องออกตรง ๆ ทำให้เข้าใจผิดว่าต้องไปถึงตอนนั้น จึงใส่ "บิน" กำกับไว้ข้าง ๆ ให้เทียบกันได้ในบรรทัดเดียว */}
            <span className="block truncate text-[9px] opacity-70" title="นัด = เวลาที่ต้องถึงสนามบิน (เครื่องออกลบเวลานำหน้าที่ตั้งไว้) · บิน = เวลาเครื่องออกจริง">
              {j.airport || '-'} · นัด {chipTime(j)}{j.flightTime ? ` · บิน ${j.flightTime}` : ''}
            </span>
          </div>
          );
        })}
        {/* เกิน MAX_CHIPS_PER_DAY — ยุบที่เหลือเป็น "+N" แทนวาดครบทุกใบ (กดที่ช่องเปิดรายการทั้งวันดูที่เหลือได้) */}
        {hiddenInDayCount > 0 && (
          <span className="block w-full truncate rounded-md px-1 py-px text-center text-[9px] font-semibold zego-badge--slate">
            +{hiddenInDayCount} เพิ่มเติม
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {/* ---------------- แถบเครื่องมือ ---------------- */}
      <Card>
        {/*
          แถวบน: ตัวควบคุมด้านซ้าย + สรุปสถานะของเดือนชิดขวา (ย้ายขึ้นมาแถวเดียวกัน แทนที่จะแยกเป็นแถวล่างมีเส้นคั่น)
          ปุ่มฝั่ง Schedule Administrator มีเยอะ (7 ปุ่ม) ใช้ size="sm" (.zego-button--sm) แทนขนาดปกติ 44px
          ให้พื้นที่ส่วนหัวเตี้ยลง/ขึ้นบรรทัดน้อยลง เหลือพื้นที่ให้ตารางด้านล่างมากขึ้น — gap ก็ลดจาก 3→2 คู่กัน
        */}
        {/*
          ปรับเป็น flex-col เต็มความกว้างของการ์ด 2 แถว แทนการวาง "กลุ่มตัวกรอง+ปุ่ม" กับ "สรุปสถานะ" เป็น
          2 คอลัมน์คู่กันแบบ justify-between เดิม — จอกว้างแล้วกลุ่มตัวกรอง+ปุ่ม (สูงหลายบรรทัด) หดแคบลง
          เหลือพื้นที่ว่างมหาศาลตรงกลาง เพราะ justify-between ไม่ได้บังคับให้ item ฝั่งซ้ายขยายเต็มที่จริง ๆ
          เมื่อฝั่งขวามีความสูงน้อยกว่ามาก (items-start ทำให้สองฝั่งเรียงชิดขอบบนเท่ากัน ไม่ยืดตามกัน)
          ตอนนี้แถวตัวกรอง (เดือน/ค้นหา/มุมมอง/ประเภท) ขึ้นเต็มความกว้างแถวของตัวเอง ส่วนแถวปุ่มจัดการ
          กับสรุปสถานะจับคู่กันเองอีกแถวหนึ่งด้วย justify-between (ทั้งสองฝั่งความสูงใกล้เคียงกัน จึงไม่มีช่องว่างแปลก ๆ)
        */}
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MonthPicker value={cursor} onChange={setCursor} hint="เลือกเดือนที่กรุ๊ปออกเดินทาง" />
            <SearchBox
              value={search}
              onChange={setSearch}
              label="ค้นหาเจ้าหน้าที่"
              placeholder="ค้นหาชื่อ นามสกุล หรือชื่อเล่น"
              className="min-w-[22rem] flex-1"
              onClear={() => setSearch('')}
            />
            {canAssign && (
              <SegmentedControl
                label="มุมมอง"
                value={view}
                onChange={setView}
                options={[
                  { value: 'board', label: 'ตาราง' },
                  { value: 'agenda', label: 'รายการ' },
                ]}
              />
            )}
            <div className="flex items-center gap-1">
              {SEND_OFF_STAFF_TYPE_ORDER.map((t) => (
                <button
                  key={t}
                  type="button"
                  aria-pressed={typeFilter === t}
                  onClick={() => setTypeFilter((prev) => (prev === t ? null : t))}
                  className={cx(
                    'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                    typeFilter === t ? 'zego-badge--info' : 'zego-surface-bg zego-border-color zego-text-secondary zego-hover-surface',
                  )}
                >
                  {SEND_OFF_STAFF_TYPE[t].label} ({typeCounts.get(t) ?? 0})
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* ยืนยันงานที่รอคอนเฟิร์มทั้งเดือนพร้อมกันทีเดียว — ใช้เมื่อคุยกับเจ้าหน้าที่ทุกคนครบแล้วเท่านั้น ไม่ต้องไล่กดทีละกรุ๊ป */}
              {canAssign && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="check"
                  onClick={() => setConfirmAllOpen(true)}
                  disabled={pendingCount === 0}
                  title={pendingCount === 0 ? 'ไม่มีงานที่รอคอนเฟิร์ม' : `ยืนยันงานที่รอคอนเฟิร์มทั้งหมด ${pendingCount} กรุ๊ปในเดือนนี้`}
                >
                  ยืนยันทั้งหมด
                </Button>
              )}
              {/* ยืนยันรายบุคคล — เลือกได้มากกว่า 1 คนในหน้าต่างเดียว แล้วยืนยันพร้อมกันทีเดียว ไม่ต้องไล่กดทีละคนที่แถว */}
              {canAssign && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="list"
                  onClick={() => { setConfirmPickIds(new Set()); setConfirmPickOpen(true); }}
                  disabled={pendingCount === 0}
                  title={pendingCount === 0 ? 'ไม่มีงานที่รอคอนเฟิร์ม' : 'เลือกเจ้าหน้าที่ที่ต้องการยืนยัน — เลือกได้มากกว่า 1 คน'}
                >
                  ยืนยันรายบุคคล
                </Button>
              )}
              {/* ยกเลิกคอนเฟิร์มทั้งเดือนพร้อมกันทีเดียว — กลับไปเป็นรอคอนเฟิร์ม ไม่ใช่ถอดคนออก ใช้เมื่อกดยืนยันผิดหมู่หรือเจ้าหน้าที่กลับคำ */}
              {canAssign && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="x"
                  onClick={() => setUnconfirmAllOpen(true)}
                  disabled={confirmedCount === 0}
                  title={confirmedCount === 0 ? 'ไม่มีงานที่คอนเฟิร์มแล้ว' : `ยกเลิกคอนเฟิร์มทั้งหมด ${confirmedCount} กรุ๊ปในเดือนนี้ กลับไปเป็นรอคอนเฟิร์ม`}
                >
                  ยกเลิกคอนเฟิร์มทั้งหมด
                </Button>
              )}
              {/* ยกเลิกคอนเฟิร์มรายบุคคล — เลือกได้มากกว่า 1 คนในหน้าต่างเดียว แล้วยกเลิกพร้อมกันทีเดียว */}
              {canAssign && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="list"
                  onClick={() => { setUnconfirmPickIds(new Set()); setUnconfirmPickOpen(true); }}
                  disabled={confirmedCount === 0}
                  title={confirmedCount === 0 ? 'ไม่มีงานที่คอนเฟิร์มแล้ว' : 'เลือกเจ้าหน้าที่ที่ต้องการยกเลิกคอนเฟิร์ม — เลือกได้มากกว่า 1 คน'}
                >
                  ยกเลิกคอนเฟิร์มรายบุคคล
                </Button>
              )}
              {/* ตั้งเพดานกรุ๊ปต่อเดือนของทุกคนในหน้าต่างเดียว — ไม่ต้องไล่กดทีละคนที่ตาราง */}
              {canAssign && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon="settings"
                  onClick={openCapBulk}
                  title="ตั้งเพดานกรุ๊ปเดือนนี้ของเจ้าหน้าที่ทุกคนพร้อมกัน"
                >
                  ตั้งเพดานเดือนนี้
                </Button>
              )}
              {/* ย้ายคำอธิบายวิธีใช้/เกณฑ์การจัดมาไว้ใน popover แทนขึ้นเป็นข้อความค้างตลอด — กินพื้นที่แถวน้อยลง กดดูเมื่อจำเป็นเท่านั้น */}
              <InfoPopover label={<Icon name="info" className="h-3.5 w-3.5" />} title="วิธีใช้ตาราง & เกณฑ์การจัด" align="right">
                <p>คลิกช่องที่มีงานเพื่อดูรายชื่อกรุ๊ปทั้งวัน · คลิกช่องว่างเพื่อจัดกรุ๊ปใหม่ให้วันนั้น</p>
                <p className="mt-1.5">ป้ายบนตาราง: <b>นัด</b> = เวลาที่ต้องถึงสนามบิน (เลขหลักที่ต้องดู) · <b>บิน</b> = เวลาเครื่องออกจริง</p>
                <p className="mt-1.5">เกณฑ์ที่ใช้อยู่: {rulesSummary(rules)}</p>
                <p className="mt-1.5">วันหยุด (เสาร์-อาทิตย์ และวันหยุดที่ตั้งไว้) พนักงานจัดได้ทุกช่วงเวลาเท่าประเภทประจำ</p>
              </InfoPopover>
            </div>

            {/* สรุปสถานะของเดือน — ตัวเลขที่ต้องเห็นก่อนลงมือจัด */}
            <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs zego-text-secondary">
              <span title="นับตามวันที่ต้องไปส่ง — เที่ยวบินดึกที่ต้องไปตั้งแต่คืนก่อนจะนับเข้าวันที่ไปจริง">
                งานไปส่งเดือนนี้ <b className="zego-text">{jobs.length}</b>
              </span>
              {/*
                ชิปแบบเดียวกับแถบ "สถานะการจัด" ของตารางหัวหน้าทัวร์ — กดได้ทุกอัน (ตัวเลข 0 กดไม่ได้)
                  คอนเฟิร์มแล้ว / รอคอนเฟิร์ม = กรองเหลือเจ้าหน้าที่ที่มีงานสถานะนั้น (กดซ้ำยกเลิก)
                  ยังไม่มีคนไปส่ง / ต้องตรวจ / ทับซ้อน = เปิดรายการกรุ๊ป (ไม่ผูกกับเจ้าหน้าที่คนใด จึงกรองแถวไม่ได้)
              */}
              {([
                { key: 'CONFIRMED', label: BOARD_STATUS.CONFIRMED.label, dot: BOARD_STATUS.CONFIRMED.dot, count: confirmedCount },
                { key: 'PENDING_CONFIRMATION', label: BOARD_STATUS.PENDING_CONFIRMATION.label, dot: BOARD_STATUS.PENDING_CONFIRMATION.dot, count: pendingCount },
              ] as const).map((c) => {
                const on = statusFilter === c.key;
                return (
                  <button
                    key={c.key}
                    type="button"
                    aria-pressed={on}
                    disabled={c.count === 0 && !on}
                    onClick={() => setStatusFilter(on ? null : c.key)}
                    title={on ? 'กดอีกครั้งเพื่อแสดงทุกคน' : `แสดงเฉพาะเจ้าหน้าที่ที่มีงาน${c.label}`}
                    className={cx(SUMMARY_CHIP, on ? 'zego-badge--info font-medium' : 'zego-surface-bg zego-border-color zego-text-secondary enabled:zego-hover-surface disabled:opacity-60')}
                  >
                    <span className={cx('h-2 w-2 rounded-full', c.dot)} />{c.label}
                    <span className={cx('text-[10px]', on ? 'zego-text-info' : 'zego-text-tertiary')}>{c.count}</span>
                  </button>
                );
              })}
              <button
                type="button"
                disabled={unassigned.length === 0}
                onClick={() => setIssueListKind('unassigned')}
                title="ดูรายการกรุ๊ปที่ยังไม่มีคนไปส่ง"
                className={cx(SUMMARY_CHIP, 'zego-surface-bg zego-border-color zego-text-secondary enabled:zego-hover-surface disabled:opacity-60')}
              >
                <span className="h-2 w-2 rounded-full zego-dot--slate" />ยังไม่มีคนไปส่ง
                <span className="text-[10px] zego-text-tertiary">{unassigned.length}</span>
              </button>
              <button
                type="button"
                disabled={issueJobs.length === 0}
                onClick={() => setIssueListKind('issue')}
                title="ดูรายการกรุ๊ปที่ต้องตรวจ"
                className={cx(SUMMARY_CHIP, issueJobs.length > 0 ? 'border-rose-300 bg-rose-50 font-medium zego-text-danger hover:bg-rose-100' : 'zego-surface-bg zego-border-color zego-text-secondary opacity-60')}
              >
                <span className="font-bold zego-text-danger">!</span>ต้องตรวจ
                <span className="text-[10px]">{issueJobs.length}</span>
              </button>
              {/* เวลานัดทับซ้อน — จัดได้ตามนโยบาย ไม่ใช่ปัญหา จึงแยกสีจาก "ต้องตรวจ" (ส้ม ไม่ใช่แดง) */}
              <button
                type="button"
                disabled={overlapJobs.length === 0}
                onClick={() => setIssueListKind('overlap')}
                title="เวลานัดทับซ้อนกับงานอื่นของคนเดียวกัน (สนามบินเดียวกัน) — จัดได้ตามนโยบาย แค่ต้องแจ้งให้เตรียมตัว"
                className={cx(SUMMARY_CHIP, overlapJobs.length > 0 ? 'border-orange-300 bg-orange-50 font-medium zego-text-orange hover:bg-orange-100' : 'zego-surface-bg zego-border-color zego-text-secondary opacity-60')}
              >
                <span className="font-bold zego-text-orange">⚠</span>ทับซ้อน
                <span className="text-[10px]">{overlapJobs.length}</span>
              </button>
            </div>
          </div>
        </div>
      </Card>

      {view === 'agenda' && <SendOffAgenda jobs={jobs} onOpen={setDetail} />}

      {/* ---------------- ตาราง ---------------- */}
      {view === 'board' && (
      <div className="w-full max-w-full">
        {/*
          เลื่อนดูวันอื่นทีละ VISIBLE_DAYS วัน — เดิมทำเป็นตารางกว้างเกินจอ + สกอลบาร์ + sticky คอลัมน์ชื่อ
          แต่ position:sticky ผิดเพี้ยนไม่เกาะซ้ายเมื่อสกอลไกลเกินราวความกว้าง 1 หน้าจอ (เจอทั้งใน demo และ
          เบราว์เซอร์จริงของผู้ใช้ ไม่ใช่บั๊กเครื่องมือทดสอบ) เปลี่ยนมาโชว์ทีละหน้าต่างวันแทนตัดปัญหานี้ทิ้งไปเลย
        */}
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium zego-text-secondary">
            {formatDate(visibleDays[0])} – {formatDate(visibleDays[visibleDays.length - 1])}
            {maxDayOffset === 0 && ' · ทั้งเดือน'}
          </span>
          <div className="flex items-center gap-2">
            {/* ย้ายมาไว้เหนือตารางปฏิทินโดยตรง ชิดขวาคู่กับปุ่มเลื่อนดูวัน (เดิมอยู่ในแถบเครื่องมือรวมกับปุ่มอื่น) —
                เป็นปุ่มที่ใช้บ่อยที่สุดของ Schedule Administrator ให้เห็นเด่นชัดตรงจุดที่กำลังดูตารางอยู่พอดี */}
            {canAssign && (
              <Button
                variant="secondary"
                size="sm"
                icon="grid"
                onClick={openAutoAssign}
                disabled={autoCandidates.length === 0}
                title={autoCandidates.length === 0
                  ? 'ไม่มีกรุ๊ปสถานะขาย CLOSED ที่ยังไม่มีคนไปส่งในเดือนนี้'
                  : `กระจายกรุ๊ปสถานะขาย CLOSED ที่ยังไม่มีคนไปส่ง ${autoCandidates.length} กรุ๊ป ให้เจ้าหน้าที่ทุกคนใกล้เคียงกันที่สุด (ร่างเบื้องต้น ปรับต่อได้)`}
              >
                จัดอัตโนมัติ
              </Button>
            )}
            {/* ย้ายมาต่อกับ "จัดอัตโนมัติ" — เป็นคู่ปุ่มที่ทำงานร่วมกัน (จัด/ล้างผลจัดอัตโนมัติ) ไว้ใกล้กัน */}
            {canAssign && (
              <Button
                variant="secondary"
                size="sm"
                icon="close"
                onClick={() => setClearAutoAssignConfirm(true)}
                disabled={autoAssigned.length === 0}
                title={autoAssigned.length === 0 ? 'ไม่มีงานที่จัดอัตโนมัติค้างอยู่' : `ล้างงานที่จัดอัตโนมัติ ${autoAssigned.length} กรุ๊ป กลับไปเป็นยังไม่มีคนไปส่ง`}
              >
                เคลียร์ที่จัดอัตโนมัติ
              </Button>
            )}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => goToPage(-1)}
                disabled={clampedDayOffset === 0}
                aria-label={`เลื่อนดูย้อนหลัง ${VISIBLE_DAYS} วัน`}
                title={`เลื่อนย้อนหลัง ${VISIBLE_DAYS} วัน`}
                className="zego-border-color rounded-full border zego-surface-bg p-1.5 zego-text-tertiary shadow-sm zego-hover-surface hover:text-[var(--zego-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--zego-surface)]"
              >
                <Icon name="chevronLeft" className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => goToPage(1)}
                disabled={clampedDayOffset >= maxDayOffset}
                aria-label={`เลื่อนดูล่วงหน้า ${VISIBLE_DAYS} วัน`}
                title={`เลื่อนล่วงหน้า ${VISIBLE_DAYS} วัน`}
                className="zego-border-color rounded-full border zego-surface-bg p-1.5 zego-text-tertiary shadow-sm zego-hover-surface hover:text-[var(--zego-text)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--zego-surface)]"
              >
                <Icon name="chevronRight" className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
        <div
          className="zego-card-surface w-full max-w-full overflow-x-hidden overflow-y-auto"
          style={{ maxHeight: 'calc(100vh - 16rem)', scrollbarGutter: 'stable' }}
        >
        {/* หัวตาราง (วันที่) — Sticky top ตอนสกอลแนวตั้ง (ไม่มีสกอลแนวนอนแล้ว จึงไม่ต้องใช้ sticky left อีก) */}
        <div className="zego-divider-bottom sticky top-0 z-30 zego-surface-soft-bg" style={{ display: 'grid', gridTemplateColumns: gridCols, height: HEAD_H }}>
          <div className="zego-border-color flex items-center truncate border-r zego-surface-soft-bg px-2 text-xs font-semibold zego-text-tertiary">
            {shownStaff.length} คน
          </div>
          {visibleDays.map((iso) => {
            const d = parseDate(iso);
            const weekend = d.getDay() === 0 || d.getDay() === 6;
            const holiday = holidays.get(iso);
            const isToday = iso === today;
            return (
              <div
                key={iso}
                title={holiday ? `${formatDate(iso)} — ${holiday.name}` : undefined}
                className={cx('zego-border-color flex min-w-0 flex-col items-center justify-center gap-0.5 border-r last:border-r-0', holiday ? 'bg-rose-50' : weekend && 'zego-surface-soft-bg')}
              >
                <span className={cx('text-[14px] font-semibold leading-none', isToday ? 'zego-today-badge inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full px-0.5' : holiday ? 'zego-text-danger' : weekend ? 'zego-text-danger' : 'zego-text-secondary')}>{d.getDate()}</span>
                <span className={cx('max-w-full truncate text-[10px] leading-tight', holiday ? 'font-semibold zego-text-danger' : weekend ? 'zego-text-danger' : 'zego-text-tertiary')}>{TH_WEEKDAYS_SHORT[d.getDay()]}</span>
              </div>
            );
          })}
        </div>

        {shownStaff.length === 0 ? (
          <EmptyState
            icon="users"
            title="ไม่มีเจ้าหน้าที่ตามตัวกรองนี้"
            description="ลองล้างคำค้นหรือเลือกประเภทอื่น · เพิ่มรายชื่อได้ที่เมนูเจ้าหน้าที่ส่งกรุ๊ป"
          />
        ) : (
          grouped.map(({ type, rows }) => rows.length === 0 ? null : (
            <div key={type}>
              <div className="zego-border-color border-y bg-[var(--zego-surface-inset)] px-3 py-1.5 text-xs font-semibold zego-text-secondary">
                {SEND_OFF_STAFF_TYPE[type].label} ({rows.length} คน) · {SEND_OFF_STAFF_TYPE[type].note}
                {type === 'employee' && ' · วันหยุดจัดได้ทุกช่วงเวลา'}
              </div>
              {rows.map((s) => {
                const mine = jobsByStaff.get(s.id) ?? [];
                const confirmed = confirmedCountByStaff.get(s.id) ?? 0;
                const pending = mine.length - confirmed;
                const cap = capOf(s.id);
                /*
                  ตัวเลขเทียบเพดานนับเฉพาะที่คอนเฟิร์มแล้ว — งานที่ยังรอคอนเฟิร์มไม่กินโควตา จึงบอกจำนวนไว้ต่อท้ายแยกเป็น "+N รอคอนเฟิร์ม"
                  มีเพดานตั้งไว้ต้องเห็น "0/N" ทันทีแม้ยังไม่มีงานคอนเฟิร์มเลย ไม่งั้นจะไม่รู้ว่าตั้งเพดานไว้แล้วจนกว่าจะมีงานแรก
                */
                // ไม่แสดงรหัสเจ้าหน้าที่ (SOS-xxx) — ผู้จัดดูจากชื่อ/ชื่อเล่นอยู่แล้ว รหัสทำให้บรรทัดรกเปล่า ๆ
                const countLabel = cap != null
                  ? `${confirmed}/${cap} กรุ๊ป`
                  // มีงานรอคอนเฟิร์มอยู่ (แม้ยังไม่มีที่คอนเฟิร์ม) ห้ามขึ้น "ยังไม่มีงาน" — อ่านแล้วขัดกับ "+N รอคอนเฟิร์ม" ด้านล่าง
                  : confirmed > 0 ? `${confirmed} กรุ๊ป` : pending > 0 ? 'ยังไม่มีงานที่คอนเฟิร์ม' : 'ยังไม่มีงาน';
                const countTone = cap != null && confirmed >= cap ? 'font-semibold zego-text-danger' : 'zego-text-tertiary';
                return (
                  <div key={s.id} className="zego-divider-bottom last:border-b-0" style={{ display: 'grid', gridTemplateColumns: gridCols, minHeight: rowHeight }}>
                    <div className="zego-border-color flex flex-col justify-center gap-0.5 border-r zego-surface-bg px-2 py-2">
                      {/* ชื่อ → หน้าต่างสรุปงานของคนนี้ในเดือนที่ดูอยู่ (กี่กรุ๊ป กรุ๊ปไหน วันไหน) — อยู่หน้าเดิม ไม่ต้องย้อนกลับมาตั้งเดือนใหม่ */}
                      <button
                        type="button"
                        onClick={() => setStaffSummary(s)}
                        title={`ดูงานของ ${sendOffStaffName(s)} เดือนนี้`}
                        className="truncate text-left text-sm font-semibold zego-text hover:underline"
                      >
                        {sendOffStaffName(s)}
                      </button>
                      {canAssign ? (
                        <button
                          type="button"
                          onClick={() => { setCapEditing(s); setCapDraft(cap != null ? String(cap) : ''); }}
                          title={`ตั้งเพดานกรุ๊ปเดือนนี้ให้ ${sendOffStaffName(s)}`}
                          className={cx('truncate text-left text-xs underline decoration-dotted decoration-slate-300 underline-offset-2 hover:decoration-slate-500', countTone)}
                        >
                          {countLabel}
                        </button>
                      ) : (
                        <span className={cx('truncate text-xs', countTone)}>{countLabel}</span>
                      )}
                      {/* ยังไม่กินโควตาเพดาน แต่ผู้จัดต้องเห็นว่ามีงานรอกดยืนยันอยู่กี่กรุ๊ป — ยืนยันหลายคนพร้อมกันได้ที่ปุ่ม "ยืนยันรายบุคคล" บนแถบเครื่องมือแทน ไม่ทำเป็นปุ่มที่แถวนี้ */}
                      {pending > 0 && (
                        <span className="truncate text-xs font-medium zego-text-warning">+{pending} รอคอนเฟิร์ม</span>
                      )}
                      {s.phone && <span className="truncate text-xs zego-text-tertiary">{s.phone}</span>}
                      {!canSendOffByStatus(s.status) && (
                        <StatusBadge meta={SEND_OFF_STAFF_STATUS[s.status]} size="sm" />
                      )}
                    </div>
                    {visibleDays.map((iso) => dayCell(iso, s.id, mine,
                      canAssign && canSendOffByStatus(s.status) ? () => setAddTarget({ staff: s, date: iso }) : undefined))}
                  </div>
                );
              })
              }
            </div>
          ))
        )}
        </div>
      </div>
      )}

      {/* ---------------- กรุ๊ปทั้งหมดของวันนั้น — ยืนยัน/ถอดคนได้ทันทีจากรายการ ไม่ต้องเปิดรายละเอียดทีละกรุ๊ป ---------------- */}
      {dayList && (() => {
        /* ดึงจาก jobsByStaff สดทุกครั้ง (ไม่ใช่ snapshot ตอนเปิด) เพื่อให้กดถอดคนแล้วรายการอัปเดตทันที */
        const dayJobs = (jobsByStaff.get(dayList.staffId) ?? []).filter((j) => j.dutyDate === dayList.date);
        const staffObj = staffById.get(dayList.staffId);
        /* ลาอยู่วันนี้ห้ามจัดเพิ่ม — เงื่อนไขเดียวกับที่บล็อกคลิกช่องวันว่างตอนลาอยู่ */
        const onLeaveThisDay = (approvedLeaveByStaff.get(dayList.staffId) ?? []).some((r) => leaveCoversDate(r, dayList.date));
        return (
          <Modal
            open
            onClose={() => setDayList(null)}
            size="lg"
            title={`กรุ๊ปวันที่ ${formatDate(dayList.date)}${staffObj ? ` · ${sendOffStaffName(staffObj)}` : ''}`}
            description={`${dayJobs.length} กรุ๊ป${onLeaveThisDay ? ' · ลาอยู่วันนี้ — จัดกรุ๊ปเพิ่มไม่ได้' : ''}`}
            footer={
              <div className="flex w-full items-center justify-between gap-2">
                {/*
                  วันที่มีกรุ๊ปอยู่แล้วยังจัดเพิ่มได้ — เดิมคลิกช่องวันจะเปิดรายการนี้เสมอ ไม่มีทางกลับไปหน้าจัดกรุ๊ปใหม่ได้เลย
                  ยกเว้นวันที่ลาอยู่ — ห้ามจัดเพิ่มเหมือนช่องวันว่าง (ดูรายการ/จัดการกรุ๊ปที่ชนกันอยู่แล้วได้ตามปกติ แค่เพิ่มใหม่ไม่ได้)
                */}
                {staffObj && canAssign && canSendOffByStatus(staffObj.status) && !onLeaveThisDay ? (
                  <Button
                    variant="secondary"
                    icon="plus"
                    onClick={() => { const s = staffObj; const d = dayList.date; setDayList(null); setAddTarget({ staff: s, date: d }); }}
                  >
                    เพิ่มกรุ๊ปวันนี้
                  </Button>
                ) : <span />}
                <Button variant="secondary" onClick={() => setDayList(null)}>ปิด</Button>
              </div>
            }
          >
            <div className="space-y-1">
              {dayJobs.length === 0 ? (
                <p className="py-4 text-center text-sm zego-text-tertiary">ไม่มีกรุ๊ปแล้ว</p>
              ) : (
                dayJobs.map((j) => {
                  const issue = jobIssue(j);
                  const overlap = jobOverlapWarning(j);
                  return (
                    <div
                      key={j.period.internalId}
                      className="zego-border-color flex items-center justify-between gap-2 rounded-lg border px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold zego-text">{j.period.groupCode}</span>
                        <span className="flex flex-wrap items-center gap-1 truncate text-xs zego-text-tertiary">
                          {j.period.countryName} · {j.staff ? sendOffStaffName(j.staff) : 'ยังไม่มีคนไปส่ง'}
                          {j.assignment && <StatusBadge meta={BOARD_STATUS[jobStatus(j)]} size="sm" />}
                          {j.assignment?.note === AUTO_ASSIGN_NOTE && (
                            <span className="zego-badge--indigo rounded border px-1 py-0.5 text-[10px] font-medium">อัตโนมัติ</span>
                          )}
                        </span>
                        {/* คำเตือน/เรื่องต้องตรวจ — ย้ายมาจาก Modal รายละเอียดเดิม จะได้ไม่ต้องเปิดซ้ำอีกชั้น */}
                        {issue ? (
                          <span className="block text-[11px] font-medium zego-text-danger">! {issue}</span>
                        ) : overlap && (
                          <span className="block text-[11px] font-medium zego-text-orange">⚠ {overlap}</span>
                        )}
                      </div>
                      <span className={cx('shrink-0 rounded border px-1.5 py-0.5 text-[11px] font-semibold', CHECK_TONE[j.check?.kind ?? jobArrival(j.flightTime).kind])}>
                        {chipTime(j)}
                      </span>
                      {/* เปลี่ยนคนทำได้ทางเดียวคือถอดแล้วไปจัดใหม่ — ยืนยัน/ยกเลิกคอนเฟิร์มขึ้นตามสถานะจริงของกรุ๊ปนั้น */}
                      {canAssign && (
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          {j.assignment?.status === 'PENDING_CONFIRMATION' && (
                            <Button size="sm" variant="primary" icon="check" onClick={() => doConfirm(j)}>
                              ยืนยัน
                            </Button>
                          )}
                          {j.assignment?.status === 'CONFIRMED' && (
                            <Button size="sm" variant="secondary" icon="x" onClick={() => doUnconfirm(j)}>
                              ยกเลิกคอนเฟิร์ม
                            </Button>
                          )}
                          <Button size="sm" variant="danger" icon="close" onClick={() => doUnassign(j)}>
                            ถอดคนไปส่ง
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </Modal>
        );
      })()}

      {/* ---------------- รายชื่อกรุ๊ปตามที่กดจากแถบสรุป — กด "ต้องตรวจ"/"ทับซ้อน" แล้วไม่ต้องไล่หาเองทั้งตาราง ---------------- */}
      {issueListKind && (
        <Modal
          open
          onClose={() => setIssueListKind(null)}
          size="lg"
          title={issueListKind === 'issue' ? `กรุ๊ปที่ต้องตรวจ (${issueJobs.length})`
            : issueListKind === 'overlap' ? `กรุ๊ปที่เวลานัดทับซ้อน (${overlapJobs.length})`
              : `กรุ๊ปที่ยังไม่มีคนไปส่ง (${unassigned.length})`}
          description={issueListKind === 'unassigned'
            ? 'จัดคนได้โดยคลิกช่องวันที่ของเจ้าหน้าที่ในตาราง หรือกด Auto Assign เพื่อกระจายงานให้อัตโนมัติ'
            : 'กดที่กรุ๊ปเพื่อเปิดรายละเอียด'}
          footer={<div className="flex justify-end"><Button variant="secondary" onClick={() => setIssueListKind(null)}>ปิด</Button></div>}
        >
          {issueListKind === 'unassigned' ? (
            /*
              จัดกลุ่มตามวันที่ต้องไปส่ง (หัววันติดด้านบนตอนเลื่อน) — แถว: รหัสกรุ๊ป + โปรแกรม (ตัดคำ) ซ้าย · สนามบิน/เวลา ขวา (คอลัมน์คงที่)
              เดิมวางแบบ flex-wrap ชื่อโปรแกรมยาวแล้วดันเวลาไปบรรทัดใหม่ ทำให้แถวไม่ตรงกัน
            */
            <div className="space-y-3">
              {(() => {
                const byDate = new Map<string, SendOffJob[]>();
                for (const j of [...unassigned].sort((x, y) => x.dutyDate.localeCompare(y.dutyDate) || chipTime(x).localeCompare(chipTime(y)))) {
                  byDate.set(j.dutyDate, [...(byDate.get(j.dutyDate) ?? []), j]);
                }
                return [...byDate.entries()].map(([date, list]) => (
                  <section key={date}>
                    <h4 className="sticky top-0 z-10 flex items-center justify-between rounded-md zego-surface-soft-bg px-3 py-1.5 text-xs font-semibold zego-text">
                      <span>{formatDate(date)}</span>
                      <span className="font-normal zego-text-tertiary">{list.length} กรุ๊ป</span>
                    </h4>
                    <ul className="divide-y divide-[var(--zego-border-soft)]">
                      {list.map((j) => (
                        <li key={j.period.internalId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 px-3 py-2">
                          <span className="min-w-0">
                            <span className="block font-mono text-sm font-bold zego-text">{j.period.groupCode}</span>
                            <span className="block truncate text-xs zego-text-tertiary" title={`${j.period.countryName} · ${j.period.displayName}`}>
                              {j.period.countryName} · {j.period.displayName}
                            </span>
                          </span>
                          <span className="whitespace-nowrap text-right text-xs tabular-nums">
                            <span className="block font-medium zego-text">นัด {chipTime(j)}</span>
                            <span className="block zego-text-tertiary">{j.airport || '-'}{j.flightTime ? ` · บิน ${j.flightTime}` : ''}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                ));
              })()}
            </div>
          ) : (
          <ul className="space-y-1.5">
            {(issueListKind === 'issue' ? issueJobs : overlapJobs).map((j) => {
              const reason = issueListKind === 'issue' ? jobIssue(j) : jobOverlapWarning(j);
              return (
                <li key={j.period.internalId}>
                  <button
                    type="button"
                    onClick={() => { setIssueListKind(null); setDetail(j); }}
                    className="zego-border-color zego-hover-selected flex w-full flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left"
                  >
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold zego-text">{j.period.groupCode}</span>
                      <span className="text-xs zego-text-tertiary">{formatDate(j.dutyDate)}</span>
                    </span>
                    <span className="text-xs zego-text-secondary">{j.staff ? sendOffStaffName(j.staff) : 'ยังไม่มีคนไปส่ง'}</span>
                    <span className={cx('text-[11px] font-medium', issueListKind === 'issue' ? 'zego-text-danger' : 'zego-text-orange')}>
                      {issueListKind === 'issue' ? '! ' : '⚠ '}{reason}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          )}
        </Modal>
      )}

      {/* ---------------- จัดกรุ๊ปให้เจ้าหน้าที่ (ทิศทางเดียวกับตารางหัวหน้าทัวร์) ---------------- */}
      {addTarget && (
        <AddSendOffPanel
          /* เปิดใหม่ทุกครั้ง — คำค้นและกรุ๊ปที่เลือกไว้ต้องไม่ค้างจากรอบก่อน */
          key={`${addTarget.staff.id}-${addTarget.date}`}
          staff={addTarget.staff}
          maxGroupsPerMonth={capOf(addTarget.staff.id)}
          rules={rules}
          dayOffOf={dayOffOf}
          date={addTarget.date}
          monthStart={monthStart}
          monthEnd={monthEnd}
          monthLabel={formatThaiMonthYear(cursor)}
          jobs={jobs}
          manualTimes={manualTimes}
          manualAirports={manualAirports}
          leaves={approvedLeaveByStaff.get(addTarget.staff.id) ?? []}
          onClose={() => setAddTarget(null)}
          onAssignMany={(list) => doAssignMany(addTarget.staff, list)}
          onSaveFlightTime={saveFlightTime}
          onSaveAirport={saveAirport}
        />
      )}

      {/* ---------------- รายละเอียดงานที่จัดแล้ว ---------------- */}
      {/* ---------------- สรุปงานรายบุคคลของเดือนนี้ — กี่กรุ๊ป กรุ๊ปไหน วันไหน ---------------- */}
      {staffSummary && (() => {
        const mine = jobsByStaff.get(staffSummary.id) ?? [];
        const confirmed = mine.filter((j) => j.assignment?.status === 'CONFIRMED').length;
        return (
          <Modal
            open
            onClose={() => setStaffSummary(null)}
            size="lg"
            title={sendOffStaffName(staffSummary)}
            description={`${formatThaiMonthYear(cursor)} · ไปส่ง ${mine.length} กรุ๊ป${mine.length > 0 ? ` (คอนเฟิร์มแล้ว ${confirmed} · รอคอนเฟิร์ม ${mine.length - confirmed})` : ''}`}
          >
            {mine.length === 0 ? (
              <EmptyState icon="calendar" title="เดือนนี้ยังไม่มีกรุ๊ปที่ต้องไปส่ง" />
            ) : (
              <SendOffAgenda jobs={mine} singleStaff />
            )}
          </Modal>
        );
      })()}

      {detail && detail.staff && (
        <Modal
          open
          onClose={() => setDetail(null)}
          title={`${detail.period.groupCode} · คนไปส่ง`}
          description={`${detail.period.countryName} · ออกเดินทาง ${formatDate(detail.period.startDate)} · ${airportLabel(detail.airport)}`}
          footer={
            <div className="flex flex-wrap items-center justify-between gap-2">
              {canAssign ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" icon="close" onClick={() => doUnassign(detail)}>ถอดคนไปส่ง</Button>
                  {detail.assignment?.status === 'PENDING_CONFIRMATION' && (
                    <Button variant="primary" icon="check" onClick={() => doConfirm(detail)}>ยืนยันรับงาน</Button>
                  )}
                  {detail.assignment?.status === 'CONFIRMED' && (
                    <Button variant="secondary" icon="x" onClick={() => doUnconfirm(detail)}>ยกเลิกคอนเฟิร์ม</Button>
                  )}
                </div>
              ) : <span />}
              <div className="flex flex-wrap gap-2">
                {/* เปลี่ยนคน = ถอดออกแล้วไปคลิกช่องวันของคนใหม่ ทิศทางเดียวกับตารางหัวหน้าทัวร์ */}
                <Button variant="secondary" onClick={() => setDetail(null)}>ปิด</Button>
              </div>
            </div>
          }
        >
          <div className="space-y-3 text-sm">
            <StatusBadge meta={BOARD_STATUS[jobStatus(detail)]} />
            {detail.assignment?.note === AUTO_ASSIGN_NOTE && (
              <div className="zego-badge--indigo rounded-lg border px-3 py-2 text-xs">
                จัดโดย Auto Assignment — ยังเป็นแค่ร่างเบื้องต้น ตรวจสอบและปรับเปลี่ยนคนได้ตามปกติ
              </div>
            )}
            {detail.dayOff && detail.staff?.staffType === 'employee' && (
              <div className="zego-badge--violet rounded-lg border px-3 py-2 text-xs">
                {detail.dayOff.label} — ไม่ติดงานประจำ จัดได้ทุกช่วงเวลาเท่าประเภทประจำ
              </div>
            )}

            {/* ผลตรวจกับงานอื่นของคนเดียวกัน — เรื่องนี้สำคัญกว่าเรื่องเวลางานประจำ จึงขึ้นก่อน */}
            {detail.hardConflict && (
              <div className="zego-badge--danger rounded-lg border px-3 py-2 text-xs">
                กับ {detail.hardConflict.withGroupCode}: {detail.hardConflict.check.reason}
              </div>
            )}
            {jobOverlapWarning(detail) && (
              <div className="zego-badge--orange rounded-lg border px-3 py-2 text-xs">
                ⚠ {jobOverlapWarning(detail)}
              </div>
            )}
            {detail.conflict?.check.airportPending && (
              <div className="zego-badge--warning rounded-lg border px-3 py-2 text-xs">
                {detail.airport
                  ? `ยังไม่รู้สนามบินของ ${detail.conflict.withGroupCode} — ใช้เกณฑ์สนามบินเดียวกันไปก่อน ตรวจอีกครั้งเมื่อข้อมูลเที่ยวบินเข้ามา`
                  : 'ยังไม่รู้สนามบินของกรุ๊ปนี้เอง — ใช้เกณฑ์สนามบินเดียวกันไปก่อน ตรวจอีกครั้งเมื่อข้อมูลเที่ยวบินเข้ามา'}
              </div>
            )}
            <div className={cx('rounded-lg border px-3 py-2 text-xs', CHECK_TONE[detail.check?.kind ?? 'unknown'])}>
              {detail.check?.reason ?? 'ยังไม่รู้เวลาเครื่องออก'}
            </div>
            {detail.check?.kind === 'blocked' && (
              <p className="text-xs zego-text-danger">
                ช่วงที่ต้องอยู่กับกรุ๊ปนี้ทับซ้อนกับเวลางานประจำของคนนี้ — เปลี่ยนเป็นประเภทประจำ หรือเลือกคนอื่นที่ว่างช่วงนั้น
              </p>
            )}
            {detail.check?.kind === 'unknown' && (
              <p className="text-xs zego-text-warning">
                กรุ๊ปนี้ยังไม่มีเวลาเครื่องออกในระบบ จึงยังคำนวณเวลาไปถึงไม่ได้ — จัดคนไว้ก่อนได้ แต่ต้องกลับมาตรวจเมื่อเวลาบินเข้ามา
              </p>
            )}
          </div>
        </Modal>
      )}

      {/* ---------------- ยืนยัน Auto Assignment — สรุปก่อนลงมือเสมอ ผลลัพธ์เป็นร่างเบื้องต้นเท่านั้น ---------------- */}
      <ConfirmDialog
        open={autoAssignPreview !== null}
        onClose={() => setAutoAssignPreview(null)}
        onConfirm={confirmAutoAssign}
        title="จัดอัตโนมัติ (ร่างเบื้องต้น) — เฉพาะกรุ๊ป CLOSED"
        message={autoAssignPreview
          ? [
            // บอกเงื่อนไขก่อน — นำมาจัดเฉพาะกรุ๊ปที่ปิดขายแล้ว (CLOSED) · กรุ๊ปที่ยังขายอยู่ไม่ถูกแตะ
            `เงื่อนไข: นำมาจัดเฉพาะกรุ๊ปสถานะขาย CLOSED ที่ยังไม่มีคนไปส่ง ${autoCandidates.length} กรุ๊ป`
              + (unassigned.length > autoCandidates.length
                ? ` · กรุ๊ปสถานะอื่น (เช่น SELL) อีก ${unassigned.length - autoCandidates.length} กรุ๊ปไม่นำมาจัด — จัดเองทีละกรุ๊ปได้`
                : ''),
            `${summarizeAutoAssign(autoAssignPreview.result, autoAssignPreview.staffCount)} ของเดือน ${formatThaiMonthYear(cursor)}`,
            'สถานะเริ่มที่ "รอคอนเฟิร์ม" ทุกกรุ๊ปเหมือนจัดมือ ต้องคุยกับเจ้าหน้าที่แล้วกดยืนยันทีละกรุ๊ปอีกที และยังปรับเปลี่ยนหรือย้ายคนเองได้ตามปกติหลังจากนี้',
          ].join('\n\n')
          : ''}
        confirmLabel="จัดอัตโนมัติ"
        tone="primary"
      />

      {/* ---------------- ยืนยันเคลียร์ผลจัดอัตโนมัติ — ล้างเฉพาะที่ยังไม่ถูกปรับด้วยมือ ---------------- */}
      <ConfirmDialog
        open={clearAutoAssignConfirm}
        onClose={() => setClearAutoAssignConfirm(false)}
        onConfirm={confirmClearAutoAssign}
        title="เคลียร์ที่จัดอัตโนมัติ"
        message={`ล้างงานที่จัดด้วย Auto Assignment ${autoAssigned.length} กรุ๊ป กลับไปเป็น "ยังไม่มีคนไปส่ง" — งานที่ถูกปรับด้วยมือไปแล้วจะไม่ถูกแตะ`}
        confirmLabel="เคลียร์"
        tone="danger"
      />

      {/* ---------------- ยืนยันงานที่รอคอนเฟิร์มทั้งเดือนพร้อมกัน ---------------- */}
      <ConfirmDialog
        open={confirmAllOpen}
        onClose={() => setConfirmAllOpen(false)}
        onConfirm={() => { confirmAllPending(); setConfirmAllOpen(false); }}
        title="ยืนยันงานที่รอคอนเฟิร์มทั้งหมด"
        message={`ยืนยันว่าเจ้าหน้าที่ทุกคนรับงานที่รอคอนเฟิร์มอยู่ตอนนี้ ${pendingCount} กรุ๊ปในเดือน ${formatThaiMonthYear(cursor)} — ใช้เมื่อคุยกับทุกคนเรียบร้อยแล้วเท่านั้น`}
        confirmLabel="ยืนยันทั้งหมด"
        tone="primary"
      />

      {/* ---------------- ยืนยันรายบุคคล — เลือกได้มากกว่า 1 คน แล้วยืนยันพร้อมกันทีเดียว ---------------- */}
      {confirmPickOpen && (
        <Modal
          open
          onClose={() => setConfirmPickOpen(false)}
          size="lg"
          title="ยืนยันรายบุคคล"
          description={`${formatThaiMonthYear(cursor)} · เลือกเจ้าหน้าที่ได้มากกว่า 1 คน แล้วยืนยันงานที่รอคอนเฟิร์มของทุกคนที่เลือกพร้อมกันทีเดียว`}
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-xs zego-text-tertiary">
                {confirmPickIds.size > 0 ? `เลือกไว้ ${confirmPickIds.size} คน` : 'ยังไม่ได้เลือก'}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmPickOpen(false)}>ยกเลิก</Button>
                <Button variant="primary" disabled={confirmPickIds.size === 0} onClick={submitConfirmPick}>
                  ยืนยันที่เลือก{confirmPickIds.size > 0 ? ` (${confirmPickIds.size} คน)` : ''}
                </Button>
              </div>
            </div>
          }
        >
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {SEND_OFF_STAFF_TYPE_ORDER.map((t) => {
              const rows = staff.filter((s) => s.staffType === t && (pendingCountByStaff.get(s.id) ?? 0) > 0);
              if (rows.length === 0) return null;
              return (
                <div key={t}>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide zego-text-tertiary">
                    {SEND_OFF_STAFF_TYPE[t].label}
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((s) => {
                      const n = pendingCountByStaff.get(s.id) ?? 0;
                      const checked = confirmPickIds.has(s.id);
                      return (
                        <label
                          key={s.id}
                          className={cx(
                            'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2',
                            checked ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-hover-surface',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleConfirmPick(s.id)}
                              className="zego-checkbox-empty h-4 w-4 shrink-0 rounded"
                            />
                            <span className="truncate text-sm font-medium zego-text">{sendOffStaffName(s)}</span>
                          </span>
                          <span className="shrink-0 text-xs font-medium zego-text-warning">{n} กรุ๊ปรอคอนเฟิร์ม</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* ---------------- ยกเลิกคอนเฟิร์มทั้งเดือนพร้อมกัน ---------------- */}
      <ConfirmDialog
        open={unconfirmAllOpen}
        onClose={() => setUnconfirmAllOpen(false)}
        onConfirm={() => { unconfirmSelected(); setUnconfirmAllOpen(false); }}
        title="ยกเลิกคอนเฟิร์มทั้งหมด"
        message={`ยกเลิกคอนเฟิร์มของเจ้าหน้าที่ทุกคนที่คอนเฟิร์มแล้วตอนนี้ ${confirmedCount} กรุ๊ปในเดือน ${formatThaiMonthYear(cursor)} — กลับไปเป็นรอคอนเฟิร์ม ไม่ได้ถอดคนออก`}
        confirmLabel="ยกเลิกคอนเฟิร์มทั้งหมด"
        tone="danger"
      />

      {/* ---------------- ยกเลิกคอนเฟิร์มรายบุคคล — เลือกได้มากกว่า 1 คน แล้วยกเลิกพร้อมกันทีเดียว ---------------- */}
      {unconfirmPickOpen && (
        <Modal
          open
          onClose={() => setUnconfirmPickOpen(false)}
          size="lg"
          title="ยกเลิกคอนเฟิร์มรายบุคคล"
          description={`${formatThaiMonthYear(cursor)} · เลือกเจ้าหน้าที่ได้มากกว่า 1 คน แล้วยกเลิกคอนเฟิร์มของทุกคนที่เลือกพร้อมกันทีเดียว — กลับไปเป็นรอคอนเฟิร์ม`}
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <span className="text-xs zego-text-tertiary">
                {unconfirmPickIds.size > 0 ? `เลือกไว้ ${unconfirmPickIds.size} คน` : 'ยังไม่ได้เลือก'}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setUnconfirmPickOpen(false)}>ยกเลิก</Button>
                <Button variant="danger" disabled={unconfirmPickIds.size === 0} onClick={submitUnconfirmPick}>
                  ยกเลิกคอนเฟิร์มที่เลือก{unconfirmPickIds.size > 0 ? ` (${unconfirmPickIds.size} คน)` : ''}
                </Button>
              </div>
            </div>
          }
        >
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {SEND_OFF_STAFF_TYPE_ORDER.map((t) => {
              const rows = staff.filter((s) => s.staffType === t && (confirmedCountByStaff.get(s.id) ?? 0) > 0);
              if (rows.length === 0) return null;
              return (
                <div key={t}>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide zego-text-tertiary">
                    {SEND_OFF_STAFF_TYPE[t].label}
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((s) => {
                      const n = confirmedCountByStaff.get(s.id) ?? 0;
                      const checked = unconfirmPickIds.has(s.id);
                      return (
                        <label
                          key={s.id}
                          className={cx(
                            'flex cursor-pointer items-center justify-between gap-3 rounded-md border px-3 py-2',
                            checked ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-hover-surface',
                          )}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleUnconfirmPick(s.id)}
                              className="zego-checkbox-empty h-4 w-4 shrink-0 rounded"
                            />
                            <span className="truncate text-sm font-medium zego-text">{sendOffStaffName(s)}</span>
                          </span>
                          <span className="shrink-0 text-xs font-medium zego-text-success">{n} กรุ๊ปคอนเฟิร์มแล้ว</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      {/* ---------------- ตั้งเพดานกรุ๊ปต่อเดือน — เฉพาะเดือนที่กำลังดูอยู่เท่านั้น ไม่มีค่าเริ่มต้นข้ามเดือน ---------------- */}
      {capEditing && (
        <Modal
          open
          onClose={() => setCapEditing(null)}
          size="sm"
          title={`ตั้งเพดานกรุ๊ปเดือนนี้ — ${sendOffStaffName(capEditing)}`}
          description={`${formatThaiMonthYear(cursor)} · ตั้งเฉพาะเดือนนี้เท่านั้น ไม่มีผลกับเดือนอื่น`}
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => saveMonthlyCap(capEditing.id, null)}>ล้างเพดาน (ไม่จำกัด)</Button>
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setCapEditing(null)}>ยกเลิก</Button>
                <Button
                  variant="primary"
                  disabled={capDraft.trim() === '' || Number(capDraft) < 0 || !Number.isFinite(Number(capDraft))}
                  onClick={() => saveMonthlyCap(capEditing.id, Math.round(Number(capDraft)))}
                >
                  บันทึก
                </Button>
              </div>
            </div>
          }
        >
          <TextInput
            label="เพดานกรุ๊ปสูงสุดเดือนนี้"
            type="number"
            min={0}
            step={1}
            value={capDraft}
            onChange={(e) => setCapDraft(e.target.value)}
            hint={`ตอนนี้คอนเฟิร์มแล้ว ${confirmedCountByStaff.get(capEditing.id) ?? 0} กรุ๊ปในเดือนนี้ — เพดานนับเฉพาะที่คอนเฟิร์มแล้ว`}
          />
        </Modal>
      )}

      {/* ---------------- ตั้งเพดานกรุ๊ปต่อเดือนของทุกคนในหน้าต่างเดียว — เลี่ยงการกดทีละคน ---------------- */}
      {capBulkOpen && (
        <Modal
          open
          onClose={() => setCapBulkOpen(false)}
          size="lg"
          title="ตั้งเพดานกรุ๊ปเดือนนี้ — ทุกคน"
          description={`${formatThaiMonthYear(cursor)} · เว้นว่าง = ไม่จำกัด · มีผลเฉพาะเดือนนี้เท่านั้น`}
          footer={
            <div className="flex w-full items-center justify-end gap-2">
              <Button variant="secondary" onClick={() => setCapBulkOpen(false)}>ยกเลิก</Button>
              <Button variant="primary" onClick={saveCapBulk}>บันทึกทั้งหมด</Button>
            </div>
          }
        >
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {SEND_OFF_STAFF_TYPE_ORDER.map((t) => {
              const rows = staff.filter((s) => s.staffType === t);
              if (rows.length === 0) return null;
              return (
                <div key={t}>
                  <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide zego-text-tertiary">
                    {SEND_OFF_STAFF_TYPE[t].label}
                  </div>
                  <div className="space-y-1.5">
                    {rows.map((s) => (
                      <div key={s.id} className="zego-border-color flex items-center justify-between gap-3 rounded-md border px-3 py-1.5">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium zego-text">{sendOffStaffName(s)}</div>
                          <div className="text-xs zego-text-tertiary">คอนเฟิร์มแล้ว {confirmedCountByStaff.get(s.id) ?? 0} กรุ๊ปเดือนนี้</div>
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={1}
                          placeholder="ไม่จำกัด"
                          value={capBulkDraft[s.id] ?? ''}
                          onChange={(e) => setCapBulkDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                          className="zego-border-color w-24 shrink-0 rounded-md border px-2 py-1 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}
    </div>
  );
}
