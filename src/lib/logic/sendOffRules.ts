/**
 * เงื่อนไขการจัดเจ้าหน้าที่ส่งกรุ๊ป — ปรับได้จากเมนูเจ้าหน้าที่ส่งกรุ๊ป
 *
 * ตัวเลขพวกนี้เป็นนโยบายของผู้จัด ไม่ใช่กฎธรรมชาติ จึงเก็บเป็นค่าตั้งค่า
 * ไม่ฝังไว้ในโค้ด และทุกที่ที่ตรวจต้องอ่านจากชุดเดียวกัน
 *
 * ⚠️ สองเกณฑ์นี้ "นับคนละจุด" และ "หนักไม่เท่ากัน" ตั้งใจให้ต่างกัน
 *   • สนามบินเดียวกัน  นับจาก "เวลาเช็คอิน" (เวลาที่ต้องไปถึง) — อยู่ที่เดิม ไม่ต้องเดินทาง
 *     ไม่ผ่านเกณฑ์นี้ = แค่ "ทับซ้อน" (เตือนให้เตรียมตัว) ยังจัดได้ตามปกติ — ใช้เมื่อกรุ๊ปวันนั้นเยอะกว่าคนว่าง
 *   • คนละสนามบิน     นับจาก "เวลาเครื่องออก" — ต้องรอกรุ๊ปแรกขึ้นเครื่องก่อนแล้วค่อยวิ่งข้าม
 *     ไม่ผ่านเกณฑ์นี้ = จัดไม่ได้จริง (ต้องเดินทางจริง เลี่ยงไม่ได้ด้วยนโยบาย) — ยังเป็นกฎตายตัวเหมือนเดิม
 */

import { toMinutes } from '@/lib/logic/sendOffStaff';

export interface SendOffRules {
  /** ต้องถึงสนามบินก่อนเครื่องออกกี่ชั่วโมง — เวลานี้คือ "เวลาเช็คอิน" ที่ใช้อ้างอิงทุกที่ */
  leadHours: number;
  /** สนามบินเดียวกัน — เวลาเช็คอินของสองกรุ๊ปต้องห่างกันเกินกี่ชั่วโมง */
  sameAirportGapHours: number;
  /** คนละสนามบิน — เวลาเครื่องออกของสองกรุ๊ปต้องห่างกันเกินกี่ชั่วโมง */
  crossAirportGapHours: number;
  /** เวลางานประจำของประเภทพนักงาน — ไปส่งช่วงนี้ไม่ได้ */
  employeeWorkStart: string;
  employeeWorkEnd: string;
}

export const DEFAULT_SEND_OFF_RULES: SendOffRules = {
  leadHours: 3,
  sameAirportGapHours: 2,
  crossAirportGapHours: 6,
  employeeWorkStart: '09:00',
  employeeWorkEnd: '18:00',
};

/** ขอบเขตที่กรอกได้ของแต่ละค่า — กันค่าที่ทำให้ตารางใช้งานไม่ได้ */
export const SEND_OFF_RULE_LIMITS = {
  leadHours: { min: 0.5, max: 12, step: 0.5, label: 'ต้องถึงสนามบินก่อนเครื่องออก', unit: 'ชั่วโมง' },
  sameAirportGapHours: { min: 0, max: 24, step: 0.5, label: 'สนามบินเดียวกัน ควรห่างกันเกิน (ไม่ถึงแค่เตือนว่าทับซ้อน)', unit: 'ชั่วโมง' },
  crossAirportGapHours: { min: 0, max: 24, step: 0.5, label: 'คนละสนามบิน ต้องห่างกันเกิน', unit: 'ชั่วโมง' },
} as const;

/** ค่าที่กรอกมาอยู่ในขอบเขตหรือไม่ — คืนข้อความผิดพลาด หรือ null เมื่อผ่าน */
export function validateRules(rules: SendOffRules): string | null {
  for (const [key, lim] of Object.entries(SEND_OFF_RULE_LIMITS)) {
    const v = rules[key as keyof typeof SEND_OFF_RULE_LIMITS];
    if (!Number.isFinite(v) || v < lim.min || v > lim.max) {
      return `${lim.label} ต้องอยู่ระหว่าง ${lim.min}–${lim.max} ${lim.unit}`;
    }
  }
  const start = toMinutes(rules.employeeWorkStart);
  const end = toMinutes(rules.employeeWorkEnd);
  if (start === null || end === null) return 'เวลางานประจำต้องเป็นรูปแบบ HH:MM';
  if (end <= start) return 'เวลาเลิกงานต้องหลังเวลาเข้างาน';
  return null;
}

