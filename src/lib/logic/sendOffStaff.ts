/**
 * เจ้าหน้าที่ส่งกรุ๊ป — ประเภท ข้อมูลบัตรประชาชน และกติกาว่าใครส่งกรุ๊ปเที่ยวบินไหนได้
 *
 * ตรรกะล้วน ไม่แตะเบราว์เซอร์/เครือข่าย — ทดสอบได้ตรง ๆ
 */

import type { LeaderBankAccount } from '@/types';

/**
 * ประเภทเจ้าหน้าที่
 *   permanent = ประจำ   — งานนี้คืองานหลัก ส่งได้ทุกเวลา
 *   employee  = พนักงาน — มีงานประจำอื่นอยู่ จึงติดเวลาทำงาน
 */
export type SendOffStaffType = 'permanent' | 'employee';

export const SEND_OFF_STAFF_TYPE: Record<SendOffStaffType, { label: string; tone: 'blue' | 'slate'; note: string }> = {
  permanent: { label: 'ประจำ', tone: 'blue', note: 'ส่งกรุ๊ปได้ทุกช่วงเวลา' },
  employee: { label: 'พนักงาน', tone: 'slate', note: 'ติดงานประจำ 09:00–18:00 จึงส่งกรุ๊ปช่วงนั้นไม่ได้' },
};

export const SEND_OFF_STAFF_TYPE_ORDER: SendOffStaffType[] = ['permanent', 'employee'];

/**
 * สถานะเจ้าหน้าที่
 *   active    = ใช้งาน          — เลือกไปส่งกรุ๊ปได้ตามปกติ
 *   suspended = ระงับชั่วคราว    — หยุดรับงานชั่วคราว (ลายาว/รอตรวจสอบ) แล้วกลับมาได้
 *   disabled  = ปิดการใช้งาน     — ไม่ร่วมงานแล้ว
 *
 * ทั้งสองสถานะหลังเลือกไปส่งกรุ๊ปไม่ได้เหมือนกัน แต่แยกกันไว้เพราะความหมายต่างกัน
 * ระงับชั่วคราวคาดว่าจะกลับมา ส่วนปิดการใช้งานคือจบแล้ว — รายงานย้อนหลังต้องแยกออกจากกันได้
 */
export type SendOffStaffStatus = 'active' | 'suspended' | 'disabled';

export const SEND_OFF_STAFF_STATUS: Record<SendOffStaffStatus, { label: string; tone: 'green' | 'amber' | 'slate'; canSendOff: boolean; note: string }> = {
  active: { label: 'ใช้งาน', tone: 'green', canSendOff: true, note: 'เลือกไปส่งกรุ๊ปได้ตามปกติ' },
  suspended: { label: 'ระงับชั่วคราว', tone: 'amber', canSendOff: false, note: 'หยุดรับงานชั่วคราว — เปิดกลับมาใช้งานได้ภายหลัง' },
  disabled: { label: 'ปิดการใช้งาน', tone: 'slate', canSendOff: false, note: 'ไม่ร่วมงานแล้ว — ประวัติที่ผ่านมายังอยู่ครบ' },
};

export const SEND_OFF_STAFF_STATUS_ORDER: SendOffStaffStatus[] = ['active', 'suspended', 'disabled'];

/** สถานะนี้เลือกไปส่งกรุ๊ปได้หรือไม่ — มีที่เดียว หน้าจอทุกที่อ่านจากนี่ */
export function canSendOffByStatus(status: SendOffStaffStatus): boolean {
  return SEND_OFF_STAFF_STATUS[status].canSendOff;
}

/** เวลาทำงานประจำของประเภท "พนักงาน" — ช่วงที่ไปส่งกรุ๊ปไม่ได้ */
export const EMPLOYEE_WORK_START = '09:00';
export const EMPLOYEE_WORK_END = '18:00';

/**
 * ต้องไปถึงสนามบินก่อนเครื่องออกกี่ชั่วโมง
 * ใช้กับเที่ยวบินที่ออกจากประเทศไทยเท่านั้น (ขากลับไม่ต้องมีคนไปส่ง)
 */
