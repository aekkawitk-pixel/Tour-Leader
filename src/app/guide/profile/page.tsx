'use client';

/**
 * โปรไฟล์ — /guide/profile — รายการหัวข้อ (แทนที่หน้าเดียวยาวเดิม)
 *
 * แต่ละหัวข้อแยกเป็นหน้าย่อยของตัวเอง กดเข้าไปดู/แก้ไขได้ — อิงหัวข้อเดียวกับแท็บฝั่งผู้จัด
 * (ภาพรวม/ข้อมูลส่วนตัว/ความเชี่ยวชาญและทักษะ/เอกสารประจำตัว/สถานะการลา ฯลฯ)
 * "ภาพรวม" คือการ์ดสรุปด้านบนหน้านี้เอง · "ตารางงาน" ย้ายไปเป็นแท็บ "งานของฉัน" ของแถบล่างแล้ว
 * (เอกสารทริปผูกกับแต่ละงานโดยตรงที่ /guide/jobs/[id]) จึงไม่ซ้ำมาไว้ที่นี่อีก
 *
 * หน้าตาตามธีม v3: แถบหัวโค้งเขียว · การ์ดโปรไฟล์ซ้อนแถบ (รูปวงทอง) · หัวข้อแบ่งกลุ่มด้วยสีไอคอน
 * ข้อมูลส่วนตัว = เขียว · การทำงาน = เขียวหัวเป็ด · เอกสาร = ทอง
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { LEADER_STATUS, LEADER_TYPE } from '@/lib/labels';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listDocumentExpiryAlerts } from '@/lib/logic/documentExpiryAlerts';
import { Card, EmptyState, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GuideBand, GuideOverlap } from '../GuideUi';

type TileTone = 'green' | 'teal' | 'gold';

interface Topic {
  href: string;
  label: string;
  description: string;
  icon: IconName;
}

const GROUPS: { label: string; tone: TileTone; topics: Topic[] }[] = [
  {
    label: 'ข้อมูลส่วนตัว',
    tone: 'green',
    topics: [
      { href: '/guide/profile/general', label: 'ข้อมูลทั่วไป', description: 'ชื่อ เพศ วันเกิด สัญชาติ', icon: 'user' },
      { href: '/guide/profile/contact', label: 'ข้อมูลติดต่อ', description: 'เบอร์โทร อีเมล ที่อยู่ ผู้ติดต่อฉุกเฉิน', icon: 'phone' },
      { href: '/guide/profile/languages', label: 'ภาษา', description: 'ภาษาที่พูดได้และระดับความสามารถ', icon: 'chat' },
      { href: '/guide/profile/account', label: 'บัญชีผู้ใช้', description: 'User name และเปลี่ยนรหัสผ่าน', icon: 'settings' },
    ],
  },
  {
    label: 'การทำงาน',
    tone: 'teal',
    topics: [
      { href: '/guide/profile/employment', label: 'ข้อมูลการร่วมงาน', description: 'รูปแบบการร่วมงาน วันที่เริ่ม สถานะโปรไฟล์', icon: 'briefcase' },
      { href: '/guide/profile/work-history', label: 'ประวัติการทำงาน', description: 'สถานประกอบการที่เคยทำงาน', icon: 'history' },
      { href: '/guide/profile/skills', label: 'ความเชี่ยวชาญและทักษะ', description: 'ประเทศ/เส้นทาง และกลุ่มลูกค้าที่ถนัด', icon: 'chart' },
      { href: '/guide/profile/leave', label: 'สถานะ/การลา', description: 'ความพร้อมรับงาน และขอลา', icon: 'calendar' },
      { href: '/guide/profile/survey', label: 'คะแนนแบบสอบถาม', description: 'ผลประเมินจากลูกทัวร์รายกรุ๊ป', icon: 'star' },
    ],
  },
  {
    label: 'เอกสาร',
    tone: 'gold',
    topics: [
      { href: '/guide/profile/documents', label: 'เอกสารประจำตัว', description: 'พาสปอร์ต บัตรหัวหน้าทัวร์ วีซ่า', icon: 'passport' },
      { href: '/guide/profile/documents/other', label: 'เอกสารอื่น ๆ', description: 'ประวัติอาชญากรรม ใบเซอร์ เอกสารอื่น', icon: 'file' },
      { href: '/guide/profile/bank', label: 'เอกสารการเงิน', description: 'บัญชีธนาคารที่ใช้รับเงิน', icon: 'bank' },
    ],
  },
];

/** อายุงานจากวันที่เริ่มร่วมงาน เช่น "4 ปี 9 เดือน" · ไม่ถึงเดือน/ไม่มีข้อมูล = '' */
function tenureText(joinedAt: string | undefined, today: string): string {
  if (!joinedAt) return '';
  const [y1, m1, d1] = joinedAt.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = today.slice(0, 10).split('-').map(Number);
  if (!y1 || !y2) return '';
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 1) return '';
  const years = Math.floor(months / 12);
  months %= 12;
  return [years > 0 && `${years} ปี`, months > 0 && `${months} เดือน`].filter(Boolean).join(' ');
}