/* ------------------------------ ตรวจงานสองกรุ๊ปของคนเดียวกัน ------------------------------ */

/** งานไปส่ง 1 ครั้ง ในรูปที่ใช้ตรวจเงื่อนไข — เวลาเป็นนาทีสัมบูรณ์ จึงเทียบข้ามวันได้ */
export interface SendOffSlot {
  groupCode: string;
  /** รหัสสนามบิน (IATA) — null = ยังไม่รู้ */
  airport: string | null;
  /** เวลาเครื่องออก (นาทีสัมบูรณ์) */
  flightMin: number;
  /** เวลาเช็คอิน = เครื่องออก − leadHours (นาทีสัมบูรณ์) */
  checkInMin: number;
}

export interface SendOffPairCheck {
  /** จัดคู่นี้ให้คนเดียวกันได้หรือไม่ */
  ok: boolean;
  /** สองกรุ๊ปนี้อยู่สนามบินเดียวกันหรือไม่ — ไม่รู้ฝั่งใดฝั่งหนึ่ง = ถือว่าเดียวกันไปก่อน */
  sameAirport: boolean;
  /** รู้สนามบินครบทั้งสองฝั่งไหม — ไม่รู้ต้องกลับมาตรวจใหม่เมื่อข้อมูลเข้ามา */
  airportKnown: boolean;
  /**
   * ยังไม่รู้สนามบิน "และ" การไม่รู้นั้นเปลี่ยนผลได้จริง — เครื่องออกห่างกันไม่เกินเกณฑ์คนละสนามบิน
   * (ถ้ารู้แล้วเป็นคนละสนามบินจะจัดไม่ได้) · ห่างกันเกินเกณฑ์นั้นแล้ว สนามบินไหนก็ผ่าน ไม่ต้องเตือน
   * เดิมเตือนทุกครั้งที่ไม่รู้สนามบิน แม้กรุ๊ปห่างกันเป็นวัน — ผู้จัดงงว่ากรุ๊ปนี้มีสนามบินอยู่แล้วทำไมยังขึ้น
   */
  airportPending: boolean;
  /** เกณฑ์นี้นับจากอะไร */
  basis: 'checkin' | 'flight';
  gapMinutes: number;
  requiredMinutes: number;
  reason: string;
}

