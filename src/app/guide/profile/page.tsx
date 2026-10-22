'use client';

/**
 * โปรไฟล์ — /guide/profile — รายการหัวข้อ (แทนที่หน้าเดียวยาวเดิม)
 *
 * แต่ละหัวข้อแยกเป็นหน้าย่อยของตัวเอง กดเข้าไปดู/แก้ไขได้ — อิงหัวข้อเดียวกับแท็บฝั่งผู้จัด
 * "ภาพรวม" คือการ์ดสรุปด้านบนหน้านี้เอง · "ตารางงาน" ย้ายไปเป็นแท็บ "งานของฉัน" ของแถบล่างแล้ว
 * (เอกสารทริปผูกกับแต่ละงานโดยตรงที่ /guide/jobs/[id]) จึงไม่ซ้ำมาไว้ที่นี่อีก
 *
 * หน้าตาตามธีม v3: แถบหัวโค้งเขียว · การ์ดโปรไฟล์ซ้อนแถบ (รูปวงทอง) · หัวข้อแบ่งกลุ่มด้วยสีไอคอน
 * ข้อมูลส่วนตัว = เขียว · การทำงาน = เขียวหัวเป็ด · เอกสาร = ทอง · บัญชี = เทา
 *
 * โครงเมนูตามต้นแบบ — รวมหัวข้อย่อยที่เคยแยก (12 → 8 หัวข้อข้อมูล + บัญชีผู้ใช้) ให้เห็นครบในจอเดียว
 *   ภาษา → การพัฒนาและประสบการณ์ · คะแนนแบบสอบถาม + ตัวเลขสรุปงาน → ประวัติงานและผลประเมิน
 *   เอกสารอื่น ๆ → เอกสารประจำตัว · URL เดิมยังเปิดได้ (พาไปหน้าที่รวมแล้ว)
 * หัวข้อที่แก้เองไม่ได้มีป้าย "ดูอย่างเดียว" — รู้ก่อนกดเข้าไป
 */

import Link from 'next/link';
import { useDemo } from '@/store/DemoStore';
import { ownLeaderScope } from '@/lib/permissions';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { LEADER_STATUS, LEADER_TYPE } from '@/lib/labels';
import { useGuideDocuments } from '@/lib/useGuideDocuments';
import { toISODate } from '@/lib/format';
import { Card, EmptyState, cx } from '@/components/ui/Primitives';
import { Icon, type IconName } from '@/components/ui/Icon';
import { GuideBand, GuideOverlap } from '../GuideUi';

type TileTone = 'green' | 'teal' | 'gold' | 'neutral';

interface Topic {
  href: string;
  label: string;
  description: string;
  icon: IconName;
  /** หน้าดูอย่างเดียว (ฝ่ายจัดหัวหน้าทัวร์เป็นผู้กำหนด) — ป้ายบอกในเมนูก่อนกดเข้าไป */
  readOnly?: boolean;
}

const GROUPS: { label: string; tone: TileTone; topics: Topic[] }[] = [
  {
    label: 'ข้อมูลส่วนตัว',
    tone: 'green',
    topics: [
      { href: '/guide/profile/general', label: 'ข้อมูลทั่วไป', description: 'ชื่อ เพศ วันเกิด สัญชาติ', icon: 'user' },
      { href: '/guide/profile/contact', label: 'ข้อมูลติดต่อ', description: 'เบอร์โทร อีเมล ที่อยู่ ผู้ติดต่อฉุกเฉิน', icon: 'phone' },
    ],
  },
  {
    label: 'การทำงาน',
    tone: 'teal',
    topics: [
      { href: '/guide/profile/employment', label: 'ข้อมูลการร่วมงาน', description: 'รูปแบบการร่วมงาน วันที่เริ่ม สถานะ', icon: 'briefcase', readOnly: true },
      { href: '/guide/profile/work-history', label: 'ประวัติงานและผลประเมิน', description: 'ทริปที่ปิดแล้ว ผลประเมิน ค่าตอบแทน', icon: 'history', readOnly: true },
      { href: '/guide/profile/skills', label: 'การพัฒนาและประสบการณ์', description: 'จุดแข็ง ประเทศที่เคยพาทัวร์', icon: 'chart' },
      { href: '/guide/profile/leave', label: 'สถานะ/การลา', description: 'ความพร้อมรับงาน และขอลา', icon: 'calendar' },
    ],
  },
  {
    label: 'เอกสาร',
    tone: 'gold',
    topics: [
      { href: '/guide/profile/documents', label: 'เอกสารประจำตัว', description: 'พาสปอร์ต บัตรหัวหน้าทัวร์ วีซ่า', icon: 'passport' },
      { href: '/guide/profile/bank', label: 'เอกสารการเงิน', description: 'บัญชีธนาคารที่ใช้รับเงิน', icon: 'bank' },
    ],
  },
  {
    label: 'บัญชี',
    tone: 'neutral',
    topics: [
      { href: '/guide/profile/account', label: 'บัญชีผู้ใช้', description: 'ชื่อผู้ใช้ และเปลี่ยนรหัสผ่าน', icon: 'settings' },
    ],
  },
];

