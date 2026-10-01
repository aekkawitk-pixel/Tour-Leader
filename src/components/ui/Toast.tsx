'use client';

/** Toast แสดงผลการทำงาน — ผูกกับ DemoStore */

import { useDemo } from '@/store/DemoStore';
import { Icon, type IconName } from './Icon';
import type { ToastTone } from '@/types';

/** โทนกล่องกลาง (แก้วเดียวกันทุกอัน) — ต่างกันแค่สีวงกลมไอคอน ตามสไตล์ toast ของ zego เอง */
const TONE_STYLE: Record<ToastTone, { icon: IconName; iconClass: string }> = {
  success: { icon: 'check', iconClass: 'zego-toast__icon' },
  error: { icon: 'warning', iconClass: 'zego-toast__icon zego-toast__icon--danger' },
  warning: { icon: 'warning', iconClass: 'zego-toast__icon zego-toast__icon--warning' },
  info: { icon: 'info', iconClass: 'zego-toast__icon zego-toast__icon--info' },
};

export function ToastContainer() {
  const { toasts, dismissToast } = useDemo();

  if (toasts.length === 0) return null;

  return (
    <div role="status" aria-live="polite" className="zego-toast-stack">
      {toasts.map((toast) => {
        const style = TONE_STYLE[toast.tone];
        return (
          <div key={toast.id} className="zego-toast">
            <span className={style.iconClass}>
              <Icon name={style.icon} className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="zego-text text-sm font-semibold">{toast.title}</p>
              {toast.description && (
                <p className="zego-text-tertiary mt-0.5 truncate text-xs">{toast.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="ปิดข้อความแจ้งเตือน"
              className="zego-toast__close rounded p-0.5"
            >
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