/** ชั่วโมง (ทศนิยมได้) → ข้อความอ่านง่าย เช่น "6 ชม." หรือ "3 ชม. 30 นาที" */
export function formatHours(hours: number): string {
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${m} นาที`;
  return m === 0 ? `${h} ชม.` : `${h} ชม. ${m} นาที`;
}

/**
 * สร้าง slot จากวันเดินทาง + เวลาเครื่องออก
 * ไม่รู้วันหรือเวลา = null (ตรวจไม่ได้ ดีกว่าเดาแล้วบอกว่าจัดได้)
 */
export function sendOffSlot(
  input: { groupCode: string; departDate: string; flightTime: string | null | undefined; airport: string | null },
  rules: SendOffRules,
): SendOffSlot | null {
  const m = input.departDate.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dep = input.flightTime ? toMinutes(input.flightTime) : null;
  if (!m || dep === null) return null;
  const day = Math.floor(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  const flightMin = day * 1440 + dep;
  return {
    groupCode: input.groupCode,
    airport: input.airport,
    flightMin,
    checkInMin: flightMin - Math.round(rules.leadHours * 60),
  };
}

/**
 * คนเดียวกันรับสองกรุ๊ปนี้ได้ไหม
 *
 * สนามบินเดียวกัน → เวลาเช็คอินต้องห่างกันเกิน sameAirportGapHours
 *   (อยู่ที่เดิม ส่งกรุ๊ปแรกเสร็จก็รอกรุ๊ปถัดไปได้เลย)
 * คนละสนามบิน → เวลาเครื่องออกต้องห่างกันเกิน crossAirportGapHours
 *   (ต้องรอกรุ๊ปแรกขึ้นเครื่องก่อน แล้วจึงวิ่งข้ามไปเช็คอินอีกที่)
 *
 * ยังไม่รู้สนามบินฝั่งใดฝั่งหนึ่ง → ใช้เกณฑ์สนามบินเดียวกันไปก่อน แล้วบอกว่ายังตรวจไม่ครบ
 * (ใช้เกณฑ์ที่เข้มกว่าจะบล็อกงานที่จัดได้จริงทิ้งไปโดยไม่มีข้อมูลยืนยัน)
 */
export function checkSendOffPair(a: SendOffSlot, b: SendOffSlot, rules: SendOffRules): SendOffPairCheck {
  const airportKnown = Boolean(a.airport && b.airport && a.airport !== '-' && b.airport !== '-');
  const sameAirport = !airportKnown || a.airport!.toUpperCase() === b.airport!.toUpperCase();

  const basis: 'checkin' | 'flight' = sameAirport ? 'checkin' : 'flight';
  const gapMinutes = sameAirport
    ? Math.abs(a.checkInMin - b.checkInMin)
    : Math.abs(a.flightMin - b.flightMin);
  const requiredHours = sameAirport ? rules.sameAirportGapHours : rules.crossAirportGapHours;
  const requiredMinutes = Math.round(requiredHours * 60);

  // "ต้องห่างกันเกิน N ชม." — เท่ากับพอดียังไม่ผ่าน
  const ok = gapMinutes > requiredMinutes;
  const airportPending = !airportKnown
    && Math.abs(a.flightMin - b.flightMin) <= Math.round(rules.crossAirportGapHours * 60);
  const basisLabel = basis === 'checkin' ? 'เวลาเช็คอิน' : 'เวลาเครื่องออก';
  const where = sameAirport
    ? (airportKnown ? 'สนามบินเดียวกัน' : 'ยังไม่รู้สนามบิน — ใช้เกณฑ์สนามบินเดียวกันไปก่อน')
    : 'คนละสนามบิน';

  return {
    ok,
    sameAirport,
    airportKnown,
    airportPending,
    basis,
    gapMinutes,
    requiredMinutes,
    reason: ok
      ? `${where} · ${basisLabel}ห่างกัน ${formatHours(gapMinutes / 60)} (เกณฑ์เกิน ${formatHours(requiredHours)})`
      : `${where} · ${basisLabel}ห่างกันแค่ ${formatHours(gapMinutes / 60)} — ต้องเกิน ${formatHours(requiredHours)}`,
  };
}

/**
 * ตรวจกรุ๊ปหนึ่งกับงานทั้งหมดที่คนนั้นรับไว้ — คืนคู่ที่ "แย่ที่สุด"
 * (ผ่านไม่ผ่านตัดสินที่คู่ที่ห่างน้อยที่สุดเทียบกับเกณฑ์ของคู่นั้น)
 */
export function worstSendOffPair(
  candidate: SendOffSlot | null,
  others: SendOffSlot[],
  rules: SendOffRules,
): { check: SendOffPairCheck; with: SendOffSlot } | null {
  if (!candidate || others.length === 0) return null;
  let worst: { check: SendOffPairCheck; with: SendOffSlot } | null = null;
  for (const o of others) {
    const check = checkSendOffPair(candidate, o, rules);
    // ขาดเกณฑ์มากที่สุด = แย่ที่สุด · ถ้าผ่านหมด เอาคู่ที่ห่างน้อยที่สุด
    const deficit = check.requiredMinutes - check.gapMinutes;
    const worstDeficit = worst ? worst.check.requiredMinutes - worst.check.gapMinutes : -Infinity;
    if (!worst || deficit > worstDeficit) worst = { check, with: o };
  }
  return worst;
}

/**
 * มีคู่ไหนที่ "จัดไม่ได้จริง" กับ candidate บ้าง — เฉพาะฝั่งคนละสนามบิน (ต้องเดินทางจริง เลี่ยงไม่ได้)
 *
 * สนามบินเดียวกันไม่นับว่าจัดไม่ได้อีกต่อไป (แค่ทับซ้อน จัดได้แต่ต้องเตือน — ดู worstSendOffPair
 * เพื่อเอาคู่ที่แย่ที่สุดรวมทั้งสองแบบไปแสดงเป็นคำอธิบาย) ใช้ฟังก์ชันนี้ตัดสินว่า "จัดได้จริงไหม" เท่านั้น
 */
export function hardConflictWith(
  candidate: SendOffSlot | null,
  others: SendOffSlot[],
  rules: SendOffRules,
): { check: SendOffPairCheck; with: SendOffSlot } | null {
  if (!candidate || others.length === 0) return null;
  let worst: { check: SendOffPairCheck; with: SendOffSlot } | null = null;
  for (const o of others) {
    const check = checkSendOffPair(candidate, o, rules);
    if (check.ok || check.sameAirport) continue;
    const deficit = check.requiredMinutes - check.gapMinutes;
    const worstDeficit = worst ? worst.check.requiredMinutes - worst.check.gapMinutes : -Infinity;
    if (!worst || deficit > worstDeficit) worst = { check, with: o };
  }
  return worst;
}
