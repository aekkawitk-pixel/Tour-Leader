'use client';

/**
 * ข้อมูลการร่วมงาน — /guide/profile/employment (ดูอย่างเดียว)
 *
 * ช่องเดียวกับการ์ด "ข้อมูลการร่วมงาน" ฝั่งผู้จัด (LeaderIdentityTab) — ประเภทบุคคล · วันที่เริ่ม · สถานะโปรไฟล์
 * · รูปแบบการร่วมงาน และรายละเอียดตามรูปแบบ (ประจำ: หน่วยงาน · ฟรีแลนซ์: ค่าจ้าง · เอเจนซี่: ผู้ติดต่อ)
 * ฝ่ายจัดหัวหน้าทัวร์เป็นผู้กำหนด หัวหน้าทัวร์ดูได้แต่แก้ไม่ได้ — ต้องการแก้ให้แจ้งเจ้าหน้าที่
 *
 * ต้นแบบ C1: ใต้ข้อมูลการร่วมงานมีกลุ่ม "ประวัติสถานประกอบการ · N" (ย้ายมาจากหน้าประวัติงาน)
 *   แถวละที่ — ไอคอนหัวเป็ด · ชื่อสถานประกอบการ · ตำแหน่ง · ช่วงเวลา · ระยะเวลาอยู่ขวา · ยอดประสบการณ์รวมท้ายกลุ่ม
 */

import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { LEADER_TYPE, LEADER_USAGE_STATUS, PAY_TYPE, PAY_UNIT, PERSON_TYPE } from '@/lib/labels';
import { formatDate, toISODate } from '@/lib/format';
import { entryDurationLabel, formatEmploymentPeriod, sortByDisplayOrder, summarizeExperience } from '@/modules/tour-leaders/experience';
import { Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Icon } from '@/components/ui/Icon';
import { ProfileBackHeader } from '../ProfileBackHeader';

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div className="zego-guide-inforow zego-divider-bottom py-2 last:border-b-0">
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

  const today = toISODate(new Date());
  const history = sortByDisplayOrder(leader.employmentHistory ?? []);
  const experience = summarizeExperience(leader.employmentHistory ?? [], today);

  return (
    <div className="space-y-3">
      <ProfileBackHeader title="ข้อมูลการร่วมงาน" />
      <h2 className="zego-guide-label">ข้อมูลการร่วมงาน</h2>
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

      <h2 className="zego-guide-label pt-1">
        ประวัติสถานประกอบการ
        {history.length > 0 && <span className="font-normal zego-text-tertiary">· {history.length}</span>}
      </h2>
      {history.length === 0 ? (
        <p className="zego-guide-list px-4 py-3 text-sm zego-text-tertiary">ยังไม่มีประวัติสถานประกอบการ</p>
      ) : (
        <ul className="zego-guide-list">
          {history.map((e) => (
            <li key={e.id} className="zego-guide-row zego-guide-row--tall">
              <span className="zego-guide-tile zego-guide-tile--teal"><Icon name="briefcase" className="h-4 w-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="zego-guide-row__title">
                  {e.employerName}
                  {e.isCurrentJob && <span className="zego-chip zego-chip--green ml-1.5 px-1.5 py-0 text-[11px]">ปัจจุบัน</span>}
                </span>
                <span className="zego-guide-row__sub">{[e.position, formatEmploymentPeriod(e)].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="shrink-0 text-sm tabular-nums zego-text-secondary">{entryDurationLabel(e, today)}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="px-1 text-xs zego-text-tertiary">
        {history.length > 0 && `ประสบการณ์รวม ${experience.label} · `}ข้อมูลส่วนนี้ฝ่ายจัดหัวหน้าทัวร์เป็นผู้กำหนด — ถ้าไม่ถูกต้อง กรุณาแจ้งเจ้าหน้าที่
      </p>
    </div>
  );
}
