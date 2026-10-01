/**
 * จัดอัตโนมัติ — ตารางเจ้าหน้าที่ส่งกรุ๊ป
 *
 * ผลลัพธ์ถือเป็น "ร่างเบื้องต้น" (Initial Schedule) เท่านั้น — Schedule Administrator ปรับเปลี่ยน/เกลี่ยงานเองภายหลังได้เสมอ
 * เป้าหมาย: กระจายงานให้เจ้าหน้าที่ทุกคนได้จำนวนงานใกล้เคียงกันที่สุด โดยไม่ละเมิดเงื่อนไขที่จัดไม่ได้จริง
 *   (เวลางานประจำของประเภทพนักงาน / วันลาที่คอนเฟิร์มแล้ว / งานชนข้ามสนามบิน — เกณฑ์เดียวกับที่ตารางใช้ตรวจตอนจัดมือ)
 *
 * หลักการแบ่งงาน — คำนวณจากวันก่อนเสมอ แล้วค่อยไล่ขึ้นสัปดาห์ สุดท้ายกันไม่ให้ยอดรวมทั้งเดือนถ่างออกข้ามสัปดาห์:
 *   1) รายวัน (ตัวตัดสินหลัก) — วันไหนมีหลายกรุ๊ป ให้กระจายไปคนละคนก่อนเสมอ ใครยังไม่มีงานวันนั้นได้ก่อนคนที่มีแล้ว
 *   2) รายสัปดาห์ (ตัวตัดสินรอง เมื่อวันเสมอกัน) — ใครภาระน้อยสุดในสัปดาห์นั้นได้ก่อน กันไม่ให้ไปกองที่คนเดิมทั้งสัปดาห์
 *      แม้แต่ละวันจะเสมอกันก็ตาม (บางคน 14 กรุ๊ป บางคน 15 กรุ๊ปต่อสัปดาห์ถือว่าใกล้เคียงกันพอ) — ต้องมาก่อนยอดรวมทั้งเดือนเสมอ
 *      ไม่งั้นคนที่ยอดเดือนตามหลังจะถูกยัดงานเกือบทั้งสัปดาห์รวดเดียวเพื่อไล่ตามยอด ทำให้บางสัปดาห์กระจุกบางสัปดาห์โหว่แทนที่
 *      จะสม่ำเสมอในแต่ละสัปดาห์ (ซึ่งขัดกับข้อ 2 เอง)
 *   3) รายเดือน (ตัวตัดสินท้ายสุด เมื่อวันและสัปดาห์เสมอกันพอดี) — ใครยอดรวมทั้งเดือนน้อยกว่าได้ก่อน กันยอดรวมทั้งเดือน
 *      ถ่างออกสะสมข้ามหลายสัปดาห์ (เช่นประเภทพนักงานติดเวลางานบ่อยกว่าในรูปแบบเดิมซ้ำ ๆ ทุกสัปดาห์) โดยไม่ไปรบกวนความ
 *      สม่ำเสมอภายในแต่ละสัปดาห์ที่ข้อ 2 ดูแลอยู่แล้ว — เกลี่ยแล้วทั้งเดือนควรห่างกันไม่เกิน 2-3 กรุ๊ป (ประเภทพนักงานห่างกัน
 *      เองไม่เกิน 1-2 กรุ๊ป)
 *
 * เวลานัดทับซ้อนกัน (สนามบินเดียวกัน ห่างไม่ถึงเกณฑ์ที่แนะนำ) ไม่ใช่กฎตายตัว — พยายามเลี่ยงก่อนเสมอ (จัดให้คนที่ไม่ชน
 * ใครก่อน) แต่ถ้าวันนั้นกรุ๊ปเยอะกว่าคนว่างจริง ๆ ก็ยอมให้ทับซ้อนได้แทนที่จะปล่อยกรุ๊ปนั้นค้างไม่มีคนไปส่งเลย
 * (บันทึกลง plan ว่ารายการไหน "ทับซ้อน" ไว้ด้วย — ข้อมูลที่บันทึกจริงจะโชว์ป้ายเตือนให้เจ้าหน้าที่เตรียมตัวถูก ดู jobOverlapWarning)
 *
 * วิธีคิด: เรียงงานตามเวลาที่ต้องไปถึงสนามบินก่อน-หลัง แล้ว "หยิบคนภาระน้อยสุดในวันนั้น (เสมอกันดูสัปดาห์ เสมอกันอีกดูเดือน)
 * ที่จัดได้จริง" ให้ทีละงาน (greedy least-loaded-per-day-then-week-then-month) — ไม่ใช่คำตอบที่เหมาะที่สุดในทุกกรณี
 * (สลับลำดับอาจจัดได้ครบกว่านี้) แต่เข้าใจง่ายและตรงกับที่ผู้จัดคนจริงจะคิด — งานที่จัดอัตโนมัติไม่ได้เลย (ชนเวลางานประจำ/ลา/
 * ชนข้ามสนามบิน) ให้ตกค้างไว้ให้ผู้จัดเลือกเอง ไม่เดา
 *
 * ตรรกะล้วน ไม่แตะ localStorage — เรียกจากหน้าจอแล้วค่อยวนเรียก store ทีละงานเหมือน doAssignMany เดิม
 */

