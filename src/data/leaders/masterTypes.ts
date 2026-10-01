/**
 * Tour Leader Master (§1/§2) — ข้อมูลหลักกลางของหัวหน้าทัวร์ (นำเข้าจากไฟล์จริง)
 *
 * แยกข้อมูล 2 กลุ่ม:
 *   • TourLeaderProfile          — ข้อมูลใช้งานทั่วไป (แสดงในเมนู/ตารางจัด/ปฏิทิน)
 *   • TourLeaderIdentityDocument — ข้อมูลส่วนบุคคล/เอกสารสำคัญ (แยกเก็บ · จำกัดสิทธิ์ · Mask §8)
 *
 * Primary Key = tourLeaderId (TL-000001…) — ห้ามใช้ passportNo/personalID เป็น PK (§1)
 * ทุกส่วนของระบบอ้างอิงด้วย tourLeaderId
 */

export type ActiveStatus = 'ACTIVE' | 'INACTIVE';
export type EmploymentStatus = 'NOT_SPECIFIED' | 'FULL_TIME' | 'PART_TIME' | 'FREELANCE' | 'AGENCY';
export type AvailabilityStatus = 'AVAILABLE' | 'UNAVAILABLE';

/** สถานะหนังสือเดินทาง (6 ระดับ) */
export type PassportStatus =
  | 'EXPIRED'
  | 'EXPIRING_WITHIN_30_DAYS'
  | 'EXPIRING_WITHIN_90_DAYS'
  | 'EXPIRING_WITHIN_180_DAYS'
  | 'VALID'
  | 'UNKNOWN';

/** สถานะตรวจสอบข้อมูล (§18) */
export type LeaderValidationStatus = 'VALID' | 'WARNING' | 'INVALID';

/** ผลตรวจข้อมูลซ้ำ (§7) */
export type DuplicateStatus = 'EXACT_DUPLICATE' | 'POSSIBLE_DUPLICATE' | 'NEW_RECORD';

/** §2.1 ข้อมูลสำหรับการใช้งานทั่วไป */
export interface TourLeaderProfile {
  tourLeaderId: string; // PK ภายในระบบ (TL-000001)
  titleNameTH: string | null;
  firstNameTH: string | null;
  lastNameTH: string | null;
  fullNameTH: string;
  titleNameEN: string | null;
  firstNameEN: string | null;
  lastNameEN: string | null;
  fullNameEN: string;
  nickName: string | null;
  /** ชื่อที่ใช้แสดง (§4): nickName ?? firstNameTH ?? firstNameEN ?? "ไม่ระบุชื่อ" */
  displayName: string;
  contactNumberRaw: string | null; // ข้อความเดิม (§6)
  contactNumberNormalized: string | null; // ตัวเลขล้วน คงเลข 0 หน้า (String)
  gender: string; // ค่าดิบ M/F/อื่น ๆ (รองรับค่าอื่นไม่ให้ Error §18)
  nationality: string | null;
  country: string | null;
  countryCode: string | null;
  activeStatus: ActiveStatus;
  employmentStatus: EmploymentStatus;
  availabilityStatus: AvailabilityStatus;
  statusNeedsReview: boolean; // §12 ต้องให้ผู้ดูแลตรวจสอบสถานะจริง

  /* §13 เตรียมโครงสร้างความสามารถ/ประสบการณ์ (ค่าว่าง — ไม่คาดเดา) */
  languages: string[];
  skilledCountries: string[];
  skilledRoutes: string[];
  guideGroups: string[];
  canHandlePrivateGroup: boolean | null;
  yearsOfExperience: number | null;
  specialSkills: string[];
  workRestrictions: string[];

  /* ระบบ */
  sourceFileName: string;
  sourceRowNumber: number;
  importedAt: string;
  updatedAt: string;
  validationStatus: LeaderValidationStatus;
  validationMessages: string[];
  duplicateStatus: DuplicateStatus;
}

/** §2.2 ข้อมูลส่วนบุคคลและเอกสารสำคัญ (แยก · จำกัดสิทธิ์ · Mask ก่อนแสดง §8) */
export interface TourLeaderIdentityDocument {
  tourLeaderId: string;
  passportType: string | null;
  passportNo: string | null;
  personalID: string | null;
  dateOfBirth: string | null; // ISO
  placeOfBirth: string | null;
  passportIssueDate: string | null; // ISO
  passportExpiryDate: string | null; // ISO
  issuingAuthority: string | null;
  authorityRemark: string | null;
}

/** เมทาดาทาการนำเข้า (§16 Import Report / §17 Audit) */
export interface LeaderImportMeta {
  sourceFileName: string;
  importedAt: string;
  totalRows: number;
  imported: number;
  exactDuplicates: number;
  possibleDuplicates: number;
  invalid: number;
  warning: number;
}
