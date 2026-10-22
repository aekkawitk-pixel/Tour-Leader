import { redirect } from 'next/navigation';

/**
 * ภาษา — /guide/profile/languages
 * รวมเข้าหน้า "การพัฒนาและประสบการณ์" (/guide/profile/skills) แล้ว — คง URL เดิมไว้ให้ลิงก์/บุ๊กมาร์กเก่ายังเปิดได้
 */
export default function GuideLanguagesRedirect() {
  redirect('/guide/profile/skills');
}
