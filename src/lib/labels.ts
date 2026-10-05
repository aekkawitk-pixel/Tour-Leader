/**
 * ข้อความและสีของสถานะทั้งหมด
 * ทุกสถานะมีทั้ง "สี" และ "ข้อความ" กำกับ — ไม่สื่อความหมายด้วยสีเพียงอย่างเดียว
 */

import type {
  AppointmentMode,
  AppointmentStatus,
  AppointmentKind,
  AuditCategory,
  ContactType,
  DocHoldingStatus,
  DocumentKind,
  EmploymentWorkStatus,
  PayType,
  PayUnit,
  DocumentVerifyStatus,
  ExpenseStatus,
  Gender,
  GuideCompensationStatus,
  JobStatus,
  LeaderSourceType,
  LeaderStatus,
  LeaderType,
  LeaderUsageStatus,
  MaritalStatus,
  PersonType,
  MoneyCategory,
  Religion,
  WorkAvailabilityMode,
  ReviewDecision,
  Role,
  RouteSkillLevel,
  RouteType,
  SettlementStatus,
  TourSkillLevel,
} from '@/types';

export type ToneKey =
  | 'slate'
  | 'blue'
  | 'sky'
  | 'indigo'
  | 'green'
  | 'amber'
  | 'orange'
  | 'red'
  | 'violet'
  | 'teal';

export interface StatusMeta {
  label: string;
  tone: ToneKey;
}

/** คลาส Tailwind ของ Badge แต่ละโทน (ระบุแบบเต็มเพื่อไม่ให้ถูก purge) */
export const TONE_BADGE: Record<ToneKey, string> = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  blue: 'bg-blue-50 text-blue-700 ring-blue-200',
  sky: 'bg-sky-50 text-sky-700 ring-sky-200',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
  orange: 'bg-orange-50 text-orange-800 ring-orange-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  teal: 'bg-teal-50 text-teal-700 ring-teal-200',
};

/** สีทึบสำหรับจุด/แถบในปฏิทินและกราฟ */
export const TONE_SOLID: Record<ToneKey, string> = {
  slate: 'bg-slate-400',
  blue: 'bg-blue-600',
  sky: 'bg-sky-500',
  indigo: 'bg-indigo-600',
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  orange: 'bg-orange-500',
  red: 'bg-rose-500',
  violet: 'bg-violet-500',
  teal: 'bg-teal-500',
};

export const TONE_HEX: Record<ToneKey, string> = {
  slate: '#94a3b8',
  blue: '#2563eb',
  sky: '#0ea5e9',
  indigo: '#4f46e5',
  green: '#10b981',
  amber: '#f59e0b',
  orange: '#f97316',
  red: '#f43f5e',
  violet: '#8b5cf6',
  teal: '#14b8a6',
};

/* ------------------------- สถานะหัวหน้าทัวร์ ------------------------- */

/* ---------- ชื่อเรียกมาตรฐาน 2 มิติ (ใช้ให้ตรงกันทั้งระบบ) ---------- */

/** ชื่อมิติสถานะ — ใช้ข้อความเดียวกันทุกหน้า/ทุก Modal/ตัวกรอง/รายงาน */
export const USAGE_STATUS_TERM = 'สถานะการใช้งาน';
export const READINESS_TERM = 'ความพร้อมรับงาน';
export const AVAILABILITY_MENU_TERM = 'จัดการความพร้อมและการลา';

/**
 * ความพร้อมรับงาน (2 ค่า · เลือกเองได้) — แยกจาก “สถานะการใช้งาน” โดยสิ้นเชิง
 * “ระงับใช้งาน” ไม่อยู่ที่นี่ (ดู LEADER_USAGE_STATUS) และ “ติดงาน”/“ลาพัก” เป็นสถานะประกอบ
 * ที่คำนวณตามช่วงวัน (ดู computeAvailabilityStatus)
 */
