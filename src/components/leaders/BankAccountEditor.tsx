'use client';

/**
 * Section 9 — บัญชีธนาคาร (หลายบัญชี)
 * — บัญชีหลักได้เพียงหนึ่งบัญชี (เลือกใหม่จะยกเลิกบัญชีหลักเดิมอัตโนมัติ)
 * — ⚠️ เลขบัญชีถูกปิดบังก่อนบันทึกเสมอ
 */

import { Button, Callout, cx, Pill } from '@/components/ui/Primitives';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import {
  newChildId,
  removeBankAccount,
  setPrimaryBankAccount,
} from '@/modules/tour-leaders/utils';
import type { LeaderBankAccount, MasterItem } from '@/types';

export function BankAccountEditor({
  accounts,
  banks,
  defaultAccountName,
  errors,
  onChange,
}: {
  accounts: LeaderBankAccount[];
  banks: MasterItem[];
  defaultAccountName: string;
  errors: Record<string, string>;
  onChange: (next: LeaderBankAccount[]) => void;
}) {
  const add = () => {
    onChange([
      ...accounts,
      {
        id: newChildId('BA'),
        bank: '',
        accountName: defaultAccountName,
        accountNoMasked: '',
        isPrimary: accounts.length === 0, // บัญชีแรกเป็นบัญชีหลักอัตโนมัติ
        active: true,
      },
    ]);
  };

  const update = (id: string, patch: Partial<LeaderBankAccount>) =>
    onChange(accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-3">
      <Callout tone="amber" title="ไม่จัดเก็บเลขบัญชีจริง">
        เลขที่บัญชีจะถูกปิดบังเป็นรูปแบบ <code className="font-mono">xxx-x-x1234-x</code>{' '}
        ก่อนบันทึกเสมอ — Demo ไม่เก็บเลขบัญชีจริง
      </Callout>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium zego-text-secondary">บัญชีธนาคาร ({accounts.length})</p>
          <p className="text-xs zego-text-tertiary">กำหนดบัญชีหลักได้เพียงหนึ่งบัญชี · เว้นว่างได้</p>
        </div>
        <Button size="sm" variant="secondary" icon="plus" onClick={add}>
          เพิ่มบัญชี
        </Button>
      </div>

      {errors.bankAccounts && (
        <p className="rounded-lg border zego-warned-border zego-warned-tint px-3 py-2 text-xs font-medium zego-text-danger">
          {errors.bankAccounts}
        </p>
      )}

      {accounts.length === 0 ? (
        <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
          ยังไม่มีบัญชีธนาคาร (เว้นว่างได้)
        </p>
      ) : (
        <ul className="space-y-3">
          {accounts.map((account, index) => (
            <li
              key={account.id}
              className={cx(
                'rounded-xl border p-3',
                account.isPrimary
                  ? 'zego-selected-border zego-selected-tint'
                  : 'zego-border-color zego-surface-soft-bg',
                !account.active && 'opacity-70',
              )}
            >
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium zego-text-secondary">
                    <input
                      type="radio"
                      name="primary-bank"
                      checked={account.isPrimary}
                      onChange={() => onChange(setPrimaryBankAccount(accounts, account.id))}
                      className="h-4 w-4 accent-[var(--zego-primary-500)]"
                    />
                    บัญชีหลัก
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-xs font-medium zego-text-secondary">
                    <input
                      type="checkbox"
                      checked={account.active}
                      onChange={(e) => update(account.id, { active: e.target.checked })}
                      className="h-4 w-4 accent-[var(--zego-primary-500)]"
                    />
                    ใช้งาน
                  </label>
                  {!account.active && <Pill tone="slate">ปิดใช้งาน</Pill>}
                </div>
                <button
                  type="button"
                  onClick={() => onChange(removeBankAccount(accounts, account.id))}
                  aria-label={`นำบัญชีที่ ${index + 1} ออก`}
                  className="rounded p-1 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>

              {errors[account.id] && (
                <p className="mb-2 text-xs font-medium zego-text-danger">{errors[account.id]}</p>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <SelectInput
                  label="ธนาคาร"
                  required
                  placeholder="เลือกธนาคาร"
                  value={account.bank}
                  onChange={(e) => update(account.id, { bank: e.target.value })}
                  options={banks
                    .filter((b) => b.active || b.name === account.bank)
                    .map((b) => ({ value: b.name, label: b.name }))}
                />
                <TextInput
                  label="ชื่อบัญชี"
                  required
                  value={account.accountName}
                  onChange={(e) => update(account.id, { accountName: e.target.value })}
                />
                <TextInput
                  label="เลขที่บัญชี"
                  required
                  value={account.accountNoMasked}
                  hint="จะถูกปิดบังเมื่อบันทึก"
                  onChange={(e) => update(account.id, { accountNoMasked: e.target.value })}
                />
                <TextInput
                  label="สาขา"
                  value={account.branch ?? ''}
                  onChange={(e) => update(account.id, { branch: e.target.value })}
                />
                <TextInput
                  label="PromptPay"
                  placeholder="เบอร์โทรหรือเลขบัตร (จำลอง)"
                  value={account.promptPay ?? ''}
                  onChange={(e) => update(account.id, { promptPay: e.target.value })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