import { canSendOffByStatus, checkSendOff, reachedMonthlyCapacity, type SendOffStaffStatus, type SendOffStaffType } from './sendOffStaff';
import { hardConflictWith, worstSendOffPair, type SendOffRules, type SendOffSlot } from './sendOffRules';

export interface AutoAssignJobInput {
  periodId: string;
  /** วันที่ต้องไปส่งจริง — ใช้เทียบกับวันลา และแบ่งกลุ่มภาระงานรายสัปดาห์ */
  dutyDate: string;
  flightTime: string | null;
  isDayOff: boolean;
  dayOffLabel?: string;
  /** เวลาสัมบูรณ์ของงานนี้ (คำนวณไว้แล้วจาก sendOffSlot) — null เมื่อยังไม่รู้เวลาเครื่องออกหรือวันที่ผิดรูปแบบ */
  slot: SendOffSlot | null;
}

export interface AutoAssignStaffInput {
  id: string;
  staffType: SendOffStaffType;
  status: SendOffStaffStatus;
  /**
   * งานที่มีอยู่แล้วในเดือนนี้ก่อนรันอัตโนมัติ (ไม่รวมงานที่ถูกปฏิเสธ — คนนั้นไม่ได้ไปแล้ว) พร้อมวันที่ต้องไปส่งจริงของแต่ละงาน
   * ใช้ทั้งนับภาระเริ่มต้นรายสัปดาห์ (ต้องรู้ว่างานเดิมอยู่สัปดาห์ไหน) และกันงานชน (ต้องเทียบข้ามสัปดาห์ได้ ไม่ใช่แค่ในสัปดาห์เดียวกัน)
   */
  existingJobs: { slot: SendOffSlot; dutyDate: string }[];
  /** วันที่คนนี้ลา (คอนเฟิร์มแล้ว) ที่คาบเกี่ยวเดือนนี้ — ห้ามจัดงานที่ dutyDate ตรงกับวันเหล่านี้ */
  leaveDates: Set<string>;
  /** เพดานจำนวนกรุ๊ปสูงสุดต่อเดือนของคนนี้ — null = ไม่จำกัด ครบแล้วจัดอัตโนมัติให้เพิ่มไม่ได้เหมือนกับจัดมือ */
  maxGroupsPerMonth?: number | null;
  /**
   * จำนวนกรุ๊ปที่ "คอนเฟิร์มแล้ว" ในเดือนนี้ก่อนรันอัตโนมัติ — ใช้ตรวจเพดานเท่านั้น (คนละตัวกับ existingJobs.length
   * ที่ใช้เกลี่ยภาระงาน) เพราะงานที่ยังรอคอนเฟิร์มไม่นับเข้าเพดานจนกว่าผู้จัดจะกดยืนยัน — งานที่ auto assign จัดในรอบนี้
   * ก็เริ่มที่รอคอนเฟิร์มเหมือนกัน แต่ยังนับสะสมภายในรอบเดียวกันเพื่อไม่ให้ยัดคนคนเดียวเกินเพดานในครั้งเดียว
   */
  confirmedThisMonth: number;
}

export interface AutoAssignPlanItem {
  periodId: string;
  staffId: string;
  arrivalTime: string | null;
  dayOffset: number;
  /** true = จัดได้แต่เวลานัดทับซ้อนกับงานอื่นของคนเดียวกัน (สนามบินเดียวกัน) เพราะวันนั้นกรุ๊ปเยอะกว่าคนว่าง */
  overlapping: boolean;
}

export interface AutoAssignResult {
  plan: AutoAssignPlanItem[];
  /** จัดอัตโนมัติไม่ได้เลยสักคน (ชนเวลางาน/ลา/ชนข้ามสนามบิน หรือยังไม่รู้เวลาเครื่องออก) */
  unassignedPeriodIds: string[];
}