export const LEADER_STATUS: Record<LeaderStatus, StatusMeta> = {
  available: { label: 'พร้อมรับงาน', tone: 'green' },
  unavailable: { label: 'ไม่พร้อมรับงาน', tone: 'slate' },
};

export const LEADER_STATUS_ORDER: LeaderStatus[] = ['available', 'unavailable'];

/** สถานะการใช้งาน (3 ค่า) — คุมว่ายังนำไปจัดงานได้หรือไม่ */
export const LEADER_USAGE_STATUS: Record<LeaderUsageStatus, StatusMeta> = {
  active: { label: 'ใช้งาน', tone: 'green' },
  suspended: { label: 'ระงับการใช้งาน', tone: 'red' },
  ended: { label: 'สิ้นสุดการใช้งาน', tone: 'slate' },
};

export const LEADER_USAGE_STATUS_ORDER: LeaderUsageStatus[] = ['active', 'suspended', 'ended'];

export const LEADER_USAGE_STATUS_DESC: Record<LeaderUsageStatus, string> = {
  active: 'ยังร่วมงานกับบริษัทและสามารถนำไปพิจารณาจัดงานได้',
  suspended: 'ระงับชั่วคราว ไม่สามารถจัดงานใหม่ได้ แต่ยังเก็บข้อมูลและประวัติเดิม',
  ended: 'สิ้นสุดการร่วมงาน ไม่สามารถจัดงานใหม่ได้ แต่ต้องรักษาประวัติทั้งหมดไว้',
};

/**
 * ชื่อสถานะแบบสั้น — ใช้เฉพาะใน Badge ของ "หน้ารายการ" ที่พื้นที่คอลัมน์จำกัด
 * (ชื่อเต็มยังใช้ในหน้ารายละเอียด ฟอร์ม และตัวกรองเหมือนเดิม)
 */
export const LEADER_STATUS_SHORT: Record<LeaderStatus, StatusMeta> = {
  available: { label: 'พร้อมรับงาน', tone: 'green' },
  unavailable: { label: 'ไม่พร้อมรับงาน', tone: 'slate' },
};

/* ------------------------- ประเภทบุคคล (ไทย / ต่างชาติ) ------------------------- */

export const PERSON_TYPE: Record<PersonType, string> = {
  thai: 'บุคคลสัญชาติไทย',
  foreigner: 'บุคคลต่างชาติ',
};

export const PERSON_TYPE_ORDER: PersonType[] = ['thai', 'foreigner'];

/** สถานะการถือวีซ่า / ใบอนุญาตทำงาน */
export const DOC_HOLDING_STATUS: Record<DocHoldingStatus, string> = {
  has: 'มี',
  none: 'ไม่มี',
  not_applicable: 'ไม่เกี่ยวข้อง',
};

export const DOC_HOLDING_STATUS_ORDER: DocHoldingStatus[] = ['has', 'none', 'not_applicable'];

/* --------------------- รายละเอียดตามรูปแบบการร่วมงาน --------------------- */

/** สถานะการทำงาน — ใช้กับหัวหน้าทัวร์ประจำ */
export const EMPLOYMENT_WORK_STATUS: Record<EmploymentWorkStatus, StatusMeta> = {
  active: { label: 'ปฏิบัติงาน', tone: 'green' },
  on_leave: { label: 'พักงานชั่วคราว', tone: 'amber' },
  ended: { label: 'สิ้นสุดการทำงาน', tone: 'slate' },
};

export const EMPLOYMENT_WORK_STATUS_ORDER: EmploymentWorkStatus[] = [
  'active',
  'on_leave',
  'ended',
];

/** รูปแบบค่าจ้าง — ใช้กับฟรีแลนซ์ */
export const PAY_TYPE: Record<PayType, string> = {
  fixed: 'อัตราคงที่',
  negotiable: 'ตามตกลงรายงาน',
};

export const PAY_TYPE_ORDER: PayType[] = ['fixed', 'negotiable'];

/** หน่วยค่าจ้าง — ใช้กับฟรีแลนซ์ */
export const PAY_UNIT: Record<PayUnit, string> = {
  per_day: 'ต่อวัน',
  per_trip: 'ต่อทริป',
};

