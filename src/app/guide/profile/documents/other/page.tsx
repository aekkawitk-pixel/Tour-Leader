import { redirect } from 'next/navigation';

/**
 * เอกสารอื่น ๆ — /guide/profile/documents/other
 * รวมเข้าหน้า "เอกสารประจำตัว" (/guide/profile/documents) แล้ว — ส่วน "เอกสารอื่น ๆ" ท้ายหน้า
 * คง URL เดิมไว้ให้ลิงก์/บุ๊กมาร์กเก่ายังเปิดได้
 */
export default function GuideOtherDocumentsRedirect() {
  redirect('/guide/profile/documents');
}
