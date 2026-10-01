'use client';

/** ผู้ติดต่อฉุกเฉิน — หลายรายการ กำหนดผู้ติดต่อหลักได้หนึ่งรายการ */

import { Button, cx, Pill } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { newChildId } from '@/modules/tour-leaders/utils';
import type { EmergencyContact } from '@/types';

export function EmergencyContactEditor({
  contacts,
  errors,
  onChange,
}: {
  contacts: EmergencyContact[];
  errors: Record<string, string>;
  onChange: (next: EmergencyContact[]) => void;
}) {
  const add = () =>
    onChange([
      ...contacts,
      {
        id: newChildId('EC'),
        name: '',
        relation: '',
        phone: '',
        isPrimary: contacts.length === 0, // รายการแรกเป็นผู้ติดต่อหลักอัตโนมัติ
      },
    ]);

  const update = (id: string, patch: Partial<EmergencyContact>) =>
    onChange(contacts.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  /** เลือกผู้ติดต่อหลักใหม่ → ยกเลิกรายการหลักเดิม */
  const setPrimary = (id: string) =>
    onChange(contacts.map((c) => ({ ...c, isPrimary: c.id === id })));

  const remove = (id: string) => {
    const next = contacts.filter((c) => c.id !== id);
    if (next.length > 0 && !next.some((c) => c.isPrimary)) {
      next[0] = { ...next[0], isPrimary: true };
    }
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs zego-text-tertiary">
          เพิ่มได้หลายรายการ · กำหนดผู้ติดต่อหลักได้เพียงหนึ่งรายการ · เว้นว่างได้
        </p>
        <Button size="sm" variant="secondary" icon="plus" onClick={add}>
          เพิ่มผู้ติดต่อ
        </Button>
      </div>

      {errors.emergencyContacts && (
        <p className="rounded-lg border zego-warned-border zego-warned-tint px-3 py-2 text-xs font-medium zego-text-danger">
          {errors.emergencyContacts}
        </p>
      )}

      {contacts.length === 0 ? (
        <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
          ยังไม่มีผู้ติดต่อฉุกเฉิน (เว้นว่างได้)
        </p>
      ) : (
        <ul className="space-y-3">
          {contacts.map((contact, index) => (
            <li
              key={contact.id}
              className={cx(
                'rounded-xl border p-3',
                contact.isPrimary
                  ? 'zego-selected-border zego-selected-tint'
                  : 'zego-border-color zego-surface-soft-bg',
              )}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs font-medium zego-text-secondary">
                  <input
                    type="radio"
                    name="primary-emergency"
                    checked={contact.isPrimary}
                    onChange={() => setPrimary(contact.id)}
                    className="h-4 w-4 accent-[var(--zego-primary-500)]"
                  />
                  ผู้ติดต่อหลัก
                  {contact.isPrimary && <Pill tone="blue">หลัก</Pill>}
                </label>
                <button
                  type="button"
                  onClick={() => remove(contact.id)}
                  aria-label={`นำผู้ติดต่อที่ ${index + 1} ออก`}
                  className="rounded p-1 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>

              {errors[contact.id] && (
                <p className="mb-2 text-xs font-medium zego-text-danger">{errors[contact.id]}</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <TextInput
                  label="ชื่อผู้ติดต่อ"
                  required
                  value={contact.name}
                  onChange={(e) => update(contact.id, { name: e.target.value })}
                />
                <TextInput
                  label="ความสัมพันธ์"
                  placeholder="เช่น ภรรยา / บิดา"
                  value={contact.relation}
                  onChange={(e) => update(contact.id, { relation: e.target.value })}
                />
                <TextInput
                  label="เบอร์โทรศัพท์"
                  required
                  placeholder="089-111-2233"
                  value={contact.phone}
                  onChange={(e) => update(contact.id, { phone: e.target.value })}
                />
                <TextInput
                  label="ช่องทางอื่น"
                  placeholder="LINE หรืออีเมล"
                  value={contact.otherChannel ?? ''}
                  onChange={(e) => update(contact.id, { otherChannel: e.target.value })}
                />
                <TextInput
                  label="หมายเหตุ"
                  value={contact.note ?? ''}
                  onChange={(e) => update(contact.id, { note: e.target.value })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