export const PAY_UNIT_ORDER: PayUnit[] = ['per_day', 'per_trip'];

/* ------------------------- ความพร้อมรับงาน / ข้อมูลส่วนบุคคล ------------------------- */

export const AVAILABILITY_MODE: Record<WorkAvailabilityMode, StatusMeta> = {
  continuous: { label: 'รับงานต่อเนื่อง', tone: 'green' },
  occasional: { label: 'รับงานเป็นครั้งคราว', tone: 'sky' },
  weekends: { label: 'รับเฉพาะวันหยุด', tone: 'violet' },
  date_range: { label: 'รับตามช่วงเวลาที่กำหนด', tone: 'amber' },
  contact_first: { label: 'ติดต่อสอบถามก่อน', tone: 'slate' },
};

export const AVAILABILITY_MODE_ORDER: WorkAvailabilityMode[] = [
  'continuous',
  'occasional',
  'weekends',
  'date_range',
  'contact_first',
];

/** ศาสนา — ข้อมูลไม่บังคับ · ห้ามใช้คำนวณความเหมาะสมกับงาน */
export const RELIGION: Record<Religion, string> = {
  buddhist: 'พุทธ',
  christian: 'คริสต์',
  islam: 'อิสลาม',
  hindu: 'ฮินดู',
  sikh: 'ซิกข์',
  other: 'ศาสนาอื่น',
  none: 'ไม่มีศาสนา',
  prefer_not_to_say: 'ไม่ประสงค์ระบุ',
};

export const RELIGION_ORDER: Religion[] = [
  'buddhist',
  'christian',
  'islam',
  'hindu',
  'sikh',
  'other',
  'none',
  'prefer_not_to_say',
];

/** สถานภาพสมรส — ข้อมูลไม่บังคับ */
export const MARITAL_STATUS: Record<MaritalStatus, string> = {
  single: 'โสด',
  married: 'สมรส',
  divorced: 'หย่าร้าง',
  widowed: 'หม้าย',
  separated: 'แยกกันอยู่',
  prefer_not_to_say: 'ไม่ประสงค์ระบุ',
};

export const MARITAL_STATUS_ORDER: MaritalStatus[] = [
  'single',
  'married',
  'divorced',
  'widowed',
  'separated',
  'prefer_not_to_say',
];

/** แหล่งที่มาของข้อมูล */
export const LEADER_SOURCE_TYPE: Record<LeaderSourceType, string> = {
  self_apply: 'สมัครด้วยตนเอง',
  staff_referral: 'พนักงานแนะนำ',
  customer_referral: 'ลูกค้าแนะนำ',
  agent_referral: 'เอเจนท์แนะนำ',
  past_collaboration: 'เคยร่วมงาน',
  online: 'ช่องทางออนไลน์',
  other: 'ช่องทางอื่น',
};

export const LEADER_SOURCE_TYPE_ORDER: LeaderSourceType[] = [
  'self_apply',
  'staff_referral',
  'customer_referral',
  'agent_referral',
  'past_collaboration',
  'online',
  'other',
];

/* ------------------------- ประเภทหัวหน้าทัวร์ ------------------------- */

/** ประเภทการใช้งานหัวหน้าทัวร์ — สีตามข้อกำหนด (ทั่วไป=เทา ประจำ=น้ำเงิน ฟรีแลนซ์=ม่วง เอเจนท์=ส้ม) */
export const LEADER_TYPE: Record<LeaderType, StatusMeta> = {
  general: { label: 'หัวหน้าทัวร์ทั่วไป', tone: 'slate' },
  regular: { label: 'หัวหน้าทัวร์ประจำ', tone: 'blue' },
  freelance: { label: 'หัวหน้าทัวร์ฟรีแลนซ์', tone: 'violet' },
  agent: { label: 'หัวหน้าทัวร์เอเจนท์', tone: 'orange' },
};

