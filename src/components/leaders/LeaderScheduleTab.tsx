'use client';

/**
 * แท็บ "ตารางงาน" — งานที่หัวหน้าทัวร์รายนี้ได้รับมอบหมาย (อ่านจาก Schedule ชุดเดียวกัน §18)
 * แสดงอย่างเดียว · จัดงานจริงทำที่หน้า "การจัดสเก็ต / Schedule"
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardHeader, Pill, StatusBadge } from '@/components/ui/Primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { formatDateRange } from '@/lib/format';
import { getTourPeriods } from '@/services/tourPeriodMaster';
import { loadActiveGuideAssignments } from '@/services/guideAssignmentStore';
import { BOARD_STATUS, boardStatusFromAssignment } from '@/lib/logic/guideBoard';
import type { TourLeader } from '@/types';

interface ScheduleRow {
  id: string;
  groupCode: string;
  displayName: string;
  countryName: string;
  startDate: string;
  endDate: string;
  board: ReturnType<typeof boardStatusFromAssignment>;
}

/**
 * แถวตารางงาน + จำนวน "กำลังเดินทาง"/"ล่วงหน้า" ของหัวหน้าทัวร์คนนี้ — อ่านจาก Schedule ชุดเดียวกับแท็บ "ตารางงาน" เสมอ
 * แยกเป็น hook เพื่อให้หน้ารายละเอียดหัวหน้าทัวร์ (Badge ของแท็บ) ใช้ตัวเลขชุดเดียวกับเนื้อหาในแท็บจริง
 * ไม่ใช่คำนวณจาก `jobs` (ชุดข้อมูลเก่า) แยกต่างหาก ซึ่งจะทำให้ Badge กับเนื้อหาในแท็บขัดแย้งกันเอง
 */
export function useLeaderScheduleRows(leader: TourLeader | undefined, today: string) {
  const rows = useMemo<ScheduleRow[]>(() => {
    if (!leader) return [];
    const periodById = new Map(getTourPeriods().map((p) => [p.internalId, p]));
    return loadActiveGuideAssignments()
      .filter((a) => a.tourLeaderId === leader.id)
      .map((a) => {
        const p = periodById.get(a.periodId);
        if (!p) return null;
        return {
          id: a.assignmentId,
          groupCode: p.groupCode,
          displayName: p.displayName,
          countryName: p.countryName,
          startDate: p.startDate,
          endDate: p.endDate,
          board: boardStatusFromAssignment(a.assignmentStatus),
        };
      })
      .filter((r): r is ScheduleRow => r !== null)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [leader]);

  const upcoming = rows.filter((r) => r.startDate > today).length;
  const current = rows.filter((r) => r.startDate <= today && r.endDate >= today).length;

  return { rows, upcoming, current };
}

export function LeaderScheduleTab({ leader, today }: { leader: TourLeader; today: string }) {
  const router = useRouter();
  const { rows, upcoming, current } = useLeaderScheduleRows(leader, today);

  const columns: Column<ScheduleRow>[] = [
    {
      key: 'group',
      header: 'Group Code / โปรแกรม',
      render: (r) => (
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 font-mono font-semibold zego-text">
            {r.groupCode}
            {r.startDate <= today && r.endDate >= today && <Pill tone="green">กำลังเดินทาง</Pill>}
          </p>
          <p className="truncate text-xs zego-text-tertiary">{r.displayName}</p>
        </div>
      ),
    },
    { key: 'country', header: 'ประเทศ', hideOnMobile: true, render: (r) => <span className="text-sm zego-text-secondary">{r.countryName || '—'}</span> },
    { key: 'period', header: 'ช่วงเดินทาง', render: (r) => <span className="whitespace-nowrap text-sm zego-text-secondary">{formatDateRange(r.startDate, r.endDate)}</span> },
    { key: 'status', header: 'สถานะการจัด', render: (r) => (r.board ? <StatusBadge meta={BOARD_STATUS[r.board]} size="sm" /> : <span className="zego-text-disabled">—</span>) },
  ];

  return (
    <Card>
      <CardHeader
        title="ตารางงาน"
        description={`ทั้งหมด ${rows.length} กรุ๊ป · กำลังเดินทาง ${current} · ล่วงหน้า ${upcoming}`}
        action={<Button size="sm" variant="primary" icon="calendar" onClick={() => router.push(`/jobs?leader=${leader.id}`)}>เปิดตารางงานเต็ม</Button>}
      />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        emptyIcon="calendar"
        emptyTitle="ยังไม่มีงานที่มอบหมาย"
        emptyDescription="เมื่อจัดงานให้หัวหน้าทัวร์รายนี้ในหน้าการจัดสเก็ต จะแสดงที่นี่"
      />
      {rows.length === 0 && (
        <div className="mt-3 flex justify-center">
          <Button size="sm" variant="secondary" onClick={() => router.push(`/jobs?leader=${leader.id}`)}>ไปหน้าการจัดสเก็ต</Button>
        </div>
      )}
    </Card>
  );
}
