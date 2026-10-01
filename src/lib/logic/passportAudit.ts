/**
 * Passport Audit Log (§7) — บันทึกทุกครั้งที่ "เปิดดูข้อมูลเต็ม"
 * เก็บเฉพาะ action/ผู้ดู/เวลา · ห้ามเก็บเลขหนังสือเดินทาง/เลขบัตรลงใน Log (§7)
 * (Demo: in-memory · โครงสร้างพร้อมต่อ backend audit จริง)
 */

export interface PassportAuditEntry {
  tourLeaderId: string;
  action: 'reveal_passport' | 'reveal_personal_id' | 'upload_image' | 'view_image';
  by: string;
  at: string;
}

/** ข้อความอธิบายการกระทำ (§9 บันทึกผู้อัปโหลด/แก้ไข/เปิดดู) */
export const PASSPORT_AUDIT_ACTION: Record<PassportAuditEntry['action'], string> = {
  reveal_passport: 'เปิดดูข้อมูลหนังสือเดินทางเต็ม',
  reveal_personal_id: 'เปิดดูเลขบัตรประชาชนเต็ม',
  upload_image: 'อัปโหลดรูปหนังสือเดินทาง',
  view_image: 'เปิดดูรูปหนังสือเดินทาง',
};

const auditLog: PassportAuditEntry[] = [];

export function logPassportReveal(tourLeaderId: string, action: PassportAuditEntry['action'], by: string, at: string): void {
  auditLog.push({ tourLeaderId, action, by, at });
}

/** บันทึกการเข้าถึงไฟล์รูป (§9) — เก็บเฉพาะ action/ผู้ใช้/เวลา ไม่เก็บเลขเอกสาร */
export function logPassportImageAccess(tourLeaderId: string, action: Extract<PassportAuditEntry['action'], 'upload_image' | 'view_image'>, by: string, at: string): void {
  auditLog.push({ tourLeaderId, action, by, at });
}

export function getPassportAudit(tourLeaderId?: string): PassportAuditEntry[] {
  return tourLeaderId ? auditLog.filter((e) => e.tourLeaderId === tourLeaderId) : [...auditLog];
}