export const LEADER_TYPE_ORDER: LeaderType[] = ['general', 'regular', 'freelance', 'agent'];

export const LEADER_TYPE_DESC: Record<LeaderType, string> = {
  general:
    'ประเภทเริ่มต้นเมื่อเพิ่มคนใหม่ — ยังไม่ถูกปรับเป็นประจำ ฟรีแลนซ์ หรือเอเจนท์ (ไม่ได้แปลว่าไม่พร้อมรับงาน)',
  regular:
    'บริษัทเรียกใช้หรือจัดให้ทำงานเป็นประจำ (ไม่ได้แปลว่าเป็นพนักงานประจำ · ไม่บังคับรหัสพนักงาน)',
  freelance: 'บริษัทไม่ได้เรียกใช้งานเป็นประจำ รับงานเป็นครั้งคราว',
  agent: 'ได้รับการแนะนำหรือจัดหาผ่านเอเจนท์ (ไม่ต้องระบุว่าเป็นเอเจนท์ใด)',
};

export const GENDER: Record<Gender, StatusMeta> = {
  male: { label: 'ชาย', tone: 'blue' },
  female: { label: 'หญิง', tone: 'violet' },
  other: { label: 'อื่น ๆ', tone: 'teal' },
  unspecified: { label: 'ไม่ระบุ', tone: 'slate' },
};

export const GENDER_ORDER: Gender[] = ['male', 'female', 'other', 'unspecified'];

export const DOCUMENT_VERIFY: Record<DocumentVerifyStatus, StatusMeta> = {
  pending: { label: 'รอตรวจสอบ', tone: 'amber' },
  verified: { label: 'ตรวจสอบแล้ว', tone: 'green' },
  rejected: { label: 'ไม่ผ่านการตรวจสอบ', tone: 'red' },
};

export const AUDIT_CATEGORY: Record<AuditCategory, StatusMeta> = {
  profile: { label: 'ข้อมูลพื้นฐาน', tone: 'slate' },
  leaderType: { label: 'รูปแบบการร่วมงาน', tone: 'blue' },
  workStatus: { label: 'สถานะพร้อมรับงาน', tone: 'sky' },
  assignedCountry: { label: 'ประเทศประจำ', tone: 'indigo' },
  routeExpertise: { label: 'ประเทศ/เส้นทางที่เชี่ยวชาญ', tone: 'violet' },
  language: { label: 'ภาษา', tone: 'teal' },
  tourSkill: { label: 'ประเภททัวร์และความถนัด', tone: 'green' },
  contact: { label: 'ช่องทางติดต่อ', tone: 'amber' },
  document: { label: 'เอกสาร', tone: 'red' },
  bankAccount: { label: 'บัญชีธนาคาร', tone: 'indigo' },
  activation: { label: 'การเปิด/ปิดใช้งาน', tone: 'red' },
};

/* ---------------------------- สถานะงานทัวร์ --------------------------- */

export const JOB_STATUS: Record<JobStatus, StatusMeta> = {
  draft: { label: 'ร่าง', tone: 'slate' },
  need_leader: { label: 'รอจัดหัวหน้าทัวร์', tone: 'amber' },
  offered: { label: 'เสนอหัวหน้าทัวร์', tone: 'violet' },
  rejected: { label: 'ปฏิเสธ', tone: 'red' },
  accepted: { label: 'ตอบรับแล้ว', tone: 'sky' },
  traveling: { label: 'กำลังเดินทาง', tone: 'blue' },
  awaiting_settlement: { label: 'รอเคลียร์', tone: 'red' },
  closed: { label: 'ปิดงาน', tone: 'green' },
  cancelled: { label: 'ยกเลิกงาน', tone: 'slate' },
};

/* ------------------- สถานะการชดเชยงาน (ไกด์ถูกยกเลิกงาน) ------------------- */

export const GUIDE_COMPENSATION_STATUS: Record<GuideCompensationStatus, StatusMeta> = {
  pending: { label: 'รอชดเชยงาน', tone: 'amber' },
  compensated: { label: 'ชดเชยงานแล้ว', tone: 'green' },
};

