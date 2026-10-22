import { redirect } from 'next/navigation';

/**
 * คะแนนแบบสอบถาม — /guide/profile/survey
 * รวมเข้าหน้า "ประวัติงานและผลประเมิน" (/guide/profile/work-history) แล้ว (ส่วนคะแนนแบบสอบถาม · ยังไม่เปิดใช้งาน)
 * คง URL เดิมไว้ให้ลิงก์/บุ๊กมาร์กเก่ายังเปิดได้
 */
export default function GuideSurveyRedirect() {
  redirect('/guide/profile/work-history');
}
