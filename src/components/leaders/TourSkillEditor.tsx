'use client';

/**
 * แก้ไขประเภททัวร์และความถนัด — แยก 2 หมวด (ประเภทกลุ่มลูกค้า / ทักษะการทำงาน)
 * — เลือกได้หลายรายการ ห้ามซ้ำ
 * — "ได้ทุกประเภท" ยังเลือกรายการที่โดดเด่นเพิ่มได้
 */

import { useState } from 'react';
import { Callout, cx, Pill } from '@/components/ui/Primitives';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import { Icon } from '@/components/ui/Icon';
import { TOUR_SKILL_LEVEL, TOUR_SKILL_ORDER } from '@/lib/labels';
import { CUSTOM_SKILL_CODE } from '@/data/master';
import type { MasterItem, TourSkillCategory, TourSkillLevel, TourTypeSkill } from '@/types';

let seq = 0;

/**
 * เพิ่มรายการที่เลือกไว้เข้าไปในชุดทักษะ — ใช้ร่วมกันระหว่างปุ่ม "เพิ่ม" และตอนกดบันทึก
 *
 * ⚠️ ต้องเรียกตอนบันทึกด้วย ไม่งั้นรายการที่ผู้ใช้เลือกค้างไว้ในช่อง (แต่ยังไม่กด "เพิ่ม")
 *    จะถูกทิ้งเงียบ ๆ ทั้งที่ระบบขึ้นว่าบันทึกสำเร็จ
 */
export function appendSkillFromMaster(
  skills: TourTypeSkill[],
  masterId: string,
  options: MasterItem[],
  category: TourSkillCategory,
): { next: TourTypeSkill[] } | { error: string } {
  if (!masterId) return { error: 'กรุณาเลือกรายการที่ต้องการเพิ่ม' };
  const master = options.find((o) => o.id === masterId);
  if (!master) return { error: 'ไม่พบรายการนี้ในข้อมูลตั้งต้น' };
  if (skills.some((s) => s.category === category && s.masterId === master.id)) {
    return { error: `“${master.name}” ถูกเพิ่มไว้แล้ว` };
  }
  seq += 1;
  return {
    next: [
      ...skills,
      {
        id: `TS-NEW-${Date.now()}-${seq}`,
        masterId: master.id,
        category,
        code: master.code,
        name: master.name,
        level: 'good',
      },
    ],
  };
}

/**
 * เพิ่มทักษะที่ผู้ใช้พิมพ์ชื่อเอง — ใช้เมื่อรายการตั้งต้นไม่ครอบคลุม
 * ไม่มี masterId ให้อ้าง จึงกันชื่อซ้ำด้วยการเทียบชื่อแบบตัดช่องว่างและไม่สนตัวพิมพ์
 */