/** ลำดับสถานะงานตาม workflow */
export const JOB_FLOW: JobStatus[] = [
  'draft',
  'need_leader',
  'offered',
  'accepted',
  'traveling',
  'awaiting_settlement',
  'closed',
];

/* ---------------------------- สถานะใบเบิก ----------------------------- */

export const EXPENSE_STATUS: Record<ExpenseStatus, StatusMeta> = {
  draft: { label: 'ร่าง', tone: 'slate' },
  submitted: { label: 'ส่งอนุมัติ', tone: 'violet' },
  revise: { label: 'ให้แก้ไข', tone: 'amber' },
  rejected: { label: 'ปฏิเสธ', tone: 'red' },
  approved: { label: 'อนุมัติ', tone: 'sky' },
  awaiting_payment: { label: 'รอจ่าย', tone: 'indigo' },
  paid: { label: 'จ่ายแล้ว', tone: 'green' },
  cancelled: { label: 'ยกเลิกแล้ว', tone: 'slate' },
};

export const EXPENSE_FLOW: ExpenseStatus[] = [
  'draft',
  'submitted',
  'approved',
  'awaiting_payment',
  'paid',
];

export const MONEY_CATEGORY: Record<MoneyCategory, StatusMeta> = {
  leader_fee: { label: 'ค่าตอบแทนหัวหน้าทัวร์', tone: 'indigo' },
  advance: { label: 'เงินทดรองก่อนเดินทาง', tone: 'sky' },
  actual: { label: 'ค่าใช้จ่ายจริง', tone: 'teal' },
  refund_topup: { label: 'เงินคืน / จ่ายเพิ่ม', tone: 'violet' },
};

export const MONEY_CATEGORY_ORDER: MoneyCategory[] = [
  'leader_fee',
  'advance',
  'actual',
  'refund_topup',
];

/* --------------------------- สถานะเคลียร์เงินกรุ๊ป -------------------------- */

export const SETTLEMENT_STATUS: Record<SettlementStatus, StatusMeta> = {
  awaiting_docs: { label: 'รอส่งเอกสาร', tone: 'slate' },
  under_review: { label: 'รอตรวจ', tone: 'violet' },
  docs_incomplete: { label: 'เอกสารไม่ครบ', tone: 'amber' },
  appointment_set: { label: 'นัดหมายแล้ว', tone: 'sky' },
  awaiting_settle_payment: { label: 'รอคืน / จ่ายเงิน', tone: 'indigo' },
  settled: { label: 'เคลียร์แล้ว', tone: 'teal' },
  closed: { label: 'ปิดงาน', tone: 'green' },
};

export const SETTLEMENT_FLOW: SettlementStatus[] = [
  'awaiting_docs',
  'under_review',
  'appointment_set',
  'awaiting_settle_payment',
  'settled',
  'closed',
];

export const REVIEW_DECISION: Record<ReviewDecision, StatusMeta> = {
  pending: { label: 'ยังไม่ตรวจ', tone: 'slate' },
  full: { label: 'อนุมัติเต็มจำนวน', tone: 'green' },
  partial: { label: 'อนุมัติบางส่วน', tone: 'amber' },
  rejected: { label: 'ไม่อนุมัติ', tone: 'red' },
};

/* ---------------------------- สถานะนัดหมาย ---------------------------- */

/*
  pending = นัดแล้ว รอหัวหน้าทัวร์ยืนยัน (นัดใหม่ / เจ้าหน้าที่เลื่อนนัด → กลับมาที่นี่)
  rescheduled = หัวหน้าทัวร์ขอเลื่อน — รอเจ้าหน้าที่นัดใหม่
*/
export const APPOINTMENT_STATUS: Record<AppointmentStatus, StatusMeta> = {
  pending: { label: 'รอหัวหน้าทัวร์ยืนยัน', tone: 'amber' },
  confirmed: { label: 'ยืนยันแล้ว', tone: 'sky' },
  rescheduled: { label: 'หัวหน้าทัวร์ขอเลื่อน', tone: 'violet' },
  attended: { label: 'เข้าพบแล้ว', tone: 'green' },
  cancelled: { label: 'ยกเลิก', tone: 'red' },
};

