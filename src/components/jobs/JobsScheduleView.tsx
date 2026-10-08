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
import { SegmentedControl } from '@/components/ui/Tabs';
import { Button } from '@/components/ui/Primitives';
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

/**
 * แท็บ "มองจากกรุ๊ป" — ซ่อนไว้ก่อน (ยังไม่เปิดใช้งาน) · ตั้งเป็น true เพื่อเปิดกลับ
 * คอมโพเนนต์ GroupCoverageView ยังอยู่ครบ ไม่ได้ลบ · ?mode=group จากลิงก์เดิมตกกลับเป็นจัดหัวหน้าทัวร์
 */
const GROUP_VIEW_ENABLED = false;

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
  if (value === 'group' && canSendOff && GROUP_VIEW_ENABLED) return value;
  return 'leader';
}

function JobsScheduleContent() {
  const params = useSearchParams();
  const router = useRouter();
  const { currentUser } = useDemo();
  const canSendOff = canEditSendOffSchedule(currentUser);
  const mode: ScheduleMode = modeFromParam(params.get('mode'), canSendOff);
  const modeOptions = MODE_OPTIONS.filter((o) => o.value !== 'group' || (canSendOff && GROUP_VIEW_ENABLED));

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

  // ปุ่มสลับโหมด — อยู่แถวเดียวกับปุ่ม "กำหนดรายชื่อ" (หน้าปุ่ม) เหนือการ์ดตัวกรอง · โหมดอื่นอยู่ตำแหน่งเดียวกัน
  const modeSwitch = <SegmentedControl options={modeOptions} value={mode} onChange={changeMode} label="เลือกสิ่งที่ต้องการจัด" />;

  // หัวหน้า — ชื่อหน้า (ซ้าย) กับปุ่มสลับโหมด / กำหนดรายชื่อ (ขวา) อยู่แถวเดียวกัน ประหยัดความสูง ตารางขึ้นมาใกล้ด้านบน
  const title = (
    <div>
      <h1 className="zego-text text-xl font-bold sm:text-2xl">การจัดสเก็ต / Schedule</h1>
      <p className="zego-text-secondary mt-1 text-sm">{MODE_DESCRIPTION[mode]}</p>
    </div>
  );

  return (
    <div className="space-y-3">

      {/*
        คนละคอมโพเนนต์กัน ไม่ใช่ตารางเดียวสลับข้อมูล — เพราะหน่วยของงาน ตัวกรอง
        และวิธีตรวจว่าชนกัน ต่างกันคนละเรื่อง ยัดรวมกันแล้วแก้อะไรทีหลังจะพังทุกโหมด
        กติกาที่ใช้ร่วมกันอยู่ใน lib/logic/sendOffJobs.ts จุดเดียว เลขจึงตรงกันทุกมุมมอง
      */}
      {mode === 'leader' && <GuideScheduleTimeline header={title} toolbarStart={modeSwitch} />}
      {mode !== 'leader' && (
        <div className="flex flex-wrap items-end justify-between gap-3">
          {title}
          {/* จอเล็ก: ปุ่มสลับโหมดยืดเต็มแถว (เหมือนโหมดจัดหัวหน้าทัวร์) */}
          <div className="ml-auto flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto max-sm:[&_.zego-segmented]:flex! max-sm:[&_.zego-segmented]:flex-1 max-sm:[&_.zego-segmented__button]:flex-1">
            {modeSwitch}
            {/* “กำหนดรายชื่อ” ใช้กับตารางหัวหน้าทัวร์เท่านั้น — แสดงไว้ตำแหน่งเดิมแต่กดไม่ได้ ปุ่มจึงไม่กระโดดตอนสลับโหมด */}
            <Button size="sm" variant="secondary" disabled title="ใช้ได้เฉพาะโหมดจัดหัวหน้าทัวร์">กำหนดรายชื่อ</Button>
          </div>
        </div>
      )}
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
