'use client';

/**
 * เมนู "หัวหน้าทัวร์" — รายชื่อทั้งหมด (ค้นหา/กรอง/แก้ไข/ปิดใช้งาน)
 *
 * ปุ่ม "ไกด์ของฉัน" (ปักดาว + กรองเฉพาะคนที่ปักดาวไว้ + ลากจัดลำดับ) อยู่ในตัว LeaderListView เอง —
 * ไม่ต้องสลับหน้า/มุมมองเพื่อใช้งาน
 */

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { can } from '@/lib/permissions';
import { Button, PageHeader } from '@/components/ui/Primitives';
import { LeaderListView } from '@/components/leaders/LeaderListView';

function LeadersPageContent() {
  const router = useRouter();
  const { leaders, currentUser } = useDemo();

  return (
    <>
      <PageHeader
        title="หัวหน้าทัวร์"
        description={`ทั้งหมด ${leaders.length} คน`}
        actions={
          can(currentUser.role, 'leader.create') && (
            <Button variant="primary" icon="plus" onClick={() => router.push('/leaders/new')}>
              เพิ่มหัวหน้าทัวร์
            </Button>
          )
        }
      />

      <LeaderListView />
    </>
  );
}

export default function LeadersPage() {
  // useSearchParams (ใน LeaderListView) ต้องอยู่ใต้ Suspense เพราะหน้านี้ถูก prerender ตอน build
  return (
    <Suspense fallback={null}>
      <LeadersPageContent />
    </Suspense>
  );
}
