/**
 * ระบบจัดการหัวหน้าทัวร์ — นิยามชนิดข้อมูลกลาง (Demo)
 * ไฟล์นี้ไม่มีข้อมูลจำลองปะปน แยก mock data ไว้ที่ src/data/*
 */

/* ------------------------------------------------------------------ */
/* ผู้ใช้และสิทธิ์                                                       */
/* ------------------------------------------------------------------ */

export type Role = 'admin' | 'coordinator' | 'accounting' | 'leader' | 'sendoff';

export interface DemoUser {
  id: string;
  name: string;
  role: Role;
  position: string;
  /** ผูกกับหัวหน้าทัวร์ (กรณี role = leader) */
  leaderId?: string;
  /** ผูกกับทะเบียนเจ้าหน้าที่ส่งกรุ๊ป SOS-xxx (กรณี role = sendoff) */
  sendOffStaffId?: string;
  /**
   * ชื่อฝ่ายที่แสดงแทนชื่อบทบาท (ไม่เปลี่ยนสิทธิ์) — ใช้เมื่อคนในบทบาทเดียวกันทำหน้าที่ต่างกัน
   * เช่น ผู้จัดสเก็ต เป็น coordinator เหมือนฝ่ายจัดหัวหน้าทัวร์ แต่แสดงเป็น "ฝ่ายจัดสเก็ต"
   */
  roleLabel?: string;
  active: boolean;
}

/* ------------------------------------------------------------------ */
/* หัวหน้าทัวร์                                                         */
/* ------------------------------------------------------------------ */

/**
 * สถานะหลักของหัวหน้าทัวร์ — ผู้ใช้เลือกเองได้เพียง 3 ค่านี้
 * แยกคนละเรื่องกับ "ประเภทการใช้งานหัวหน้าทัวร์" · ห้ามเปลี่ยนประเภทโดยอัตโนมัติตามสถานะนี้
 *
 * “ติดงาน” และ “ลาพัก” ไม่ใช่สถานะหลักอีกต่อไป — เป็น “สถานะประกอบ” ที่คำนวณตามช่วงวัน:
 *   • ติดงาน → จากงานที่ได้รับมอบหมายในเมนูการจัดสเก็ต / Schedule
 *   • ลาพัก/ลา/ติดงานบริษัท → จากรายการในเมนูสถานะและการลา
 * ดู computeAvailabilityStatus() ใน lib/logic/availabilityStatus.ts — ห้ามเปลี่ยนสถานะหลักอัตโนมัติ
 */
export type LeaderStatus =
  | 'available' // พร้อมรับงาน
  | 'unavailable'; // ไม่พร้อมรับงาน

/**
 * สถานะการใช้งาน — คุมว่ายังใช้งานหัวหน้าทัวร์คนนี้ในระบบได้หรือไม่
 * แยกคนละมิติกับ "ความพร้อมรับงาน" (LeaderStatus) · ห้ามมีตัวเลือกซ้ำกันสองมิติ
 *   • active    ใช้งาน — นำไปพิจารณาจัดงานได้
 *   • suspended ระงับการใช้งาน — จัดงานใหม่ไม่ได้ แต่เก็บข้อมูล/ประวัติเดิมไว้
 *   • ended     สิ้นสุดการใช้งาน — จัดงานใหม่ไม่ได้ แต่รักษาประวัติทั้งหมดไว้
 * เปลี่ยนเป็น suspended/ended → ระบบตั้งความพร้อมรับงานเป็น 'unavailable' ให้อัตโนมัติ
 */
export type LeaderUsageStatus = 'active' | 'suspended' | 'ended';

/** รูปแบบการรับงาน */
export type WorkAvailabilityMode =
  | 'continuous' // รับงานต่อเนื่อง
  | 'occasional' // รับงานเป็นครั้งคราว
  | 'weekends' // รับเฉพาะวันหยุด
  | 'date_range' // รับตามช่วงเวลาที่กำหนด
  | 'contact_first'; // ติดต่อสอบถามก่อน

/** ศาสนา — ข้อมูลไม่บังคับ · ห้ามใช้คำนวณความเหมาะสมกับงาน */
export type Religion =
  | 'buddhist'
  | 'christian'
  | 'islam'
  | 'hindu'
  | 'sikh'
  | 'other'
  | 'none'
  | 'prefer_not_to_say';

/** สถานภาพสมรส — ข้อมูลไม่บังคับ · ห้ามใช้คำนวณความเหมาะสมกับงาน */
export type MaritalStatus =
  | 'single'
  | 'married'
  | 'divorced'
  | 'widowed'
  | 'separated'
  | 'prefer_not_to_say';

/** แหล่งที่มาของข้อมูลหัวหน้าทัวร์ */
export type LeaderSourceType =
  | 'self_apply' // สมัครด้วยตนเอง
  | 'staff_referral' // พนักงานแนะนำ
  | 'customer_referral' // ลูกค้าแนะนำ
  | 'agent_referral' // เอเจนท์แนะนำ
  | 'past_collaboration' // เคยร่วมงาน
  | 'online' // ช่องทางออนไลน์
  | 'other'; // ช่องทางอื่น

/**
 * ที่อยู่ปัจจุบัน — เก็บแยกฟิลด์เสมอ (ห้ามเก็บเป็นข้อความเดียว)
 * จังหวัด/อำเภอ/ตำบล ยังเป็น Text Input ใน Demo แต่แยกฟิลด์ไว้เพื่อเชื่อม Master ภายหลัง
 */
export interface LeaderAddress {
  houseNo: string;
  building?: string;
  villageNo?: string;
  alley?: string;
  road?: string;
  subdistrict?: string;
  district?: string;
  province?: string;
  /** รหัสจังหวัดมาตรฐาน (อ้างอิง Master เขตปกครองไทย) — เก็บคู่กับชื่อจังหวัด */
  provinceCode?: string;
  /** รหัสอำเภอ/เขต — เก็บคู่กับชื่ออำเภอ */
  districtCode?: string;
  postalCode?: string;
  /** อ้างอิง Country Master ด้วย id (ค่าเริ่มต้น C-TH) */
  countryId: string;
  note?: string;
}

/**
 * ประเภทหัวหน้าทัวร์ตามสถานะบุคคล — กำหนดว่าต้องกรอกเอกสารชุดใด
 *  thai      — คนไทย: บัตรประชาชน + ที่อยู่ตามบัตรประชาชน
 *  foreigner — ชาวต่างชาติ: หนังสือเดินทาง / วีซ่า / ใบอนุญาตทำงาน + ที่อยู่ในประเทศไทย
 */
export type PersonType = 'thai' | 'foreigner';

/** สถานะการถือเอกสาร (วีซ่า / ใบอนุญาตทำงาน) */
export type DocHoldingStatus = 'has' | 'none' | 'not_applicable';

/** สถานะการทำงานของหัวหน้าทัวร์ประจำ */
export type EmploymentWorkStatus = 'active' | 'on_leave' | 'ended';

/** รูปแบบค่าจ้าง (ฟรีแลนซ์) */
export type PayType = 'fixed' | 'negotiable';

/** หน่วยค่าจ้าง (ฟรีแลนซ์) */
export type PayUnit = 'per_day' | 'per_trip';

/**
 * ประเภทการใช้งานหัวหน้าทัวร์ (แยกจากสถานะพร้อมรับงาน)
 *  general   — ทั่วไป: ประเภทเริ่มต้น ยังไม่ถูกปรับเป็นประจำ/ฟรีแลนซ์/เอเจนท์
 *              (ไม่ได้หมายความว่าไม่พร้อมรับงาน)
 *  regular   — ประจำ: บริษัทเรียกใช้/จัดให้ทำงานเป็นประจำ
 *              (ไม่ได้หมายความว่าเป็นพนักงานประจำ · ไม่บังคับรหัสพนักงาน)
 *  freelance — ฟรีแลนซ์: ไม่ได้เรียกใช้เป็นประจำ รับงานเป็นครั้งคราว
 *  agent     — เอเจนท์: ได้รับการแนะนำ/จัดหาผ่านเอเจนท์
 *              (ไม่ต้องมี Master บริษัทเอเจนท์ · ระบุแหล่งที่มาแบบไม่บังคับ)
 */
