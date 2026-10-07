'use client';

/**
 * ทักษะด้านภาษา — กรอกหลายภาษาแล้วบันทึกครั้งเดียว (Inline ในหน้าหลัก ไม่เปิด Modal)
 *
 * แต่ละภาษาแสดงเป็น 1 แถว: [ภาษา] [ระดับภาษา (ตัวเลือกติก ขึ้นเมื่อเลือกภาษาแล้ว)] [ภาษาแม่] [ลบ]
 * ระดับภาษาใช้มาตรฐานของภาษานั้นเอง (อังกฤษ/ฝรั่งเศส/เยอรมัน/สเปน = CEFR, จีน = HSK, ญี่ปุ่น = JLPT,
 * เกาหลี = TOPIK, ภาษาอื่น = ระดับกลาง GENERAL) — เลือกภาษาแล้ว dropdown ระดับเปลี่ยนตามอัตโนมัติ
 * ผู้ใช้ไม่ต้องเลือกมาตรฐานเอง เปลี่ยนภาษาแล้วระดับเดิมถูกล้างทิ้งทันที (คนละมาตรฐานเทียบกันไม่ได้)
 * เลือก "ภาษาแม่" แล้วช่องระดับภาษาปิดใช้งาน (ภาษาแม่ไม่ใช่ระดับที่ต้องสอบ)
 *
 * โหมดแสดงผล (view)
 *   Card สรุปรายภาษา + ปุ่ม "แก้ไข"/"ลบ" รายรายการ · ปุ่ม "แก้ไขข้อมูลภาษา" เปิดทุกรายการเป็นฟอร์มพร้อมกัน
 *
 * โหมดแก้ไข (edit)
 *   ทุกภาษาเป็นแถวฟอร์ม "ภาษา 1..N" · ปุ่ม "+ เพิ่มภาษา" ต่อท้าย · ปุ่มหลักปุ่มเดียวด้านล่าง
 *   บันทึกทั้งชุดพร้อมกัน — รายการใดไม่ผ่าน Validation จะไม่บันทึกทั้งชุด และข้อมูลที่กรอกไว้ไม่หาย
 */

import { useMemo, useRef, useState } from 'react';
import { Button, Card, CardHeader, cx, Pill } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/FormField';
import { Combobox } from '@/components/ui/Combobox';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/Modal';
import { useDemo } from '@/store/DemoStore';
import { leaderToForm } from '@/modules/tour-leaders/mappers';
import { validateLeaderForm } from '@/modules/tour-leaders/validation';
import { saveErrorMessage } from '@/services/browserStorage';
import { newChildId } from '@/modules/tour-leaders/utils';
import {
  levelOption,
  levelsForStandard,
  standardForLanguageCode,
  MAIN_LANGUAGE_CODES,
} from '@/data/leaders/languageStandards';
import { LanguageLevelTag } from './LanguageBadge';
import type { LanguageSkill, TourLeader } from '@/types';

/** ตัวเลือก "อื่น ๆ" ของ Combobox ภาษา */
const OTHER_CODE = 'OTHER';
const OTHER_LABEL = 'อื่น ๆ (ระบุเอง)';

/** แถวภาษาใหม่ — ช่องว่างทั้งหมด ไม่คัดลอกค่าจากรายการก่อนหน้า */
function blankSkill(): LanguageSkill {
  return {
    id: newChildId('LS'),
    languageCode: '',
    languageName: '',
    isNativeLanguage: false,
    standard: 'GENERAL',
    levelCode: null,
    levelName: null,
    levelRank: null,
  };
}

/**
 * ตรวจทั้งชุดก่อนบันทึก — คืน error รายการต่อแถว (key = id) และ error ระดับชุด
 * ห้ามบันทึกบางรายการ: ถ้ามี error แม้ข้อเดียวจะไม่บันทึกทั้งชุด
 */
