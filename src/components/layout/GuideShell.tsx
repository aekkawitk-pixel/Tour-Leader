'use client';

/**
 * Chrome ของพอร์ทัลหัวหน้าทัวร์ (/guide/*) — แยกจาก AppShell ฝั่งผู้จัดโดยสิ้นเชิง
 *
 * ออกแบบมือถือเป็นหลัก (ตามที่ผู้บริหารต้องการ): แถบล่างคงที่ 5 ปุ่ม แทน Sidebar,
 * ไม่มีตารางกว้าง ไม่มีเมนูย่อยหลายชั้น — ทุกอย่างเข้าถึงได้ใน 1 แตะจากแถบล่าง
 * จำกัดความกว้างเนื้อหาไว้ที่ขนาดจอมือถือ (max-w-md) แม้เปิดจากจอเดสก์ท็อป
 * เพื่อให้ตรงกับสิ่งที่จะเห็นจริงตอนใช้งานบนมือถือเสมอ ไม่ใช่ responsive แบบขยายเต็มจอ
 */

import { usePathname, useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Avatar, Button, Card, EmptyState, cx } from '@/components/ui/Primitives';
import { landingPathForRole, ownLeaderScope } from '@/lib/permissions';
import { ROLE } from '@/lib/labels';
import { useLeaderDocumentsView } from '@/lib/useLeaderDocuments';
import { listDocumentExpiryAlerts } from '@/lib/logic/documentExpiryAlerts';
import { countPendingConfirmationJobs } from '@/lib/logic/pendingConfirmationAlerts';
import type { Role } from '@/types';

interface GuideNavItem {
  href: string;
  label: string;
  icon: IconName;
  /** path อื่นที่นับเป็นเมนูนี้ด้วย (หน้าย่อยที่อยู่ path เดิม) */
  also?: string[];
}

const GUIDE_NAV: GuideNavItem[] = [
  { href: '/guide', label: 'หน้าหลัก', icon: 'dashboard' },
  { href: '/guide/jobs', label: 'งานของฉัน', icon: 'briefcase' },
  // "ค่าใช้จ่าย" + "เคลียร์เงิน" เดิมรวมเป็นเมนูเดียว — หน้าย่อยยังอยู่ path เดิม
  { href: '/guide/finance', label: 'บัญชี-การเงิน', icon: 'money', also: ['/guide/expenses', '/guide/settlement'] },
  // นัดหมายเคลียร์เงินกับฝ่ายบัญชี — path ยาวกว่า /guide/settlement จึงชนะการจับคู่แท็บ active (เลือก href ที่ยาวสุด)
  { href: '/guide/settlement/appointments', label: 'นัดหมาย', icon: 'calendar' },
  { href: '/guide/profile', label: 'โปรไฟล์', icon: 'guide' },
];

