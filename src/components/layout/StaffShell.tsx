'use client';

/**
 * Chrome ของพอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป (/staff/*) — มือถือเป็นหลัก เหมือนพอร์ทัลหัวหน้าทัวร์
 *
 * แถบล่าง 5 เมนู: ตารางงาน · ซองเงิน · เบิกค่าใช้จ่าย · การลา · โปรไฟล์
 * ซองเงิน = ทอดกลางของเงินกรุ๊ป (การเงิน → เจ้าหน้าที่ → หัวหน้าทัวร์) ยืนยันในเครื่องตัวเองทุกขั้น
 */

import { usePathname, useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { Icon, type IconName } from '@/components/ui/Icon';
import { Avatar, Button, Card, EmptyState, cx } from '@/components/ui/Primitives';
import { landingPathForRole } from '@/lib/permissions';
import { ROLE } from '@/lib/labels';
import type { Role } from '@/types';

const STAFF_NAV: { href: string; label: string; icon: IconName }[] = [
  { href: '/staff', label: 'ตารางงาน', icon: 'calendar' },
  { href: '/staff/envelopes', label: 'ซองเงิน', icon: 'money' },
  { href: '/staff/claims', label: 'เบิกค่าใช้จ่าย', icon: 'receipt' },
  { href: '/staff/leave', label: 'การลา', icon: 'clock' },
  { href: '/staff/profile', label: 'โปรไฟล์', icon: 'guide' },
];

export function StaffShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, setRole, envelopes } = useDemo();
  const staffId = currentUser.sendOffStaffId;

  /** ซองที่ต้องทำอะไรต่อ (ยังไม่กดรับ หรือรับแล้วยังไม่ส่งต่อ) */
  const envelopeTodo = staffId
    ? envelopes.filter((e) => e.handover?.proxyStaffId === staffId && !e.leaderAck && (!e.staffAck || !e.staffHandoff)).length
    : 0;

  const activeHref = [...STAFF_NAV]
    .filter((i) => (i.href === '/staff' ? pathname === '/staff' : pathname.startsWith(i.href)))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  /** ออกจากมุมมองเจ้าหน้าที่ — สลับกลับบทบาทผู้จัด (ใช้ทดสอบ/สาธิตเท่านั้น ไม่ใช่ระบบ Login จริง) */
  const exitToAdmin = () => {
    const adminRole: Role = 'accounting';
    setRole(adminRole);
    router.push(landingPathForRole(adminRole));
  };

  const isStaff = currentUser.role === 'sendoff';

  return (
    <div className="zego-guide-backdrop flex h-dvh justify-center">
      <div className="zego-guide-phone flex h-dvh w-full max-w-md flex-col shadow-xl sm:my-0 sm:border-x">
        <header className="zego-guide-header sticky top-0 z-30 flex items-center gap-2.5 px-4 py-2.5">
          <Avatar initials={currentUser.name.slice(0, 1)} color="bg-amber-600" size="sm" />
          <div className="min-w-0 flex-1">
            <p className="zego-text truncate text-xs font-semibold leading-tight">{currentUser.name}</p>
            <p className="zego-text-tertiary truncate text-[11px] leading-tight">พอร์ทัลเจ้าหน้าที่ส่งกรุ๊ป</p>
          </div>
          <button type="button" onClick={exitToAdmin} title="ออกจากมุมมองเจ้าหน้าที่ส่งกรุ๊ป (โหมดทดลอง)" className="zego-guide-icon-btn rounded-lg p-2">
            <Icon name="logout" className="h-4 w-4" />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-24 pt-4">
          {isStaff ? (
            children
          ) : (
            <Card>
              <EmptyState
                icon="users"
                title="นี่คือพอร์ทัลของเจ้าหน้าที่ส่งกรุ๊ป"
                description={`บัญชีปัจจุบันเป็น "${ROLE[currentUser.role].label}" — สลับเป็นบทบาท "เจ้าหน้าที่ส่งกรุ๊ป" ก่อนถึงจะเข้าดูส่วนนี้ได้`}
                action={<Button variant="primary" size="sm" onClick={exitToAdmin}>กลับไปมุมมองผู้จัด</Button>}
              />
            </Card>
          )}
        </main>

        {isStaff && (
          <nav className="zego-guide-bottomnav sticky bottom-0 z-30 grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
            {STAFF_NAV.map((item) => {
              const active = item.href === activeHref;
              const badge = item.href === '/staff/envelopes' ? envelopeTodo : 0;
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
                  <span className="relative">
                    {/* นาฬิกาเติมสีแล้วเข็มกลืนเป็นวงกลมทึบ — ไม่เติมสี ใช้สีเมนูที่เลือกพอ */}
                    <Icon name={item.icon} className="h-5 w-5" filled={active && item.icon !== 'clock'} />
                    {badge > 0 && (
                      <span className="zego-count-badge absolute -right-2 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 text-[9px] font-bold">
                        {badge}
                      </span>
                    )}
                  </span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        )}
      </div>
    </div>
  );
}
