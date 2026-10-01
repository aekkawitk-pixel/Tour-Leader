'use client';

/**
 * ขั้นตอนที่ 4 — ประวัติ/ประสบการณ์การทำงาน (สถานประกอบการ)
 * ⚠️ คนละเรื่องกับงานทัวร์ที่ได้รับมอบหมายในระบบ (ดูแท็บ "ผลแบบสอบถาม")
 *
 * Desktop: ตาราง (มีหัวตาราง) · มือถือ: การ์ด
 * สลับลำดับได้ด้วย Drag & Drop (เมาส์/สัมผัส) หรือปุ่ม "เลื่อนขึ้น/เลื่อนลง" ในเมนูจัดการ
 *   • ลำดับที่ผู้ใช้จัดไว้เป็นลำดับหลัก — ไม่เรียงตามวันที่อัตโนมัติ (เว้นแต่กด "เรียงจากล่าสุด")
 *   • เพิ่มใหม่ → ต่อท้าย · ลบ → เรียงเลขใหม่ทันที · บันทึกลำดับลง sortOrder
 */

import { useMemo, useState } from 'react';
import { Button, Callout, cx, Pill } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { ConfirmDialog } from '@/components/ui/Modal';
import { formatTHB } from '@/lib/format';
import { newChildId } from '@/modules/tour-leaders/utils';
import { DEFAULT_SALARY_CURRENCY, SALARY_CURRENCIES } from '@/modules/tour-leaders/constants';
import {
  entryDurationLabel,
  formatEmploymentPeriod,
  formatMonthYear,
  MONTH_NAMES_TH,
  sortEmploymentHistory,
  summarizeExperience,
} from '@/modules/tour-leaders/experience';
import { DragHandle, RowMenu, useDragReorder, type RowMenuItem } from './reorderControls';
import type { EmploymentHistory } from '@/types';

const MONTH_OPTIONS = MONTH_NAMES_TH.map((name, i) => ({ value: String(i + 1), label: name }));

const YEAR_OPTIONS = Array.from({ length: 45 }, (_, i) => {
  const year = 2026 - i;
  return { value: String(year), label: String(year + 543) };
});

/** เทมเพลตคอลัมน์ (ต้องตรงกันระหว่างหัวตารางและแถว) */
const GRID_COLS =
  'grid-cols-[2rem_2.25rem_minmax(0,2fr)_minmax(0,1.4fr)_5.5rem_5.5rem_4rem_minmax(0,1.6fr)_2.5rem]';

const HEADERS = [
  'สลับลำดับ',
  '#',
  'บริษัท/หน่วยงาน',
  'ตำแหน่ง',
  'วันที่เริ่ม',
  'วันที่สิ้นสุด',
  'งานปัจจุบัน',
  'รายละเอียด',
  'จัดการ',
];

function emptyEntry(leaderId: string, now: string): EmploymentHistory {
  return {
    id: newChildId('EH'),
    tourLeaderId: leaderId,
    employerName: '',
    currency: DEFAULT_SALARY_CURRENCY,
    startMonth: 1,
    startYear: 2024,
    isCurrentJob: false,
    position: '',
    createdAt: now,
    updatedAt: now,
  };
}