export const SEND_OFF_LEAD_HOURS = 3;

/**
 * ข้อมูลตามบัตรประชาชน — ชื่อฟิลด์ตรงกับ schema id_card ของหัวหน้าทัวร์
 * จึงใช้ template หน้าบัตรและผังฟอร์มชุดเดียวกันได้เลย ไม่ต้องแปลงชื่อช่อง
 */
export interface ThaiIdCard {
  /** เลขบัตรประชาชน 13 หลัก (เก็บเฉพาะตัวเลข) */
  idNumber: string;
  title: string;
  firstName: string;
  lastName: string;
  /** บัตรจริงพิมพ์ชื่ออังกฤษไว้ใต้ชื่อไทย */
  titleEn: string;
  firstNameEn: string;
  lastNameEn: string;
  /** วันเกิด ISO (yyyy-mm-dd) · '' = ยังไม่ระบุ */
  birthDate: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  /** รหัสเขตปกครอง — เก็บคู่กับชื่อ เพื่อให้เปิดแก้ไขแล้วรู้ว่าเลือกอะไรอยู่ */
  provinceCode: string;
  districtCode: string;
  /** วันออกบัตร / วันหมดอายุ (ISO) — ชื่อ issuedDate ตรงกับ schema กลาง */
  issuedDate: string;
  expiryDate: string;
}

/** ข้อมูลอ้างอิงไฟล์ที่แนบ — โครงเดียวกับ AttachedFile ของระบบเอกสาร */
export interface AttachedFileRef {
  imageId: string;
  fileName: string;
  byteSize: number;
  uploadedBy: string;
  uploadedAt: string;
}

/** ค่าว่างของบัตร — ใช้ทั้งตอนสร้างใหม่และตอนเติมช่องที่ข้อมูลเก่ายังไม่มี */
export const EMPTY_ID_CARD: ThaiIdCard = {
  idNumber: '', title: 'นาย', firstName: '', lastName: '',
  titleEn: '', firstNameEn: '', lastNameEn: '',
  birthDate: '', addressLine: '', subdistrict: '', district: '', province: '', postalCode: '',
  provinceCode: '', districtCode: '', issuedDate: '', expiryDate: '',
};

/** ผู้ติดต่อฉุกเฉิน — ส่วนหนึ่งของ "ข้อมูลส่วนตัว" แยกจากข้อมูลตามบัตร */
export interface EmergencyContact {
  name: string;
  phone: string;
  relation: string;
}

export const EMPTY_EMERGENCY_CONTACT: EmergencyContact = { name: '', phone: '', relation: '' };

export interface SendOffStaff {
  id: string;
  staffType: SendOffStaffType;
  nickname: string;
  phone: string;
  /** สถานะการใช้งาน — เปลี่ยนสถานะแทนการลบเสมอ */
  status: SendOffStaffStatus;
  /** วันที่เริ่มร่วมงาน (ISO) — ผู้ดูแลกำหนด · ไม่มี = ยังไม่ระบุ */
  startDate?: string;
  idCard: ThaiIdCard;
  /**
   * ไฟล์สำเนาบัตรที่แนบไว้ — เก็บเป็นข้อมูลอ้างอิงของไฟล์ ไม่ใช่ตัวไฟล์
   * ชนิดเดียวกับที่ระบบเอกสารหัวหน้าทัวร์ใช้ จึงเปิดดูผ่านตัวเดียวกันได้
   */
  idCardFile?: AttachedFileRef | null;
  /** ---- ข้อมูลส่วนตัวเพิ่มเติม (แท็บ "ข้อมูลส่วนตัว") ---- */
  email?: string;
  emergencyContact?: EmergencyContact;
  /**
   * ---- เอกสารการเงิน (แท็บ "เอกสารการเงิน") ----
   * ใช้ชนิดเดียวกับบัญชีธนาคารของหัวหน้าทัวร์ (LeaderBankAccount) จึงใช้ตัวแก้ไข/ตัวช่วยชุดเดียวกันได้
   */
  bankAccounts: LeaderBankAccount[];
  note: string;
}

