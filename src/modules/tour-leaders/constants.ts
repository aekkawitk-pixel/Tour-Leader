/** ค่าคงที่ของโมดูลหัวหน้าทัวร์ */

import type { DocumentKind, Gender, LeaderStatus, LeaderType, PersonType } from '@/types';

/** คำนำหน้าชื่อ (ไทย) */
export const TITLE_OPTIONS = ['นาย', 'นาง', 'นางสาว', 'อื่น ๆ'];

/** คำนำหน้าชื่อ (EN) — ใช้ทั้งกับคนไทยและบุคคลต่างชาติ (ตามหนังสือเดินทาง) */
export const TITLE_OPTIONS_FOREIGN = ['Mr.', 'Mrs.', 'Ms.', 'Miss', 'Dr.', 'Other'];
export const TITLE_OPTIONS_EN = TITLE_OPTIONS_FOREIGN;

/** เลือกคำนำหน้าไทย → เติมคำนำหน้าอังกฤษให้อัตโนมัติ (ผู้ใช้แก้ทีหลังได้) */
export const TITLE_TH_TO_EN: Record<string, string> = {
  นาย: 'Mr.',
  นาง: 'Mrs.',
  นางสาว: 'Miss',
  'อื่น ๆ': 'Other',
};

export const DEFAULT_TITLE = 'นาย';

/** ค่าเริ่มต้นเมื่อเพิ่มหัวหน้าทัวร์ใหม่ (ตามข้อกำหนด) */
export const DEFAULT_LEADER_TYPE: LeaderType = 'general';
export const DEFAULT_WORK_STATUS: LeaderStatus = 'available';
export const DEFAULT_ACTIVE = true;
export const DEFAULT_GENDER: Gender = 'unspecified';
/**
 * ประเภทบุคคลเริ่มต้น — ใช้เมื่อสร้างใหม่ หรือเมื่อข้อมูลเดิมไม่เคยระบุไว้เท่านั้น
 * ห้ามใช้ทับค่าที่บันทึกไว้แล้วของหัวหน้าทัวร์เดิม
 */
export const DEFAULT_PERSON_TYPE: PersonType = 'thai';

/** ประเทศเริ่มต้น (ไทย) — ใช้กับสัญชาติและที่อยู่ */
export const DEFAULT_COUNTRY_ID = 'C-TH';

/** รหัสไปรษณีย์ไทย 5 หลัก */
export const POSTAL_CODE_PATTERN = /^\d{5}$/;

/** เลขบัตรประชาชนไทย 13 หลัก */
export const NATIONAL_ID_PATTERN = /^\d{13}$/;

/** เลขที่ถูกปิดบังแล้ว (โหลดกลับมาแก้ไข) — ไม่ต้องตรวจรูปแบบซ้ำ */
export const MASKED_NUMBER_PATTERN = /x/i;

/** ชื่อภาษาอังกฤษ — ตัวอักษร ช่องว่าง จุด ขีดกลาง และ apostrophe (เช่น O'Brien, Anne-Marie) */
export const NAME_EN_PATTERN = /^[A-Za-z][A-Za-z ''\-.]*$/;

/** ความยาวสูงสุดของหมายเหตุแต่ละช่อง */
export const NOTE_MAX_LENGTH = {
  generalNote: 500,
  internalNote: 500,
  cautions: 300,
} as const;

/** เริ่มแสดงตัวนับเมื่อใช้ไปแล้วกี่ % ของขีดจำกัด */
export const NOTE_COUNTER_THRESHOLD = 0.8;

/** ชื่อภาษาไทย — อักษรไทย ช่องว่าง จุด และขีดกลาง */
export const NAME_TH_PATTERN = /^[ก-๙ํ-๛][ก-๙ํ-๛ .\-]*$/;

/** รหัสหัวหน้าทัวร์ */
export const LEADER_CODE_PREFIX = 'TL';
/** จำนวนหลักของลำดับที่เติมศูนย์ข้างหน้า — รหัสใหม่เป็น TL-0001, TL-0002, … */
export const LEADER_CODE_DIGITS = 4;
/** ยอมรับทั้งข้อมูลเดิม 3 หลัก (TL-001) และรหัสใหม่ 4 หลักขึ้นไป (TL-0001) */
export const LEADER_CODE_PATTERN = /^TL-\d{3,}$/;