export function EmploymentHistoryEditor({
  entries,
  leaderId,
  today,
  now,
  errors,
  canSeeSalary,
  onChange,
}: {
  entries: EmploymentHistory[];
  leaderId: string;
  today: string;
  now: string;
  errors: Record<string, string>;
  /** สิทธิ์ดูเงินเดือน (ข้อมูลอ่อนไหว) */
  canSeeSalary: boolean;
  onChange: (next: EmploymentHistory[]) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EmploymentHistory | null>(null);

  const summary = useMemo(() => summarizeExperience(entries, today), [entries, today]);

  /* สลับลำดับ (ใช้ตรรกะร่วมกับหน้าเพิ่มหัวหน้าทัวร์ใหม่) */
  const { dragId, dragStart, move, indicatorStyle, setRowRef } = useDragReorder(entries, onChange);

  const update = (id: string, patch: Partial<EmploymentHistory>) =>
    onChange(entries.map((e) => (e.id === id ? { ...e, ...patch, updatedAt: now } : e)));

  /** เพิ่มใหม่ → ต่อท้ายรายการเสมอ */
  const add = () => {
    const entry = emptyEntry(leaderId, now);
    onChange([...entries, entry]);
    setExpanded(entry.id);
  };

  /** ทำสำเนา → วางถัดจากรายการต้นฉบับ */
  const duplicate = (entry: EmploymentHistory) => {
    const copy: EmploymentHistory = {
      ...entry,
      id: newChildId('EH'),
      employerName: `${entry.employerName} (สำเนา)`,
      isCurrentJob: false,
      createdAt: now,
      updatedAt: now,
    };
    const index = entries.findIndex((e) => e.id === entry.id);
    const next = [...entries];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setExpanded(copy.id);
  };

  /** ผู้ใช้สั่งเรียงจากล่าสุดเอง (คำสั่งเดียวที่อนุญาตให้เรียงตามวันที่) */
  const sortByLatest = () => onChange(sortEmploymentHistory(entries));

  const salaryText = (entry: EmploymentHistory) => {
    if (entry.salary === undefined) return '—';
    if (!canSeeSalary) return '••••••';
    return entry.currency === 'THB'
      ? formatTHB(entry.salary)
      : `${entry.salary.toLocaleString('th-TH')} ${entry.currency}`;
  };

  const menuItems = (entry: EmploymentHistory, index: number, isOpen: boolean): RowMenuItem[] => [
    { label: isOpen ? 'ปิดการแก้ไข' : 'แก้ไข', onClick: () => setExpanded(isOpen ? null : entry.id) },
    { label: 'เลื่อนขึ้น', onClick: () => move(entry.id, -1), disabled: index === 0 },
    { label: 'เลื่อนลง', onClick: () => move(entry.id, 1), disabled: index === entries.length - 1 },
    { label: 'ทำสำเนา', onClick: () => duplicate(entry) },
    { label: 'ลบ', onClick: () => setDeleteTarget(entry), danger: true },
  ];

  /* -------------------------------- Render -------------------------------- */

  return (
    <div className="space-y-4">
      <Callout tone="blue" title="ประวัติ / ประสบการณ์การทำงาน">
        หมายถึงการทำงานกับ <strong>บริษัท ร้านค้า องค์กร หรือสถานประกอบการ</strong> —
        คนละส่วนกับงานทัวร์ที่ได้รับมอบหมายในระบบ
        <br />
        จัดลำดับได้เองด้วยการลากไอคอน <span aria-hidden="true">⠿</span> หรือปุ่ม “เลื่อนขึ้น/เลื่อนลง”
        ในเมนูจัดการ — ระบบจะไม่เรียงตามวันที่ให้ เว้นแต่กด “เรียงจากล่าสุด”
      </Callout>

      {/* สรุปประสบการณ์รวม */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
          <p className="text-xs zego-text-tertiary">จำนวนสถานประกอบการ</p>
          <p className="text-lg font-bold tabular-nums zego-text">
            {summary.employerCount} แห่ง
          </p>
        </div>
        <div className="rounded-lg zego-today-tint border zego-today-border px-3 py-2">
          <p className="text-xs zego-text-info">ประสบการณ์รวม</p>
          <p className="text-lg font-bold zego-text-info">{summary.label}</p>
          <p className="text-[11px] zego-text-info">ไม่นับเดือนที่ซ้อนกันซ้ำ</p>
        </div>
        <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
          <p className="text-xs zego-text-tertiary">ตำแหน่งล่าสุด</p>
          <p className="truncate text-sm font-semibold zego-text">{summary.latestPosition}</p>
        </div>
      </div>

      {summary.currentJobs.length > 1 && (
        <Callout tone="amber" title={`มีงานปัจจุบัน ${summary.currentJobs.length} แห่ง`}>
          บันทึกได้ แต่ควรตรวจสอบว่าถูกต้อง —{' '}
          {summary.currentJobs.map((e) => e.employerName).join(' · ')}
        </Callout>
      )}
      {summary.hasOverlap && (
        <Callout tone="amber" title="มีช่วงเวลาทำงานที่ซ้อนกัน">
          บันทึกได้ และระบบจะ<strong>ไม่นับเดือนซ้ำ</strong>ในการคำนวณประสบการณ์รวม
        </Callout>
      )}
      {errors.employmentHistory && (
        <p className="rounded-lg zego-status-bar zego-status-bar--warning px-3 py-2 text-xs font-medium">
          {errors.employmentHistory}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium zego-text-secondary">รายการ ({entries.length})</p>
        <div className="flex flex-wrap items-center gap-2">
          {entries.length > 1 && (
            <Button size="sm" variant="ghost" onClick={sortByLatest}>
              เรียงจากล่าสุด
            </Button>
          )}
          <Button size="sm" variant="secondary" icon="plus" onClick={add}>
            เพิ่มประวัติ
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-lg border border-dashed zego-border-color px-4 py-10 text-center">
          <p className="text-sm font-medium zego-text-secondary">ยังไม่มีประวัติการทำงาน</p>
          <p className="mt-1 text-xs zego-text-tertiary">
            เว้นว่างได้ หากยังไม่เคยทำงานกับสถานประกอบการใด
          </p>
          <Button variant="primary" size="sm" icon="plus" className="mt-3" onClick={add}>
            เพิ่มประวัติ
          </Button>
        </div>
      ) : (
        <div className="w-full">
          {/* หัวตาราง — เฉพาะจอใหญ่ */}
          <div
            className={cx(
              'hidden gap-2 rounded-t-lg border border-b-0 zego-border-color zego-surface-soft-bg px-2 py-2 lg:grid',
              GRID_COLS,
            )}
          >
            {HEADERS.map((h, i) => (
              <div
                key={h}
                className={cx(
                  'text-[11px] font-semibold uppercase tracking-wide zego-text-tertiary',
                  (i === 0 || i === 1 || i === 6 || i === 8) && 'text-center',
                )}
              >
                {h}
              </div>
            ))}
          </div>

          <ul className="space-y-2 lg:space-y-0">
            {entries.map((entry, index) => {
              const isOpen = expanded === entry.id;
              const hasError = Boolean(errors[entry.id]);
              const isDragging = dragId === entry.id;

              return (
                <li
                  key={entry.id}
                  ref={setRowRef(entry.id)}
                  style={indicatorStyle(index)}
                  className={cx(
                    'rounded-xl border transition-[background-color,box-shadow] duration-150',
                    'lg:rounded-none lg:border-x lg:border-b lg:border-t-0 lg:first:border-t',
                    hasError
                      ? 'zego-warned-border zego-warned-tint'
                      : isDragging
                        ? 'zego-selected-border zego-selected-tint'
                        : entry.isCurrentJob
                          ? 'zego-status-bar--success'
                          : 'zego-border-color zego-row-alt-bg',
                  )}
                >
                  {/* ----------------------- แถวตาราง (จอใหญ่) ----------------------- */}
                  <div className={cx('hidden items-center gap-2 px-2 py-2 lg:grid', GRID_COLS)}>
                    <div className="flex justify-center">
                      <DragHandle
                        dragging={isDragging}
                        onPointerDown={(e) => {
                          setExpanded(null);
                          dragStart(entry.id)(e);
                        }}
                      />
                    </div>
                    <div className="text-center text-sm font-semibold tabular-nums zego-text-tertiary">
                      {index + 1}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium zego-text">
                        {entry.employerName || '(ยังไม่ระบุชื่อ)'}
                      </p>
                      <p className="truncate text-[11px] zego-text-tertiary">
                        {entryDurationLabel(entry, today)} · เงินเดือน {salaryText(entry)}
                      </p>
                    </div>
                    <div className="min-w-0 truncate text-sm zego-text-secondary">
                      {entry.position || '—'}
                    </div>
                    <div className="truncate text-xs zego-text-secondary">
                      {formatMonthYear(entry.startMonth, entry.startYear)}
                    </div>
                    <div className="truncate text-xs zego-text-secondary">
                      {entry.isCurrentJob ? '—' : formatMonthYear(entry.endMonth, entry.endYear)}
                    </div>
                    <div className="flex justify-center">
                      {entry.isCurrentJob ? (
                        <Pill tone="green">ปัจจุบัน</Pill>
                      ) : (
                        <span className="text-xs zego-text-disabled">—</span>
                      )}
                    </div>
                    <div className="min-w-0 truncate text-xs zego-text-tertiary">
                      {entry.jobDescription || '—'}
                    </div>
                    <div className="flex justify-center">
                      <RowMenu items={menuItems(entry, index, isOpen)} />
                    </div>
                  </div>

                  {/* ----------------------- การ์ด (มือถือ) ----------------------- */}
                  <div className="flex items-start gap-2 p-3 lg:hidden">
                    <DragHandle
                      dragging={isDragging}
                      onPointerDown={(e) => {
                        setExpanded(null);
                        dragStart(entry.id)(e);
                      }}
                    />
                    <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded zego-surface-soft-bg px-1 text-xs font-semibold zego-text-secondary">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 font-medium zego-text">
                        <span className="truncate">
                          {entry.employerName || '(ยังไม่ระบุชื่อสถานประกอบการ)'}
                        </span>
                        {entry.isCurrentJob && <Pill tone="green">ปัจจุบัน</Pill>}
                      </p>
                      <p className="text-xs zego-text-tertiary">
                        {entry.position || '—'} · {formatEmploymentPeriod(entry)}
                      </p>
                      {entry.jobDescription && (
                        <p className="mt-0.5 line-clamp-2 text-xs zego-text-tertiary">
                          {entry.jobDescription}
                        </p>
                      )}
                      {hasError && (
                        <p className="mt-1 text-xs font-medium zego-text-danger">{errors[entry.id]}</p>
                      )}
                    </div>
                    <RowMenu items={menuItems(entry, index, isOpen)} />
                  </div>

                  {/* error บนจอใหญ่ (แสดงใต้แถว) */}
                  {hasError && (
                    <p className="hidden px-3 pb-2 text-xs font-medium zego-text-danger lg:block">
                      {errors[entry.id]}
                    </p>
                  )}

                  {/* ------------------------- ฟอร์มแก้ไข ------------------------- */}
                  {isOpen && (
                    <div className="zego-divider-top zego-surface-bg p-3">
                      <EntryEditForm entry={entry} onUpdate={(patch) => update(entry.id, patch)} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (!deleteTarget) return;
          onChange(entries.filter((e) => e.id !== deleteTarget.id));
          setDeleteTarget(null);
        }}
        tone="danger"
        title="ยืนยันการลบประวัติการทำงาน"
        confirmLabel="ลบรายการนี้"
        message={`ลบประวัติการทำงานที่ “${deleteTarget?.employerName || '(ไม่ระบุชื่อ)'}” — รายการอื่นจะถูกเรียงเลขลำดับใหม่ทันที`}
      />
    </div>
  );
}

/* --------------------------------- ฟอร์มแก้ไข --------------------------------- */

function EntryEditForm({
  entry,
  onUpdate,
}: {
  entry: EmploymentHistory;
  onUpdate: (patch: Partial<EmploymentHistory>) => void;
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextInput
          label="ชื่อสถานประกอบการ"
          required
          wrapperClassName="lg:col-span-2"
          value={entry.employerName}
          onChange={(e) => onUpdate({ employerName: e.target.value })}
        />
        <TextInput
          label="เบอร์โทรศัพท์"
          placeholder="02-123-4567"
          value={entry.employerPhone ?? ''}
          onChange={(e) => onUpdate({ employerPhone: e.target.value })}
        />
        <TextInput
          label="หน้าที่ / ตำแหน่ง"
          required
          value={entry.position}
          onChange={(e) => onUpdate({ position: e.target.value })}
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TextInput
          label="เงินเดือน"
          inputMode="numeric"
          hint="ไม่บังคับ · ข้อมูลอ่อนไหว"
          value={entry.salary === undefined ? '' : String(entry.salary)}
          onChange={(e) =>
            onUpdate({ salary: e.target.value === '' ? undefined : Number(e.target.value) })
          }
        />
        <SelectInput
          label="สกุลเงิน"
          value={entry.currency}
          onChange={(e) => onUpdate({ currency: e.target.value })}
          options={SALARY_CURRENCIES.map((c) => ({ value: c, label: c }))}
        />
      </div>

      <fieldset className="mt-3">
        <legend className="mb-1.5 text-xs font-medium zego-text-secondary">ช่วงเวลาทำงาน</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectInput
            label="เดือนที่เริ่ม"
            required
            value={String(entry.startMonth)}
            onChange={(e) => onUpdate({ startMonth: Number(e.target.value) })}
            options={MONTH_OPTIONS}
          />
          <SelectInput
            label="ปีที่เริ่ม (พ.ศ.)"
            required
            value={String(entry.startYear)}
            onChange={(e) => onUpdate({ startYear: Number(e.target.value) })}
            options={YEAR_OPTIONS}
          />
          <SelectInput
            label="เดือนที่สิ้นสุด"
            required={!entry.isCurrentJob}
            disabled={entry.isCurrentJob}
            value={entry.endMonth ? String(entry.endMonth) : ''}
            placeholder={entry.isCurrentJob ? 'ปัจจุบัน' : 'เลือกเดือน'}
            onChange={(e) =>
              onUpdate({ endMonth: e.target.value ? Number(e.target.value) : undefined })
            }
            options={MONTH_OPTIONS}
          />
          <SelectInput
            label="ปีที่สิ้นสุด (พ.ศ.)"
            required={!entry.isCurrentJob}
            disabled={entry.isCurrentJob}
            value={entry.endYear ? String(entry.endYear) : ''}
            placeholder={entry.isCurrentJob ? 'ปัจจุบัน' : 'เลือกปี'}
            onChange={(e) =>
              onUpdate({ endYear: e.target.value ? Number(e.target.value) : undefined })
            }
            options={YEAR_OPTIONS}
          />
        </div>

        <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm zego-text-secondary">
          <input
            type="checkbox"
            checked={entry.isCurrentJob}
            onChange={(e) =>
              onUpdate({
                isCurrentJob: e.target.checked,
                endMonth: e.target.checked ? undefined : entry.endMonth,
                endYear: e.target.checked ? undefined : entry.endYear,
              })
            }
            className="h-4 w-4 accent-emerald-600"
          />
          ยังทำงานอยู่ที่นี่ (ปัจจุบัน)
        </label>
      </fieldset>

      <div className="mt-3 space-y-3">
        <TextArea
          label="รายละเอียดงาน"
          rows={2}
          value={entry.jobDescription ?? ''}
          onChange={(e) => onUpdate({ jobDescription: e.target.value })}
        />
        <TextInput
          label="เหตุผลที่ออก"
          required={!entry.isCurrentJob}
          disabled={entry.isCurrentJob}
          placeholder={entry.isCurrentJob ? 'ยังทำงานอยู่' : 'เช่น หาประสบการณ์ใหม่'}
          value={entry.reasonForLeaving ?? ''}
          onChange={(e) => onUpdate({ reasonForLeaving: e.target.value })}
        />
        <TextInput
          label="หมายเหตุ"
          value={entry.note ?? ''}
          onChange={(e) => onUpdate({ note: e.target.value })}
        />
      </div>
    </>
  );
}