/** ข้อความสั้นสรุปสิ่งที่ Auto Assign จะทำ — ใช้ในกล่องยืนยันและ Toast */
export function summarizeAutoAssign(result: AutoAssignResult, staffCount: number): string {
  const n = result.plan.length;
  if (n === 0) return 'ไม่มีกรุ๊ปที่จัดอัตโนมัติได้ในเดือนนี้';
  const avg = staffCount > 0 ? (n / staffCount).toFixed(1) : '0';
  const leftover = result.unassignedPeriodIds.length;
  const overlapping = result.plan.filter((p) => p.overlapping).length;
  return `จัดอัตโนมัติได้ ${n} กรุ๊ป ให้เจ้าหน้าที่ ${staffCount} คน (เฉลี่ยคนละ ~${avg} กรุ๊ป)`
    + (overlapping > 0 ? ` · ${overlapping} กรุ๊ปในนั้นเวลานัดทับซ้อนกับงานอื่น (วันนั้นกรุ๊ปเยอะกว่าคนว่าง)` : '')
    + (leftover > 0 ? ` · อีก ${leftover} กรุ๊ปจัดอัตโนมัติไม่ได้ (ชนเวลา/ไม่มีใครว่าง) ต้องจัดเอง` : '');
}

/** กุญแจสัปดาห์ของวันที่ (ISO) — ใช้จัดกลุ่มภาระงานรายสัปดาห์ สัปดาห์เริ่มวันอาทิตย์เหมือนปฏิทินที่ใช้ทั้งระบบ */
function weekKeyOf(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso; // รูปแบบวันที่ผิด — กันชนแค่ไม่ให้พัง (ยังจัดกลุ่มแยกกันได้ตามค่าดิบ)
  const day = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const dow = new Date(day).getUTCDay(); // 0 = อาทิตย์
  return new Date(day - dow * 86_400_000).toISOString().slice(0, 10);
}