export type TourLeaderUsageType = 'general' | 'regular' | 'freelance' | 'agent';

/** ชื่อเดิมที่ใช้ในโค้ดส่วนอื่น — คงไว้เพื่อไม่ให้กระทบของเดิม */
export type LeaderType = TourLeaderUsageType;

export type Gender = 'male' | 'female' | 'other' | 'unspecified';

/** ประวัติการเปลี่ยนประเภทหัวหน้าทัวร์ */
export interface TypeHistoryEntry {
  id: string;
  from: LeaderType | null;
  to: LeaderType;
  effectiveDate: string;
  at: string;
  by: string;
  reason?: string;
}

/* ----------------------------- ช่องทางติดต่อ ----------------------------- */

export type ContactType =
  | 'phone'
  | 'email'
  | 'line'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'whatsapp'
  | 'wechat'
  | 'website'
  | 'other';

export interface ContactChannel {
  id: string;
  type: ContactType;
  /** ป้ายกำกับ เช่น "เบอร์หลัก", "เบอร์สำรอง" */
  label?: string;
  value: string;
  isPrimary: boolean;
  /** ช่วงเวลาที่สะดวกให้ติดต่อ เช่น "18:00–21:00 น." */
  preferredContactTime?: string;
  note?: string;
}

/* -------------------------- ภาษาและระดับความสามารถ ------------------------ */

/**
 * มาตรฐานวัดระดับภาษา — แต่ละภาษาใช้มาตรฐานของตัวเอง ไม่ใช่ CEFR กับทุกภาษาเหมือนเดิม
 * (อังกฤษ/ฝรั่งเศส/เยอรมัน/สเปน = CEFR · จีน = HSK · ญี่ปุ่น = JLPT · เกาหลี = TOPIK ·
 * ภาษาอื่นที่ยังไม่มีมาตรฐานเฉพาะ = GENERAL) กำหนดจาก languageCode อัตโนมัติ ผู้ใช้ไม่ต้องเลือกเอง
 * ⚠️ ห้ามเทียบ levelRank ข้ามมาตรฐานกันตรง ๆ (เช่น HSK 5 กับ JLPT N2 เทียบกันไม่ได้) —
 *    เทียบได้เฉพาะภายในมาตรฐานเดียวกัน ดูรายการระดับของแต่ละมาตรฐานที่
 *    src/data/leaders/languageStandards.ts
 */
export type LanguageStandard = 'CEFR' | 'HSK' | 'JLPT' | 'TOPIK' | 'GENERAL';

export interface LanguageSkill {
  id: string;
  /** รหัสภาษาจาก Master Data (เช่น EN/JA) หรือ 'OTHER' เมื่อระบุชื่อเอง */
  languageCode: string;
  /** ชื่อภาษา — มาจาก Master Data ตาม languageCode หรือระบุเองเมื่อ languageCode === 'OTHER' */
  languageName: string;
  /** เป็นภาษาแม่หรือไม่ — เลือกได้มากกว่า 1 ภาษา (พูดได้หลายภาษาแม่) */
  isNativeLanguage: boolean;
  /** มาตรฐานที่ใช้วัดระดับของภาษานี้ — กำหนดอัตโนมัติจาก languageCode */
  standard: LanguageStandard;
  /** รหัสระดับ (เช่น 'B2'/'HSK5'/'N2') — null เมื่อเป็นภาษาแม่ (ไม่ต้องระบุระดับ) */
  levelCode: string | null;
  /** ชื่อระดับภาษาไทย (เช่น 'ใช้งานได้ดี') — คู่กับ levelCode */
  levelName: string | null;
  /** อันดับระดับภายในมาตรฐานเดียวกัน (1 = ต่ำสุด) — ใช้เทียบ/กรอง "อย่างน้อยระดับ" ของภาษาเดียวกัน */
  levelRank: number | null;
}

/* -------------------- ประเทศและเส้นทางที่เชี่ยวชาญ (Master) ---------------- */

export interface Country {
  id: string;
  code: string; // = alpha-2 (คงชื่อเดิมไว้เพื่อความเข้ากันได้กับข้อมูล/โค้ดเดิม)
  /** รหัส ISO 3166-1 alpha-2 เช่น JP (เท่ากับ code เสมอ) */
  alpha2?: string;
  /** รหัส ISO 3166-1 alpha-3 เช่น JPN */
  alpha3?: string;
  /**
   * สัญชาติภาษาอังกฤษตามที่พิมพ์บนหน้าหนังสือเดินทาง เช่น THAI (ต่างจาก nameEn = THAILAND)
   * ดินแดนที่ใช้สัญชาติของประเทศแม่จะซ้ำกับประเทศแม่ (เช่น เกิร์นซีย์ = BRITISH) — ตั้งใจให้ซ้ำ
   */
  nationality?: string;
  nameTh: string;
  nameEn: string;
  /** ภูมิภาค (ภาษาไทย) เช่น เอเชีย */
  region?: string;
  /** อนุภูมิภาค (ภาษาไทย) เช่น เอเชียตะวันออก */
  subregion?: string;
  /** รหัสโทรศัพท์ระหว่างประเทศ เช่น +66 */
  callingCode?: string;
  isActive: boolean;
  order?: number;
}

export type RouteType = 'region' | 'city' | 'airport' | 'tour_route';

/**
 * Airport Master — สนามบินนานาชาติ/สนามบินหลักของแต่ละประเทศ
 * เชื่อมกับ Country Master ด้วย countryCode (alpha-2) และระบุเอกลักษณ์ด้วย iata
 * `id` = route id ของระบบ (ใช้เป็นเอกลักษณ์เดียวกับ TourRoute สำหรับการจับคู่งาน)
 */
export interface Airport {
  id: string;
  /** รหัส IATA 3 ตัวอักษร (unique) เช่น NRT */
  iata: string;
  /** รหัสประเทศ ISO 3166-1 alpha-2 เช่น JP */
  countryCode: string;
  nameTh: string;
  nameEn: string;
  cityTh: string;
  cityEn: string;
  /** สนามบินยอดนิยม — แสดงไว้ด้านบนของรายการ */
  popular: boolean;
  isActive: boolean;
}

export interface TourRoute {
  id: string;
  countryId: string;
  routeType: RouteType;
  /** รหัสสนามบิน เช่น NRT (เฉพาะ routeType = airport) */
  code?: string;
  nameTh: string;
  nameEn?: string;
  isActive: boolean;
  order?: number;
}

/**
 * ประเทศประจำ — ประเทศที่บริษัทเรียกใช้บุคคลนี้ทำงานเป็นหลัก
 * แยกคนละเรื่องกับ "ประเทศที่เชี่ยวชาญ" (TourLeaderRouteSkill)
 */
export interface AssignedCountry {
  id: string;
  countryId: string;
  /** ประเทศประจำหลักได้เพียงหนึ่งรายการ */
  isPrimary: boolean;
  /** ภูมิภาคหรือเมืองประจำ */
  regionOrCity?: string;
  startDate?: string;
  /** สถานะการใช้งานของประเทศประจำนี้ */
  active: boolean;
  note?: string;
}

/** ระดับความเชี่ยวชาญเส้นทาง (เรียงจากน้อยไปมาก) */
export type RouteSkillLevel =
  | 'traveled' // เคยเดินทาง
  | 'assisted' // เคยช่วยงาน
  | 'can_lead' // นำทัวร์ได้
  | 'expert' // เชี่ยวชาญ
  | 'principal'; // ผู้เชี่ยวชาญหลัก

export type RouteCoverage = 'all_routes' | 'selected_routes';

export interface TourLeaderRouteSkill {
  id: string;
  countryId: string;
  coverage: RouteCoverage;
  /** ใช้เมื่อ coverage = selected_routes */
  routeIds: string[];
  skillLevel: RouteSkillLevel;
  tripCount?: number;
  lastWorkedAt?: string;
  note?: string;
}