function validateDrafts(drafts: LanguageSkill[]): {
  byCard: Record<string, string>;
  formError: string | null;
} {
  const byCard: Record<string, string> = {};
  const seen = new Map<string, number>();

  drafts.forEach((s, i) => {
    const name = s.languageName.trim();
    if (!name) {
      byCard[s.id] =
        s.languageCode === OTHER_CODE ? 'กรุณาระบุชื่อภาษาที่เลือก “อื่น ๆ”' : 'กรุณาเลือกภาษา';
      return;
    }
    const firstAt = seen.get(name);
    if (firstAt !== undefined) {
      byCard[s.id] = `ภาษานี้ซ้ำกับ “ภาษา ${firstAt + 1}” — หนึ่งคนเพิ่มภาษาเดียวกันได้ครั้งเดียว`;
      return;
    }
    seen.set(name, i);

    if (!s.isNativeLanguage && !s.levelCode) {
      byCard[s.id] = 'กรุณาเลือกระดับภาษา';
    }
  });

  const formError = drafts.length === 0 ? 'ต้องระบุภาษาอย่างน้อย 1 ภาษา' : null;
  return { byCard, formError };
}

/* ================================ Panel ================================= */

export function LanguageSkillsPanel({
  leader,
  canEdit,
}: {
  leader: TourLeader;
  canEdit: boolean;
}) {
  const { master, leaders, today, saving, saveLeaderForm } = useDemo();

  /** รายการที่บันทึกแล้วเท่านั้น — ใช้เป็นตัวนับจำนวนภาษา */
  const saved = leader.languages;
  const savedIds = useMemo(() => new Set(saved.map((l) => l.id)), [saved]);

  const [editing, setEditing] = useState(() => canEdit && saved.length === 0);
  const [drafts, setDrafts] = useState<LanguageSkill[]>(() =>
    saved.length > 0 ? saved.map((s) => ({ ...s })) : [blankSkill()],
  );
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<LanguageSkill | null>(null);
  const submitting = useRef(false);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});

  /*
    ยังไม่มีภาษาเลย → เปิดโหมดกรอกค้างไว้เสมอ (รวมกรณีลบรายการสุดท้ายทิ้ง)
    ปรับ state ระหว่าง render — เงื่อนไขเป็นเท็จทันทีหลังตั้งค่า จึงไม่วนซ้ำ
  */
  if (canEdit && saved.length === 0 && !editing) {
    setEditing(true);
    setDrafts([blankSkill()]);
  }

  const openEditor = (focusId?: string) => {
    setDrafts(saved.length > 0 ? saved.map((s) => ({ ...s })) : [blankSkill()]);
    setCardErrors({});
    setFormError(null);
    setSaveError(null);
    setSavedNotice(false);
    setEditing(true);
    if (focusId) {
      window.setTimeout(
        () => cardRefs.current[focusId]?.scrollIntoView({ behavior: 'smooth', block: 'center' }),
        120,
      );
    }
  };

  const cancelEditor = () => {
    setDrafts(saved.map((s) => ({ ...s })));
    setCardErrors({});
    setFormError(null);
    setSaveError(null);
    setEditing(false);
  };

  const patchDraft = (id: string, patch: Partial<LanguageSkill>) => {
    setSavedNotice(false);
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const addDraft = () => {
    setSavedNotice(false);
    setDrafts((prev) => [...prev, blankSkill()]);
  };

  /** ลบแถวออกจากชุดที่กำลังกรอก — ไม่แตะข้อมูลที่บันทึกไว้จนกว่าจะกดบันทึก */
  const dropDraft = (id: string) => {
    setSavedNotice(false);
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    setCardErrors((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  /** เขียนรายการภาษาทั้งชุดลงโปรไฟล์ในครั้งเดียว — สำเร็จทั้งหมดหรือไม่เขียนเลย */
  const persist = async (next: LanguageSkill[]): Promise<boolean> => {
    if (submitting.current || saving) return false;
    const form = { ...leaderToForm(leader), languages: next };

    // ด่านสุดท้าย: กติกาเดียวกับที่ใช้ตรวจทั้งโปรไฟล์ (กันกรณีที่ตรวจฝั่งแถวไม่ครอบคลุม)
    const validation = validateLeaderForm(form, { existingLeaders: leaders, isNew: false, today });
    const relevant = validation.errors.filter(
      (e) => e.step === 'skills' && (e.field === 'languages' || next.some((l) => l.id === e.field)),
    );
    if (relevant.length > 0) {
      const byCard: Record<string, string> = {};
      let top: string | null = null;
      for (const e of relevant) {
        if (e.field === 'languages') top = top ?? e.message;
        else if (!byCard[e.field]) byCard[e.field] = e.message;
      }
      setCardErrors(byCard);
      setFormError(top);
      return false;
    }

    submitting.current = true;
    setSaveError(null);
    try {
      await saveLeaderForm(form, leader, undefined);
      return true;
    } catch (err) {
      setSaveError(saveErrorMessage(err));
      return false;
    } finally {
      submitting.current = false;
    }
  };

  /** ปุ่มหลัก — บันทึกทุกรายการพร้อมกัน */
  const saveAll = async () => {
    if (submitting.current || saving) return;
    const { byCard, formError: fe } = validateDrafts(drafts);
    setCardErrors(byCard);
    setFormError(fe);

    const firstBad = drafts.find((d) => byCard[d.id]);
    if (firstBad) {
      cardRefs.current[firstBad.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (fe) return;

    if (await persist(drafts.map((s) => ({ ...s })))) {
      setCardErrors({});
      setFormError(null);
      setEditing(false);
      setSavedNotice(true);
    }
  };

  /** ลบภาษาที่บันทึกแล้วจากหน้าสรุป — ยืนยันก่อน แล้วเขียนทับทั้งชุด */
  const deleteSaved = async (skill: LanguageSkill) => {
    const next = saved.filter((l) => l.id !== skill.id).map((s) => ({ ...s }));
    if (await persist(next)) {
      setPendingDelete(null);
      setDrafts(next.length > 0 ? next : [blankSkill()]);
    }
  };

  // ปิดปุ่มระหว่างบันทึกจาก state ของ store — ref `submitting` เป็นกันกดซ้ำใน handler เท่านั้น
  const savingAll = saving;
  const saveLabel = saved.length > 0 ? 'บันทึกการเปลี่ยนแปลงทั้งหมด' : 'บันทึกภาษาทั้งหมด';

  return (
    <Card>
      <CardHeader
        title="ทักษะด้านภาษา"
        description={`${saved.length} ภาษา`}
        action={
          canEdit && !editing && saved.length > 0 ? (
            <Button size="sm" variant="secondary" icon="edit" onClick={() => openEditor()}>
              แก้ไขข้อมูลภาษา
            </Button>
          ) : undefined
        }
      />

      {savedNotice && !editing && (
        <p className="mb-3 flex items-center gap-2 zego-status-bar zego-status-bar--success rounded-lg px-3 py-2 text-xs font-medium">
          <Icon name="check" className="h-4 w-4 shrink-0" />
          บันทึกข้อมูลภาษาทั้งหมดสำเร็จ
        </p>
      )}
      {formError && (
        <p className="mb-3 zego-status-bar zego-status-bar--danger rounded-lg px-3 py-2 text-xs font-medium">
          {formError}
        </p>
      )}
      {saveError && (
        <p className="mb-3 zego-status-bar zego-status-bar--danger rounded-lg px-3 py-2 text-xs font-medium">
          {saveError}
        </p>
      )}

      {editing ? (
        <>
          <div className="space-y-3">
            {drafts.map((skill, i) => (
              <LanguageRowForm
                key={skill.id}
                index={i}
                skill={skill}
                others={drafts.filter((d) => d.id !== skill.id)}
                masterLanguages={master.languages}
                error={cardErrors[skill.id]}
                canRemove={drafts.length > 1}
                isSavedRecord={savedIds.has(skill.id)}
                cardRef={(el) => {
                  cardRefs.current[skill.id] = el;
                }}
                onPatch={(patch) => patchDraft(skill.id, patch)}
                onRemove={() =>
                  savedIds.has(skill.id) ? setPendingDelete(skill) : dropDraft(skill.id)
                }
              />
            ))}
          </div>

          <div className="mt-3">
            <Button variant="secondary" icon="plus" onClick={addDraft} disabled={savingAll}>
              เพิ่มภาษา
            </Button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-2 zego-divider-top pt-3">
            {saved.length > 0 && (
              <Button variant="ghost" onClick={cancelEditor} disabled={savingAll}>
                ยกเลิก
              </Button>
            )}
            <Button variant="primary" onClick={saveAll} loading={savingAll} disabled={savingAll}>
              {savingAll ? 'กำลังบันทึก...' : saveLabel}
            </Button>
          </div>
        </>
      ) : (
        <div className="space-y-2">
          {saved.map((skill) => (
            <LanguageSummaryRow
              key={skill.id}
              skill={skill}
              canEdit={canEdit}
              onEdit={() => openEditor(skill.id)}
              onDelete={() => setPendingDelete(skill)}
            />
          ))}
          {saved.length === 0 && (
            <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
              ยังไม่ได้ระบุภาษา
            </p>
          )}
        </div>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteSaved(pendingDelete)}
        loading={savingAll}
        tone="danger"
        title="ยืนยันการลบภาษา"
        confirmLabel="ลบภาษา"
        message={`ลบ “${pendingDelete?.languageName}” ที่บันทึกไว้แล้วออกจากโปรไฟล์ — การลบจะมีผลทันที`}
      />
    </Card>
  );
}

/* ============================== แถวสรุป =============================== */

function LanguageSummaryRow({
  skill,
  canEdit,
  onEdit,
  onDelete,
}: {
  skill: LanguageSkill;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border zego-border-color px-4 py-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="text-sm font-semibold zego-text">{skill.languageName}</span>
        <LanguageLevelTag skill={skill} />
      </div>
      {canEdit && (
        <div className="flex shrink-0 items-center gap-1.5">
          <Button size="sm" variant="secondary" icon="edit" onClick={onEdit}>
            แก้ไข
          </Button>
          <Button size="sm" variant="ghost" onClick={onDelete}>
            ลบ
          </Button>
        </div>
      )}
    </div>
  );
}

/* ============================== แถวฟอร์ม ============================== */

function LanguageRowForm({
  index,
  skill,
  others,
  masterLanguages,
  error,
  canRemove,
  isSavedRecord,
  cardRef,
  onPatch,
  onRemove,
}: {
  index: number;
  skill: LanguageSkill;
  others: LanguageSkill[];
  masterLanguages: { code: string; name: string; active: boolean }[];
  error?: string;
  canRemove: boolean;
  isSavedRecord: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
  onPatch: (patch: Partial<LanguageSkill>) => void;
  onRemove: () => void;
}) {
  const [query, setQuery] = useState('');
  const isCustom = skill.languageCode === OTHER_CODE;

  const usedNames = useMemo(
    () => new Set(others.map((l) => l.languageName.trim()).filter(Boolean)),
    [others],
  );

  /**
   * ตัวเลือกภาษา — เหลือเฉพาะภาษาหลัก (มีมาตรฐานวัดระดับเฉพาะของตัวเอง) + "อื่น ๆ (ระบุเอง)"
   * ตัดภาษาที่แถวอื่นเลือกไปแล้วออก เพื่อกันเพิ่มซ้ำตั้งแต่ต้นทาง
   */
  const options = useMemo(
    () => [
      ...masterLanguages
        .filter((m) => m.active && (MAIN_LANGUAGE_CODES as readonly string[]).includes(m.code) && !usedNames.has(m.name))
        .map((m) => ({ code: m.code, name: m.name })),
      { code: OTHER_CODE, name: OTHER_LABEL },
    ],
    [masterLanguages, usedNames],
  );
  const filtered = query.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(query.trim().toLowerCase()))
    : options;

  /** เลือกภาษาแล้วต้องล้างระดับเดิมทันที — คนละมาตรฐานเทียบกันไม่ได้ */
  const selectLanguage = (item: { code: string; name: string } | null) => {
    if (!item) return;
    if (item.code === OTHER_CODE) {
      onPatch({
        languageCode: OTHER_CODE,
        languageName: '',
        standard: 'GENERAL',
        levelCode: null,
        levelName: null,
        levelRank: null,
      });
      return;
    }
    onPatch({
      languageCode: item.code,
      languageName: item.name,
      standard: standardForLanguageCode(item.code),
      levelCode: null,
      levelName: null,
      levelRank: null,
    });
  };

  const levelOptions = levelsForStandard(skill.standard);

  const selectLevel = (code: string) => {
    const opt = levelOption(skill.standard, code);
    if (!opt) return;
    onPatch({ levelCode: opt.code, levelName: opt.name, levelRank: opt.rank });
  };

  const toggleNative = (checked: boolean) => {
    onPatch(
      checked
        ? { isNativeLanguage: true, levelCode: null, levelName: null, levelRank: null }
        : { isNativeLanguage: false },
    );
  };

  return (
    <div
      ref={cardRef}
      data-field={skill.id}
      data-testid="language-row-form"
      className={cx(
        'rounded-xl border p-4',
        error ? 'zego-warned-border zego-warned-tint' : 'zego-border-color zego-surface-soft-bg',
      )}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold zego-text">ภาษา {index + 1}</span>
          {skill.languageName && <span className="text-sm zego-text-tertiary">· {skill.languageName}</span>}
          {isSavedRecord && <Pill tone="slate">บันทึกแล้ว</Pill>}
        </div>
        {canRemove && (
          <Button size="sm" variant="ghost" onClick={onRemove}>
            ลบรายการ
          </Button>
        )}
      </div>

      {error && <p className="mb-2 text-xs font-medium zego-text-danger">{error}</p>}

      {/* [ภาษา] [ระดับภาษา] [ภาษาแม่] — ช่องภาษา+ระดับข้างกันเมื่อพื้นที่พอ ไม่งั้นเรียงคอลัมน์เดียว */}
      <div className="grid grid-cols-1 items-start gap-3 [&_input:not([type=radio])]:h-[38px] [&_select]:h-[38px] sm:grid-cols-2">
        <div className="min-w-0">
          <Combobox
            label="ภาษา"
            required
            value={isCustom ? OTHER_LABEL : skill.languageName}
            items={filtered}
            getKey={(o) => o.code}
            getLabel={(o) => o.name}
            onSelect={selectLanguage}
            onSearch={setQuery}
            placeholder="พิมพ์ค้นหาภาษา…"
          />
          {isCustom && (
            <div className="mt-2">
              <TextInput
                label="ระบุชื่อภาษา"
                required
                placeholder="เช่น ภาษาโปรตุเกส"
                value={skill.languageName}
                onChange={(e) => onPatch({ languageName: e.target.value })}
              />
            </div>
          )}
        </div>

        {/*
          ระดับภาษา — เลือกภาษาแล้วแสดงทุกระดับของมาตรฐานนั้นเป็นตัวเลือกติกได้ทันที (ไม่ต้องเปิด dropdown)
          ยังไม่เลือกภาษา = บอกให้เลือกภาษาก่อน · ภาษาแม่ = ไม่ต้องระบุระดับ
        */}
        <fieldset className="min-w-0">
          <legend className="mb-1.5 text-sm font-medium zego-text">
            ระดับภาษา{!skill.isNativeLanguage && <span className="zego-text-danger" aria-hidden="true">*</span>}
          </legend>
          {skill.isNativeLanguage ? (
            <p className="rounded-lg zego-surface-bg px-3 py-2 text-sm zego-text-tertiary">ไม่ต้องระบุ — ภาษาแม่</p>
          ) : !skill.languageName && !isCustom ? (
            <p className="rounded-lg zego-surface-bg px-3 py-2 text-sm zego-text-tertiary">เลือกภาษาก่อน แล้วระดับภาษาจะขึ้นให้เลือก</p>
          ) : (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={`ระดับภาษา — ${skill.languageName || 'ภาษา'}`}>
              {levelOptions.map((l) => {
                const on = skill.levelCode === l.code;
                return (
                  <label
                    key={l.code}
                    className={cx(
                      'flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition',
                      on ? 'border-emerald-500 bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-500' : 'zego-border-color zego-surface-bg zego-text-secondary hover:border-emerald-300',
                    )}
                  >
                    <input
                      type="radio"
                      name={`level-${skill.id}`}
                      className="h-4 w-4 accent-emerald-600"
                      checked={on}
                      onChange={() => selectLevel(l.code)}
                    />
                    <span><b className="font-semibold">{l.code}</b> — {l.name}</span>
                  </label>
                );
              })}
            </div>
          )}
        </fieldset>
      </div>

      <div className="mt-3">
        <label className="flex cursor-pointer items-center gap-2 text-sm zego-text-secondary">
          <input
            type="checkbox"
            checked={skill.isNativeLanguage}
            onChange={(e) => toggleNative(e.target.checked)}
            className="h-4 w-4 accent-blue-700"
          />
          ภาษาแม่
        </label>
      </div>
    </div>
  );
}

