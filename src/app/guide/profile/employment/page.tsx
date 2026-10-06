'use client';

/**
 * ข้อมูลการร่วมงาน — /guide/profile/employment (ดูอย่างเดียว)
 *
 * ช่องเดียวกับการ์ด "ข้อมูลการร่วมงาน" ฝั่งผู้จัด (LeaderIdentityTab) — ประเภทบุคคล · วันที่เริ่ม · สถานะโปรไฟล์
 * · รูปแบบการร่วมงาน และรายละเอียดตามรูปแบบ (ประจำ: หน่วยงาน · ฟรีแลนซ์: ค่าจ้าง · เอเจนซี่: ผู้ติดต่อ)
 * ฝ่ายจัดหัวหน้าทัวร์เป็นผู้กำหนด หัวหน้าทัวร์ดูได้แต่แก้ไม่ได้ — ต้องการแก้ให้แจ้งเจ้าหน้าที่
 */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { LEADER_TYPE, LEADER_USAGE_STATUS, PAY_TYPE, PAY_UNIT, PERSON_TYPE } from '@/lib/labels';
import { formatDate } from '@/lib/format';
import { Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { ProfileBackHeader } from '../ProfileBackHeader';

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 zego-divider-bottom py-2 last:border-b-0">
      <dt className="shrink-0 text-xs zego-text-tertiary">{label}</dt>
      <dd className={`text-right text-sm ${empty ? 'zego-text-disabled' : 'zego-text'}`}>{empty ? 'ยังไม่ระบุ' : value}</dd>
    </div>
  );
}

export default function GuideEmploymentPage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  if (!leader) {
    return (
      <div>
        <ProfileBackHeader title="ข้อมูลการร่วมงาน" />
        <Card><EmptyState icon="guide" title="ยังไม่พบข้อมูลหัวหน้าทัวร์" /></Card>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="ข้อมูลการร่วมงาน" />
      <Card>
        <dl>
          <Row label="ประเภทบุคคล" value={leader.personType ? PERSON_TYPE[leader.personType] : undefined} />
          <Row label="วันที่เริ่มร่วมงาน" value={leader.joinedAt ? formatDate(leader.joinedAt) : undefined} />
          <Row label="สถานะโปรไฟล์" value={<StatusBadge meta={LEADER_USAGE_STATUS[leader.usageStatus]} size="sm" />} />
          <Row
            label="รูปแบบการร่วมงาน"
            value={LEADER_TYPE[leader.leaderType] ? <StatusBadge meta={LEADER_TYPE[leader.leaderType]} size="sm" dot={false} /> : undefined}
          />
          {leader.leaderType === 'regular' && <Row label="หน่วยงาน / ฝ่ายที่ดูแล" value={leader.team} />}
          {leader.leaderType === 'freelance' && (
            <>
              <Row label="รูปแบบค่าจ้าง" value={leader.payType ? PAY_TYPE[leader.payType] : undefined} />
              <Row
                label="อัตราค่าจ้างเบื้องต้น"
                value={leader.payRate == null ? undefined : `${leader.payRate.toLocaleString('th-TH')} บาท${leader.payUnit ? ` ${PAY_UNIT[leader.payUnit]}` : ''}`}
              />
            </>
          )}
          {leader.leaderType === 'agent' && (
            <>
              <Row label="บริษัท / หน่วยงานที่สังกัด" value={leader.agencyName} />
              <Row label="ผู้ติดต่อของเอเจนซี่" value={leader.agencyContactName} />
              <Row label="เบอร์โทรผู้ติดต่อ" value={leader.agencyContactPhone} />
            </>
          )}
          <Row label="หมายเหตุการร่วมงาน" value={leader.typeNote || 'ไม่มี'} />
        </dl>
      </Card>
      <p className="px-1 text-xs zego-text-tertiary">ข้อมูลส่วนนี้ฝ่ายจัดหัวหน้าทัวร์เป็นผู้กำหนด — ถ้าไม่ถูกต้อง กรุณาแจ้งเจ้าหน้าที่</p>
    </div>
  );
}
