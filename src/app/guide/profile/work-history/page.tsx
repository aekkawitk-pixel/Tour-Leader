'use client';

/**
 * ประวัติงาน — /guide/profile/work-history (ดูอย่างเดียว · ชื่อหน้าตามต้นแบบ C2 · หัวข้อในเมนู "ประวัติงานและผลประเมิน")
 *
 *   1) ผลงานกับบริษัท — คะแนนเฉลี่ย · งานที่ผ่านมา · วันเดินทางรวม (เดิมอยู่หน้ารวมโปรไฟล์ — ค่า 0 ดูเหมือนข้อมูลเสีย)
 *   2) คะแนนแบบสอบถาม — ยังไม่เปิดใช้งาน (เดิมเป็นหน้า /guide/profile/survey แยก)
 * ประวัติสถานประกอบการ (ที่ทำงานก่อนร่วมงาน) ย้ายไปหน้า "ข้อมูลการร่วมงาน" ตามต้นแบบ C1
 * ยังไม่มี: รายการทริปที่ปิดแล้ว (ค้นหา · ตัวกรอง · แบ่งตามเดือน) และรายละเอียดทริป (C2–C3)
 */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { Card, EmptyState } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideWorkHistoryPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ประวัติงาน" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  // ยังไม่มีงานที่ปิดแล้วในระบบ — ไม่แสดง "⭐ 0.0" ที่อ่านเหมือนได้คะแนนต่ำ
  const hasJobStats = leader.totalJobs > 0 || leader.totalDays > 0 || leader.rating > 0;

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="ประวัติงาน" />

      <h2 className="zego-guide-label">ผลงานกับบริษัท</h2>
      {hasJobStats ? (
        <div className="zego-guide-list grid grid-cols-3 py-3 text-center">
          <div>
            <p className="zego-guide-display flex items-center justify-center gap-1 text-base font-semibold zego-text">
              <Icon name="star" className="h-4 w-4 text-[var(--zego-accent-500)]" filled />
              {leader.rating > 0 ? leader.rating.toFixed(1) : '—'}
            </p>
            <p className="text-xs zego-text-tertiary">คะแนนเฉลี่ย</p>
          </div>
          <div className="border-x border-[var(--zego-border-soft)]">
            <p className="zego-guide-display text-base font-semibold zego-text">{leader.totalJobs}</p>
            <p className="text-xs zego-text-tertiary">งานที่ผ่านมา</p>
          </div>
          <div>
            <p className="zego-guide-display text-base font-semibold zego-text">{leader.totalDays}</p>
            <p className="text-xs zego-text-tertiary">วันเดินทางรวม</p>
          </div>
        </div>
      ) : (
        <p className="zego-guide-list px-4 py-3 text-sm zego-text-tertiary">ยังไม่มีงานที่ปิดแล้วในระบบ — คะแนนและจำนวนงานจะขึ้นหลังจบทริปแรก</p>
      )}

      <h2 className="zego-guide-label flex items-center gap-2 pt-1">
        คะแนนแบบสอบถาม
        <span className="zego-chip zego-chip--neutral text-[11px] tracking-normal">เร็ว ๆ นี้</span>
      </h2>
      <p className="zego-guide-list flex items-center gap-2 px-4 py-3 text-sm zego-text-tertiary">
        <Icon name="clock" className="h-4 w-4 shrink-0" />
        ผลประเมินจากลูกทัวร์รายกรุ๊ปจะแสดงที่นี่เมื่อระบบพร้อม
      </p>
    </div>
  );
}
