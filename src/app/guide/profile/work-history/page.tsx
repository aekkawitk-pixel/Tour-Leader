'use client';

/**
 * ประวัติงานและผลประเมิน — /guide/profile/work-history (ดูอย่างเดียว)
 *
 * รวม 3 เรื่องที่เคยแยกกัน (ตามต้นแบบธีม v3):
 *   1) ผลงานกับบริษัท — คะแนนเฉลี่ย · งานที่ผ่านมา · วันเดินทางรวม (เดิมอยู่หน้ารวมโปรไฟล์ — ค่า 0 ดูเหมือนข้อมูลเสีย)
 *   2) คะแนนแบบสอบถาม — ยังไม่เปิดใช้งาน (เดิมเป็นหน้า /guide/profile/survey แยก)
 *   3) ประวัติการทำงานก่อนร่วมงาน (สถานประกอบการ) — ด้านล่าง
 *
 * ข้อมูลชุดเดียวกับส่วน "ประวัติการทำงาน" ในแท็บข้อมูลส่วนตัวฝั่งผู้จัด — เรียงตามลำดับที่ผู้จัดตั้งไว้
 * ⚠️ คือที่ทำงานที่เคยทำมาก่อน ไม่ใช่งานทัวร์ที่ได้รับมอบหมาย (ดูที่ "งานของฉัน")
 * ต้องการเพิ่ม/แก้ให้แจ้งเจ้าหน้าที่
 */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { toISODate } from '@/lib/format';
import { entryDurationLabel, formatEmploymentPeriod, sortByDisplayOrder, summarizeExperience } from '@/modules/tour-leaders/experience';
import { Card, EmptyState } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideWorkHistoryPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const today = toISODate(new Date());

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ประวัติงานและผลประเมิน" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  const rows = sortByDisplayOrder(leader.employmentHistory ?? []);
  const summary = summarizeExperience(leader.employmentHistory ?? [], today);
  const salaryText = (salary: number | undefined, currency: string) =>
    salary === undefined ? undefined : `${salary.toLocaleString('th-TH')} ${currency === 'THB' ? 'บาท' : currency}`;

  // ยังไม่มีงานที่ปิดแล้วในระบบ — ไม่แสดง "⭐ 0.0" ที่อ่านเหมือนได้คะแนนต่ำ
  const hasJobStats = leader.totalJobs > 0 || leader.totalDays > 0 || leader.rating > 0;

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="ประวัติงานและผลประเมิน" />

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

      <h2 className="zego-guide-label pt-1">ประวัติการทำงานก่อนร่วมงาน</h2>
      {rows.length === 0 ? (
        <p className="zego-guide-list px-4 py-3 text-sm zego-text-tertiary">ยังไม่มีประวัติการทำงาน — ต้องการเพิ่ม กรุณาแจ้งเจ้าหน้าที่</p>
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-2 text-center">
            <div>
              <p className="text-lg font-bold zego-text">{summary.label}</p>
              <p className="text-[11px] zego-text-tertiary">ประสบการณ์รวม</p>
            </div>
            <div>
              <p className="text-lg font-bold zego-text">{summary.employerCount}</p>
              <p className="text-[11px] zego-text-tertiary">สถานประกอบการ</p>
            </div>
          </Card>
          <Card padded={false}>
            <ul className="divide-y divide-[var(--zego-border-soft)]">
              {rows.map((e) => (
                <li key={e.id} className="space-y-0.5 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold zego-text">{e.employerName}</p>
                    {e.isCurrentJob && <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">ปัจจุบัน</span>}
                  </div>
                  <p className="text-xs zego-text-secondary">{e.position}</p>
                  <p className="text-xs zego-text-tertiary">{formatEmploymentPeriod(e)} · {entryDurationLabel(e, today)}</p>
                  {(e.employerPhone || e.salary !== undefined) && (
                    <p className="text-xs zego-text-tertiary">
                      {[e.employerPhone && `โทร ${e.employerPhone}`, salaryText(e.salary, e.currency) && `เงินเดือน ${salaryText(e.salary, e.currency)}`].filter(Boolean).join(' · ')}
                    </p>
                  )}
                  {e.jobDescription && <p className="text-xs zego-text-secondary">{e.jobDescription}</p>}
                  {e.reasonForLeaving && <p className="text-xs zego-text-tertiary">เหตุผลที่ออก: {e.reasonForLeaving}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
      {rows.length > 0 && <p className="px-1 text-xs zego-text-tertiary">ต้องการเพิ่มหรือแก้ไขประวัติการทำงาน กรุณาแจ้งเจ้าหน้าที่</p>}
    </div>
  );
}
