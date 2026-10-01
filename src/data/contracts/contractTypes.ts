/**
 * Leader Contract — สัญญาจ้างหัวหน้าทัวร์ "รายกรุ๊ป"
 *
 * ทำไมต้องแยกจากเอกสารประจำตัว (LeaderDocumentRecord):
 *   • เอกสารประจำตัวติดตัวคน ใช้ซ้ำได้ทุกกรุ๊ป — สัญญาเกิดใหม่ทุกกรุ๊ป
 *   • สัญญามีลำดับสถานะของตัวเอง (ร่าง → ส่ง → เซ็น) และมีเงื่อนไขค่าตอบแทนของกรุ๊ปนั้น
 *   • ต้องดูได้จากสองฝั่ง: หน้าหัวหน้าทัวร์ (สัญญาทั้งหมดของเขา) และหน้ากรุ๊ป (สัญญาของกรุ๊ปนี้)
 *
 * อ้างอิงกรุ๊ปด้วย `periodId` เท่านั้น (กติกาเดียวกับ Guide Assignment §7)
 * ห้ามเก็บข้อมูลพีเรียดซ้ำเป็นข้อมูลปัจจุบัน — ที่เก็บไว้เป็น "ภาพ ณ วันเซ็น" สำหรับตรวจย้อนหลังเท่านั้น
 */

/* --------------------------------- สถานะ --------------------------------- */

export type ContractStatus =
  | 'DRAFT' // ร่าง — ยังไม่ส่งให้หัวหน้าทัวร์
  | 'SENT' // ส่งให้เซ็นแล้ว รอตอบกลับ
  | 'SIGNED' // เซ็นแล้ว มีผลผูกพัน
  | 'CANCELLED' // ยกเลิกก่อนเซ็น
  | 'VOID'; // ยกเลิกสัญญาที่เซ็นแล้ว

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  DRAFT: 'ร่าง',
  SENT: 'รอเซ็น',
  SIGNED: 'เซ็นแล้ว',
  CANCELLED: 'ยกเลิกก่อนเซ็น',
  VOID: 'ยกเลิกสัญญา',
};

/** สถานะที่ยังถือว่า "มีผลอยู่" — ใช้กันไม่ให้มีสัญญาซ้อนกันในกรุ๊ปเดียว */
export const ACTIVE_CONTRACT_STATUSES: readonly ContractStatus[] = ['DRAFT', 'SENT', 'SIGNED'];

/** สถานะปลายทาง — เปลี่ยนต่อไม่ได้อีก */
export const TERMINAL_CONTRACT_STATUSES: readonly ContractStatus[] = ['CANCELLED', 'VOID'];

/**
 * เส้นทางสถานะที่อนุญาต — ทุกการเปลี่ยนสถานะต้องผ่านตารางนี้จุดเดียว
 * DRAFT → SIGNED อนุญาตด้วย เพราะบางกรุ๊ปเซ็นกันหน้างานโดยไม่ได้ส่งเอกสารล่วงหน้า
 */
export const CONTRACT_TRANSITIONS: Record<ContractStatus, readonly ContractStatus[]> = {
  DRAFT: ['SENT', 'SIGNED', 'CANCELLED'],
  SENT: ['SIGNED', 'CANCELLED'],
  SIGNED: ['VOID'],
  CANCELLED: [],
  VOID: [],
};

export function canTransitionContract(from: ContractStatus, to: ContractStatus): boolean {
  return CONTRACT_TRANSITIONS[from].includes(to);
}

export function isContractActive(status: ContractStatus): boolean {
  return ACTIVE_CONTRACT_STATUSES.includes(status);
}

/* -------------------------------- Snapshot -------------------------------- */

/**
 * ข้อมูลคู่สัญญา ณ วันเซ็น — จุดที่คนมักพลาด
 * ถ้าเก็บแค่ลิงก์ไปเอกสารปัจจุบัน พอหัวหน้าทัวร์ต่อหนังสือเดินทางเล่มใหม่
 * สัญญาเก่าจะแสดงเลขเล่มใหม่ ไม่ตรงกับกระดาษที่เซ็นจริง
 */
export interface ContractPartySnapshot {
  leaderNameTh: string;
  leaderNameEn: string;
  /** เล่มที่ใช้ยืนยันตัวตนตอนเซ็น (null = ตอนเซ็นยังไม่มีเล่มในระบบ) */
  passportDocId: string | null;
  /** เลขที่ปิดบังแล้ว — ห้ามเก็บเลขเต็มลงสัญญาในระบบ Demo */
  passportNoMasked: string;
  passportExpiresAt: string | null;
}

/** ข้อมูลกรุ๊ป ณ วันเซ็น — เก็บเพื่อตรวจย้อนหลังเท่านั้น ห้ามใช้เป็นข้อมูลปัจจุบัน */
export interface ContractPeriodSnapshot {
  groupCode: string;
  startDate: string | null;
  endDate: string | null;
  countryName: string;
  route: string | null;
}

/* ------------------------------ ประวัติการเปลี่ยน ----------------------------- */

export type ContractHistoryAction =
  | 'CREATE' | 'UPDATE_TERMS' | 'SEND' | 'SIGN' | 'CANCEL' | 'VOID' | 'ATTACH_FILE' | 'REMOVE_FILE';

export interface ContractHistoryEntry {
  at: string; // ISO datetime
  by: string;
  action: ContractHistoryAction;
  from?: ContractStatus;
  to?: ContractStatus;
  note?: string;
}

/* -------------------------------- ตัวสัญญา -------------------------------- */

export interface LeaderContract {
  contractId: string;
  tourLeaderId: string;
  /** กรุ๊ปที่สัญญานี้ผูกอยู่ — อ้าง Tour Period Master */
  periodId: string;
  /** การจัดงานที่ทำให้เกิดสัญญานี้ (null = ทำสัญญาไว้ก่อนจัดงาน) */
  assignmentId: string | null;
  role: 'lead' | 'assistant';

  status: ContractStatus;

  /* ---- เงื่อนไขที่ตกลงกันสำหรับกรุ๊ปนี้ (อาจต่างจากอัตรามาตรฐาน) ---- */
  fee: number;
  currency: string;
  payTerm: string;

  sentAt: string | null;
  sentBy: string | null;
  signedAt: string | null;
  signedBy: string | null;
  /** เวลาที่ยกเลิก (ทั้งก่อนและหลังเซ็น) */
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;

  /** ไฟล์สัญญา — อ้าง documentImageStore ด้วย imageId (ไม่เก็บไฟล์ในนี้) */
  fileIds: string[];
  note: string;

  /** ภาพ ณ วันเซ็น — null จนกว่าจะเซ็น */
  partySnapshot: ContractPartySnapshot | null;
  periodSnapshot: ContractPeriodSnapshot | null;

  createdBy: string;
  createdAt: string;
  updatedAt: string;
  history: ContractHistoryEntry[];
}