export const AVATAR_COLORS = [
  'bg-blue-600',
  'bg-violet-600',
  'bg-teal-600',
  'bg-rose-600',
  'bg-indigo-600',
  'bg-emerald-600',
  'bg-amber-600',
  'bg-cyan-600',
  'bg-pink-600',
  'bg-orange-600',
];

/** ขนาดไฟล์รูปสูงสุด (MB) */
export const MAX_PHOTO_MB = 2;
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** เอกสารประเภทไหนต้องมีวันหมดอายุ */
export const DOCUMENT_KINDS_WITH_EXPIRY: DocumentKind[] = [
  'passport',
  'license',
  'visa',
  'health',
];

/** จำนวนวันที่ถือว่า "ใกล้หมดอายุ" */
export const DOC_EXPIRY_WARNING_DAYS = 120;

/** พาสปอร์ตต้องเหลืออายุอย่างน้อยกี่วัน ณ วันเดินทาง */
export const PASSPORT_MIN_VALID_DAYS = 183;

/**
 * กลุ่มการตรวจสอบ (validation) ภายในของฟอร์ม — ใช้ผูก field → step สำหรับ error attribution
 * (คงคีย์เดิมไว้เพื่อไม่ให้ validation/mappers ต้องเปลี่ยนตาม · label ปรับให้ตรงชื่อหมวดหน้า Detail)
 */
export const FORM_STEPS = [
  { key: 'general', label: 'ข้อมูลส่วนบุคคล', hint: 'รูป ชื่อ ประเภท สถานะ' },
  { key: 'contact', label: 'ข้อมูลติดต่อ', hint: 'ช่องทางติดต่อ + ผู้ติดต่อฉุกเฉิน' },
  { key: 'skills', label: 'ความสามารถ', hint: 'ภาษา ประเทศ เส้นทาง ความถนัด' },
  { key: 'employment', label: 'ประวัติการทำงาน', hint: 'สถานประกอบการที่เคยทำงาน' },
  { key: 'finance', label: 'เอกสารและการเงิน', hint: 'เอกสาร + บัญชีธนาคาร' },
] as const;

export type FormStepKey = (typeof FORM_STEPS)[number]['key'];

/**
 * Tab ของหน้าแก้ไข (§1) — ชื่อ/ลำดับสอดคล้องกับ Tab หน้ารายละเอียด · แก้ไขแต่ละหมวดได้โดยตรง
 *   1. ข้อมูลส่วนบุคคล (รวม ส่วนบุคคล + ตาม Passport + ติดต่อ + บัตรประชาชน + ที่อยู่)
 *   2. ข้อมูลหนังสือเดินทาง (Passport Card — จัดการแยกในสโตร์ของตัวเอง §3)
 *   3. ความสามารถ
 *   4. ประวัติการทำงาน
 *   5. เอกสารและการเงิน
 * `formSteps` = กลุ่ม validation ที่ Tab นั้นครอบคลุม (passport ไม่ผูกกับ form)
 */
export const EDIT_TABS = [
  { key: 'personal', label: 'ข้อมูลส่วนบุคคล', formSteps: ['general', 'contact'] },
  { key: 'passport', label: 'ข้อมูลหนังสือเดินทาง', formSteps: [] },
  { key: 'skills', label: 'ความสามารถ', formSteps: ['skills'] },
  { key: 'employment', label: 'ประวัติการทำงาน', formSteps: ['employment'] },
  { key: 'finance', label: 'เอกสารและการเงิน', formSteps: ['finance'] },
] as const;

export type EditTabKey = (typeof EDIT_TABS)[number]['key'];

/** map กลุ่ม validation → Tab (ใช้กระโดดไปแก้เมื่อเจอ error) */
export const FORM_STEP_TO_EDIT_TAB: Record<FormStepKey, EditTabKey> = {
  general: 'personal',
  contact: 'personal',
  skills: 'skills',
  employment: 'employment',
  finance: 'finance',
};

/** สถานะของแต่ละขั้นตอน */
export type StepStatus = 'empty' | 'in_progress' | 'complete' | 'error';

export const STEP_STATUS_LABEL: Record<StepStatus, string> = {
  empty: 'ยังไม่กรอก',
  in_progress: 'กำลังกรอก',
  complete: 'ข้อมูลครบ',
  error: 'มีข้อผิดพลาด',
};

/** สกุลเงินสำหรับเงินเดือนในประวัติการทำงาน */
export const SALARY_CURRENCIES = ['THB', 'USD', 'JPY', 'EUR'];
export const DEFAULT_SALARY_CURRENCY = 'THB';