export function planAutoAssignSendOff(
  jobs: AutoAssignJobInput[],
  staffList: AutoAssignStaffInput[],
  rules: SendOffRules,
): AutoAssignResult {
  // เรียงงานตามเวลาที่ต้องไปถึงสนามบินก่อน-หลัง (เช็คอินเร็วสุดก่อน) — งานไม่รู้เวลาบิน (slot ว่าง) ไว้ท้ายสุด
  const ordered = [...jobs].sort((a, b) => (a.slot?.checkInMin ?? Infinity) - (b.slot?.checkInMin ?? Infinity));

  const eligible = staffList.filter((s) => canSendOffByStatus(s.status));
  /*
    ภาระงานนับ 3 ระดับ (staffId -> key -> จำนวน): วัน/สัปดาห์/เดือน — slot เก็บรวมทุกสัปดาห์แยกอีกชุด เพราะตรวจงานชนต้องดูข้ามสัปดาห์ได้
    เดือนนับเป็นยอดรวมทั้งก้อน (ไม่แยก key ตามวันที่) เพราะที่ต้องกันคือ "ยอดรวมทั้งเดือนห่างกันเกิน" สะสมข้ามหลายสัปดาห์ —
    ถ้าใช้แค่รายสัปดาห์ คนที่ได้เปรียบในสัปดาห์ก่อน (เช่น ประเภทพนักงานติดเวลางานบ่อยกว่า งานจึงไหลไปอีกฝั่งซ้ำ ๆ ทุกสัปดาห์)
    จะไม่ถูกจดจำข้ามสัปดาห์เลย ทำให้ยอดรวมทั้งเดือนถ่างออกเรื่อย ๆ ทั้งที่แต่ละสัปดาห์ดูสมดุลดี
  */
  const loadByDay = new Map<string, Map<string, number>>();
  const loadByWeek = new Map<string, Map<string, number>>();
  const loadByMonth = new Map<string, number>();
  const slots = new Map<string, SendOffSlot[]>();
  for (const s of eligible) {
    const dm = new Map<string, number>();
    const wm = new Map<string, number>();
    for (const j of s.existingJobs) {
      dm.set(j.dutyDate, (dm.get(j.dutyDate) ?? 0) + 1);
      const wk = weekKeyOf(j.dutyDate);
      wm.set(wk, (wm.get(wk) ?? 0) + 1);
    }
    loadByDay.set(s.id, dm);
    loadByWeek.set(s.id, wm);
    loadByMonth.set(s.id, s.existingJobs.length);
    slots.set(s.id, s.existingJobs.map((j) => j.slot));
  }
  const loadInDay = (staffId: string, day: string) => loadByDay.get(staffId)?.get(day) ?? 0;
  const loadInWeek = (staffId: string, week: string) => loadByWeek.get(staffId)?.get(week) ?? 0;
  const loadInMonth = (staffId: string) => loadByMonth.get(staffId) ?? 0;

  /*
    ตัวนับแยกสำหรับเพดานต่อเดือนโดยเฉพาะ — เริ่มที่ "คอนเฟิร์มแล้ว" เท่านั้น (ไม่ใช่ existingJobs.length ที่รวมงานรอคอนเฟิร์มด้วย)
    เพราะงานรอคอนเฟิร์มยังไม่นับเข้าเพดาน แต่ยังต้องนับสะสมภายในรอบรันเดียวกัน ไม่งั้นจะยัดคนคนเดียวเกินเพดานได้ในรอบเดียว
  */
  const capLoadByMonth = new Map<string, number>();
  for (const s of eligible) capLoadByMonth.set(s.id, s.confirmedThisMonth);
  const capLoad = (staffId: string) => capLoadByMonth.get(staffId) ?? 0;

  const plan: AutoAssignPlanItem[] = [];
  const unassignedPeriodIds: string[] = [];

  for (const job of ordered) {
    const week = weekKeyOf(job.dutyDate);
    const timeOk = eligible.filter((s) => {
      if (s.leaveDates.has(job.dutyDate)) return false;
      // ครบเพดานเดือนนี้แล้ว = จัดเพิ่มไม่ได้อีกเลย เหมือนกับตอนจัดมือ (นับเฉพาะที่คอนเฟิร์มแล้ว + ที่เพิ่งจัดในรอบนี้ ดู capLoad ด้านบน)
      if (reachedMonthlyCapacity(s.maxGroupsPerMonth, capLoad(s.id))) return false;
      return checkSendOff(s.staffType, job.flightTime, {
        leadHours: rules.leadHours,
        workStart: rules.employeeWorkStart,
        workEnd: rules.employeeWorkEnd,
        isDayOff: job.isDayOff,
        dayOffLabel: job.dayOffLabel,
      }).ok;
    });

    // ชั้นที่ 1: ไม่ชนใครเลย (ทั้งทับซ้อนสนามบินเดียวกันและชนข้ามสนามบิน) — พยายามให้ได้แบบนี้ก่อนเสมอ
    const noConflict = timeOk.filter((s) => {
      if (!job.slot) return true;
      const worst = worstSendOffPair(job.slot, slots.get(s.id) ?? [], rules);
      return !worst || worst.check.ok;
    });
    // ชั้นสำรอง (ใช้เมื่อชั้นที่ 1 ไม่มีใครว่างเลย): ยอมทับซ้อนสนามบินเดียวกันได้ แต่ห้ามชนข้ามสนามบินเด็ดขาด
    const overlapAllowed = timeOk.filter((s) => !job.slot || !hardConflictWith(job.slot, slots.get(s.id) ?? [], rules));

    const feasible = noConflict.length > 0 ? noConflict : overlapAllowed;
    if (feasible.length === 0) { unassignedPeriodIds.push(job.periodId); continue; }

    /*
      ลำดับตัดสิน: วัน (ตัดสินหลัก กระจายงานวันเดียวกันให้คนละคนก่อนเสมอ) → สัปดาห์ (ตัดสินรอง กระจายให้เท่ากันภายในสัปดาห์นั้น
      — ต้องมาก่อนเดือนเสมอ ไม่งั้นคนที่ยอดรวมทั้งเดือนตามหลังจะถูกยัดงานเกือบทั้งสัปดาห์รวดเดียวเพื่อไล่ตามยอด ทำให้แต่ละ
      สัปดาห์กระจุก/โหว่สลับกันไปแทนที่จะสม่ำเสมอ) → เดือน (ตัดสินละเอียดสุดท้ายเมื่อวันและสัปดาห์เสมอกันพอดี กันยอดรวม
      ทั้งเดือนถ่างออกสะสมข้ามหลายสัปดาห์) → รหัสเจ้าหน้าที่ (กันผลลัพธ์สลับไปมาโดยไม่มีเหตุผล)
    */
    feasible.sort((a, b) =>
      (loadInDay(a.id, job.dutyDate) - loadInDay(b.id, job.dutyDate))
      || (loadInWeek(a.id, week) - loadInWeek(b.id, week))
      || (loadInMonth(a.id) - loadInMonth(b.id))
      || a.id.localeCompare(b.id));
    const chosen = feasible[0];

    const check = checkSendOff(chosen.staffType, job.flightTime, {
      leadHours: rules.leadHours,
      workStart: rules.employeeWorkStart,
      workEnd: rules.employeeWorkEnd,
      isDayOff: job.isDayOff,
      dayOffLabel: job.dayOffLabel,
    });
    plan.push({
      periodId: job.periodId,
      staffId: chosen.id,
      arrivalTime: check.arrivalTime,
      dayOffset: check.dayOffset,
      overlapping: feasible === overlapAllowed,
    });
    loadByDay.get(chosen.id)!.set(job.dutyDate, loadInDay(chosen.id, job.dutyDate) + 1);
    loadByWeek.get(chosen.id)!.set(week, loadInWeek(chosen.id, week) + 1);
    loadByMonth.set(chosen.id, loadInMonth(chosen.id) + 1);
    capLoadByMonth.set(chosen.id, capLoad(chosen.id) + 1);
    if (job.slot) slots.set(chosen.id, [...(slots.get(chosen.id) ?? []), job.slot]);
  }

  return { plan, unassignedPeriodIds };
}