/* ------------------------------- สถานะการจัดงานไปส่ง -------------------------------
 * จัดคนแล้ว = "รอคอนเฟิร์ม" ก่อนเสมอ — ผู้จัดตารางต้องคุยกับเจ้าหน้าที่นอกระบบ (โทร/LINE) แล้วกลับมากด
 * "ยืนยัน" เองจึงจะเปลี่ยนเป็น "คอนเฟิร์มแล้ว" — ไม่มีพอร์ทัลให้เจ้าหน้าที่ส่งกรุ๊ปกดตอบรับเอง (คนละแบบกับหัวหน้าทัวร์)
 * ถ้าเจ้าหน้าที่ไม่รับงาน (ไม่ว่าจะตอนยังรอคอนเฟิร์มหรือคอนเฟิร์มไปแล้ว) ไม่มีสถานะ "ปฏิเสธ" แยก —
 * ผู้จัดถอดคน/หาคนใหม่ผ่านปุ่ม "ถอดคนไปส่ง" เหมือนเดิม
 * ระหว่างที่ยังรอคอนเฟิร์ม งานนั้นยังไม่นับเป็น "จัดแล้ว" ในเพดานกรุ๊ป/เดือน หรือสรุปยอดต่าง ๆ — นับเมื่อคอนเฟิร์มแล้วเท่านั้น
 * (แต่ยังกันชนตารางเวลาได้ตามปกติ กันไม่ให้จัดคนคนเดียวกันไปสองที่พร้อมกันทั้งที่ยังไม่คอนเฟิร์ม)
 */
export type SendOffAssignStatus = 'PENDING_CONFIRMATION' | 'CONFIRMED';

/** สถานะเริ่มต้นของงานที่เพิ่งจัด — ต้องรอผู้จัดกดยืนยันก่อนเสมอ */
export const SEND_OFF_ASSIGN_STATUS_DEFAULT: SendOffAssignStatus = 'PENDING_CONFIRMATION';

/* ------------------------------- ตัวช่วยเรื่องเวลา ------------------------------- */

/** "HH:MM" → นาทีนับจากเที่ยงคืน · รูปแบบอื่นคืน null (ไม่เดา) */
export function toMinutes(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 ? h * 60 + min : null;
}

