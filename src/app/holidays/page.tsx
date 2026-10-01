'use client';

/**
 * วันหยุด — กำหนดวันหยุดของบริษัทสำหรับ "ปีปัจจุบันและปีถัดไป"
 *
 * วันที่ตายตัวระบบเติมให้เอง · วันหยุดชดเชยระบบเสนอตามกฎทั่วไป (ลบทิ้งได้ถ้าปีนั้นไม่ให้ชดเชย)
 * ส่วนวันหยุดที่อิงจันทรคติ/ประกาศ ต้องกำหนดเอง — มีกล่องเตือนบอกว่าปีไหนยังใส่ไม่ครบ
 *
 * ปฏิทินทุกหน้าอ่านผลลัพธ์ผ่าน holidayService จุดเดียว (§14) จึงบอกวันหยุดตรงกันเสมอ
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { formatDate, parseDate, TH_WEEKDAYS_SHORT } from '@/lib/format';
import { Button, Callout, Card, cx, EmptyState, PageHeader, Pill } from '@/components/ui/Primitives';
import { SegmentedControl } from '@/components/ui/Tabs';
import { TextInput } from '@/components/ui/FormField';
import { DateField } from '@/components/ui/DateInput';
import { Icon } from '@/components/ui/Icon';
import { can } from '@/lib/permissions';
import {
  getHolidays, holidayYears, missingAnnualHolidays, type Holiday, type HolidaySource,
} from '@/services/holidayService';
import { setHoliday, removeHoliday, clearHolidayOverride, loadHolidayOverrides } from '@/services/holidayStore';

const SOURCE_META: Record<HolidaySource, { label: string; tone: 'slate' | 'blue' | 'violet' }> = {
  fixed: { label: 'วันที่ตายตัว', tone: 'slate' },
  compensatory: { label: 'ชดเชย (ระบบเสนอ)', tone: 'violet' },
  custom: { label: 'กำหนดเอง', tone: 'blue' },
};

const thaiYear = (y: number) => y + 543;

export default function HolidaysPage() {
  const { today, currentUser, pushToast } = useDemo();
  const editable = can(currentUser.role, 'holiday.manage');

  const [thisYear, nextYear] = holidayYears(today);
  const [year, setYear] = useState<number>(thisYear);
  const [rev, setRev] = useState(0); // บังคับอ่านใหม่หลังแก้ localStorage

  const [newDate, setNewDate] = useState('');
  const [newName, setNewName] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const holidays = useMemo(() => { void rev; return getHolidays(year); }, [year, rev]);
  const missing = useMemo(() => { void rev; return missingAnnualHolidays(year); }, [year, rev]);
  const overrides = useMemo(() => { void rev; return loadHolidayOverrides(); }, [rev]);

  const stamp = () => new Date().toISOString().slice(0, 19);
  const refresh = () => setRev((r) => r + 1);

  const add = () => {
    const date = newDate.trim();
    const name = newName.trim();
    if (!date) return setFormError('เลือกวันที่ก่อน');
    if (!name) return setFormError('ใส่ชื่อวันหยุด');
    if (!date.startsWith(`${year}-`)) return setFormError(`วันที่ต้องอยู่ในปี ${thaiYear(year)} ที่กำลังแก้อยู่`);
    setHoliday(date, name, currentUser.name, stamp());
    setFormError(null);
    setNewDate('');
    setNewName('');
    refresh();
    pushToast('success', `เพิ่มวันหยุด ${formatDate(date)}`, name);
  };

  const rename = (h: Holiday, name: string) => {
    if (!name.trim() || name.trim() === h.name) return;
    setHoliday(h.date, name, currentUser.name, stamp());
    refresh();
    pushToast('success', `แก้ชื่อวันหยุด ${formatDate(h.date)}`, name.trim());
  };

  const drop = (h: Holiday) => {
    removeHoliday(h.date, currentUser.name, stamp());
    refresh();
    pushToast('info', `ลบวันหยุด ${formatDate(h.date)}`, `${h.name} — กดคืนค่าเพื่อเรียกกลับ`);
  };

  const restore = (date: string) => {
    clearHolidayOverride(date);
    refresh();
    pushToast('info', `คืนค่าวันที่ ${formatDate(date)} กลับเป็นค่าตั้งต้น`);
  };

  /** วันที่ถูกซ่อนไว้ของปีนี้ — แสดงแยกเพื่อให้เรียกคืนได้ ไม่ใช่หายไปเฉย ๆ */
  const removedDates = Object.entries(overrides)
    .filter(([date, o]) => o.removed && date.startsWith(`${year}-`))
    .map(([date]) => date)
    .sort();

  return (
    <>
      <PageHeader
        title="วันหยุด"
        description={`กำหนดวันหยุดของบริษัท · เตรียมไว้ปีปัจจุบันและปีถัดไป · ปฏิทินทุกหน้าใช้ชุดนี้ร่วมกัน`}
        actions={
          <SegmentedControl
            label="เลือกปี"
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={[
              { value: String(thisYear), label: `${thaiYear(thisYear)} (ปีปัจจุบัน)` },
              { value: String(nextYear), label: `${thaiYear(nextYear)} (ปีถัดไป)` },
            ]}
          />
        }
      />

      {missing.length > 0 && (
        <div className="mb-4">
          <Callout tone="amber" title={`ปี ${thaiYear(year)} ยังกำหนดไม่ครบ ${missing.length} รายการ`}>
            {missing.join(' · ')} — วันหยุดกลุ่มนี้อิงปฏิทินจันทรคติหรือประกาศรายปี ระบบคำนวณล่วงหน้าให้ไม่ได้
            ต้องดูจากประกาศแล้วเพิ่มเองด้านล่าง
          </Callout>
        </div>
      )}

      {!editable && (
        <div className="mb-4">
          <Callout tone="slate" title="ดูได้อย่างเดียว">
            บทบาทของคุณไม่มีสิทธิ์แก้ไขวันหยุด (ต้องเป็นผู้ดูแลระบบหรือฝ่ายจัดหัวหน้าทัวร์)
          </Callout>
        </div>
      )}

      {editable && (
        <Card className="mb-5">
          <div className="grid items-start gap-3 lg:grid-cols-4">
            <DateField
              label="วันที่"
              value={newDate}
              onChange={setNewDate}
              picker
              min={`${year}-01-01`}
              max={`${year}-12-31`}
              hint={`อยู่ในปี ${thaiYear(year)}`}
            />
            <div className="lg:col-span-2">
              <TextInput
                label="ชื่อวันหยุด"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="เช่น วันมาฆบูชา หรือ วันหยุดพิเศษตามมติ ครม."
                onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
              />
            </div>
            <div className="flex h-[42px] items-center lg:mt-[26px]">
              <Button onClick={add}>เพิ่มวันหยุด</Button>
            </div>
          </div>
          {formError && <p className="zego-text-danger mt-2 text-xs font-medium">{formError}</p>}
        </Card>
      )}

      <Card padded={false} className="overflow-hidden">
        <div className="zego-divider-bottom flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <h2 className="zego-text text-base font-semibold">
            วันหยุดปี {thaiYear(year)}
            <span className="zego-text-tertiary ml-2 text-sm font-normal">{holidays.length} วัน</span>
          </h2>
          <span className="zego-text-tertiary text-xs">
            วันที่ตายตัวและวันชดเชยระบบเติมให้ · แก้ชื่อหรือลบได้ทุกรายการ
          </span>
        </div>

        {holidays.length === 0 ? (
          <div className="p-4">
            <EmptyState icon="calendar" title={`ยังไม่มีวันหยุดในปี ${thaiYear(year)}`} description="เพิ่มจากแบบฟอร์มด้านบน" />
          </div>
        ) : (
          <ul className="divide-y divide-[var(--zego-border-soft)]">
            {holidays.map((h) => {
              const d = parseDate(h.date);
              const weekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <li key={h.date} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <span className={cx('w-24 shrink-0 font-mono text-sm font-semibold', weekend ? 'text-rose-500' : 'zego-text')}>
                    {formatDate(h.date)}
                  </span>
                  <span className="zego-text-tertiary w-8 shrink-0 text-xs">{TH_WEEKDAYS_SHORT[d.getDay()]}</span>
                  <span className="zego-text min-w-0 flex-1 truncate text-sm">{h.name}</span>
                  <Pill tone={SOURCE_META[h.source].tone}>{SOURCE_META[h.source].label}</Pill>
                  {editable && (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const next = window.prompt(`แก้ชื่อวันหยุด ${formatDate(h.date)}`, h.name);
                          if (next !== null) rename(h, next);
                        }}
                      >
                        แก้ชื่อ
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => drop(h)}>ลบ</Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {removedDates.length > 0 && (
        <Card className="mt-4">
          <h3 className="zego-text-secondary mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Icon name="info" className="zego-text-tertiary h-4 w-4" />
            วันที่ถูกลบออกจากชุดตั้งต้น ({removedDates.length})
          </h3>
          <div className="flex flex-wrap gap-2">
            {removedDates.map((date) => (
              <span key={date} className="zego-border-color zego-text-secondary flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs">
                {formatDate(date)}
                {editable && (
                  <button type="button" onClick={() => restore(date)} className="zego-text-info font-medium hover:underline">
                    คืนค่า
                  </button>
                )}
              </span>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}