export function appendCustomSkill(
  skills: TourTypeSkill[],
  rawName: string,
  category: TourSkillCategory,
): { next: TourTypeSkill[] } | { error: string } {
  const name = rawName.trim();
  if (!name) return { error: 'กรุณาระบุชื่อทักษะ' };

  const same = skills.some(
    (s) => s.category === category && s.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (same) return { error: `“${name}” ถูกเพิ่มไว้แล้ว` };

  seq += 1;
  return {
    next: [
      ...skills,
      {
        id: `TS-NEW-${Date.now()}-${seq}`,
        masterId: '',
        category,
        code: CUSTOM_SKILL_CODE,
        name,
        level: 'good',
      },
    ],
  };
}

export function SkillSection({
  title,
  description,
  category,
  allCode,
  options,
  skills,
  onChange,
}: {
  title: string;
  description: string;
  category: TourSkillCategory;
  allCode: string;
  options: MasterItem[];
  skills: TourTypeSkill[];
  onChange: (next: TourTypeSkill[]) => void;
}) {
  const [addError, setAddError] = useState<string>();
  /** เปิดช่องพิมพ์ชื่อทักษะเองอยู่หรือไม่ + ชื่อที่กำลังพิมพ์ */
  const [customOpen, setCustomOpen] = useState(false);
  const [customName, setCustomName] = useState('');

  const mine = skills.filter((s) => s.category === category);
  /* ติ๊กเองเสมอ ไม่ตั้งค่าเริ่มต้นจาก mine.length — เปิดจากปุ่ม "เพิ่มข้อมูล" ต้องพร้อมกรอกทันที */
  const [none, setNone] = useState(false);
  const used = new Set(mine.map((s) => s.masterId));
  const available = options.filter((o) => o.active && !used.has(o.id));
  const hasAll = mine.some((s) => s.code === allCode);

  const add = (masterId: string) => {
    const result = appendSkillFromMaster(skills, masterId, options, category);
    if ('error' in result) {
      setAddError(result.error);
      return;
    }
    onChange(result.next);
    setAddError(undefined);
  };

  const addCustom = () => {
    const result = appendCustomSkill(skills, customName, category);
    if ('error' in result) {
      setAddError(result.error);
      return;
    }
    onChange(result.next);
    setCustomName('');
    setCustomOpen(false);
    setAddError(undefined);
  };

  /** ติ๊กตอนมีรายการอยู่ → นำรายการของหมวดนี้ออกทั้งหมด (หมวดอื่นใน tourSkills ไม่ถูกแตะ) */
  const toggleNone = (checked: boolean) => {
    setNone(checked);
    setAddError(undefined);
    setCustomOpen(false);
    if (checked && mine.length > 0) onChange(skills.filter((s) => s.category !== category));
  };

  const update = (id: string, patch: Partial<TourTypeSkill>) => {
    onChange(skills.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-semibold zego-text">{title}</p>
        <p className="text-xs zego-text-tertiary">{description}</p>
      </div>

      {hasAll && (
        <Callout tone="green" title="เลือก “ได้ทุกประเภท” ไว้แล้ว">
          รายการนี้จะตรงกับทุกประเภทในการค้นหาและการจับคู่งาน —
          ยังสามารถเพิ่มรายการที่โดดเด่นเป็นพิเศษได้อีก
        </Callout>
      )}

      {/* ไม่ระบุ = ยืนยันว่าไม่มีรายการให้บันทึก ต่างจากยังไม่ได้กรอก — ติ๊กแล้วซ่อนช่องเพิ่มรายการไม่ให้กรอกสับสน */}
      <label className="inline-flex items-center gap-2 text-sm zego-text-secondary">
        <input
          type="checkbox"
          checked={none}
          onChange={(e) => toggleNone(e.target.checked)}
          className="h-4 w-4 rounded zego-border-color"
        />
        ไม่ระบุ{title}
      </label>

      {none ? (
        <p className="rounded-lg border border-dashed zego-border-color px-4 py-5 text-center text-sm zego-text-tertiary">
          ไม่ระบุ{title} — ติ๊กออกเพื่อเพิ่มรายการ
        </p>
      ) : (
        <>
        {/*
          เลือกได้ทีละหลายรายการ — กดชื่อรายการเพื่อเพิ่มทันที กดกี่อันก็ได้
          (เดิมเป็น dropdown + ปุ่ม "เพิ่ม" ต้องทำซ้ำทีละรายการ และมีโอกาสเลือกค้างไว้แล้วลืมกด)
        */}
        <div>
          <p className="mb-1.5 text-sm font-medium zego-text-secondary">เพิ่มรายการ</p>
          <div className="flex flex-wrap gap-2">
            {available.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => add(o.id)}
                className={cx(
                  'inline-flex items-center gap-1 rounded-lg border zego-border-color zego-surface-bg px-3 py-1.5',
                  'text-sm zego-text-secondary zego-hover-selected',
                )}
              >
                <Icon name="plus" className="h-3.5 w-3.5" />
                {o.name}
              </button>
            ))}

            {/* ระบุเอง — มีให้กดเสมอ แม้เพิ่มรายการตั้งต้นครบแล้ว */}
            <button
              type="button"
              onClick={() => { setCustomOpen(true); setAddError(undefined); }}
              className={cx(
                'inline-flex items-center gap-1 rounded-lg border border-dashed zego-border-color zego-surface-bg px-3 py-1.5',
                'text-sm zego-text-secondary zego-hover-selected',
              )}
            >
              <Icon name="plus" className="h-3.5 w-3.5" />
              อื่น ๆ (ระบุเอง)
            </button>
          </div>

          {available.length === 0 && (
            <p className="mt-1 text-xs zego-text-tertiary">เพิ่มครบทุกรายการตั้งต้นแล้ว — ยังระบุเองเพิ่มได้</p>
          )}

          {/* ระบุเอง — ใช้เมื่อทักษะนั้นไม่มีในข้อมูลตั้งต้น */}
          {customOpen ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                autoFocus
                value={customName}
                onChange={(e) => { setCustomName(e.target.value); setAddError(undefined); }}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } }}
                placeholder="ระบุชื่อทักษะ"
                className={cx(
                  'min-w-56 flex-1 rounded-lg border zego-border-color zego-surface-bg px-3 py-1.5 text-sm',
                  'focus:border-[var(--zego-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--zego-focus)]',
                )}
              />
              <button
                type="button"
                onClick={addCustom}
                className="rounded-lg bg-[var(--zego-primary-500)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--zego-primary-600)]"
              >
                เพิ่ม
              </button>
              <button
                type="button"
                onClick={() => { setCustomOpen(false); setCustomName(''); setAddError(undefined); }}
                className="rounded-lg px-2 py-1.5 text-sm zego-text-tertiary"
              >
                ยกเลิก
              </button>
            </div>
          ) : null}
          {addError && <p className="mt-1 text-xs zego-text-danger">{addError}</p>}
        </div>

        {mine.length === 0 ? (
          <p className="rounded-lg border border-dashed zego-border-color px-4 py-5 text-center text-sm zego-text-tertiary">
            ยังไม่ได้ระบุ{title}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {mine.map((skill) => (
              <li
                key={skill.id}
                className={cx(
                  'rounded-xl border p-3',
                  skill.code === allCode
                    ? 'border-[#cce8d7] bg-[#effaf4]'
                    : 'zego-border-color zego-surface-soft-bg',
                )}
              >
                <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold zego-text">{skill.name}</span>
                    {skill.code === allCode && <Pill tone="green">ครอบคลุมทุกประเภท</Pill>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange(skills.filter((s) => s.id !== skill.id))}
                    aria-label={`นำ ${skill.name} ออก`}
                    className="rounded p-1 zego-text-tertiary hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectInput
                    label="ระดับความถนัด"
                    required
                    value={skill.level}
                    onChange={(e) => update(skill.id, { level: e.target.value as TourSkillLevel })}
                    options={TOUR_SKILL_ORDER.map((l) => ({
                      value: l,
                      label: TOUR_SKILL_LEVEL[l].label,
                    }))}
                  />
                  <TextInput
                    label="หมายเหตุ"
                    value={skill.note ?? ''}
                    onChange={(e) => update(skill.id, { note: e.target.value })}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        </>
      )}
    </div>
  );
}

/*
  เดิมมี <TourSkillEditor> ที่รวม 2 หมวดไว้ด้วยกัน — ไม่มีที่ไหนเรียกใช้แล้ว
  (หมวด "ประเภททัวร์ (กลุ่มลูกค้า)" ถูกนำออกจากหน้าจอ · หมวดทักษะเปิดผ่าน SkillSection โดยตรง)
  จึงลบออกเพื่อไม่ให้เหลือโค้ดที่ไม่ได้ใช้และหลุดการดูแล
*/