/* ---------------------- ประเภททัวร์และความถนัด (Master) -------------------- */

export type TourSkillCategory = 'customer_group' | 'work_skill';

/** ระดับความถนัด (เรียงจากน้อยไปมาก) */
export type TourSkillLevel =
  | 'able' // พอทำได้
  | 'good' // ทำได้ดี
  | 'strong' // ถนัด
  | 'expert'; // เชี่ยวชาญ

export interface TourTypeSkill {
  id: string;
  /** อ้างอิง MasterItem.id ในกลุ่ม customerGroups หรือ workSkills */
  masterId: string;
  category: TourSkillCategory;
  /** รหัสจาก Master เช่น GROUP_VIP หรือ ALL (ได้ทุกประเภท) */
  code: string;
  name: string;
  level: TourSkillLevel;
  note?: string;
}

/* --------------------------- ประวัติการทำงาน ------------------------------ */

/*
  ผลแบบสอบถามรายกรุ๊ปเป็นข้อมูลที่คำนวณจากกรุ๊ปที่มอบหมายจริง (ดู lib/logic/tourGroupScoreRows)
  ไม่มีชนิดข้อมูลสำหรับ "บันทึกย้อนหลังเอง" อีกต่อไป — เคยมีแต่ไม่เคยถูกนำมาแสดงที่ไหน
*/

/* ------------------------- ประวัติการแก้ไขข้อมูล -------------------------- */

/** หมวดข้อมูลที่ระบบบันทึกประวัติการเปลี่ยนแปลง */
export type AuditCategory =
  | 'profile'
  | 'leaderType'
  | 'workStatus'
  | 'assignedCountry'
  | 'routeExpertise'
  | 'language'
  | 'tourSkill'
  | 'contact'
  | 'document'
  | 'bankAccount'
  | 'activation';

export interface AuditEntry {
  id: string;
  at: string;
  by: string;
  category: AuditCategory;
  action: string;
  /** ค่าเดิม → ค่าใหม่ (ข้อมูลอ่อนไหวถูกปิดบังแล้ว) */
  oldValue?: string;
  newValue?: string;
  reason?: string;
  detail?: string;
}

export type DocumentKind =
  | 'national_id'
  | 'passport'
  | 'license'
  | 'certificate'
  | 'visa'
  | 'health'
  | 'other';

/** สถานะการตรวจสอบเอกสาร */
export type DocumentVerifyStatus = 'pending' | 'verified' | 'rejected';

export interface LeaderDocument {
  id: string;
  kind: DocumentKind;
  name: string;
  /** เลขที่เอกสาร — ปิดบังเสมอเมื่อเป็นเอกสารอ่อนไหว (Demo ไม่เก็บเลขจริง) */
  number: string;
  /** ประเทศผู้ออกเอกสาร (อ้างอิง Country Master ด้วย id) */
  issuingCountryId?: string;
  issuedAt: string; // ISO date
  expiresAt: string | null; // ISO date | null = ไม่มีวันหมดอายุ
  fileName: string; // ชื่อไฟล์จำลอง (ไม่มีการอัปโหลดจริง)
  verifyStatus: DocumentVerifyStatus;
  note?: string;
}

/** บัญชีธนาคารที่ใช้ในใบเบิก (payload — คงรูปเดิมไว้เพื่อไม่กระทบโมดูลเบิกจ่าย) */
export interface BankAccount {
  bank: string;
  /** เก็บเฉพาะเลขที่ถูกปิดบัง เช่น xxx-x-x1234-x — ไม่เก็บเลขบัญชีจริง */
  accountNoMasked: string;
  accountName: string;
  branch: string;
}

/** บัญชีธนาคารของหัวหน้าทัวร์ — มีได้หลายบัญชี กำหนดบัญชีหลักได้หนึ่งบัญชี */
export interface LeaderBankAccount {
  id: string;
  /** อ้างอิงชื่อธนาคารจาก Master (banks) */
  bank: string;
  accountName: string;
  /** ปิดบังเสมอ */
  accountNoMasked: string;
  branch?: string;
  promptPay?: string;
  isPrimary: boolean;
  active: boolean;
}

/** ผู้ติดต่อฉุกเฉิน — มีได้หลายรายการ กำหนดผู้ติดต่อหลักได้หนึ่งรายการ */
export interface EmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  /** ช่องทางอื่น เช่น LINE หรืออีเมล */
  otherChannel?: string;
  isPrimary: boolean;
  note?: string;
}

/* --------------------- ประวัติการทำงาน (สถานประกอบการ) -------------------- */

/**
 * ประวัติ/ประสบการณ์การทำงานกับบริษัท ร้านค้า องค์กร หรือสถานประกอบการ
 * ⚠️ คนละเรื่องกับงานทัวร์ที่ได้รับมอบหมายในระบบ (ซึ่งเชื่อมด้วย tourJobId)
 */
export interface EmploymentHistory {
  id: string;
  tourLeaderId: string;
  employerName: string;
  employerPhone?: string;
  /** เงินเดือน — ข้อมูลอ่อนไหว ปิดบังตามสิทธิ์ */
  salary?: number;
  currency: string;
  startMonth: number; // 1-12
  startYear: number;
  endMonth?: number;
  endYear?: number;
  isCurrentJob: boolean;
  position: string;
  jobDescription?: string;
  reasonForLeaving?: string;
  note?: string;
  /** ลำดับที่ผู้ใช้จัดเรียงเอง (0,1,2…) — ใช้แสดงผลตามลำดับล่าสุดที่บันทึกไว้ */
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
}

/** ผลการคำนวณประสบการณ์รวม (ไม่นับเดือนที่ซ้อนกันซ้ำ) */
export interface ExperienceSummary {
  totalMonths: number;
  years: number;
  months: number;
  label: string; // เช่น "8 ปี 4 เดือน"
  employerCount: number;
  currentJobs: EmploymentHistory[];
  latestPosition: string;
  /** ช่วงเวลาที่ทับซ้อนกัน (ใช้เตือน) */
  hasOverlap: boolean;
}

export interface LeaderEvaluation {
  id: string;
  jobId: string;
  jobTitle: string;
  date: string;
  scoreService: number; // 1-5
  scoreKnowledge: number;
  scoreDiscipline: number;
  scoreDocument: number;
  comment: string;
  by: string;
}

export interface TourLeader {
  /* ---------------------- Section 1: ข้อมูลพื้นฐาน --------------------- */
  id: string; // รหัสหัวหน้าทัวร์ (ไม่ซ้ำ) เช่น TL-001
  title: string; // คำนำหน้า (ไทย)
  /** คำนำหน้าภาษาอังกฤษ — เติมให้อัตโนมัติจากคำนำหน้าไทย แก้ไขเองได้ */
  titleEn?: string;
  firstName: string;
  lastName: string;
  firstNameEn: string;
  lastNameEn: string;
  nickname: string;
  /** ชื่อเล่นภาษาอังกฤษ (ไม่บังคับ) */
  nicknameEn?: string;
  gender: Gender;
  birthDate: string; // ISO date — ⚠️ ไม่เก็บ "อายุ" ซ้ำ เพราะอายุเปลี่ยนตามเวลา (คำนวณตอนแสดงผล)
  /** สัญชาติ (อ้างอิง Country Master ด้วย id) */
  nationalityCountryId: string;
  /** ศาสนา — ไม่บังคับ · ห้ามใช้คำนวณความเหมาะสมกับงาน */
  religion?: Religion;
  /** ระบุเพิ่มเติมเมื่อเลือก "ศาสนาอื่น" */
  religionOther?: string;
  /** สถานภาพสมรส — ไม่บังคับ */
  maritalStatus?: MaritalStatus;
  /** อักษรย่อสำหรับ Avatar เมื่อไม่มีรูป */
  avatarInitials: string;
  avatarColor: string;
  /**
   * รูปประจำตัว — Demo เก็บเป็น Data URL (Base64) ใน memory เท่านั้น
   * ไม่มีการอัปโหลดขึ้น Server
   */
  photoUrl: string | null;
  /**
   * ข้อมูลยังใช้อยู่ในระบบหรือไม่ — ค่าสะท้อนของ usageStatus (false เฉพาะ 'ended')
   * “ระงับการใช้งาน” ยัง active = true (หยุดชั่วคราว ยังค้นเจอในรายการหลัก แต่จัดงานใหม่ไม่ได้)
   * อ่านได้ทั่วระบบ แต่ให้แก้ผ่าน usageStatus เท่านั้น (ไม่ลบข้อมูลถาวร)
   */
  active: boolean;

