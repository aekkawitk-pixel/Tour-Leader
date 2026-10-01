'use client';

/**
 * Header: การแจ้งเตือน ตัวสลับบทบาท และข้อมูลผู้ใช้
 * ช่องค้นหาข้ามโมดูลถูกนำออกแล้ว — แต่ละหน้ามีช่องค้นหาของตัวเองที่ตรงกับข้อมูลในหน้านั้น
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { ROLE_ORDER, userRoleMeta } from '@/lib/labels';
import { ROLE_SCOPE, can } from '@/lib/permissions';
import { Icon } from '@/components/ui/Icon';
import { Avatar, cx, StatusBadge } from '@/components/ui/Primitives';
import { ThemeDensitySwitcher } from '@/components/theme/ThemeDensitySwitcher';
import { formatDateTime } from '@/lib/format';
import { leaderDisplayName } from '@/lib/logic/leaderExpertise';
import { listNoSellAlerts, noSellAlertMessage } from '@/lib/logic/noSellAlerts';
import type { Notification, Role } from '@/types';

export function Header({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { currentUser, users, setUserById, leaders, notifications, markNotificationsRead, today } = useDemo();

  const [openPanel, setOpenPanel] = useState<'none' | 'notifications' | 'user'>('none');
  const wrapperRef = useRef<HTMLDivElement>(null);

  /**
   * §4 แจ้งเตือน "โปรแกรม NO SELL ที่ยังมีหัวหน้าทัวร์"
   *
   * คำนวณสด ๆ จากข้อมูลจริง (Assignment + สถานะขายล่าสุด) แทนการเก็บสถานะแจ้งเตือนไว้อีกชุด
   * id คงที่ต่อ Assignment + การเปลี่ยนหนึ่งครั้ง จึงไม่เกิดรายการซ้ำทุกครั้งที่เปิดหน้า
   * แสดงเฉพาะผู้ที่มีสิทธิ์จัดหัวหน้าทัวร์ (ผู้จัด/Operation/Admin)
   * อ่าน localStorage ได้เฉพาะฝั่ง client → ตั้งค่าใน effect เพื่อไม่ให้ HTML ฝั่ง server ต่างกัน
   */
  const [noSellNotis, setNoSellNotis] = useState<Notification[]>([]);
  const canAssign = can(currentUser.role, 'job.assignLeader');
  useEffect(() => {
    const leaderName = (id: string) => {
      const l = leaders.find((x) => x.id === id);
      return l ? leaderDisplayName(l) : id;
    };
    const next: Notification[] = canAssign
      ? listNoSellAlerts(today).map((a) => ({
        id: a.id,
        title: 'โปรแกรม NO SELL ที่ยังมีหัวหน้าทัวร์',
        description: noSellAlertMessage(a, leaderName(a.tourLeaderId)),
        at: a.change?.at ?? a.assignment.assignedAt,
        tone: 'error' as const,
        read: false,
      }))
      : [];
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNoSellNotis(next);
  }, [canAssign, leaders, today]);

  // การแจ้งเตือน NO SELL ขึ้นก่อน เพราะเป็นงานค้างที่ต้องลงมือทำ
  const allNotifications = useMemo(() => [...noSellNotis, ...notifications], [noSellNotis, notifications]);
  const unread = allNotifications.filter((n) => !n.read).length;

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpenPanel('none');
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <header ref={wrapperRef} className="zego-topbar">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="เปิดเมนู"
        className="zego-button zego-button--icon zego-button--ghost zego-mobile-only"
      >
        <Icon name="menu" />
      </button>

      <div className="zego-topbar__actions ml-auto">
        <ThemeDensitySwitcher />

        {/* แจ้งเตือน */}
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setOpenPanel((p) => (p === 'notifications' ? 'none' : 'notifications'));
              markNotificationsRead();
            }}
            aria-label={`การแจ้งเตือน ${unread} รายการที่ยังไม่ได้อ่าน`}
            className="zego-button zego-button--icon zego-button--ghost relative"
          >
            <Icon name="bell" />
            {unread > 0 && (
              <span className="zego-count-badge absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold">
                {unread}
              </span>
            )}
          </button>

          {openPanel === 'notifications' && (
            <div className="zego-popover zego-is-open zego-popover--wide right-0 mt-2 overflow-hidden">
              <p className="zego-divider-bottom zego-text px-4 py-2.5 text-sm font-semibold">
                การแจ้งเตือน
              </p>
              <ul className="max-h-96 overflow-y-auto">
                {allNotifications.map((n) => (
                  <li key={n.id} className="zego-divider-bottom px-4 py-3 last:border-b-0">
                    <div className="flex items-start gap-2">
                      <span
                        className={cx(
                          'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                          n.tone === 'error' ? 'zego-dot--danger' : n.tone === 'warning' ? 'zego-dot--warning' : 'zego-dot--info',
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className="zego-text text-sm font-medium">{n.title}</p>
                        <p className="zego-text-secondary mt-0.5 text-xs">{n.description}</p>
                        <p className="zego-text-tertiary mt-1 text-[11px]">{formatDateTime(n.at)}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ผู้ใช้ + สลับบทบาท */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpenPanel((p) => (p === 'user' ? 'none' : 'user'))}
            aria-expanded={openPanel === 'user'}
            className="zego-hover-surface flex items-center gap-2 rounded-lg py-1.5 pl-1.5 pr-2"
          >
            <Avatar
              initials={currentUser.name.slice(0, 1)}
              color="bg-blue-800"
              size="sm"
            />
            <span className="hidden text-left sm:block">
              <span className="zego-text block text-xs font-semibold leading-tight">
                {currentUser.name}
              </span>
              <span className="zego-text-tertiary block text-[11px] leading-tight">
                {userRoleMeta(currentUser).label}
              </span>
            </span>
            <Icon name="chevronDown" className="zego-text-tertiary h-4 w-4" />
          </button>

          {openPanel === 'user' && (
            <div className="zego-popover zego-is-open zego-popover--wide right-0 mt-2 overflow-hidden">
              <div className="zego-divider-bottom zego-surface-soft-bg px-4 py-3">
                <p className="zego-text text-sm font-semibold">{currentUser.name}</p>
                <p className="zego-text-secondary text-xs">{currentUser.position}</p>
                <div className="mt-2">
                  <StatusBadge meta={userRoleMeta(currentUser)} size="sm" />
                </div>
                <p className="zego-text-secondary mt-2 text-[11px]">{ROLE_SCOPE[currentUser.role]}</p>
              </div>

              <div className="px-4 py-2">
                <p className="zego-text-disabled mb-1.5 text-[11px] font-semibold uppercase tracking-wide">
                  สลับบทบาทเพื่อทดลอง (Demo)
                </p>
                {/*
                  เดิมโชว์แค่ 1 คนต่อบทบาท (คนแรกที่ active) — พอมีสิทธิ์ที่ผูกกับตัวบุคคลแทนบทบาท
                  (เช่น canEditSendOffSchedule) คนอื่นในบทบาทเดียวกันต้องสลับมาลองได้ด้วย ไม่งั้นทดสอบสิทธิ์นั้นจากหน้านี้ไม่ได้เลย
                  บทบาทที่มี active user คนเดียวยังแสดงแถวเดียวเหมือนเดิม ไม่กระทบพฤติกรรมเก่า
                */}
                <ul className="space-y-0.5 pb-1">
                  {ROLE_ORDER.flatMap((role: Role) => users.filter((u) => u.role === role && u.active)).map((user) => {
                    const active = user.id === currentUser.id;
                    return (
                      <li key={user.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setUserById(user.id);
                            setOpenPanel('none');
                          }}
                          className={cx('zego-menu-item w-full justify-between', active && 'zego-menu-item--selected')}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{user.name}</span>
                            <span className="zego-text-tertiary block truncate text-xs">{userRoleMeta(user).label}</span>
                          </span>
                          {active && <Icon name="check" className="zego-text-info h-4 w-4 shrink-0" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
