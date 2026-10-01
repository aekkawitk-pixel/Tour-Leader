'use client';

/**
 * เมนู "การจัดสเก็ต / Schedule" — จัดได้ 3 มุมมอง สลับที่หัวหน้า
 *   • leader  = จัดหัวหน้าทัวร์      → มองจากคน ครองทั้งพีเรียด แท่งยาวหลายวัน
 *   • sendoff = จัดเจ้าหน้าที่ส่งกรุ๊ป → มองจากคน ครองแค่วันออกเดินทาง ป้ายเดียวพร้อมเวลาไปถึง
 *   • group   = มองจากกรุ๊ป          → แถวหนึ่ง = กรุ๊ปหนึ่ง เห็นทั้งสองฝั่งพร้อมกัน
 *
 * สองมุมมองแรกมองจาก "คน" จึงตอบไม่ได้ว่ากรุ๊ปไหนยังขาดอะไร มุมมองที่สามกลับด้านให้
 *
 * รวมไว้เมนูเดียวเพราะคนจัดทำงานสองอย่างนี้กับกรุ๊ปเดียวกัน เดือนเดียวกัน ต้องสลับไปมาบ่อย
 * ถ้าแยกเป็นสองเมนูจะต้องตั้งเดือนกับตัวกรองใหม่ทุกครั้งที่สลับ
 *
 * โหมดเก็บไว้ใน URL (?mode=) — refresh หรือส่งลิงก์ให้คนอื่นแล้วยังอยู่โหมดเดิม
 */

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PageHeader } from '@/components/ui/Primitives';
import { SegmentedControl } from '@/components/ui/Tabs';
import { GuideScheduleTimeline } from '@/components/jobs/GuideScheduleTimeline';
import { SendOffScheduleTimeline } from '@/components/jobs/SendOffScheduleTimeline';
import { GroupCoverageView } from '@/components/jobs/GroupCoverageView';
import { useDemo } from '@/store/DemoStore';
import { canEditSendOffSchedule } from '@/lib/permissions';

type ScheduleMode = 'leader' | 'sendoff' | 'group';

const MODE_OPTIONS: { value: ScheduleMode; label: string }[] = [
  { value: 'leader', label: 'จัดหัวหน้าทัวร์' },
  { value: 'sendoff', label: 'จัดเจ้าหน้าที่ส่งกรุ๊ป' },
  { value: 'group', label: 'มองจากกรุ๊ป' },
];

const MODE_DESCRIPTION: Record<ScheduleMode, string> = {
  leader: 'ตรวจสอบงานทัวร์และจัดหัวหน้าทัวร์ตามตาราง Schedule รายเดือน',
  sendoff: 'จัดเจ้าหน้าที่ไปส่งกรุ๊ปที่สนามบิน ตามเวลาที่ต้องไปถึงของแต่ละกรุ๊ป',
  group: 'ตรวจรายกรุ๊ปว่ามีทั้งหัวหน้าทัวร์และเจ้าหน้าที่ส่งกรุ๊ปครบแล้วหรือยัง',
};

/**
 * ค่าที่รับได้จาก URL — ค่าอื่นตกกลับเป็นโหมดเดิม ไม่ทำให้หน้าว่าง
 * "มองจากกรุ๊ป" เป็นมุมมองของผู้จัดเจ้าหน้าที่ส่งกรุ๊ป — คนที่ไม่มีสิทธิ์นั้น (?mode=group จากลิงก์) ตกกลับเป็นจัดหัวหน้าทัวร์
 */
function modeFromParam(value: string | null, canSendOff: boolean): ScheduleMode {
  if (value === 'sendoff') return value;
  if (value === 'group' && canSendOff) return value;
  return 'leader';
}

function JobsScheduleContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { currentUser } = useDemo();
  const canSendOff = canEditSendOffSchedule(currentUser);
  const mode: ScheduleMode = modeFromParam(params.get('mode'), canSendOff);
  const modeOptions = canSendOff ? MODE_OPTIONS : MODE_OPTIONS.filter((o) => o.value !== 'group');

  /*
    เขียนโหมดลง URL ด้วย replace ไม่ใช่ push — ปุ่ม Back ของเบราว์เซอร์ควรพาออกจากหน้านี้
    ไม่ใช่ไล่ย้อนโหมดที่เพิ่งสลับไปมา
    ?leader= ที่ติดมาจากหน้าอื่นต้องไม่หายไปตอนสลับโหมด จึงต่อจากพารามิเตอร์เดิม
  */
  const changeMode = (next: ScheduleMode) => {
    const q = new URLSearchParams(params.toString());
    if (next === 'leader') q.delete('mode');
    else q.set('mode', next);
    const qs = q.toString();
    router.replace(qs ? `/jobs?${qs}` : '/jobs', { scroll: false });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader title="การจัดสเก็ต / Schedule" description={MODE_DESCRIPTION[mode]} />
        <SegmentedControl options={modeOptions} value={mode} onChange={changeMode} label="เลือกสิ่งที่ต้องการจัด" />
      </div>

      {/*
        คนละคอมโพเนนต์กัน ไม่ใช่ตารางเดียวสลับข้อมูล — เพราะหน่วยของงาน ตัวกรอง
        และวิธีตรวจว่าชนกัน ต่างกันคนละเรื่อง ยัดรวมกันแล้วแก้อะไรทีหลังจะพังทุกโหมด
        กติกาที่ใช้ร่วมกันอยู่ใน lib/logic/sendOffJobs.ts จุดเดียว เลขจึงตรงกันทุกมุมมอง
      */}
      {mode === 'leader' && <GuideScheduleTimeline />}
      {mode === 'sendoff' && <SendOffScheduleTimeline />}
      {mode === 'group' && <GroupCoverageView />}
    </div>
  );
}

export function JobsScheduleView() {
  // useSearchParams ต้องอยู่ใต้ Suspense เพราะหน้านี้ถูก prerender ตอน build
  return (
    <Suspense fallback={null}>
      <JobsScheduleContent />
    </Suspense>
  );
}