  /* --------------------- Section 2: ประเภทการใช้งาน -------------------- */
  leaderType: LeaderType;
  /** วันที่เริ่มเป็นประเภทปัจจุบัน */
  typeStartDate: string;
  typeHistory: TypeHistoryEntry[];
  /**
   * วันที่เริ่มร่วมงาน = วันที่เริ่มมีความสัมพันธ์/เริ่มทำงานกับบริษัท
   * ⚠️ คนละอย่างกับ availableStartDate
   */
  joinedAt: string;
  /**
   * วันที่พร้อมเริ่มงาน = วันที่บุคคลพร้อมรับมอบหมายงาน
   * ⚠️ คนละอย่างกับ joinedAt
   */
  availableStartDate: string;
  /** รูปแบบการรับงาน */
  availabilityMode?: WorkAvailabilityMode;
  /** ช่วงวันที่พร้อมรับงาน (ใช้เมื่อ availabilityMode = date_range) */
  availabilityFrom?: string;
  availabilityTo?: string;
  /** แหล่งที่มาหรือผู้แนะนำ (ข้อความอิสระ — ใช้กับประเภทเอเจนท์เป็นหลัก) */
  source: string;
  /** แหล่งที่มาของข้อมูล (ตัวเลือกมาตรฐาน) */
  sourceType?: LeaderSourceType;
  /** ระบุเพิ่มเติมเมื่อเลือก "ช่องทางอื่น" */
  sourceOther?: string;
  /** เงื่อนไขค่าตอบแทน */
  compensationNote: string;
  /** หมายเหตุความพร้อมรับงาน / ช่วงเวลาที่พร้อมรับงาน (ใช้กับฟรีแลนซ์) */
  availabilityNote: string;
  /** หมายเหตุของประเภทการใช้งาน */
  typeNote: string;

  /* ---------- รายละเอียดตามรูปแบบการร่วมงาน (เก็บเฉพาะของรูปแบบที่เลือก) ---------- */
  /* -- หัวหน้าทัวร์ประจำ -- */
  employeeCode?: string;
  /** หน่วยงาน / ทีม */
  team?: string;
  workStatus?: EmploymentWorkStatus;

  /* -- หัวหน้าทัวร์ฟรีแลนซ์ -- */
  payType?: PayType;
  /** อัตราค่าจ้างเบื้องต้น (บาท) */
  payRate?: number;
  payUnit?: PayUnit;

  /* -- หัวหน้าทัวร์เอเจนท์ -- */
  agencyName?: string;
  agencyContactName?: string;
  agencyContactPhone?: string;
  agencyContactEmail?: string;
  /** รหัสหรือเลขอ้างอิงเอเจนซี่ (ถ้ามี) */
  agencyRefCode?: string;
  /** ความพร้อมรับงาน — แยกจากสถานะการใช้งานและประเภทหัวหน้าทัวร์ */
  status: LeaderStatus;
  /**
   * สถานะการใช้งาน — แหล่งความจริงของ "ใช้งาน / ระงับการใช้งาน / สิ้นสุดการใช้งาน"
   * `active` (boolean ด้านล่าง) เป็นค่าสะท้อนของฟิลด์นี้ (active === usageStatus === 'active')
   */
  usageStatus: LeaderUsageStatus;

  /* ------------------ Section 3–7: ข้อมูลเชิงความสามารถ ---------------- */
  contacts: ContactChannel[];
  languages: LanguageSkill[];
  /** ประเทศประจำ (บริษัทเรียกใช้เป็นหลัก) */
  assignedCountries: AssignedCountry[];
  /** ประเทศ/เส้นทางที่เชี่ยวชาญ (ลำดับชั้น ประเทศ → เส้นทางย่อย) */
  routeSkills: TourLeaderRouteSkill[];
  /** ประเภทกลุ่มลูกค้า + ทักษะการทำงาน */
  tourSkills: TourTypeSkill[];

  /** ประวัติการทำงานกับสถานประกอบการ (แยกจากงานทัวร์ที่ได้รับมอบหมาย) */
  employmentHistory: EmploymentHistory[];

  /* ------------------- Section 8–10: เอกสาร / เงิน / อื่น -------------- */
  documents: LeaderDocument[];
  bankAccounts: LeaderBankAccount[];
  /** ที่อยู่ปัจจุบัน — เก็บแยกฟิลด์ */
  address: LeaderAddress;

  /* ---------- เอกสารประจำตัวตามประเภทบุคคล (เก็บเฉพาะของประเภทที่เลือก) ---------- */
  /** คนไทย / ชาวต่างชาติ — ข้อมูลเดิมที่ยังไม่เคยระบุจะไม่มีค่า */
  personType?: PersonType;

  /* -- คนไทยเท่านั้น -- */
  /** เลขบัตรประชาชน — ปิดบังเสมอก่อนบันทึก (Demo ไม่เก็บเลขจริง) */
  nationalIdNumber?: string;
  nationalIdExpiresAt?: string; // ISO date
  /** ที่อยู่ตามบัตรประชาชน — เก็บแยกฟิลด์ */
  idCardAddress?: LeaderAddress;
  /** true = ที่อยู่ตามบัตรประชาชนใช้ข้อมูลเดียวกับที่อยู่ปัจจุบัน */
  idCardAddressSameAsCurrent?: boolean;

  /* -- ชาวต่างชาติเท่านั้น -- */
  /** ประเทศที่เกิด (อ้างอิง Country Master ด้วย id) */
  birthCountryId?: string;
  /** หมายเลขหนังสือเดินทาง — ปิดบังเสมอก่อนบันทึก */
  passportNumber?: string;
  /** ประเทศที่ออกหนังสือเดินทาง (อ้างอิง Country Master ด้วย id) */
  passportCountryId?: string;
  passportIssuedAt?: string; // ISO date
  passportExpiresAt?: string; // ISO date
  /** สถานะวีซ่า — เก็บรายละเอียดวีซ่าเฉพาะเมื่อเป็น 'has' */
  visaStatus?: DocHoldingStatus;
  visaNumber?: string;
  visaType?: string;
  visaExpiresAt?: string; // ISO date
  /** สถานะใบอนุญาตทำงาน — เก็บรายละเอียดเฉพาะเมื่อเป็น 'has' */
  workPermitStatus?: DocHoldingStatus;
  workPermitNumber?: string;
  workPermitExpiresAt?: string; // ISO date
  /** ที่อยู่ในประเทศต้นทาง — เก็บแยกฟิลด์ (ที่อยู่ในไทยใช้ `address` ร่วมกับคนไทย) */
  homeCountryAddress?: LeaderAddress;
  /** ผู้ติดต่อฉุกเฉิน — หลายรายการ */
  emergencyContacts: EmergencyContact[];
  /** หมายเหตุทั่วไป (แสดงได้ทุกบทบาท) */
  generalNote: string;
  /** หมายเหตุภายใน (เจ้าหน้าที่เท่านั้น) */
  internalNote: string;
  /** ข้อควรระวัง */
  cautions: string;

  /* ------------------------------ ตัวเลขสรุป --------------------------- */
  rating: number; // 0-5
  totalJobs: number;
  totalDays: number;

  evaluations: LeaderEvaluation[];
  /** ประวัติการแก้ไขข้อมูล (จำลอง) */
  auditLog: AuditEntry[];