export const APPOINTMENT_KIND: Record<AppointmentKind, StatusMeta> = {
  clear: { label: 'เคลียร์เงินกรุ๊ป', tone: 'teal' },
  document: { label: 'ส่งเอกสาร', tone: 'blue' },
  meeting: { label: 'ประชุม / พบหัวหน้าทัวร์', tone: 'violet' },
  other: { label: 'อื่น ๆ', tone: 'slate' },
};

export const APPOINTMENT_MODE: Record<AppointmentMode, StatusMeta> = {
  office: { label: 'เข้าสำนักงาน', tone: 'blue' },
  online: { label: 'ประชุมออนไลน์', tone: 'violet' },
  document: { label: 'ส่งเอกสาร', tone: 'teal' },
};

/* -------------------------------- อื่น ๆ ------------------------------ */

/* --------------------------- ภาษาและระดับความสามารถ ------------------------ */

/**
 * สีป้ายระดับภาษา — ตามสัดส่วนอันดับภายในมาตรฐานนั้น (rank/maxRank) ใช้ได้กับทุกมาตรฐาน
 * เพราะแต่ละมาตรฐานมีจำนวนระดับไม่เท่ากัน (CEFR 6 ขั้น, HSK 9 ขั้น, JLPT 5 ขั้น ฯลฯ)
 * จึงเทียบเป็นสัดส่วนแทนตำแหน่งตายตัว — ยิ่งสัดส่วนสูงยิ่งเข้มขึ้น
 */
const LEVEL_TONE_BY_FRACTION: { max: number; tone: ToneKey }[] = [
  { max: 1 / 6, tone: 'slate' },
  { max: 2 / 6, tone: 'sky' },
  { max: 3 / 6, tone: 'blue' },
  { max: 4 / 6, tone: 'indigo' },
  { max: 5 / 6, tone: 'violet' },
  { max: 1, tone: 'teal' },
];

export function languageLevelTone(rank: number, maxRank: number): ToneKey {
  const fraction = maxRank > 0 ? rank / maxRank : 0;
  return (
    LEVEL_TONE_BY_FRACTION.find((t) => fraction <= t.max) ?? LEVEL_TONE_BY_FRACTION[LEVEL_TONE_BY_FRACTION.length - 1]
  ).tone;
}

/** สีป้าย "ภาษาแม่" */
export const NATIVE_LANGUAGE_TONE: ToneKey = 'green';

/* ------------------------- ความเชี่ยวชาญเส้นทาง ---------------------------- */

export const ROUTE_SKILL_LEVEL: Record<RouteSkillLevel, StatusMeta> = {
  traveled: { label: 'เคยเดินทาง', tone: 'slate' },
  assisted: { label: 'เคยช่วยงาน', tone: 'sky' },
  can_lead: { label: 'นำทัวร์ได้', tone: 'blue' },
  expert: { label: 'เชี่ยวชาญ', tone: 'indigo' },
  principal: { label: 'ผู้เชี่ยวชาญหลัก', tone: 'green' },
};

export const ROUTE_SKILL_ORDER: RouteSkillLevel[] = [
  'traveled',
  'assisted',
  'can_lead',
  'expert',
  'principal',
];

export function routeSkillRank(level: RouteSkillLevel): number {
  return ROUTE_SKILL_ORDER.indexOf(level);
}

export const ROUTE_TYPE: Record<RouteType, StatusMeta> = {
  region: { label: 'ภูมิภาค', tone: 'violet' },
  city: { label: 'เมือง', tone: 'blue' },
  airport: { label: 'สนามบิน', tone: 'teal' },
  tour_route: { label: 'เส้นทางทัวร์', tone: 'amber' },
};

/* -------------------------- ประเภททัวร์และความถนัด ------------------------- */

