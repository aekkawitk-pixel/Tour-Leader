'use client';

/**
 * เมนู ข้อมูลระบบ → Master รายการทัวร์และพีเรียด (§8)
 * แหล่งข้อมูลกลางเพียงชุดเดียว (Tour Period Master) ที่ทุกหน้าอ้างอิงผ่าน Service
 */

import { TourPeriodMasterView } from '@/components/master/TourPeriodMasterView';

export default function TourPeriodsPage() {
  return <TourPeriodMasterView />;
}
