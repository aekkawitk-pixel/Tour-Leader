'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navForRole, isNavEnabled, IN_DEVELOPMENT_LABEL } from '@/lib/permissions';
import { useDemo } from '@/store/DemoStore';
import { Icon, type IconName } from '@/components/ui/Icon';
import { cx } from '@/components/ui/Primitives';

function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { currentUser } = useDemo();
  const items = navForRole(currentUser.role);

  return (
    <>
      <div className="zego-sidebar__top">
        <div className="zego-brand">
          <span className="zego-brand__mark" aria-hidden="true">
            <Icon name="plane" className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <span className="zego-brand__name block truncate">ระบบจัดการหัวหน้าทัวร์</span>
            <span className="zego-brand__meta block truncate">Tour Leader Management — Demo</span>
          </div>
        </div>
      </div>

      <div className="zego-sidebar__scroll">
        <nav className="zego-nav" aria-label="เมนูหลัก">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const enabled = isNavEnabled(item.key);

            /*
              เมนูที่ยังไม่เปิดใช้ — แสดงให้เห็นว่ามีอะไรบ้าง แต่กดไม่ได้
              ใช้ <span aria-disabled> แทน <Link> เพื่อไม่ให้ Tab/Enter หรือคลิกขวาเปิดลิงก์ได้
            */
            if (!enabled) {
              return (
                <span
                  key={item.key}
                  aria-disabled="true"
                  title={`${item.label} — ${IN_DEVELOPMENT_LABEL}`}
                  className="zego-nav__link zego-nav__link--disabled"
                >
                  <Icon name={item.icon as IconName} className="h-[18px] w-[18px] shrink-0 opacity-60" />
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="zego-badge zego-badge--slate zego-badge--sm shrink-0">
                    {IN_DEVELOPMENT_LABEL}
                  </span>
                </span>
              );
            }

            return (
              <Link
                key={item.key}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cx('zego-nav__link', active && 'zego-is-active')}
              >
                <Icon name={item.icon as IconName} className="h-[18px] w-[18px] shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="zego-sidebar__bottom">
        <div className="zego-sidebar__status">
          <span className="zego-sidebar__dot" aria-hidden="true" />
          <span>
            ข้อมูลทั้งหมดในระบบนี้เป็น <strong>ข้อมูลจำลองสำหรับ Demo</strong> ไม่เชื่อมต่อฐานข้อมูลหรือระบบบัญชีจริง
          </span>
        </div>
      </div>
    </>
  );
}

/**
 * .zego-sidebar ของ zego เองครอบทั้งสองสถานะไว้แล้ว: คอลัมน์ปกติบนเดสก์ท็อป และ
 * fixed overlay เลื่อนเข้า-ออกด้วย transform ตอน ≤980px (ดู zego-design-system.css) —
 * mobileOpen แค่เติม class zego-is-mobile-open ให้ CSS media query จัดการที่เหลือเอง
 */
export function Sidebar({
  mobileOpen = false,
  onCloseMobile,
}: {
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}) {
  return (
    <>
      {mobileOpen && (
        <div className="zego-mobile-backdrop" onClick={onCloseMobile} aria-hidden="true" />
      )}
      <aside className={cx('zego-sidebar', mobileOpen && 'zego-is-mobile-open')}>
        <SidebarContent onNavigate={onCloseMobile} />
      </aside>
    </>
  );
}