/** นาทีนับจากเที่ยงคืน → "HH:MM" (วนรอบวันให้อัตโนมัติ) */
export function toTimeText(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * เวลาที่เจ้าหน้าที่ต้องไปถึงสนามบิน = เวลาเครื่องออก − 3 ชั่วโมง
 *
 * เที่ยวบินดึกอาจย้อนไปเป็นวันก่อนหน้า (เช่น 01:00 → 22:00 ของเมื่อวาน)
 * จึงคืน dayOffset มาด้วย ไม่ใช่แค่เวลา เพราะ "วันไหน" มีผลกับการนับวันทำงาน
 */
export function sendOffArrival(flightTime: string, leadHours: number = SEND_OFF_LEAD_HOURS): { time: string; dayOffset: number } | null {
  const dep = toMinutes(flightTime);
  if (dep === null) return null;
  const raw = dep - Math.round(leadHours * 60);
  return { time: toTimeText(raw), dayOffset: raw < 0 ? -1 : 0 };
}

/**
 * เวลานี้อยู่ในช่วงงานประจำของพนักงานหรือไม่ (นับรวมหัวท้าย)
 *
 * 18:00 ถือว่ายังติด — เลิกงานพอดีตอนนั้น
 */
export function isWithinEmployeeWorkHours(
  time: string,
  workStart: string = EMPLOYEE_WORK_START,
  workEnd: string = EMPLOYEE_WORK_END,
): boolean {
  const t = toMinutes(time);
  const start = toMinutes(workStart);
  const end = toMinutes(workEnd);
  if (t === null || start === null || end === null) return false;
  return t >= start && t <= end;
}

/**
 * ช่วงที่เจ้าหน้าที่ต้องอยู่กับกรุ๊ป (ตั้งแต่เวลาที่ต้องถึงสนามบิน "เวลานัด" จนถึง "เวลาบิน" ที่เครื่องออก)
 * ทับซ้อนกับเวลางานประจำหรือไม่ — ทับซ้อนแค่บางส่วนก็ถือว่าติด ไม่ใช่เช็คแค่จุดใดจุดหนึ่งเพียงจุดเดียว
 * (เวลานัดอาจย้อนไปเป็นเที่ยงคืนก่อนหน้าได้ จึงเทียบด้วยนาทีดิบก่อน wrap วัน ไม่ใช่ arrival.time ที่ wrap แล้ว)
 */
export function dutyOverlapsWorkHours(
  flightTime: string,
  leadHours: number = SEND_OFF_LEAD_HOURS,
  workStart: string = EMPLOYEE_WORK_START,
  workEnd: string = EMPLOYEE_WORK_END,
): boolean {
  const dep = toMinutes(flightTime);
  const start = toMinutes(workStart);
  const end = toMinutes(workEnd);
  if (dep === null || start === null || end === null) return false;
  const arrivalRaw = dep - Math.round(leadHours * 60);
  return arrivalRaw <= end && start <= dep;
}

/** ผลการตรวจว่าเจ้าหน้าที่ประเภทนี้ส่งเที่ยวบินนี้ได้ไหม */
export interface SendOffCheck {
  /** ส่งได้หรือไม่ */
  ok: boolean;
  /**
   * แยกสาเหตุที่ส่งไม่ได้ออกจากกัน — ผู้จัดต้องทำคนละอย่าง
   *   'ok'      = ไปได้
   *   'blocked' = ติดเวลางานประจำ ต้องเปลี่ยนคน
   *   'unknown' = ยังไม่รู้เวลาเครื่องออก จัดไปก่อนได้แต่ต้องตามเวลาบินมาเติม
   */
  kind: 'ok' | 'blocked' | 'unknown';
  /** เวลาที่ต้องไปถึงสนามบิน (HH:MM) — null = ไม่รู้เวลาเครื่องออก */
  arrivalTime: string | null;
  /** -1 = ต้องไปตั้งแต่คืนก่อนวันเดินทาง */
  dayOffset: number;
  reason: string;
}

/**
 * เจ้าหน้าที่ประเภทนี้ไปส่งเที่ยวบินนี้ได้หรือไม่
 *
 * ไม่รู้เวลาเครื่องออก = ตอบว่าไม่รู้ (ok = false พร้อมเหตุผล) ดีกว่าเดาแล้วจัดคนผิด
 * ประเภทประจำผ่านเสมอ · ประเภทพนักงานติดเมื่อ "ช่วงที่ต้องอยู่กับกรุ๊ป" (เวลานัดถึงเวลาบิน) ทับซ้อนกับเวลางานประจำ
 * แม้เพียงบางส่วน — ไม่ใช่เช็คแค่เวลานัดอย่างเดียวหรือเวลาบินอย่างเดียว (ดู dutyOverlapsWorkHours)
 */
export function checkSendOff(
  staffType: SendOffStaffType,
  flightTime: string | null | undefined,
  /** เงื่อนไขที่ผู้จัดตั้งไว้ — ไม่ส่งมา = ใช้ค่าเริ่มต้นของระบบ */
  opts: {
    leadHours?: number;
    workStart?: string;
    workEnd?: string;
    /**
     * วันที่ต้องไปส่งเป็นวันหยุดหรือไม่ (เสาร์-อาทิตย์ หรือวันหยุดที่ตั้งไว้ในเมนูวันหยุด)
     * วันหยุดพนักงานไม่ต้องเข้างานประจำ จึงจัดได้เท่ากับประเภทประจำ
     */
    isDayOff?: boolean;
    /** ชื่อวันหยุด — ใช้บอกเหตุผลให้ผู้จัดรู้ว่าทำไมวันนี้จัดได้ */
    dayOffLabel?: string;
  } = {},
): SendOffCheck {
  const leadHours = opts.leadHours ?? SEND_OFF_LEAD_HOURS;
  const workStart = opts.workStart ?? EMPLOYEE_WORK_START;
  const workEnd = opts.workEnd ?? EMPLOYEE_WORK_END;
  if (!flightTime) {
    return { ok: false, kind: 'unknown', arrivalTime: null, dayOffset: 0, reason: 'ยังไม่รู้เวลาเครื่องออก จึงคำนวณเวลาไปส่งไม่ได้' };
  }
  const arrival = sendOffArrival(flightTime, leadHours);
  if (!arrival) {
    return { ok: false, kind: 'unknown', arrivalTime: null, dayOffset: 0, reason: 'ยังไม่รู้เวลาเครื่องออก จึงคำนวณเวลาไปส่งไม่ได้' };
  }

  const base = `เครื่องออก ${flightTime} · ต้องถึงสนามบิน ${arrival.time}`;
  const dayNote = arrival.dayOffset === -1 ? ' (คืนก่อนวันเดินทาง)' : '';

  if (staffType === 'permanent') {
    return { ok: true, kind: 'ok', arrivalTime: arrival.time, dayOffset: arrival.dayOffset, reason: `${base}${dayNote}` };
  }

  /* วันหยุดไม่มีงานประจำให้ติด — พนักงานจึงจัดได้ทุกช่วงเวลาเท่าประเภทประจำ */
  if (opts.isDayOff) {
    return {
      ok: true,
      kind: 'ok',
      arrivalTime: arrival.time,
      dayOffset: arrival.dayOffset,
      reason: `${base}${dayNote} — ${opts.dayOffLabel ?? 'วันหยุด'} ไม่ติดงานประจำ`,
    };
  }

  /* ทับซ้อนแค่บางส่วนก็ติด — เทียบทั้งช่วง (เวลานัดถึงเวลาบิน) กับเวลางานประจำ ไม่ใช่จุดใดจุดหนึ่ง */
  if (dutyOverlapsWorkHours(flightTime, leadHours, workStart, workEnd)) {
    return {
      ok: false,
      kind: 'blocked',
      arrivalTime: arrival.time,
      dayOffset: arrival.dayOffset,
      reason: `${base} — ช่วงเวลานี้ทับซ้อนกับเวลางานประจำ ${workStart}–${workEnd} จึงไปส่งไม่ได้`,
    };
  }

  return { ok: true, kind: 'ok', arrivalTime: arrival.time, dayOffset: arrival.dayOffset, reason: `${base}${dayNote} — ไม่ทับซ้อนกับเวลางานประจำ` };
}

/** เจ้าหน้าที่ที่ส่งเที่ยวบินนี้ได้ (เฉพาะสถานะใช้งาน) */
export function eligibleStaff<T extends { staffType: SendOffStaffType; status: SendOffStaffStatus }>(
  staff: T[],
  flightTime: string | null | undefined,
  opts: { leadHours?: number; workStart?: string; workEnd?: string } = {},
): T[] {
  return staff.filter((s) => canSendOffByStatus(s.status) && checkSendOff(s.staffType, flightTime, opts).ok);
}

/**
 * คนนี้รับกรุ๊ปเพิ่มได้อีกกี่กรุ๊ปในเดือนที่กำลังดู — null = ไม่จำกัด (ไม่ได้ตั้งเพดานไว้เดือนนี้)
 * เพดานเป็นแบบเฉพาะเดือน ไม่มีค่าเริ่มต้นข้ามเดือน (ดู sendOffMonthlyCapStore) — เรียกใช้ที่เดียวกันทั้งตอนจัดเอง
 * (มือ) และตอนจัดอัตโนมัติ กันไม่ให้สองที่คิดเพดานไม่ตรงกัน
 */
export function remainingMonthlyCapacity(
  maxGroupsThisMonth: number | null | undefined,
  assignedThisMonth: number,
): number | null {
  if (maxGroupsThisMonth === null || maxGroupsThisMonth === undefined) return null;
  return Math.max(0, maxGroupsThisMonth - assignedThisMonth);
}

/** คนนี้ครบเพดานเดือนที่กำลังดูแล้วหรือยัง — เกินแล้วเลือกไม่ได้อีก (บล็อกจริง) */
export function reachedMonthlyCapacity(
  maxGroupsThisMonth: number | null | undefined,
  assignedThisMonth: number,
): boolean {
  const remaining = remainingMonthlyCapacity(maxGroupsThisMonth, assignedThisMonth);
  return remaining !== null && remaining <= 0;
}

/* ------------------------------ ตรวจความถูกต้อง ------------------------------ */

/** เลขบัตรประชาชนไทย 13 หลัก — ตรวจหลักตรวจสอบ (checksum) ตัวสุดท้ายด้วย */
export function isValidThaiId(idNumber: string): boolean {
  const digits = idNumber.replace(/\D/g, '');
  if (digits.length !== 13) return false;
  let sum = 0;
  for (let i = 0; i < 12; i += 1) sum += Number(digits[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(digits[12]);
}

/** ชื่อที่ใช้แสดงผล — ชื่อจริงจากบัตร ตามด้วยชื่อเล่นถ้ามี */
export function sendOffStaffName(s: Pick<SendOffStaff, 'idCard' | 'nickname'>): string {
  const full = `${s.idCard.firstName} ${s.idCard.lastName}`.trim();
  if (!full) return s.nickname || '(ยังไม่ระบุชื่อ)';
  return s.nickname ? `${full} (${s.nickname})` : full;
}

/**
 * เจ้าหน้าที่ส่งกรุ๊ปแก้ข้อมูลติดต่อของตัวเองในพอร์ทัล (เบอร์โทร · อีเมล · ผู้ติดต่อฉุกเฉิน) — มีผลทันที
 * ข้อมูลบัตรประชาชน / บัญชีรับเงิน ยังแก้ได้เฉพาะผู้ดูแล (กระทบเอกสารและการโอนเงิน)
 * คืนข้อความผิดต่อช่อง · ว่าง = ผ่าน
 */
export function validateStaffContact(v: { phone: string; email: string; ecName: string; ecPhone: string }): Partial<Record<'phone' | 'email' | 'ecPhone', string>> {
  const digits = (s: string) => s.replace(/\D/g, '');
  const badPhone = (s: string) => !/^0\d{8,9}$/.test(digits(s));
  const out: Partial<Record<'phone' | 'email' | 'ecPhone', string>> = {};
  if (!v.phone.trim()) out.phone = 'กรุณาระบุเบอร์โทร';
  else if (badPhone(v.phone)) out.phone = 'เบอร์โทรไม่ถูกต้อง (9–10 หลัก ขึ้นต้นด้วย 0)';
  if (v.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) out.email = 'อีเมลไม่ถูกต้อง';
  if (v.ecPhone.trim() && badPhone(v.ecPhone)) out.ecPhone = 'เบอร์โทรไม่ถูกต้อง';
  else if (v.ecName.trim() && !v.ecPhone.trim()) out.ecPhone = 'ระบุเบอร์โทรของผู้ติดต่อฉุกเฉิน';
  return out;
}

/** ปี/เดือนเต็มจาก from ถึง to (ISO) — ใช้คิดอายุงาน / อายุ · from หลัง to = null */
export function fullYearsMonths(from: string, to: string): { years: number; months: number } | null {
  if (!from || !to || from > to) return null;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  let months = (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
  if (months < 0) months = 0;
  return { years: Math.floor(months / 12), months: months % 12 };
}

/** อายุงาน เช่น "2 ปี 3 เดือน" · ไม่ถึงเดือน = "ไม่ถึง 1 เดือน" */
export function tenureLabel(startDate: string | undefined, today: string): string | null {
  const t = startDate ? fullYearsMonths(startDate, today) : null;
  if (!t) return null;
  if (t.years === 0 && t.months === 0) return 'ไม่ถึง 1 เดือน';
  return [t.years ? `${t.years} ปี` : '', t.months ? `${t.months} เดือน` : ''].filter(Boolean).join(' ');
}
