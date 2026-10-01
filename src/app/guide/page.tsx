'use client';

/**
 * หน้าหลัก (Personal Workspace) ของพอร์ทัลหัวหน้าทัวร์ — /guide
 *
 * ขอบเขตตามที่ตกลงกับผู้บริหาร: ทางลัดไปยัง 4 กลุ่มงานหลัก (งานของฉัน/ค่าใช้จ่าย/เคลียร์เงิน/โปรไฟล์)
 * และภาพรวมงานของตัวเอง — ไม่มี checklist/attendance/customer-care ที่เพิ่มภาระรายวัน (ตัดออกแล้วตามที่คุยกัน)
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { boardStatusMeta } from '@/lib/logic/guideBoard';
import { formatDateRange } from '@/lib/format';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listDocumentExpiryAlerts } from '@/lib/logic/documentExpiryAlerts';
import { Card, Callout, StatusBadge, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';

const QUICK_LINKS: { href: string; label: string; description: string; icon: IconName }[] = [
  { href: '/guide/jobs', label: 'งานของฉัน', description: 'ดูรายละเอียด + เอกสารทริป', icon: 'briefcase' },
  { href: '/guide/expenses', label: 'ค่าใช้จ่าย', description: 'บันทึกใหม่ + ดูรายการที่บันทึกไว้', icon: 'receipt' },
  { href: '/guide/settlement', label: 'เคลียร์เงิน', description: 'เตรียมเอกสาร + จองคิว', icon: 'money' },
  { href: '/guide/profile', label: 'โปรไฟล์', description: 'ข้อมูลส่วนตัว คะแนน สถานะ', icon: 'guide' },
];

export default function GuideHomePage() {
  const { currentUser, leaders, today } = useDemo();

  // GuideShell กันบัญชีที่ไม่ใช่บทบาทหัวหน้าทัวร์ไว้แล้วที่ชั้นบนสุด — หน้านี้เข้าถึงได้แปลว่าเป็นหัวหน้าทัวร์แน่นอน
  const leaderId = ownLeaderScope(currentUser);
  const leader = leaders.find((l) => l.id === leaderId);

  // เอกสารต้องตาม (หมดอายุแล้ว/ใกล้หมดอายุ) — ดูของตัวเองได้เสมอ ไม่ต้องเช็คสิทธิ์เพิ่ม
  const documents = useLeaderDocumentsView(leader, true);
  const docAlerts = listDocumentExpiryAlerts(documents, today);
  const expiredDocs = docAlerts.filter((a) => a.severity === 'expired');
  const soonDocs = docAlerts.filter((a) => a.severity === 'soon');

  // ดึงจาก Tour Period Master + guideAssignmentStore — แหล่งเดียวกับที่หน้า "การจัดสเก็ต" ฝั่งผู้จัดใช้จริง
  const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
  const myJobs = (leaderId ? loadActiveGuideAssignments().filter((a) => a.tourLeaderId === leaderId) : [])
    .map((assignment) => ({ assignment, period: periodById.get(assignment.periodId) }))
    .filter((x): x is { assignment: typeof x.assignment; period: NonNullable<typeof x.period> } => Boolean(x.period))
    .filter((x) => x.assignment.assignmentStatus !== 'DECLINED' && x.period.endDate >= today)
    .sort((a, b) => a.period.startDate.localeCompare(b.period.startDate));
  const nextJob = myJobs[0];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold zego-text">
          สวัสดี{leader ? `, ${leaderDisplayName(leader)}` : ''}
        </h1>
        <p className="text-sm zego-text-tertiary">{leader ? leader.id : currentUser.position}</p>
      </div>

      {!leader && (
        <Card className="bg-amber-50 ring-1 ring-amber-200">
          <p className="text-sm zego-text-warning">
            ยังไม่พบข้อมูลหัวหน้าทัวร์ที่ผูกกับบัญชีนี้ในชุดข้อมูลปัจจุบัน — ทางลัดด้านล่างยังใช้งานได้ตามปกติ
          </p>
        </Card>
      )}

      {/* เอกสารต้องตาม — แจ้งเตือนเฉพาะเอกสาร แยกจากงาน/ค่าใช้จ่าย */}
      {docAlerts.length > 0 && (
        <Link href="/guide/profile/documents" className="block">
          <Callout
            tone={expiredDocs.length > 0 ? 'red' : 'amber'}
            title={`เอกสารต้องตาม ${docAlerts.length} รายการ`}
          >
            {expiredDocs.length > 0 && `หมดอายุแล้ว: ${expiredDocs.map((a) => a.name).join(', ')}`}
            {expiredDocs.length > 0 && soonDocs.length > 0 && ' · '}
            {soonDocs.length > 0 && `ใกล้หมดอายุ: ${soonDocs.map((a) => a.name).join(', ')}`}
          </Callout>
        </Link>
      )}

      {/* งานถัดไป — สิ่งที่ต้องรู้ทันทีที่เปิดแอป */}
      <Card padded={false}>
        <div className="zego-divider-bottom px-4 py-2.5">
          <p className="text-sm font-semibold zego-text">งานของฉัน</p>
        </div>
        {!nextJob ? (
          <div className="px-4 py-6 text-center text-sm zego-text-tertiary">ยังไม่มีงานที่กำลังจะถึง</div>
        ) : (
          <Link href={`/guide/jobs/${nextJob.period.internalId}`} className="block px-4 py-3 zego-hover-surface">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold zego-text">{nextJob.period.groupCode} · {nextJob.period.displayName}</p>
                <p className="mt-0.5 text-xs zego-text-tertiary">
                  {nextJob.period.countryName} · {formatDateRange(nextJob.period.startDate, nextJob.period.endDate)}
                </p>
              </div>
              <StatusBadge meta={boardStatusMeta(nextJob.assignment.assignmentStatus)} size="sm" />
            </div>
          </Link>
        )}
        {myJobs.length > 1 && (
          <Link href="/guide/jobs" className="block zego-divider-top px-4 py-2 text-center text-xs font-medium zego-text-success zego-hover-surface">
            และอีก {myJobs.length - 1} งานที่กำลังจะถึง — ดูทั้งหมด
          </Link>
        )}
      </Card>

      {/* ทางลัด 4 กลุ่มงานหลัก */}
      <div>
        <p className="mb-2 text-sm font-semibold zego-text">ทางลัด</p>
        <div className="grid grid-cols-2 gap-3">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cx(
                'flex flex-col gap-2 zego-card-surface p-3.5 transition-colors',
                'hover:border-emerald-300 hover:bg-emerald-50/40',
              )}
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 zego-text-success">
                <Icon name={item.icon} className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-semibold zego-text">{item.label}</span>
                <span className="block text-xs zego-text-tertiary">{item.description}</span>
              </span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
