'use client';

/**
 * โปรไฟล์ — /guide/profile — รายการหัวข้อ (แทนที่หน้าเดียวยาวเดิม)
 *
 * แต่ละหัวข้อแยกเป็นหน้าย่อยของตัวเอง กดเข้าไปดู/แก้ไขได้ — อิงหัวข้อเดียวกับแท็บฝั่งผู้จัด
 * (ภาพรวม/ข้อมูลส่วนตัว/ความเชี่ยวชาญและทักษะ/เอกสารประจำตัว/สถานะการลา ฯลฯ)
 * "ภาพรวม" คือการ์ดสรุปด้านบนหน้านี้เอง · "ตารางงาน" ย้ายไปเป็นแท็บ "งานของฉัน" ของแถบล่างแล้ว
 * (เอกสารทริปผูกกับแต่ละงานโดยตรงที่ /guide/jobs/[id]) จึงไม่ซ้ำมาไว้ที่นี่อีก
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { LEADER_STATUS, LEADER_TYPE } from '@/lib/labels';
import { Avatar, Card, EmptyState, StatusBadge } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';

const TOPICS: { href: string; label: string; description: string; icon: IconName }[] = [
  { href: '/guide/profile/general', label: 'ข้อมูลทั่วไป', description: 'ชื่อ เพศ วันเกิด สัญชาติ', icon: 'guide' },
  { href: '/guide/profile/contact', label: 'ข้อมูลติดต่อ', description: 'เบอร์โทร อีเมล ที่อยู่ ผู้ติดต่อฉุกเฉิน', icon: 'phone' },
  { href: '/guide/profile/languages', label: 'ภาษา', description: 'ภาษาที่พูดได้และระดับความสามารถ', icon: 'chat' },
  { href: '/guide/profile/skills', label: 'ความเชี่ยวชาญและทักษะ', description: 'ประเทศ/เส้นทาง และกลุ่มลูกค้าที่ถนัด', icon: 'star' },
  { href: '/guide/profile/documents', label: 'เอกสารประจำตัว', description: 'พาสปอร์ต บัตรหัวหน้าทัวร์ วีซ่า', icon: 'file' },
  { href: '/guide/profile/documents/other', label: 'เอกสารอื่น ๆ', description: 'ประวัติอาชญากรรม ใบเซอร์ เอกสารอื่น', icon: 'file' },
  { href: '/guide/profile/bank', label: 'เอกสารการเงิน', description: 'บัญชีธนาคารที่ใช้รับเงิน', icon: 'money' },
  { href: '/guide/profile/leave', label: 'สถานะ/การลา', description: 'ความพร้อมรับงาน และขอลา', icon: 'calendar' },
  { href: '/guide/profile/survey', label: 'คะแนนแบบสอบถาม', description: 'ผลประเมินจากลูกทัวร์รายกรุ๊ป', icon: 'chart' },
];

export default function GuideProfilePage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  if (!leader) {
    return (
      <Card>
        <EmptyState
          icon="guide"
          title="ยังไม่พบข้อมูลหัวหน้าทัวร์"
          description="ข้อมูลส่วนตัวจะแสดงที่นี่เมื่อบัญชีนี้ผูกกับหัวหน้าทัวร์ใน Master แล้ว"
        />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-3">
          <Avatar
            initials={leader.avatarInitials || leaderDisplayName(leader).slice(0, 1)}
            color={leader.avatarColor || 'bg-emerald-700'}
            src={leader.photoUrl}
            size="lg"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold zego-text">{leaderDisplayName(leader)}</p>
            <p className="truncate text-sm zego-text-tertiary">{leader.id}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <StatusBadge meta={LEADER_TYPE[leader.leaderType]} size="sm" />
              <StatusBadge meta={LEADER_STATUS[leader.status]} size="sm" />
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 zego-divider-top pt-3 text-center">
          <div>
            <p className="flex items-center justify-center gap-1 text-base font-semibold zego-text">
              <Icon name="star" className="h-4 w-4 zego-text-warning" filled />
              {leader.rating.toFixed(1)}
            </p>
            <p className="text-xs zego-text-tertiary">คะแนนเฉลี่ย</p>
          </div>
          <div>
            <p className="text-base font-semibold zego-text">{leader.totalJobs}</p>
            <p className="text-xs zego-text-tertiary">งานที่ผ่านมา</p>
          </div>
          <div>
            <p className="text-base font-semibold zego-text">{leader.totalDays}</p>
            <p className="text-xs zego-text-tertiary">วันเดินทางรวม</p>
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <ul className="divide-y divide-[var(--zego-border-soft)]">
          {TOPICS.map((t) => (
            <li key={t.href}>
              <Link
                href={t.href}
                className="flex items-center gap-3 px-4 py-3 zego-hover-surface"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 zego-text-success">
                  <Icon name={t.icon} className="h-4.5 w-4.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold zego-text">{t.label}</span>
                  <span className="block truncate text-xs zego-text-tertiary">{t.description}</span>
                </span>
                <Icon name="chevronRight" className="h-4 w-4 shrink-0 zego-text-disabled" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
