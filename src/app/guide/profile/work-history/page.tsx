'use client';

/**
 * ประวัติการทำงาน (สถานประกอบการ) — /guide/profile/work-history (ดูอย่างเดียว)
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
import { ProfileBackHeader } from '../ProfileBackHeader';

export default function GuideWorkHistoryPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const today = toISODate(new Date());

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ประวัติการทำงาน" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  const rows = sortByDisplayOrder(leader.employmentHistory ?? []);
  const summary = summarizeExperience(leader.employmentHistory ?? [], today);
  const salaryText = (salary: number | undefined, currency: string) =>
    salary === undefined ? undefined : `${salary.toLocaleString('th-TH')} ${currency === 'THB' ? 'บาท' : currency}`;

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="ประวัติการทำงาน" />
      {rows.length === 0 ? (
        <Card><EmptyState icon="briefcase" title="ยังไม่มีประวัติการทำงาน" description="ต้องการเพิ่มประวัติ กรุณาแจ้งเจ้าหน้าที่" /></Card>
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
