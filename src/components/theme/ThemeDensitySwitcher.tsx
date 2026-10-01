'use client';

/**
 * สลับธีม (สว่าง/มืด) และความหนาแน่นของตาราง/ฟอร์ม (สบายตา/กระชับ/แน่น)
 * ใช้ class ของ zego-design-system ตรง ๆ (.zego-button--icon, .zego-segmented) — ไม่มี style เอง
 */

import { useTheme } from '@/store/ThemeStore';
import { Icon } from '@/components/ui/Icon';
import type { UiDensity } from '@/services/ui-prefs-storage';

const DENSITY_OPTIONS: { value: UiDensity; label: string }[] = [
  { value: 'comfortable', label: 'สบายตา' },
  { value: 'compact', label: 'กระชับ' },
  { value: 'dense', label: 'แน่น' },
];

export function ThemeDensitySwitcher() {
  const { theme, density, toggleTheme, setDensity } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <div className="zego-segmented" role="group" aria-label="ความหนาแน่นของตาราง/ฟอร์ม">
        {DENSITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`zego-segmented__button${density === opt.value ? ' zego-is-active' : ''}`}
            aria-pressed={density === opt.value}
            onClick={() => setDensity(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <button
        type="button"
        className="zego-button zego-button--icon"
        onClick={toggleTheme}
        aria-label={theme === 'dark' ? 'สลับเป็นธีมสว่าง' : 'สลับเป็นธีมมืด'}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="zego-icon" />
      </button>
    </div>
  );
}