export function GuideShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { currentUser, leaders, today, setRole } = useDemo();

  /*
   * เอกสารต้องตาม — ต้องเรียก Hook นี้เสมอไม่ว่าบทบาทปัจจุบันจะเป็นอะไร (กฎของ Hook)
   * ผู้ใช้ที่ไม่ใช่หัวหน้าทัวร์จะได้ leader เป็น undefined ซึ่ง Hook รองรับอยู่แล้ว → ได้ 0 รายการ
   */
  const ownLeader = leaders.find((l) => l.id === ownLeaderScope(currentUser));
  const ownDocuments = useLeaderDocumentsView(ownLeader, true);
  const docAlertCount = listDocumentExpiryAlerts(ownDocuments, today).length;

  /** งานที่ยังไม่ได้กดคอนเฟิร์ม — แจ้งเตือนอื่นนอกเหนือจากเอกสาร */
  const pendingJobCount = countPendingConfirmationJobs(ownLeaderScope(currentUser), today);

  /** แท็บที่ active — ใช้ href ยาวสุดที่ตรงกับ path ปัจจุบัน กัน "/guide" จับคู่ผิดกับ "/guide/xxx" */
  const activeHref = [...GUIDE_NAV]
    .filter((item) => (item.href === '/guide' ? pathname === '/guide' : [item.href, ...(item.also ?? [])].some((h) => pathname.startsWith(h))))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  /** ออกจากมุมมองหัวหน้าทัวร์ — สลับกลับบทบาทผู้จัด (ใช้ทดสอบ/สาธิตเท่านั้น ไม่ใช่ระบบ Login จริง) */
  const exitToAdmin = () => {
    const adminRole: Role = 'coordinator';
    setRole(adminRole);
    router.push(landingPathForRole(adminRole));
  };

  /*
   * กันบัญชีที่ไม่ใช่บทบาทหัวหน้าทัวร์เข้ามาเห็นเนื้อหา — เช็คจุดเดียวที่นี่ ครอบทุกหน้าใน /guide/*
   * (เดิมมีแค่หน้าแรกที่เช็คเอง ทำให้หน้าอื่น เช่น /guide/profile/documents ขึ้น "ไม่พบข้อมูลหัวหน้าทัวร์"
   * ซึ่งเป็นข้อความผิด — จริง ๆ แล้วบัญชีนี้ไม่ใช่หัวหน้าทัวร์เลย ไม่ใช่ว่าข้อมูลหาย)
   * ปุ่มพากลับไปมุมมองผู้จัดเรียก exitToAdmin() ตรง ๆ — เดิมข้อความบอกให้ไปกดที่ "เมนูผู้ใช้มุมบนขวาฝั่งผู้จัด"
   * ซึ่งไม่มีทางกดได้จริงเพราะอยู่ใน Shell นี้ไม่มี Sidebar/Header ฝั่งผู้จัดให้เห็นเลย
   */
  if (currentUser.role !== 'leader') {
    return (
      <div className="zego-guide-backdrop flex h-dvh justify-center">
        <div className="zego-guide-phone flex h-dvh w-full max-w-md flex-col shadow-xl sm:my-0 sm:border-x">
          <header className="zego-guide-header sticky top-0 z-30 flex items-center gap-2.5 px-4 py-2.5">
            <Avatar initials={currentUser.name.slice(0, 1)} color="bg-emerald-700" size="sm" />
            <div className="min-w-0 flex-1">
              <p className="zego-text truncate text-xs font-semibold leading-tight">{currentUser.name}</p>
              <p className="zego-text-tertiary truncate text-[11px] leading-tight">พอร์ทัลหัวหน้าทัวร์</p>
            </div>
          </header>
          <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
            <Card>
              <EmptyState
                icon="guide"
                title="นี่คือพอร์ทัลของหัวหน้าทัวร์"
                description={`บัญชีปัจจุบันเป็น "${ROLE[currentUser.role].label}" — สลับเป็นบทบาท "หัวหน้าทัวร์" ก่อนถึงจะเข้าดูส่วนนี้ได้`}
                action={<Button variant="primary" size="sm" onClick={exitToAdmin}>กลับไปมุมมองผู้จัด</Button>}
              />
            </Card>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="zego-guide-backdrop flex h-dvh justify-center">
      <div className="zego-guide-phone flex h-dvh w-full max-w-md flex-col shadow-xl sm:my-0 sm:border-x">
        {/* แถบบน — เบามาก แค่ระบุตัวตนและทางออกกลับมุมมองผู้จัด (โหมดทดลอง) */}
        <header className="zego-guide-header sticky top-0 z-30 flex items-center gap-2.5 px-4 py-2.5">
          <Avatar initials={currentUser.name.slice(0, 1)} color="bg-emerald-700" size="sm" />
          <div className="min-w-0 flex-1">
            <p className="zego-text truncate text-xs font-semibold leading-tight">{currentUser.name}</p>
            <p className="zego-text-tertiary truncate text-[11px] leading-tight">พอร์ทัลหัวหน้าทัวร์</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/guide/jobs')}
            title={pendingJobCount > 0 ? `งานรอคอนเฟิร์ม ${pendingJobCount} รายการ` : 'ไม่มีงานรอคอนเฟิร์ม'}
            className="zego-guide-icon-btn relative rounded-lg p-2"
          >
            <Icon name="bell" className="h-4 w-4" />
            {pendingJobCount > 0 ? (
              <span className="zego-count-badge absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold">
                {pendingJobCount}
              </span>
            ) : (
              <span
                aria-label="ไม่มีงานรอคอนเฟิร์ม"
                className="zego-guide-dot--idle absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
              />
            )}
          </button>
          <button
            type="button"
            onClick={() => router.push('/guide/profile/documents')}
            title={docAlertCount > 0 ? `เอกสารต้องตาม ${docAlertCount} รายการ` : 'ยังไม่มีเอกสารต้องตาม'}
            className="zego-guide-icon-btn relative rounded-lg p-2"
          >
            <Icon name="file" className="h-4 w-4" />
            {docAlertCount > 0 ? (
              <span className="zego-count-badge absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold">
                {docAlertCount}
              </span>
            ) : (
              <span
                aria-label="ยังไม่มีเอกสารต้องตาม"
                className="zego-guide-dot--idle absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full"
              />
            )}
          </button>
          <button
            type="button"
            onClick={exitToAdmin}
            title="ออกจากมุมมองหัวหน้าทัวร์ (โหมดทดลอง)"
            className="zego-guide-icon-btn rounded-lg p-2"
          >
            <Icon name="logout" className="h-4 w-4" />
          </button>
        </header>


        {/* เนื้อหาหลัก — เว้นที่ด้านล่างให้พ้นแถบเมนูคงที่ */}
        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">{children}</main>

        {/* แถบเมนูล่าง — คงที่ ใช้นิ้วโป้งแตะได้ตลอดโดยไม่ต้องเลื่อนขึ้น */}
        <nav className="zego-guide-bottomnav sticky bottom-0 z-30 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
          {GUIDE_NAV.map((item) => {
            const active = item.href === activeHref;
            return (
              <button
                key={item.href}
                type="button"
                onClick={() => router.push(item.href)}
                aria-current={active ? 'page' : undefined}
                className={cx(
                  'zego-guide-nav-item relative flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  active && 'zego-guide-nav-item--active',
                )}
              >
                <Icon name={item.icon} className="h-5 w-5" filled={active} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
