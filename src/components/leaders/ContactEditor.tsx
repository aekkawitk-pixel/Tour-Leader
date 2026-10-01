'use client';

/**
 * แก้ไขช่องทางติดต่อได้หลายรายการ + กำหนดช่องทางหลัก (ได้หนึ่งรายการ) + ตรวจรูปแบบข้อมูล
 *
 * แต่ละรายการแสดงแถวเดียว: [ประเภท] [ข้อมูลติดต่อ] [ช่องทางหลัก] [เพิ่มเติม] [ลบ]
 * ป้ายกำกับ / ช่วงเวลาที่สะดวก / หมายเหตุ ซ่อนไว้ใต้ปุ่ม "เพิ่มเติม" (ข้อมูลไม่หายเมื่อย่อ)
 */

import { useState } from 'react';
import { Button, Pill, cx } from '@/components/ui/Primitives';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { CONTACT_TYPE, CONTACT_TYPE_ORDER } from '@/lib/labels';
import { newChildId, removeContact, setPrimaryContact } from '@/modules/tour-leaders/utils';
import type { ContactChannel, ContactType } from '@/types';

const PLACEHOLDER: Record<ContactType, string> = {
  phone: '081-234-5678 หรือ +66 81-234-5678',
  email: 'name@example.com',
  line: 'line_id',
  facebook: 'https://facebook.com/…',
  instagram: '@username หรือ https://instagram.com/…',
  tiktok: 'https://tiktok.com/@…',
  whatsapp: '+66812345678',
  wechat: 'wechat_id',
  website: 'https://example.com',
  other: 'ระบุช่องทาง',
};

/** ชื่อช่อง "ข้อมูลติดต่อ" เปลี่ยนตามประเภท */
const VALUE_LABEL: Record<ContactType, string> = {
  phone: 'หมายเลขโทรศัพท์',
  email: 'อีเมล',
  line: 'LINE ID',
  facebook: 'ชื่อผู้ใช้หรือ URL',
  instagram: 'ชื่อผู้ใช้หรือ URL',
  tiktok: 'ชื่อผู้ใช้หรือ URL',
  whatsapp: 'หมายเลข WhatsApp',
  wechat: 'WeChat ID',
  website: 'URL เว็บไซต์',
  other: 'ข้อมูลติดต่อ',
};

/** ป้ายกำกับเริ่มต้นตามประเภท — โทรศัพท์เบอร์แรก = "เบอร์หลัก" เบอร์ถัดไป = "เบอร์สำรอง" */
function defaultLabel(type: ContactType, isFirstOfType: boolean): string {
  switch (type) {
    case 'phone':
      return isFirstOfType ? 'เบอร์หลัก' : 'เบอร์สำรอง';
    case 'email':
      return 'อีเมลหลัก';
    case 'line':
      return 'LINE ส่วนตัว';
    case 'instagram':
      return 'Instagram';
    case 'whatsapp':
      return 'WhatsApp';
    default:
      return CONTACT_TYPE[type].label;
  }
}

/** ป้ายกำกับที่ระบบเติมให้เอง — ทับได้เมื่อเปลี่ยนประเภท แต่ถ้าผู้ใช้แก้เองจะไม่ทับ */
const AUTO_LABELS = new Set<string>([
  'เบอร์หลัก',
  'เบอร์สำรอง',
  ...CONTACT_TYPE_ORDER.flatMap((t) => [defaultLabel(t, true), defaultLabel(t, false)]),
]);

/** ช่อง input ให้เหมาะกับชนิดข้อมูล (คีย์บอร์ดบนมือถือ + ตรวจรูปแบบเบื้องต้นของเบราว์เซอร์) */
function inputPropsFor(type: ContactType) {
  switch (type) {
    case 'phone':
    case 'whatsapp':
      return { type: 'tel', inputMode: 'tel' as const, autoComplete: 'tel' };
    case 'email':
      return { type: 'email', inputMode: 'email' as const, autoComplete: 'email' };
    case 'website':
    case 'facebook':
    case 'instagram':
    case 'tiktok':
      return { type: 'url', inputMode: 'url' as const };
    default:
      return { type: 'text' };
  }
}

export const newContact = (type: ContactType = 'phone', isFirstOfType = true): ContactChannel => ({
  id: newChildId('CC'),
  type,
  value: '',
  isPrimary: false,
  label: defaultLabel(type, isFirstOfType),
});

