'use client';

/**
 * โหมด "แก้ไขเฉพาะส่วน" (§1 โหมดที่ 2) — เปิดแบบฟอร์มของ Card เดียวในหมวดความสามารถ
 * ไม่มี Tab Bar · ไม่มีปุ่มร่าง/ย้อนกลับ/ถัดไป (§3/§4) · บันทึกเฉพาะ Card ที่แก้ ไม่แตะข้อมูลอื่น (§6)
 *
 * เปิดจากปุ่มใน Card ของหน้า Detail แทนการเปิด Modal แก้ไขแบบเต็ม (§7)
 */

import { useMemo, useRef, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Primitives';
import { useDemo } from '@/store/DemoStore';
import { ALL_WORK_SKILLS_CODE } from '@/data';
import { leaderToForm, type LeaderFormState } from '@/modules/tour-leaders/mappers';
import { validateLeaderForm } from '@/modules/tour-leaders/validation';
import { SkillSection } from './TourSkillEditor';
import { ExpertiseScopeEditor } from './ExpertiseScopeEditor';
import { GroupExpertisePicker } from './GroupExpertisePicker';
import { saveErrorMessage } from '@/services/browserStorage';
import { getExpertiseScopes, saveExpertiseScopes } from '@/services/expertiseScopeStore';
import { getGroupExpertise, saveGroupExpertise } from '@/services/groupExpertiseStore';
import { validateScopes, type ExpertiseScope, type ScopeValidationContext } from '@/lib/logic/expertiseScope';
import type { GroupExpertiseCode } from '@/lib/logic/groupExpertise';
import { zoneById, zoneCountries } from '@/data/leaders/zoneMaster';
import { airportsOfCountry } from '@/data/airports';
import type { TourLeader } from '@/types';

/**
 * หมวดที่ยังเปิดเป็น Modal
 *   • “ทักษะด้านภาษา” ย้ายไปแก้ไข Inline ในหน้าหลักแล้ว
 *   • “ประเภททัวร์ (กลุ่มลูกค้า)” ถูกนำออกจากหน้าจอ — ใช้ “ประเภทกรุ๊ปที่ถนัด” เป็นข้อมูลหลักแทน
 */
export type SkillSectionKey = 'country-route' | 'group-type' | 'skill';

const SECTION_TITLE: Record<SkillSectionKey, string> = {
  'country-route': 'โซน ประเทศ และเส้นทางที่เชี่ยวชาญ',
  'group-type': 'ประเภทกรุ๊ปที่ถนัด',
  skill: 'ทักษะและความถนัด',
};

export function SkillSectionEditModal({
  open,
  onClose,
  leader,
  section,
  mode = 'edit',
}: {
  open: boolean;
  onClose: () => void;
  leader: TourLeader | null;
  section: SkillSectionKey;
  /** ปุ่ม "เพิ่ม" → 'add' · ปุ่ม "แก้ไข" → 'edit' (เปลี่ยนเฉพาะคำในหัวข้อ) */
  mode?: 'add' | 'edit';
}) {
  if (!open || !leader) return null;
  return <SectionForm key={`${leader.id}-${section}`} onClose={onClose} leader={leader} section={section} mode={mode} />;
}

function SectionForm({
  onClose, leader, section, mode,
}: {
  onClose: () => void;
  leader: TourLeader;
  section: SkillSectionKey;
  mode: 'add' | 'edit';
}) {
  const { master, countries, leaders, today, saving, saveLeaderForm, pushToast } = useDemo();

  const isScopeSection = section === 'country-route';
  const isGroupSection = section === 'group-type';
  const initial = useMemo<LeaderFormState>(() => leaderToForm(leader), [leader]);
  const [form, setForm] = useState<LeaderFormState>(initial);
  const [scopes, setScopes] = useState<ExpertiseScope[]>(() => (isScopeSection ? getExpertiseScopes(leader.id) : []));
  const [groupCodes, setGroupCodes] = useState<GroupExpertiseCode[]>(() => (isGroupSection ? getGroupExpertise(leader.id) : []));
  // หมวดที่เหลือในโมดัลนี้ไม่แสดง error รายช่อง — ใช้วิธีเลื่อนไปโฟกัสช่องแรกที่ผิดแทน
  const [saveError, setSaveError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  // §12 ctx สำหรับตรวจ Rule ความเชี่ยวชาญ
  const scopeCtx = useMemo<ScopeValidationContext>(() => ({
    countryExists: (id) => countries.some((c) => c.id === id),
    routeInCountry: (code, countryId) => airportsOfCountry(countryId.slice(2)).some((a) => a.iata === code),
    zoneCovers: (zoneId, countryId) => {
      const z = zoneById(zoneId);
      const c = countries.find((x) => x.id === countryId);
      return Boolean(z && c) && zoneCountries(z!, [c!]).length > 0;
    },
  }), [countries]);

  const setField = <K extends keyof LeaderFormState>(key: K, value: LeaderFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /** error เฉพาะของ Card นี้ (ไม่บล็อกเพราะ error ของ Card อื่นในหมวดความสามารถ) */
  const isRelevant = (field: string): boolean => {
    switch (section) {
      case 'country-route':
        return field === 'routeSkills' || form.routeSkills.some((s) => s.id === field);
      case 'skill':
        return form.tourSkills.some((s) => s.category === 'work_skill' && s.id === field);
      default:
        return false;
    }
  };

  const focusField = (field?: string) => {
    if (!field) return;
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    }, 120);
  };

  const save = async () => {
    if (submittingRef.current || saving) return;

    // §7/§15 หมวดความเชี่ยวชาญ — บันทึกลง Expertise Scope Store (ไม่แตะ leader form)
    if (isScopeSection) {
      const blocking = validateScopes(scopes, scopeCtx).filter((i) => !i.warning);
      if (blocking.length > 0) { pushToast('error', blocking[0].message); return; }
      submittingRef.current = true;
      try {
        // บันทึกให้สำเร็จก่อน → ค่อยแจ้งผลและปิด Modal (เขียนไม่สำเร็จจะ throw)
        saveExpertiseScopes(leader.id, scopes);
        pushToast('success', 'บันทึกข้อมูลหัวหน้าทัวร์สำเร็จ', SECTION_TITLE[section]);
        onClose();
      } catch (err) {
        setSaveError(saveErrorMessage(err));
      } finally {
        submittingRef.current = false;
      }
      return;
    }

    // §8 ประเภทกรุ๊ปที่ถนัด — บันทึกลง Group Expertise Store (normalize กันซ้ำ)
    if (isGroupSection) {
      submittingRef.current = true;
      try {
        saveGroupExpertise(leader.id, groupCodes);
        pushToast('success', 'บันทึกข้อมูลหัวหน้าทัวร์สำเร็จ', SECTION_TITLE[section]);
        onClose();
      } catch (err) {
        setSaveError(saveErrorMessage(err));
      } finally {
        submittingRef.current = false;
      }
      return;
    }

    const formToSave = form;

    const validation = validateLeaderForm(formToSave, { existingLeaders: leaders, isNew: false, today });
    const relevant = validation.errors.filter((e) => e.step === 'skills' && isRelevant(e.field));
    if (relevant.length > 0) {
      setSaveError(relevant[0].message);
      focusField(relevant[0].field);
      return;
    }
    submittingRef.current = true;
    setSaveError(null);
    try {
      // แจ้งผลสำเร็จที่ saveLeaderForm จุดเดียว (กัน Toast ซ้ำ) — ปิด Modal หลังบันทึกสำเร็จเท่านั้น
      await saveLeaderForm(formToSave, leader, undefined);
      onClose();
    } catch (err) {
      setSaveError(saveErrorMessage(err));
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${isGroupSection ? 'กำหนด' : mode === 'add' ? 'เพิ่ม' : 'แก้ไข'}${SECTION_TITLE[section]} — ${leader.firstName} ${leader.lastName}`}
      description="แก้ไขเฉพาะหมวดนี้ — ไม่กระทบข้อมูลส่วนอื่นของหัวหน้าทัวร์"
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-xs zego-text-danger">{saveError ?? ''}</span>
          <span className="flex flex-wrap gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>ยกเลิก</Button>
            <Button variant="primary" onClick={save} loading={saving} disabled={saving}>บันทึกข้อมูล</Button>
          </span>
        </div>
      }
    >
      {/* หมวด 'language' ไม่ใช้ Modal แล้ว — แก้ไขแบบ Inline ที่ LanguageSkillsPanel ในหน้าหลัก */}

      {section === 'country-route' && (
        <div>
          <p className="mb-3 text-sm zego-text-tertiary">
            เลือกได้หลายโซน หลายประเทศ และหลายเส้นทาง หรือระบุเฉพาะประเทศโดยไม่เลือกโซนก็ได้ · ข้อมูลไม่บังคับ
          </p>
          <ExpertiseScopeEditor scopes={scopes} countries={countries} onChange={setScopes} />
        </div>
      )}

      {section === 'group-type' && (
        <div>
          <p className="mb-3 text-sm zego-text-tertiary">เลือกได้หลายรายการ · ข้อมูลไม่บังคับ (เว้นว่างได้)</p>
          <GroupExpertisePicker value={groupCodes} onChange={setGroupCodes} />
        </div>
      )}

      {/* หมวด 'tour-type' (ประเภททัวร์/กลุ่มลูกค้า) ถูกนำออกจากหน้าจอแล้ว —
          ข้อมูล tourSkills หมวด customer_group ที่บันทึกไว้เดิมยังอยู่ครบและถูกบันทึกกลับตามเดิม */}

      {section === 'skill' && (
        <SkillSection
          title="ทักษะและรูปแบบการทำงาน"
          description="งานถ่ายทำระหว่างทริป เช่น ถ่ายภาพนิ่ง ถ่ายวิดีโอ ไลฟ์สด — เลือกได้หลายรายการ"
          category="work_skill"
          allCode={ALL_WORK_SKILLS_CODE}
          options={master.workSkills}
          skills={form.tourSkills}
          onChange={(next) => setField('tourSkills', next)}
        />
      )}
    </Modal>
  );
}