export const TOUR_SKILL_LEVEL: Record<TourSkillLevel, StatusMeta> = {
  able: { label: 'พอทำได้', tone: 'slate' },
  good: { label: 'ทำได้ดี', tone: 'sky' },
  strong: { label: 'ถนัด', tone: 'blue' },
  expert: { label: 'เชี่ยวชาญ', tone: 'green' },
};

export const TOUR_SKILL_ORDER: TourSkillLevel[] = ['able', 'good', 'strong', 'expert'];

export function tourSkillRank(level: TourSkillLevel): number {
  return TOUR_SKILL_ORDER.indexOf(level);
}

/* ------------------------------ ช่องทางติดต่อ ------------------------------ */

export const CONTACT_TYPE: Record<ContactType, StatusMeta> = {
  phone: { label: 'โทรศัพท์', tone: 'blue' },
  email: { label: 'อีเมล', tone: 'sky' },
  line: { label: 'LINE', tone: 'green' },
  facebook: { label: 'Facebook', tone: 'indigo' },
  instagram: { label: 'Instagram', tone: 'violet' },
  tiktok: { label: 'TikTok', tone: 'slate' },
  whatsapp: { label: 'WhatsApp', tone: 'teal' },
  wechat: { label: 'WeChat', tone: 'green' },
  website: { label: 'เว็บไซต์', tone: 'amber' },
  other: { label: 'ช่องทางอื่น', tone: 'slate' },
};

export const CONTACT_TYPE_ORDER: ContactType[] = [
  'phone',
  'email',
  'line',
  'facebook',
  'instagram',
  'tiktok',
  'whatsapp',
  'wechat',
  'website',
  'other',
];

/** ช่องทางที่เป็นลิงก์เปิดหน้าต่างใหม่ได้ */
export const LINKABLE_CONTACT: ContactType[] = [
  'facebook',
  'instagram',
  'tiktok',
  'website',
];

export const DOCUMENT_KIND: Record<DocumentKind, StatusMeta> = {
  national_id: { label: 'บัตรประชาชน', tone: 'slate' },
  passport: { label: 'หนังสือเดินทาง', tone: 'blue' },
  license: { label: 'ใบอนุญาต', tone: 'indigo' },
  certificate: { label: 'ใบรับรอง', tone: 'teal' },
  visa: { label: 'วีซ่า', tone: 'violet' },
  health: { label: 'เอกสารสุขภาพ', tone: 'green' },
  other: { label: 'อื่น ๆ', tone: 'slate' },
};

export const DOCUMENT_KIND_ORDER: DocumentKind[] = [
  'national_id',
  'passport',
  'license',
  'visa',
  'certificate',
  'health',
  'other',
];

/** เอกสารที่ต้องปิดบังเลขที่เสมอ (ข้อมูลส่วนบุคคลอ่อนไหว) */
export const SENSITIVE_DOCUMENT_KINDS: DocumentKind[] = ['national_id', 'passport'];

export const ROLE: Record<Role, StatusMeta> = {
  admin: { label: 'ผู้ดูแลระบบ', tone: 'indigo' },
  coordinator: { label: 'ฝ่ายจัดหัวหน้าทัวร์', tone: 'blue' },
  accounting: { label: 'ฝ่ายบัญชี', tone: 'teal' },
  leader: { label: 'หัวหน้าทัวร์', tone: 'violet' },
  sendoff: { label: 'เจ้าหน้าที่ส่งกรุ๊ป', tone: 'amber' },
};

export const ROLE_ORDER: Role[] = ['admin', 'coordinator', 'accounting', 'leader', 'sendoff'];

/** ป้ายบทบาทของผู้ใช้คนนี้ — ใช้ roleLabel ของตัวบุคคลถ้ามี (สีตามบทบาทเดิม) */
export function userRoleMeta(user: { role: Role; roleLabel?: string }): StatusMeta {
  const meta = ROLE[user.role];
  return user.roleLabel ? { ...meta, label: user.roleLabel } : meta;
}