  /* -------------------------------- Metadata -------------------------- */
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/* ------------------------------------------------------------------ */
/* งานทัวร์                                                             */
/* ------------------------------------------------------------------ */

export type JobStatus =
  | 'draft' // ร่าง
  | 'need_leader' // รอจัดหัวหน้าทัวร์
  | 'offered' // เสนอหัวหน้าทัวร์ (รอหัวหน้าทัวร์ตอบรับ)
  | 'rejected' // หัวหน้าทัวร์ปฏิเสธการรับงาน
  | 'accepted' // ตอบรับแล้ว
  | 'traveling' // กำลังเดินทาง
  | 'awaiting_settlement' // รอเคลียร์
  | 'closed' // ปิดงาน
  | 'cancelled'; // ยกเลิกกรุ๊ป/งานทั้งหมด (ต่างจาก rejected ที่หัวหน้าทัวร์ปฏิเสธแค่ข้อเสนอ)

export interface Flight {
  flightNo: string;
  route: string;
  departAt: string; // ISO datetime
  arriveAt: string; // ISO datetime
}

export interface StatusEvent {
  id: string;
  at: string; // ISO datetime
  from: string | null;
  to: string;
  by: string;
  note?: string;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  /** ไฟล์จำลอง ไม่มีการอัปโหลดจริงใน Demo */
  uploadedAt: string;
}

export interface TourJob {
  id: string; // รหัสงาน เช่น JOB-2026-001
  title: string; // ชื่อโปรแกรมทัวร์
  customer: string; // ลูกค้า/บริษัทคู่ค้า
  country: string;
  cities: string[];
  route: string;
  departDate: string; // ISO date
  returnDate: string; // ISO date
  meetingDateTime: string; // ISO datetime — วัน/เวลานัดหมาย
  meetingPoint: string; // สนามบิน/จุดนัดพบ
  outboundFlight: Flight;
  inboundFlight: Flight;
  paxCount: number;
  /** ประเภทกลุ่มลูกค้า (อ้างอิง Master: customerGroups) — ใช้จับคู่ความถนัด */
  customerGroup?: string;
  leaderId: string | null; // หัวหน้าทัวร์หลัก
  assistantLeaderIds: string[]; // เจ้าหน้าที่ส่งกรุ๊ป (แสดงผล; เดิม "ผู้ช่วยหัวหน้าทัวร์") — คง key เดิม
  coordinator: string; // ผู้ประสานงาน
  leaderFee: number; // ค่าตอบแทน (บาท)
  budget: number; // งบประมาณ (บาท)
  attachments: Attachment[];
  note: string;
  status: JobStatus;
  history: StatusEvent[];