export function ContactEditor({
  contacts,
  errors,
  onChange,
}: {
  contacts: ContactChannel[];
  /** map: contactId → ข้อความผิดพลาด */
  errors: Record<string, string>;
  onChange: (next: ContactChannel[]) => void;
}) {
  /** รายการที่กาง "เพิ่มเติม" อยู่ — เป็นสถานะการแสดงผลเท่านั้น ข้อมูลยังอยู่ใน contacts เสมอ */
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const update = (id: string, patch: Partial<ContactChannel>) => {
    onChange(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  };

  /** เปลี่ยนประเภท → เติมป้ายกำกับเริ่มต้นให้ใหม่ (ยกเว้นผู้ใช้ตั้งป้ายเองไว้แล้ว) */
  const changeType = (channel: ContactChannel, type: ContactType) => {
    const current = channel.label?.trim() ?? '';
    const isFirstOfType = !contacts.some((c) => c.id !== channel.id && c.type === type);
    const keepLabel = current !== '' && !AUTO_LABELS.has(current);
    update(channel.id, {
      type,
      label: keepLabel ? current : defaultLabel(type, isFirstOfType),
    });
  };

  const add = () => {
    const isFirstPhone = !contacts.some((c) => c.type === 'phone');
    const channel = newContact('phone', isFirstPhone);
    // รายการแรกของฟอร์มเป็นช่องทางหลักโดยอัตโนมัติ
    onChange([...contacts, { ...channel, isPrimary: contacts.length === 0 }]);
  };

  /** กำหนดช่องทางหลัก — ยกเลิก isPrimary ของรายการเดิมอัตโนมัติ (เลือกได้ 1 รายการ) */
  const setPrimary = (id: string) => onChange(setPrimaryContact(contacts, id));

  /** ลบรายการ — ถ้าลบช่องทางหลักออกและยังมีรายการเหลือ ระบบเลื่อนรายการแรกขึ้นเป็นหลักแทน */
  const remove = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    onChange(removeContact(contacts, id));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs zego-text-tertiary">
          เพิ่มได้หลายรายการ · กำหนด “ช่องทางหลัก” ได้เพียงหนึ่งรายการ
        </p>
        <Button size="sm" variant="secondary" icon="plus" onClick={add}>
          เพิ่มช่องทาง
        </Button>
      </div>

      {contacts.length === 0 ? (
        <div className="rounded-lg border border-dashed zego-border-color px-4 py-8 text-center">
          <p className="text-sm zego-text-tertiary">ยังไม่มีช่องทางติดต่อ</p>
          <div className="mt-3 flex justify-center">
            <Button size="sm" variant="secondary" icon="plus" onClick={add}>
              เพิ่มช่องทาง
            </Button>
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map((channel, index) => {
            const isOpen = expanded.has(channel.id);
            const detailId = `contact-detail-${channel.id}`;

            return (
              <li
                key={channel.id}
                className={cx(
                  'rounded-xl border p-3',
                  channel.isPrimary
                    ? 'zego-selected-border zego-selected-tint'
                    : 'zego-border-color zego-surface-soft-bg',
                )}
              >
                {/* แถวหลัก — มือถือ: ประเภท+ข้อมูลก่อน แล้วปุ่มลงแถวถัดไป */}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
                  <div className="grid flex-1 gap-3 sm:grid-cols-2">
                    <SelectInput
                      label="ประเภท"
                      value={channel.type}
                      onChange={(e) => changeType(channel, e.target.value as ContactType)}
                      options={CONTACT_TYPE_ORDER.map((t) => ({
                        value: t,
                        label: CONTACT_TYPE[t].label,
                      }))}
                    />
                    <TextInput
                      label={VALUE_LABEL[channel.type]}
                      required
                      placeholder={PLACEHOLDER[channel.type]}
                      value={channel.value}
                      error={errors[channel.id]}
                      {...inputPropsFor(channel.type)}
                      onChange={(e) => update(channel.id, { value: e.target.value })}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:pt-7">
                    <label
                      className={cx(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors',
                        channel.isPrimary
                          ? 'zego-selected-border zego-surface-bg text-[var(--zego-primary-800)]'
                          : 'zego-border-color zego-surface-bg zego-text-secondary zego-hover-surface',
                      )}
                    >
                      <input
                        type="radio"
                        name="primary-contact"
                        checked={channel.isPrimary}
                        onChange={() => setPrimary(channel.id)}
                        className="h-4 w-4 accent-[var(--zego-primary-500)]"
                      />
                      ช่องทางหลัก
                      {channel.isPrimary && <Pill tone="green">หลัก</Pill>}
                    </label>

                    <Button
                      size="sm"
                      variant="ghost"
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      onClick={() => toggleExpanded(channel.id)}
                    >
                      เพิ่มเติม
                      <Icon
                        name="chevronDown"
                        className={cx('ml-1 h-3.5 w-3.5 transition-transform', isOpen && 'rotate-180')}
                      />
                    </Button>

                    <button
                      type="button"
                      onClick={() => remove(channel.id)}
                      aria-label={`นำช่องทางที่ ${index + 1} ออก`}
                      className="rounded-lg p-2 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* รายละเอียดเพิ่มเติม — ซ่อนเป็นค่าเริ่มต้น · ค่าที่กรอกไว้ไม่หายเมื่อย่อ */}
                {isOpen && (
                  <div
                    id={detailId}
                    className="mt-3 grid gap-3 zego-divider-top pt-3 sm:grid-cols-2 lg:grid-cols-3"
                  >
                    <TextInput
                      label="ป้ายกำกับ"
                      placeholder="เช่น เบอร์หลัก / เบอร์สำรอง"
                      hint="ระบบเติมให้ตามประเภท · แก้ไขได้"
                      value={channel.label ?? ''}
                      onChange={(e) => update(channel.id, { label: e.target.value })}
                    />
                    <TextInput
                      label="ช่วงเวลาที่สะดวก"
                      placeholder="เช่น 09:00–18:00"
                      value={channel.preferredContactTime ?? ''}
                      onChange={(e) =>
                        update(channel.id, { preferredContactTime: e.target.value })
                      }
                    />
                    <TextInput
                      label="หมายเหตุ"
                      value={channel.note ?? ''}
                      onChange={(e) => update(channel.id, { note: e.target.value })}
                    />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