/** อายุงานจากวันที่เริ่มร่วมงาน เช่น "4 ปี 9 เดือน" · ไม่ถึงเดือน = "ไม่ถึง 1 เดือน" · ไม่มีข้อมูล = '' */
function tenureText(joinedAt: string | undefined, today: string): string {
  if (!joinedAt) return '';
  const [y1, m1, d1] = joinedAt.slice(0, 10).split('-').map(Number);
  const [y2, m2, d2] = today.slice(0, 10).split('-').map(Number);
  if (!y1 || !y2) return '';
  let months = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0);
  if (months < 0) return '';
  if (months < 1) return 'ไม่ถึง 1 เดือน';
  const years = Math.floor(months / 12);
  months %= 12;
  return [years > 0 && `${years} ปี`, months > 0 && `${months} เดือน`].filter(Boolean).join(' ');
}

export default function GuideProfilePage() {
  const { currentUser, leaders } = useDemo();
  const leader = leaders.find((l) => l.id === ownLeaderScope(currentUser));

  // เอกสารต้องตาม — ตัวเลขเดียวกับกระดิ่งเอกสาร/แถบล่าง (เรียก Hook ก่อน early-return เสมอ)
  const docAlertCount = useGuideDocuments(leader).alerts.length;

  if (!leader) {
    return (
      <div className="space-y-4">
        <GuideBand>
          <h1 className="zego-guide-band__title">โปรไฟล์</h1>
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
  // อายุงานนับถึงวันจริงของเครื่อง — ตรงกับหน้าอื่นในพอร์ทัล (useDemo().today เป็นวันจำลองของ Demo)
  const tenure = tenureText(leader.joinedAt, toISODate(new Date()));
  const ready = leader.status === 'available';

  return (
    <div className="space-y-4">
      <GuideBand overlap>
        <h1 className="zego-guide-band__title">โปรไฟล์</h1>
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
              {[leader.id, LEADER_TYPE[leader.leaderType]?.label, tenure && `ร่วมงาน ${tenure}`].filter(Boolean).join(' · ')}
            </p>
            {/* ความพร้อมรับงาน — กดไปหน้าสถานะ/การลา (ขอลา/แจ้งช่วงไม่พร้อม) ซึ่งทำจากตรงนี้บ่อยที่สุด */}
            <Link
              href="/guide/profile/leave"
              aria-label={`ความพร้อมรับงาน: ${LEADER_STATUS[leader.status]?.label ?? ''} — ดูสถานะหรือขอลา`}
              className={cx('zego-guide-status-link', ready ? 'zego-guide-ready' : 'zego-chip zego-chip--neutral self-start')}
            >
              {LEADER_STATUS[leader.status]?.label}
              <Icon name="chevronRight" className="h-3 w-3" />
            </Link>
          </div>
        </section>
      </GuideOverlap>

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
                    <span className="zego-chip zego-chip--red shrink-0 font-semibold">ต้องตรวจ {docAlertCount}</span>
                  )}
                  {t.readOnly && <span className="zego-chip zego-chip--neutral shrink-0 text-[11px]">ดูอย่างเดียว</span>}
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