  /* ---- ระดับโปรแกรม/พีเรียด (อ้างอิงรายงานโปรแกรมทัวร์จริง — ไม่ใช่ Ticket Stock/PNR) ----
   * โปรแกรมหนึ่งมีได้หลายพีเรียด: จัดกลุ่มด้วย programCode · แต่ละงาน = 1 พีเรียด (periodCode)
   * ทุกฟิลด์เป็น optional เพื่อไม่กระทบข้อมูลเดิม (งานที่ไม่มี = โปรแกรมพีเรียดเดียว) */
  /** รหัสโปรแกรม (จัดกลุ่มพีเรียด) เช่น ZGCKG-2622HU */
  programCode?: string;
  /** Group/Period Code เช่น CKG-260805A-HU (ถ้าไม่ระบุ ใช้ id เป็นรหัสพีเรียด) */
  periodCode?: string;
  /** บัส เช่น 'A' */
  bus?: string;
  /** สถานะการขาย เช่น SELL / CLOSE / FULL */
  saleStatus?: string;
  /** สถานะยืนยันกรุ๊ป เช่น CONFIRM / WAIT */
  confirmStatus?: string;
  /** ที่นั่งทั้งหมด */
  totalSeats?: number;
  /** ยอดจอง (ถ้าไม่ระบุ ใช้ paxCount) */
  bookedSeats?: number;
  /** พีเรียดนี้ไม่ต้องใช้หัวหน้าทัวร์ */
  leaderNotNeeded?: boolean;
  /* ---- ข้อมูลเสริม (แสดงใน "ดูรายละเอียด" เท่านั้น — ไม่ทำให้ Card หลักแน่น) ---- */
  ticketDeadline?: string; // ISO date — เส้นตายออกตั๋ว
  sellPrice?: number; // ราคาขาย
  promotionStatus?: string; // สถานะโปรโมชัน
  paymentInfo?: string; // ข้อมูลการชำระเงิน
  periodRemark?: string; // หมายเหตุพีเรียด
}

/* ------------------------------------------------------------------ */
/* ประวัติไกด์ถูกยกเลิกงาน + Reminder การชดเชยงาน                          */
/* ------------------------------------------------------------------ */

/** สถานะการชดเชยงานให้ไกด์ที่ถูกยกเลิก */
export type GuideCompensationStatus = 'pending' | 'compensated';

/**
 * ประวัติ 1 รายการ = ไกด์ 1 คน ถูกยกเลิกจากงาน 1 กรุ๊ป
 * สร้างอัตโนมัติเมื่องานที่มีไกด์ Assign อยู่แล้วถูกเปลี่ยนสถานะเป็น "cancelled"
 * เก็บเป็นข้อมูลกลาง (ไม่ผูกกับผู้ใช้คนใดคนหนึ่ง) เพื่อให้พนักงานทุกคนเห็นตรงกัน
 * ⚠️ เก็บชื่อ/เส้นทางแบบ denormalize ไว้ ณ เวลาที่ยกเลิก — กันข้อมูลเพี้ยนหากภายหลังมีการแก้ไขงาน/หัวหน้าทัวร์ต้นทาง
 */
export interface GuideCancellationRecord {
  id: string; // รหัส เช่น GC-2026-001
  leaderId: string;
  leaderName: string; // ชื่อไกด์ ณ เวลาที่ยกเลิก
  jobId: string;
  jobTitle: string; // ชื่อกรุ๊ป/โปรแกรมทัวร์
  route: string; // เส้นทาง
  originalTravelDate: string; // ISO date — วันที่เดินทางไปเดิม (departDate ของงาน)
  originalReturnDate: string; // ISO date — วันที่เดินทางกลับเดิม (returnDate ของงาน)
  cancelledDate: string; // ISO date — วันที่มีการยกเลิก
  responsibleUser: string; // ผู้รับผิดชอบกรุ๊ป (ผู้ประสานงานของงานนั้น ณ เวลาที่ยกเลิก)
  compensationStatus: GuideCompensationStatus;
  compensatedAt?: string; // ISO date
  compensatedBy?: string;
  compensatedJobId?: string; // งานที่นำมาชดเชย (ถ้าระบุ)
  compensatedNote?: string;
}

/* ------------------------------------------------------------------ */
/* เบิกจ่าย                                                             */
/* ------------------------------------------------------------------ */

export type ExpenseStatus =
  | 'draft' // ร่าง
  | 'submitted' // ส่งอนุมัติ
  | 'revise' // ให้แก้ไข
  | 'rejected' // ปฏิเสธ
  | 'approved' // อนุมัติ
  | 'awaiting_payment' // รอจ่าย
  | 'paid' // จ่ายแล้ว
  | 'cancelled'; // ยกเลิกโดยผู้ขอเบิกเอง (เช่น บันทึกซ้ำ) — ต่างจาก rejected ที่บัญชีเป็นคนปฏิเสธ

/** ประเภทเงิน (แบ่งรายการเงินตามที่ระบบต้องรองรับ) */
export type MoneyCategory =
  | 'leader_fee' // ค่าตอบแทนหัวหน้าทัวร์
  | 'advance' // เงินทดรองก่อนเดินทาง
  | 'actual' // ค่าใช้จ่ายจริง
  | 'refund_topup'; // เงินคืน / เงินจ่ายเพิ่ม

export interface ExpenseLine {
  id: string;
  expenseType: string; // ประเภทค่าใช้จ่าย (อ้างอิง master data)
  purpose: string; // วัตถุประสงค์
  amount: number; // จำนวนเงินสกุลต่างประเทศ
  currency: string;
  fxRate: number; // อัตราแลกเปลี่ยน
  amountTHB: number; // ยอดเทียบเงินบาท
  receiptNo: string; // เลขที่ใบเสร็จ
  evidenceFileName: string; // หลักฐานจำลอง
  /** รูปหลักฐาน (JPEG data URL ย่อขนาดแล้ว) — มีเฉพาะที่ถ่าย/เลือกรูปจากพอร์ทัลหัวหน้าทัวร์ ใช้เปิดดูรูปภายหลัง */
  evidenceImage?: string;
  note?: string;
  receiptDate?: string; // วันที่บนใบเสร็จ (ISO) — ต่างจาก ExpenseRequest.requestedAt ที่เป็นวันที่ยื่นขอ
  /*
   * ---- รายการงบของกรุ๊ป (ใบเบิกเงินทดรอง) — รูปแบบเดียวกับตารางของคนทำเบิก ----
   * expenseType = หมวด (เช่น #หมวดเข้าชมสถานที่) · purpose = ชื่อรายการ (เช่น Kiyomizu Temple)
   * amount = จำนวน × ราคา/หน่วย − ส่วนลด (สกุลเงินต่างประเทศ) — ไม่มีจำนวน/ราคา = กรอกยอดตรง ๆ แบบเดิม
   */
  description?: string; // คำอธิบาย เช่น "Hotel Koyo 2 คืน"
  quantity?: number;
  unitPrice?: number;
  discount?: number;
  /** ใบเสร็จของหัวหน้าทัวร์ (ค่าใช้จ่ายจริง) ผูกกับรายการงบไหน — id ของบรรทัดในใบเบิกเงินทดรองของกรุ๊ปเดียวกัน */
  budgetLineId?: string;
  /** บัญชีไม่อนุมัติบรรทัดนี้ (อนุมัติบางรายการ) — ไม่นับในยอดอนุมัติ/ยอดที่ใช้ไป */
  rejected?: boolean;
  /** เหตุผลที่ไม่อนุมัติบรรทัดนี้ — แจ้งหัวหน้าทัวร์ */
  rejectNote?: string;
}

export interface ExpenseRequest {
  id: string; // เลขที่ใบเบิก เช่น EXP-2026-001
  jobId: string;
  category: MoneyCategory;
  requesterId: string; // leaderId หรือ userId
  requesterName: string;
  /** ผู้เบิกเป็นใคร — ไม่ระบุ = หัวหน้าทัวร์/ผู้ใช้ภายใน · 'sendoff' = เจ้าหน้าที่ส่งกรุ๊ป (requesterId = SOS-xxx) */
  requesterKind?: 'sendoff';
  requestedAt: string; // วันที่ขอ
  submittedAt?: string; // เวลาจริงที่กดบันทึก (ISO datetime) — ต่างจาก requestedAt ที่เป็นวันที่ล้วน
  lines: ExpenseLine[];
  totalTHB: number;
  bankAccount: BankAccount; // บัญชีรับเงิน (ปิดบัง)
  note: string;
  status: ExpenseStatus;
  history: StatusEvent[];
  paidAt?: string;
  paidRef?: string;
  /** ใบเบิกที่นำเข้าจากไฟล์ "เอกสารเบิกค่าใช้จ่ายกรุ๊ป" (.xls) — ข้อมูลหัวเอกสารตามต้นฉบับ */
  sourceDoc?: AdvanceDocMeta;
}

export interface AdvanceDocMeta {
  sourceFileName: string;
  importedAt: string; // ISO datetime
  groupCode: string; // รหัสกรุ๊ปตามไฟล์
  programName?: string; // ชื่อรายการทัวร์
  travelDates?: string; // วันที่เดินทาง ตามที่พิมพ์ในไฟล์ เช่น "01/10/26 - 06/10/26"
  pax?: string; // เช่น "34 ท่าน + 1 TL"
  printedBy?: string;
  printedAt?: string; // วันที่พิมพ์ ตามที่พิมพ์ในไฟล์
  contact?: string; // ผู้ติดต่อ
}

/* ------------------------------------------------------------------ */
/* เคลียร์งาน                                                           */
/* ------------------------------------------------------------------ */

export type SettlementStatus =
  | 'awaiting_docs' // รอส่งเอกสาร
  | 'under_review' // รอตรวจ
  | 'docs_incomplete' // เอกสารไม่ครบ
  | 'appointment_set' // นัดหมายแล้ว
  | 'awaiting_settle_payment' // รอคืน/จ่ายเงิน
  | 'settled' // เคลียร์แล้ว
  | 'closed'; // ปิดงาน

export type ReviewDecision = 'pending' | 'full' | 'partial' | 'rejected';

export interface SettlementItem {
  id: string;
  expenseType: string;
  purpose: string;
  claimedTHB: number; // ค่าใช้จ่ายที่หัวหน้าทัวร์แจ้ง
  approvedTHB: number; // ค่าใช้จ่ายที่บัญชีอนุมัติ
  decision: ReviewDecision;
  reason: string; // เหตุผลกรณีตัด/ไม่อนุมัติ
  receiptNo: string;
  hasReceipt: boolean; // เอกสารครบหรือไม่
  reviewedBy?: string;
  reviewedAt?: string;
  /* ---- ข้อมูลต้นฉบับตอนหัวหน้าทัวร์กรอกแบบฟอร์มเคลียร์ค่าใช้จ่าย (§เคลียร์ค่าใช้จ่ายรายกรุ๊ป) ----
     claimedTHB ด้านบนคือยอดแปลงเป็นบาทแล้วที่บัญชีใช้ตรวจ — ฟิลด์ด้านล่างนี้เก็บค่าดิบก่อนแปลงไว้ */
  amount?: number; // จำนวนเงินตามสกุลเงินเดิม (ก่อนแปลงเป็น claimedTHB)
  currency?: string;
  fxRate?: number;
  formula?: string; // สูตรคำนวณที่แสดงให้ผู้ใช้เห็น เช่น "1,000 × 5"
  note?: string;
  evidenceFileName?: string;
  receiptDate?: string;
  /** อ้างอิงกลับไปยัง CustodyAllocation ต้นทาง — เฉพาะรายการ "ค่าแลนด์" ที่แปลงมาจากเงินที่ได้รับผ่านเจ้าหน้าที่ส่งกรุ๊ป */
  custodyAllocationId?: string;
  /** อ้างอิงกลับไปยัง BudgetLine ต้นทาง — รายการที่กรอกยอดใช้จริงเทียบกับงบที่ตั้งไว้ล่วงหน้า (1 รายการงบ ทำได้หลายครั้ง) */
  budgetLineId?: string;
  /** true = ยอดนี้ได้จากการสแกนใบเสร็จด้วย AI ไม่ใช่หัวหน้าทัวร์กรอกเอง */
  scannedFromReceipt?: boolean;
}

export interface Settlement {
  id: string; // เช่น STL-2026-001
  jobId: string;
  leaderId: string;
  advanceTHB: number; // เงินทดรองที่ได้รับ
  items: SettlementItem[];
  dueDate: string; // กำหนดวันเคลียร์
  status: SettlementStatus;
  appointmentId?: string;
  history: StatusEvent[];
  settledAt?: string;
  paymentRef?: string;
  /* ---- ข้อมูลสรุป ณ ตอนหัวหน้าทัวร์ส่งแบบฟอร์มเคลียร์ค่าใช้จ่ายรายกรุ๊ป ---- */
  customerCount?: number;
  companionCount?: number;
  cancelledCustomerNote?: string;
  submittedAt?: string;
}

/* ------------------------------------------------------------------ */
/* เงินค่าแลนด์ที่เจ้าหน้าที่ส่งกรุ๊ปถือไปให้หัวหน้าทัวร์ (§ Custody)     */
/* ------------------------------------------------------------------ */

/**
 * ส่วนของเงินก้อนหนึ่ง (CashCustodyBatch) ที่การเงินระบุไว้ล่วงหน้าว่าเผื่อไว้ให้กรุ๊ปไหน/หัวหน้าทัวร์คนไหน
 * หนึ่งก้อนเงินที่เจ้าหน้าที่ส่งกรุ๊ปถือไป อาจแบ่งเผื่อได้หลายกรุ๊ปพร้อมกัน (allocations หลายรายการต่อ 1 batch)
 * หัวหน้าทัวร์ต้องกด "ยืนยันรับเงิน" (acknowledgedAt) ก่อนจึงจะเพิ่มรายการค่าแลนด์ในฟอร์มเคลียร์ได้
 * claimedAt = เวลาที่ถูกแปลงเป็น SettlementItem แล้ว (กันไม่ให้เบิกซ้ำจากยอดเดิม)
 */
export interface CustodyAllocation {
  id: string; // เช่น ALLOC-2026-001
  periodId: string; // TourPeriodMaster.internalId
  leaderId: string;
  amount: number; // ตามสกุลเงินของ batch (CashCustodyBatch.currency)
  amountTHB: number;
  acknowledgedAt?: string;
  acknowledgedNote?: string;
  claimedAt?: string;
}

/** เงินก้อนที่การเงินจัดให้เจ้าหน้าที่ส่งกรุ๊ปถือไป — อาจถือของหลายกรุ๊ปพร้อมกันในทริปเดียว */
export interface CashCustodyBatch {
  id: string; // เช่น CUST-2026-001
  staffId: string; // SendOffStaff.id
  currency: string;
  fxRate: number;
  issuedBy: string; // DemoUser.id ของฝ่ายการเงินที่จัดเงิน
  issuedByName: string;
  issuedAt: string;
  note?: string;
  allocations: CustodyAllocation[];
}

/* ------------------------------------------------------------------ */
/* งบประมาณต่อกรุ๊ป (§ ตั้งงบล่วงหน้า) — หัวหน้าทัวร์กรอกยอดใช้จริงเทียบกับรายการนี้  */
/* ------------------------------------------------------------------ */

/**
 * รายการงบประมาณ 1 บรรทัดที่ตั้งไว้ล่วงหน้าต่อกรุ๊ป (ปกติมาจากการทำเบิกของโอพี — ในระบบนี้ใช้ข้อมูลตัวอย่าง)
 * budgetedAmount = quantity × unitPrice − discount (สกุลเงินเดิม) · หัวหน้าทัวร์กรอกยอดใช้จริงได้หลายครั้งต่อ 1 รายการ
 * (แต่ละครั้งบันทึกเป็น SettlementItem แยก อ้างอิงกลับมาที่ budgetLineId เดียวกัน)
 */
export interface BudgetLine {
  id: string; // เช่น BL-001
  category: string; // เช่น 'ค่าเข้าชมสถานที่', 'ค่าเบ็ดเตล็ด', 'ค่ายานพาหนะ', 'ค่าอาหาร'
  name: string; // ชื่อรายการเฉพาะ เช่น 'Moai Atama Daibutsu'
  description?: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  currency: string;
  fxRate: number;
  budgetedAmount: number;
  budgetedAmountTHB: number;
}

/** งบประมาณทั้งชุดของ 1 กรุ๊ป — ฟอร์มเคลียร์ค่าใช้จ่ายของหัวหน้าทัวร์ดึงรายการนี้มาให้กรอกยอดใช้จริง */
export interface GroupBudget {
  id: string; // เช่น BUD-2026-001
  periodId: string; // TourPeriodMaster.internalId
  lines: BudgetLine[];
}

/* ------------------------------------------------------------------ */
/* นัดหมาย                                                              */
/* ------------------------------------------------------------------ */

export type AppointmentStatus =
  | 'pending' // รอยืนยัน
  | 'confirmed' // ยืนยันแล้ว
  | 'rescheduled' // เลื่อนนัด
  | 'attended' // เข้าพบแล้ว
  | 'cancelled'; // ยกเลิก

export type AppointmentMode = 'office' | 'online' | 'document';

export interface Appointment {
  id: string; // APT-2026-001
  date: string; // ISO date
  time: string; // HH:mm
  durationMinutes: number;
  leaderId: string;
  jobId: string;
  staffName: string; // เจ้าหน้าที่ผู้รับผิดชอบ
  mode: AppointmentMode;
  location: string; // สถานที่หรือลิงก์ประชุม
  note: string;
  status: AppointmentStatus;
  /** ปิดช่วงเวลารับงานหรือไม่ (ไม่ระบุ = ถือว่าปิด เพื่อกันจัดงานทับ) — ใช้ตรวจความว่างของหัวหน้าทัวร์ */
  blocksAssignment?: boolean;
  history: StatusEvent[];
}

/* ------------------------------------------------------------------ */
/* วันลา / ช่วงไม่พร้อมรับงาน + สถานะการใช้งาน                            */
/* ------------------------------------------------------------------ */

/**
 * ประเภทวันลา/ช่วงไม่พร้อม — รองรับเฉพาะ 4 ค่านี้เท่านั้น (Code ↔ ค่าในระบบ)
 *   SICK_LEAVE=sick_leave · PERSONAL_LEAVE=personal_leave · COMPANY_WORK=company_work · UNAVAILABLE=unavailable
 */
export type AvailabilityRecordType =
  | 'sick_leave' // ลาป่วย
  | 'personal_leave' // ลากิจ
  | 'company_work' // ติดงานบริษัท
  | 'unavailable'; // ไม่พร้อมรับงาน

export type AvailabilityApproval =
  | 'pending' // รออนุมัติ
  | 'approved' // อนุมัติแล้ว
  | 'rejected' // ปฏิเสธ
  | 'cancelled'; // ยกเลิก

export interface LeaderAvailabilityRecord {
  id: string; // AV-2026-001
  leaderId: string;
  type: AvailabilityRecordType;
  startDate: string; // ISO date
  endDate: string; // ISO date (ข้ามวัน/ข้ามปีได้)
  startTime: string; // HH:mm ('' เมื่อทั้งวัน)
  endTime: string;
  isAllDay: boolean;
  /** ปิดรับงานในช่วงนี้ (นำไปตรวจการมอบหมาย) */
  blocksAssignment: boolean;
  reason: string;
  internalNote?: string;
  approval: AvailabilityApproval;
  createdBy: string;
  createdByRole: Role;
  createdAt: string;
  updatedAt: string;
  history: StatusEvent[];
}

/* ------------------------------------------------------------------ */
/* ข้อมูลตั้งต้น (Master data)                                           */
/* ------------------------------------------------------------------ */

export type MasterKey =
  | 'languages'
  | 'customerGroups' // ประเภทกลุ่มลูกค้า
  | 'workSkills' // ทักษะและรูปแบบการทำงาน
  | 'expenseTypes'
  | 'currencies'
  | 'banks'
  | 'documentTypes'
  | 'statuses'
  | 'appointmentModes';

export interface MasterItem {
  id: string;
  code: string;
  name: string;
  /** ข้อมูลเสริม เช่น อัตราแลกเปลี่ยนของสกุลเงิน หรือกลุ่มของสถานะ */
  extra?: string;
  /** ลำดับการแสดงผล (น้อย = อยู่บน) */
  order: number;
  active: boolean;
}

export type MasterDataMap = Record<MasterKey, MasterItem[]>;

/* ------------------------------------------------------------------ */
/* ระบบแจ้งเตือน / Toast                                                */
/* ------------------------------------------------------------------ */

export type ToastTone = 'success' | 'error' | 'info' | 'warning';

export interface ToastMessage {
  id: string;
  tone: ToastTone;
  title: string;
  description?: string;
}

export interface Notification {
  id: string;
  title: string;
  description: string;
  at: string;
  tone: ToastTone;
  read: boolean;
}

/* ------------------------------------------------------------------ */
/* ผลลัพธ์ของ business logic                                            */
/* ------------------------------------------------------------------ */

export interface ScheduleConflict {
  leaderId: string;
  jobA: string;
  jobB: string;
  overlapStart: string;
  overlapEnd: string;
  overlapDays: number;
}

export interface SettlementSummary {
  advanceTHB: number;
  claimedTHB: number;
  approvedTHB: number;
  /** ยอดสุทธิ = ค่าใช้จ่ายที่อนุมัติ − เงินทดรอง */
  netTHB: number;
  /** บวก = บริษัทจ่ายเพิ่ม, ลบ = หัวหน้าทัวร์คืนเงิน, ศูนย์ = เคลียร์พอดี */
  direction: 'company_pays' | 'leader_returns' | 'balanced';
  cutTHB: number;
  missingDocCount: number;
  partialCount: number;
  rejectedCount: number;
  pendingCount: number;
  overdueDays: number;
}

export interface MatchFactor {
  /** ชื่อเกณฑ์ เช่น "เส้นทาง", "ภาษา" */
  key: string;
  /** คะแนนที่ได้จริง / คะแนนเต็มของเกณฑ์นี้ */
  earned: number;
  max: number;
  /** ข้อความอธิบายที่ตรวจสอบได้ */
  detail: string;
}

export interface LeaderMatch {
  leaderId: string;
  score: number; // 0-100
  factors: MatchFactor[];
  reasons: string[];
  warnings: string[];
  hasConflict: boolean;
  /** เอกสารเดินทางยังใช้ได้ ณ วันเดินทาง */
  documentsValid: boolean;
}

/* ------------------------------------------------------------------ */
/* จัดหัวหน้าทัวร์ลงตารางงาน — Matching Rules / Assignment / Audit       */
/* Demo: เก็บเป็น TS types + in-memory + localStorage (ไม่มี DB จริง)    */
/* เก็บเฉพาะ ID อ้างอิง + ผลวิเคราะห์ — ไม่เก็บข้อมูลทัวร์/หัวหน้าทัวร์ซ้ำ     */
/* ------------------------------------------------------------------ */

/** ประเภทกฎการ Map: บังคับ (required) / ให้คะแนน (score) / เตือน (warning) */
export type MatchingRuleType = 'required' | 'score' | 'warning';

export interface MatchingRule {
  id: string;
  ruleSetId: string;
  ruleCode: string;
  ruleName: string;
  ruleType: MatchingRuleType;
  /** กลุ่มเกณฑ์ เช่น status | availability | route | language | group | rating | rest */
  ruleGroup: string;
  description: string;
  weight: number; // น้ำหนักคะแนน (สำหรับ score rules)
  maximumScore: number;
  isRequired: boolean;
  isActive: boolean;
  priority: number;
  /** เงื่อนไขยืดหยุ่น (country/route/language/groupType/paxRange ฯลฯ) — รองรับอนาคต */
  configuration?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface MatchingRuleSet {
  id: string;
  ruleSetCode: string;
  ruleSetName: string;
  version: number;
  isActive: boolean;
  effectiveFrom?: string;
  effectiveTo?: string;
  rules: MatchingRule[];
  createdAt: string;
  updatedAt: string;
}

/** ผลการวิเคราะห์ ณ เวลาที่คำนวณ */
export interface MatchingResult {
  id: string;
  tourJobId: string;
  tourLeaderId: string;
  ruleSetId: string;
  ruleSetVersion: number;
  totalScore: number;
  maximumScore: number;
  scorePercentage: number;
  matchedReasons: string[];
  warningReasons: string[];
  failedRequiredRules: string[];
  calculatedAt: string;
}

export type AssignmentStatus =
  | 'unassigned'
  | 'pending' // รอคอนเฟิร์ม
  | 'accepted'
  | 'rejected'
  | 'cancelled'
  | 'reassign'; // รอจัดใหม่

export type AssignedSource = 'manual' | 'recommended' | 'override';

/** ตารางการมอบหมาย (อ้างอิงผ่าน Tour Job ID + Tour Leader ID เท่านั้น) */
export interface TourScheduleAssignment {
  id: string;
  tourJobId: string;
  tourLeaderId: string;
  assignmentStatus: AssignmentStatus;
  assignedSource: AssignedSource;
  matchingResultId?: string;
  manualOverride: boolean;
  overrideReason?: string;
  assignedBy: string;
  assignedAt: string;
  confirmedAt?: string;
  rejectedAt?: string;
  cancelledAt?: string;
  createdAt: string;
  updatedAt: string;
}

/** บันทึกการตัดสินใจจัดหัวหน้าทัวร์ (นำไปวิเคราะห์ปรับหลักเกณฑ์ภายหลังได้) */
export interface AssignmentAudit {
  id: string;
  tourJobId: string;
  tourLeaderId: string | null;
  action: 'assign' | 'reassign' | 'unassign' | 'override' | 'reject';
  assignedSource: AssignedSource;
  /** ผู้จัดเลือกตามคำแนะนำอันดับแรกของระบบหรือไม่ */
  followedRecommendation: boolean;
  recommendedLeaderIds: string[];
  matchingResult?: MatchingResult;
  overrideReason?: string;
  ruleSetId: string;
  ruleSetVersion: number;
  by: string;
  at: string;
  note?: string;
}

export type LeaderSortKey =
  | 'name'
  | 'rating'
  | 'jobs'
  | 'experience'
  | 'updatedAt';

/**
 * ระดับประสบการณ์ (ช่วงปี) — ใช้ร่วมกันทั้งตัวกรองและกราฟหน้าภาพรวม
 * นับจาก "ปีเต็ม" (floor เดือน/12): none=ยังไม่มีข้อมูล, lt1=<1ปี, 1to3=1–3ปี, 4to6=4–6ปี, 7to10=7–10ปี, gt10=>10ปี
 */
export type ExperienceLevelFilter =
  | 'any'
  | 'none'
  | 'lt1'
  | '1to3'
  | '4to6'
  | '7to10'
  | 'gt10';

/** เงื่อนไขการค้นหา/กรองหัวหน้าทัวร์ */
export interface LeaderFilter {
  query: string;
  status: 'all' | LeaderStatus;
  /** ประเภทหัวหน้าทัวร์ (แยกจากสถานะรับงาน) */
  leaderType: 'all' | LeaderType;
  /** กรองตามชุดสถานะ (ว่าง = ทุกสถานะ) — รองรับกลุ่มหลายสถานะจากหน้าภาพรวม */
  statusIn: LeaderStatus[];
  /** ประเทศประจำ */
  assignedCountryId: string;
  /** จังหวัดที่พักอาศัย */
  province: string;
  /** พร้อมเริ่มงานภายในวันที่ (availableStartDate <= ค่านี้) */
  availableBy: string;
  /** แสดงเฉพาะที่ปิดใช้งาน / ใช้งาน */
  activeOnly: boolean;
  /** แสดงคนที่สถานะไม่พร้อมรับงาน (ลาพัก/ระงับ/ไม่พร้อม) ด้วย — ค่าเริ่มต้นซ่อน */
  showUnavailable: boolean;
  sortBy: LeaderSortKey;
  sortDir: 'asc' | 'desc';
  /** ภาษาที่ต้องมี — เลือกได้หลายภาษา ([] = ทุกภาษา) · เข้าเงื่อนไขอย่างน้อย 1 ภาษาก็ผ่าน */
  languages: string[];
  /**
   * รหัสระดับขั้นต่ำ (เช่น 'B2'/'HSK5'/'N2') — ตีความตามมาตรฐานของภาษาที่เลือก
   * ใช้ได้เฉพาะตอนเลือกภาษาเดียว (languages.length === 1) เพราะแต่ละภาษาคนละมาตรฐาน
   * เทียบข้ามมาตรฐานกันตรง ๆ ไม่ได้ · null = ไม่กรองระดับ
   */
  minLevelCode: string | null;
  /** ระดับประสบการณ์ทำงานรวม (ช่วงปี) */
  experienceLevel: ExperienceLevelFilter;
  /** ประเทศที่เชี่ยวชาญ — เลือกได้หลายประเทศ ([] = ทุกประเทศ) · เชี่ยวชาญประเทศใดประเทศหนึ่งก็ผ่าน */
  countryIds: string[];
  routeId: string;
  airportCode: string;
  customerGroupCode: string;
  workSkillCode: string;
  minRouteLevel: RouteSkillLevel | 'any';
  minTripCount: string;
  minRating: string;
  documentsValid: boolean;
  /** ไม่มีงานซ้อนในช่วงวันที่ระบุ */
  freeFrom: string;
  freeTo: string;
}