export default function GuideProfilePage() {
  const { currentUser, leaders, today } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  // เอกสารต้องตาม — ตัวเลขเดียวกับกระดิ่งเอกสาร/แถบล่าง (เรียก Hook ก่อน early-return เสมอ)
  const documents = useLeaderDocumentsView(leader, true);
  const docAlertCount = listDocumentExpiryAlerts(documents, today).length;

  if (!leader) {
    return (
      <div className="space-y-4">
        <GuideBand>
          <h1 className="zego-guide-band__title text-[32px]">โปรไฟล์</h1>
        </GuideBand>
        <Card>
          <EmptyState
            icon="guide"
            title="ยังไม่พบข้อมูลหัวหน้าทัวร์"
            description="ข้อมูลส่วนตัวจะแสดงที่นี่เมื่อบัญชีนี้ผูกกับหัวหน้าทัวร์ใน Master แล้ว"
          />
        </Card>
      </div>
    );
  }

  const name = leaderDisplayName(leader);
  const tenure = tenureText(leader.joinedAt, today);
  const ready = leader.status === 'available';

  return (
    <div className="space-y-4">
      <GuideBand overlap>
        <h1 className="zego-guide-band__title text-[32px]">โปรไฟล์</h1>
      </GuideBand>

      <GuideOverlap>
        <section className="zego-guide-profile-card">
          {leader.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- Data URL จาก Demo ใช้ next/image ไม่ได้
            <img src={leader.photoUrl} alt="รูปประจำตัว" className="zego-guide-avatar zego-guide-avatar--ring h-[60px] w-[60px] object-cover" />
          ) : (
            <span className="zego-guide-avatar zego-guide-avatar--ring h-[60px] w-[60px] text-2xl" aria-hidden="true">
              {leader.avatarInitials || name.slice(0, 1)}
            </span>
          )}
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <p className="zego-guide-display truncate text-lg font-semibold text-[var(--zego-heading)]">{name}</p>
            <p className="text-[13px] zego-text-secondary">
              {[leader.id, LEADER_TYPE[leader.leaderType]?.label, tenure].filter(Boolean).join(' · ')}
            </p>
            <span className={ready ? 'zego-guide-ready' : 'zego-chip zego-chip--neutral self-start'}>{LEADER_STATUS[leader.status]?.label}</span>
          </div>
        </section>
      </GuideOverlap>

      {/* ตัวเลขสรุปงาน */}
      <div className="zego-guide-list grid grid-cols-3 py-3 text-center">
        <div>
          <p className="zego-guide-display flex items-center justify-center gap-1 text-base font-semibold zego-text">
            <Icon name="star" className="h-4 w-4 text-[var(--zego-accent-500)]" filled />
            {leader.rating.toFixed(1)}
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

      {GROUPS.map((g) => (
        <section key={g.label} className="space-y-2">
          <h2 className="zego-guide-label">{g.label}</h2>
          <ul className="zego-guide-list">
            {g.topics.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="zego-guide-row">
                  <span className={cx('zego-guide-tile', `zego-guide-tile--${g.tone}`)}>
                    <Icon name={t.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="zego-guide-row__title">{t.label}</span>
                    <span className="zego-guide-row__sub truncate">{t.description}</span>
                  </span>
                  {t.href === '/guide/profile/documents' && docAlertCount > 0 && (
                    <span className="zego-chip zego-chip--red font-semibold">ต้องตรวจ {docAlertCount}</span>
                  )}
                  <Icon name="chevronRight" className="zego-guide-chev h-4 w-4" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
