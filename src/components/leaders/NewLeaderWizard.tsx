'use client';

/**
 * วิซาร์ด "เพิ่มหัวหน้าทัวร์ใหม่" แบบ 6 แท็บ (หน้าเต็ม /leaders/new)
 *
 * - แถบความคืบหน้า + ตัวบอก "แท็บที่ X จาก N" (นับจาก WIZARD_TAB_KEYS)
 * - ปุ่ม ย้อนกลับ / ถัดไป (ตรวจช่องบังคับของแท็บปัจจุบันก่อนไป) และเลือกแท็บตรง ๆ ได้
 * - ข้อมูลไม่หายเมื่อสลับแท็บ (state อยู่ที่ระดับวิซาร์ด)
 * - ตารางภาษาเปลี่ยนเป็นการ์ดบนมือถือ · แท็บเลื่อนแนวนอนบนจอเล็ก
 * - บันทึกผ่าน pipeline เดิม (รหัสจริงออกจากเซิร์ฟเวอร์)
 *
 * ตรรกะ validate / map อยู่ใน src/modules/tour-leaders/newLeaderWizard.ts
 */

import {
  Fragment,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useDemo } from '@/store/DemoStore';
import { saveErrorMessage } from '@/services/browserStorage';
import { airportByIata } from '@/data';
import { Button, Card, CardHeader, Callout, cx, Pill } from '@/components/ui/Primitives';
import { SelectInput, TextArea, TextInput } from '@/components/ui/FormField';
import { DateField, DateInputBase } from '@/components/ui/DateInput';
import { withYearEraNote } from '@/lib/format';
import { Tabs } from '@/components/ui/Tabs';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Combobox } from '@/components/ui/Combobox';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { Icon } from '@/components/ui/Icon';
import type { Country, LeaderType, TourRoute } from '@/types';
import { saveExpertiseScopes } from '@/services/expertiseScopeStore';
import { OCR_ENABLED, readDocumentOcr } from '@/modules/tour-leaders/ocr';
import { PhotoPicker } from './PhotoPicker';
import { useThaiGeography, type GeographyStatus } from '@/lib/useThaiGeography';
import {
  GEOGRAPHY_ERROR_MESSAGE,
  listDistricts,
  listProvinces,
  listSubdistricts,
  lookupPostalCode,
  type GeographyRow,
} from '@/lib/thaiGeography';
import {
  WIZARD_TABS,
  WIZARD_TAB_KEYS,
  WIZARD_TITLES,
  WIZARD_TITLES_EN,
  WIZARD_TITLE_TH_TO_EN,
  WIZARD_NATIONALITIES,
  WIZARD_LEADER_TYPES,
  WIZARD_CONTACT_TYPES,
  newContactRow,
  contactRowCallPhone,
  setPrimaryContactRow,
  removeContactRow,
  contactInputType,
  contactPlaceholder,
  WIZARD_POSITIONS,
  newExperienceRow,
  summarizeWizardExperience,
  experienceHasDetails,
  experienceStartPatch,
  experienceRowComplete,
  experienceRowFilled,
  countFilledExperiences,
  setCurrentExperience,
  nextGridCell,
  WIZARD_EXPERIENCE_MIN_ROWS,
  EXPERIENCE_GRID_COLS,
  WIZARD_TOUR_TYPE_CODES,
  isAllTourTypesSelected,
  isTourTypesIndeterminate,
  WIZARD_CURRENCIES,
  WIZARD_EXPERTISE_OTHER_MAX,
  newCountryExpertise,
  makeCustomRoute,
  isDuplicateRouteName,
  isDuplicateCountry,
  countSelectedRoutes,
  WIZARD_POPULAR_COUNTRY_CODES,
  newFlightRoute,
  flightRoutePreview,
  canAppendAirport,
  isFlightRouteValid,
  moveItem,
  type WizardRoute,
  type WizardFlightRoute,
  type WizardCountryExpertise,
  type ExpertiseScope,
  type CountryRouteScope,
  WIZARD_LANGUAGES,
  WIZARD_LANGUAGE_OTHER,
  wizardLanguageStandard,
  WIZARD_TOUR_TYPES,
  WIZARD_MAX_FILE_MB,
  WIZARD_PHOTO_MAX_MB,
  WIZARD_PHOTO_TYPES,
  WIZARD_FILE_ACCEPT,
  emptyWizardForm,
  newLanguageRow,
  resolvedLanguageName,
  validateWizard,
  validateWizardTab,
  validateUploadFile,
  wizardToLeaderForm,
  wizardToExpertiseScopes,
  newDocEntry,
  docEntryHasData,
  docFieldErrorKey,
  type DocEntry,
  type WizardForm,
  type WizardTabKey,
  type WizardAddress,
  type WizardLanguageRow,
  type WizardNationality,
  type WizardContactRow,
  type WizardContactType,
  type WizardExperienceRow,
  type UploadedFile,
} from '@/modules/tour-leaders/newLeaderWizard';
import {
  DOC_SCHEMAS,
  docFieldPlaceholder,
  emptyDocData,
  type DocFieldDef,
  type DocKind,
} from '@/data/leaders/documentSchemas';
import { MONTH_NAMES_TH } from '@/modules/tour-leaders/experience';
import { DragHandle, RowMenu, useDragReorder, type RowMenuItem } from './reorderControls';
import { levelsForStandard } from '@/data/leaders/languageStandards';

/**
 * แถวช่องชื่อ (คำนำหน้า / ชื่อ / นามสกุล / ชื่อเล่น)
 * มือถือ = 1 คอลัมน์ · จอใหญ่ = 4 คอลัมน์ (คำนำหน้าแคบ · ชื่อ/นามสกุลยืด · ชื่อเล่นกลาง)
 */
const NAME_GRID =
  'grid gap-4 lg:grid-cols-[minmax(105px,0.48fr)_1fr_1fr_minmax(145px,0.72fr)]';

export function NewLeaderWizard() {
  const router = useRouter();
  const { createLeaderCode, saveLeaderForm, saving, today, countries, routes } = useDemo();
  const geo = useThaiGeography();

  const previewCode = useMemo(() => createLeaderCode(), [createLeaderCode]);
  const [form, setForm] = useState<WizardForm>(() => emptyWizardForm(previewCode));
  const [tab, setTab] = useState<WizardTabKey>('personal');
  const [touched, setTouched] = useState<Set<WizardTabKey>>(new Set(['personal']));
  const [showErrors, setShowErrors] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** ยืนยันก่อนลบเอกสารในแท็บเอกสารประจำตัว */
  const [docDelete, setDocDelete] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const submittingRef = useRef(false);

  const set = <K extends keyof WizardForm>(key: K, value: WizardForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  /* ---- เอกสาร (แต่ละรายการมี id ไม่ซ้ำ กันข้อมูลสลับเมื่อเพิ่ม/ลบ) ---- */
  const updateIdCard = (patch: Partial<DocEntry>) =>
    setForm((prev) => ({ ...prev, idCard: { ...prev.idCard, ...patch } }));
  const updateCriminalRecord = (patch: Partial<DocEntry>) =>
    setForm((prev) => ({ ...prev, criminalRecord: { ...prev.criminalRecord, ...patch } }));

  const addPassport = () =>
    setForm((prev) => ({ ...prev, passports: [...prev.passports, newDocEntry('passport')] }));
  const updatePassport = (id: string, patch: Partial<DocEntry>) =>
    setForm((prev) => ({
      ...prev,
      passports: prev.passports.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    }));
  const removePassport = (id: string) =>
    setForm((prev) => ({ ...prev, passports: prev.passports.filter((p) => p.id !== id) }));

  const addVisa = () => setForm((prev) => ({ ...prev, visas: [...prev.visas, newDocEntry('visa')] }));
  const updateVisa = (id: string, patch: Partial<DocEntry>) =>
    setForm((prev) => ({
      ...prev,
      visas: prev.visas.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    }));
  const removeVisa = (id: string) =>
    setForm((prev) => ({ ...prev, visas: prev.visas.filter((v) => v.id !== id) }));

  const addTourCard = () =>
    setForm((prev) => ({ ...prev, tourCards: [...prev.tourCards, newDocEntry('tour_card')] }));
  const updateTourCard = (id: string, patch: Partial<DocEntry>) =>
    setForm((prev) => ({
      ...prev,
      tourCards: prev.tourCards.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    }));
  const removeTourCard = (id: string) =>
    setForm((prev) => ({ ...prev, tourCards: prev.tourCards.filter((c) => c.id !== id) }));

  /** ประเทศที่ยังใช้งาน (สำหรับช่องเลือกประเทศผู้ออก/ประเทศวีซ่า) */
  const countryOptions = useMemo(
    () =>
      countries
        .filter((c) => c.isActive)
        .map((c) => ({ value: c.id, label: `${c.nameTh} (${c.nameEn})` })),
    [countries],
  );

  /** แก้ที่อยู่ปัจจุบัน — ถ้าเปิด "เหมือนกับที่อยู่ปัจจุบัน" ให้ที่อยู่ตามบัตรอัปเดตตาม */
  const setAddr = (patch: Partial<WizardAddress>) =>
    setForm((prev) => {
      const address = { ...prev.address, ...patch };
      return {
        ...prev,
        address,
        idCardAddress: prev.idCardSameAsCurrent ? { ...address } : prev.idCardAddress,
      };
    });
  const setIdAddr = (patch: Partial<WizardAddress>) =>
    setForm((prev) => ({ ...prev, idCardAddress: { ...prev.idCardAddress, ...patch } }));

  /** ติ๊ก "เหมือนกับที่อยู่ปัจจุบัน" → คัดลอกที่อยู่ปัจจุบันทั้งหมดทันที */
  const toggleSameAsCurrent = (checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      idCardSameAsCurrent: checked,
      idCardAddress: checked ? { ...prev.address } : prev.idCardAddress,
    }));

  const validation = useMemo(() => validateWizard(form), [form]);

  /** แสดง error เฉพาะแท็บที่ผู้ใช้ไปถึงแล้ว หรือหลังกดบันทึก */
  const visibleErrors = useMemo(
    () => validation.errors.filter((e) => showErrors || touched.has(e.tab)),
    [validation, touched, showErrors],
  );
  const errByField = useMemo(() => {
    const map: Record<string, string> = {};
    for (const e of visibleErrors) if (!map[e.field]) map[e.field] = e.message;
    return map;
  }, [visibleErrors]);

  const tabIndex = WIZARD_TAB_KEYS.indexOf(tab);
  const isLast = tabIndex === WIZARD_TAB_KEYS.length - 1;

  const tabItems = WIZARD_TABS.map((t) => {
    const seen = touched.has(t.key) || showErrors;
    const badge = seen ? validation.byTab[t.key] : 0;
    return { key: t.key, label: t.label, badge, done: seen && badge === 0 };
  });

  /** เลือกคำนำหน้าไทย → เติมคำนำหน้าอังกฤษให้อัตโนมัติ */
  const changeTitle = (value: string) =>
    setForm((prev) => ({ ...prev, title: value, titleEn: WIZARD_TITLE_TH_TO_EN[value] ?? prev.titleEn }));

  const focusField = (field?: string) => {
    if (!field) return;
    window.setTimeout(() => {
      const el = document.querySelector<HTMLElement>(`[data-field="${field}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el?.querySelector<HTMLElement>('input,select,textarea')?.focus();
    }, 80);
  };

  const goTab = (key: WizardTabKey) => {
    // ไม่เรียงประสบการณ์ตามวันที่อัตโนมัติ — คงลำดับที่ผู้ใช้จัดไว้ (ลาก/เลื่อนขึ้น-ลง)
    setTab(key);
    setTouched((prev) => new Set(prev).add(key));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const next = () => {
    const errors = validateWizardTab(form, tab);
    setTouched((prev) => new Set(prev).add(tab));
    if (errors.length > 0) {
      focusField(errors[0].field);
      return;
    }
    const nextKey = WIZARD_TAB_KEYS[tabIndex + 1];
    if (nextKey) goTab(nextKey);
  };

  const back = () => {
    const prevKey = WIZARD_TAB_KEYS[tabIndex - 1];
    if (prevKey) goTab(prevKey);
  };

  const submit = async () => {
    if (submittingRef.current || saving) return;
    setShowErrors(true);
    setTouched(new Set(WIZARD_TAB_KEYS));
    if (!validation.ok) {
      if (validation.firstTab) setTab(validation.firstTab);
      focusField(validation.firstField);
      return;
    }
    submittingRef.current = true;
    setSaveError(null);
    try {
      const leaderForm = wizardToLeaderForm(form, previewCode, today);
      // ออกจากหน้าเพิ่มข้อมูลหลังบันทึกสำเร็จเท่านั้น — ล้มเหลวจะคงฟอร์มและค่าที่กรอกไว้ครบ
      const saved = await saveLeaderForm(leaderForm);
      /*
        ความเชี่ยวชาญ โซน/ประเทศ/เส้นทาง เก็บคนละที่กับ record หลัก (§15)
        ต้องเขียนด้วย id จริงที่ระบบออกให้ ไม่ใช่ previewCode — ไม่งั้นข้อมูลจะไปผูกกับรหัสที่ไม่มีอยู่
        เขียนหลังบันทึก record สำเร็จแล้วเท่านั้น เพื่อไม่ให้เกิดความเชี่ยวชาญลอยที่ไม่มีเจ้าของ
      */
      const scopes = wizardToExpertiseScopes(form);
      if (scopes.length > 0) saveExpertiseScopes(saved.id, scopes);
      router.push(`/leaders/${saved.id}`);
    } catch (err) {
      setSaveError(saveErrorMessage(err));
    } finally {
      submittingRef.current = false;
    }
  };

  /* ----------------------------- ตัวช่วยภาษา ----------------------------- */
  const setLanguages = (langs: WizardLanguageRow[]) => set('languages', langs);
  const updateLang = (id: string, patch: Partial<WizardLanguageRow>) =>
    setLanguages(form.languages.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  const addLang = () => setLanguages([...form.languages, newLanguageRow('')]);
  const removeLang = (id: string) => setLanguages(form.languages.filter((l) => l.id !== id));

  /** ล้างเฉพาะข้อมูลยอดขาย (ใช้เมื่อยกเลิก "เน้นทำยอด" หรือ "เลือกทั้งหมด" ออก) */
  const clearSales = (): Partial<WizardForm> => ({
    salesAmount: '',
    salesCurrency: '',
    salesCurrencyOther: '',
    salesMonth: '',
    salesDetails: '',
  });

  /** เลือก/ยกเลิกความถนัดแต่ละข้อ — ไม่กระทบข้ออื่น · ยกเลิก sales/other ให้ล้างข้อมูลของข้อนั้น */
  const toggleTourType = (code: string) =>
    setForm((prev) => {
      const has = prev.tourTypes.includes(code);
      const tourTypes = has ? prev.tourTypes.filter((c) => c !== code) : [...prev.tourTypes, code];
      const patch: Partial<WizardForm> = { tourTypes };
      if (has && code === 'sales') Object.assign(patch, clearSales());
      if (has && code === 'other') patch.expertiseOther = '';
      return { ...prev, ...patch };
    });

  /** เลือกทั้งหมด / ยกเลิกทั้งหมด */
  const toggleAllTourTypes = (checked: boolean) =>
    setForm((prev) =>
      checked
        ? { ...prev, tourTypes: [...WIZARD_TOUR_TYPE_CODES] }
        : { ...prev, tourTypes: [], expertiseOther: '', ...clearSales() },
    );

  const err = (field: string) => errByField[field];

  /**
   * ชื่อไทย + ชื่ออังกฤษอยู่ในการ์ด 02 ใบเดียวกัน — ส่วนชื่อไทยแสดงเฉพาะสัญชาติไทย
   * (ต่างชาติ = ซ่อนแต่คง DOM ไว้ ข้อมูลไม่หาย) เลขการ์ดจึงคงที่ 01–03 ไม่ขึ้นกับสัญชาติ
   */
  const isThaiNationality = form.nationality === 'thai';

  return (
    <div className="w-full pb-24">
      {/* หัวเรื่อง + ความคืบหน้า */}
      <div className="mb-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-xl font-bold zego-text sm:text-2xl">เพิ่มหัวหน้าทัวร์ใหม่</h1>
          <Pill tone="blue">
            แท็บที่ {tabIndex + 1} จาก {WIZARD_TAB_KEYS.length}
          </Pill>
        </div>
        <p className="mt-1 text-sm zego-text-tertiary">
          {WIZARD_TABS[tabIndex].label} · กรอกข้อมูลให้ครบทุกแท็บก่อนบันทึก
        </p>

        {/* แถบความคืบหน้า 5 ขั้นตอน */}
        <div className="mt-3 flex gap-1.5" aria-hidden="true">
          {WIZARD_TABS.map((t, i) => (
            <div
              key={t.key}
              className={cx(
                'h-1.5 flex-1 rounded-full transition-colors',
                i < tabIndex ? 'zego-step-bar--success' : i === tabIndex ? 'zego-step-bar--current' : 'zego-step-bar',
              )}
            />
          ))}
        </div>
      </div>

      {/* แถบแท็บ (เลื่อนแนวนอนบนจอเล็ก) */}
      <Tabs items={tabItems} value={tab} onChange={(k) => goTab(k as WizardTabKey)} className="mb-1" />

      {/* สรุปข้อผิดพลาดของแท็บปัจจุบัน */}
      {(() => {
        const tabErrors = visibleErrors.filter((e) => e.tab === tab);
        if (tabErrors.length === 0) return null;
        return (
          <div className="mt-4 rounded-xl border zego-status-bar--danger p-3">
            <p className="flex items-center gap-2 text-sm font-semibold zego-text-danger">
              <Icon name="warning" className="h-4 w-4" />
              กรอกข้อมูลไม่ครบ {tabErrors.length} รายการ
            </p>
            <ul className="mt-1.5 space-y-0.5">
              {tabErrors.slice(0, 6).map((e, i) => (
                <li key={`${e.field}-${i}`} className="text-xs zego-text-danger">
                  • {e.message}
                </li>
              ))}
              {tabErrors.length > 6 && (
                <li className="text-xs zego-text-danger">และอีก {tabErrors.length - 6} รายการ</li>
              )}
            </ul>
          </div>
        );
      })()}

      <div className="mt-4 space-y-4">
        {/* ================= 1. ข้อมูลส่วนตัว ================= */}
        {tab === 'personal' && (
          <>
            {/* ---- ข้อมูลพื้นฐาน — แบ่งเป็น 4 กลุ่มการ์ด ---- */}
            <p className="flex items-center gap-1.5 text-xs zego-text-tertiary">
              <span className="zego-text-danger">*</span>
              ช่องที่มีเครื่องหมายดอกจันสีแดงเป็นข้อมูลที่จำเป็นต้องกรอก
            </p>

            {/* 01 — ข้อมูลระบบและประเภท */}
            <GroupCard
              no="01"
              title="ข้อมูลระบบและประเภท"
              description="รหัสที่ระบบออกให้ สัญชาติ และประเภทการร่วมงาน"
            >
              <PhotoPicker
                photoUrl={form.photoUrl}
                initials={`${form.firstName.slice(0, 1)}${form.lastName.slice(0, 1)}` || '—'}
                color="bg-blue-600"
                accepted={WIZARD_PHOTO_TYPES}
                maxSizeMB={WIZARD_PHOTO_MAX_MB}
                formatsLabel="JPG หรือ PNG"
                onChange={(url) => set('photoUrl', url)}
              />

              <div className="mt-5 grid gap-4 zego-divider-top pt-5 sm:grid-cols-2 lg:grid-cols-3">
                <div data-field="code">
                  <TextInput
                    label="รหัสหัวหน้าทัวร์"
                    required
                    value={previewCode}
                    readOnly
                    disabled
                    hint="ระบบสร้างรหัสให้อัตโนมัติ"
                  />
                </div>
                <div data-field="nationality">
                  <SelectInput
                    label="สัญชาติ"
                    required
                    value={form.nationality}
                    error={err('nationality')}
                    onChange={(e) => set('nationality', e.target.value as WizardNationality)}
                    options={WIZARD_NATIONALITIES.map((n) => ({ value: n.value, label: n.label }))}
                  />
                </div>
                <div data-field="leaderType">
                  {/* ชื่อและค่าชุดเดียวกับทั้งระบบ — เดิมใช้ชื่อเก่า "ประเภทหัวหน้าทัวร์" ที่ซ้ำความหมาย */}
                  <SelectInput
                    label="รูปแบบการร่วมงาน"
                    required
                    placeholder="เลือกรูปแบบการร่วมงาน"
                    value={form.leaderType}
                    error={err('leaderType')}
                    onChange={(e) => set('leaderType', e.target.value as LeaderType | '')}
                    options={WIZARD_LEADER_TYPES.map((t) => ({ value: t.code, label: t.label }))}
                  />
                </div>
              </div>
            </GroupCard>

            {/* 02 — ชื่อ-นามสกุล: ภาษาไทย (เฉพาะสัญชาติไทย) + ภาษาอังกฤษ ในการ์ดเดียว */}
            <GroupCard
              no="02"
              title="ชื่อ-นามสกุล"
              description={isThaiNationality ? 'ภาษาไทยและภาษาอังกฤษ' : 'ภาษาอังกฤษ'}
            >
              {/* ชื่อภาษาไทย — ต่างชาติ = ซ่อนแต่คง DOM ไว้ */}
              <div hidden={!isThaiNationality} className="mb-5 zego-divider-bottom pb-5">
                <NameSubheading title="ชื่อภาษาไทย" description="คำนำหน้า ชื่อ นามสกุล และชื่อเล่นภาษาไทย" />
                <div className={NAME_GRID}>
                  <div data-field="title">
                    <SelectInput
                      label="คำนำหน้า"
                      required
                      disabled={!isThaiNationality}
                      value={form.title}
                      error={err('title')}
                      onChange={(e) => changeTitle(e.target.value)}
                      options={WIZARD_TITLES.map((t) => ({ value: t, label: t }))}
                    />
                  </div>
                  <div data-field="firstName">
                    <TextInput
                      label="ชื่อ"
                      required
                      disabled={!isThaiNationality}
                      lang="th"
                      placeholder="กรอกชื่อภาษาไทย"
                      value={form.firstName}
                      error={err('firstName')}
                      onChange={(e) => set('firstName', e.target.value)}
                    />
                  </div>
                  <div data-field="lastName">
                    <TextInput
                      label="นามสกุล"
                      required
                      disabled={!isThaiNationality}
                      lang="th"
                      placeholder="กรอกนามสกุลภาษาไทย"
                      value={form.lastName}
                      error={err('lastName')}
                      onChange={(e) => set('lastName', e.target.value)}
                    />
                  </div>
                  <div data-field="nickname">
                    <TextInput
                      label="ชื่อเล่น"
                      optional
                      disabled={!isThaiNationality}
                      lang="th"
                      placeholder="ชื่อเล่นภาษาไทย"
                      value={form.nickname}
                      onChange={(e) => set('nickname', e.target.value)}
                    />
                  </div>
                </div>
              </div>

              {/* ชื่อภาษาอังกฤษ (คำนำหน้า / ชื่อ / นามสกุล / ชื่อเล่น) */}
              <NameSubheading title="ชื่อภาษาอังกฤษ" description="ใช้ได้เฉพาะอักษรอังกฤษ ช่องว่าง จุด อัญประกาศเดี่ยว และขีดกลาง" />
              <div className={NAME_GRID}>
                <div data-field="titleEn">
                  <SelectInput
                    label="คำนำหน้า"
                    required
                    value={form.titleEn}
                    error={err('titleEn')}
                    placeholder="เลือก"
                    hint="เติมจากคำนำหน้าไทยอัตโนมัติ"
                    onChange={(e) => set('titleEn', e.target.value)}
                    options={WIZARD_TITLES_EN.map((t) => ({ value: t, label: t }))}
                  />
                </div>
                <div data-field="firstNameEn">
                  <TextInput
                    label="ชื่อ"
                    required
                    lang="en"
                    placeholder="First name"
                    value={form.firstNameEn}
                    error={err('firstNameEn')}
                    onChange={(e) => set('firstNameEn', e.target.value)}
                  />
                </div>
                <div data-field="lastNameEn">
                  <TextInput
                    label="นามสกุล"
                    required
                    lang="en"
                    placeholder="Last name"
                    value={form.lastNameEn}
                    error={err('lastNameEn')}
                    onChange={(e) => set('lastNameEn', e.target.value)}
                  />
                </div>
                <div data-field="nicknameEn">
                  <TextInput
                    label="ชื่อเล่น"
                    optional
                    lang="en"
                    placeholder="Nickname"
                    value={form.nicknameEn}
                    error={err('nicknameEn')}
                    onChange={(e) => set('nicknameEn', e.target.value)}
                  />
                </div>
              </div>
            </GroupCard>

            {/* ข้อมูลส่วนบุคคล — เอกสารประจำตัวเปลี่ยนตามสัญชาติ */}
            <GroupCard
              no="03"
              title="ข้อมูลส่วนบุคคล"
              description={
                isThaiNationality
                  ? 'วันเดือนปีเกิด และเลขบัตรประชาชน'
                  : 'วันเดือนปีเกิด และเลขที่หนังสือเดินทาง'
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div data-field="birthDate">
                  <DateField
                    label="วันเดือนปีเกิด"
                    required
                    max={today}
                    value={form.birthDate}
                    error={err('birthDate')}
                    onChange={(v) => set('birthDate', v)}
                  />
                </div>

                {/* key แยกช่อง เพื่อไม่ให้ค่าของเอกสารประเภทเดิมค้างเมื่อสลับสัญชาติ */}
                {isThaiNationality ? (
                  <div key="doc-nationalId" data-field="nationalId">
                    <TextInput
                      label="เลขบัตรประชาชน"
                      required
                      inputMode="numeric"
                      pattern="[0-9]{13}"
                      maxLength={13}
                      placeholder="กรอกเลขบัตรประชาชน 13 หลัก"
                      hint="13 หลัก · ระบบจะปิดบังเลขก่อนบันทึก (Demo ไม่เก็บเลขจริง)"
                      value={form.nationalId}
                      error={err('nationalId')}
                      onChange={(e) => set('nationalId', e.target.value.replace(/\D/g, '').slice(0, 13))}
                    />
                  </div>
                ) : (
                  <div key="doc-passportNo" data-field="passportNo">
                    <TextInput
                      label="เลขที่หนังสือเดินทาง"
                      required
                      pattern="[A-Za-z0-9]{6,20}"
                      maxLength={20}
                      autoCapitalize="characters"
                      placeholder="Passport number"
                      hint="อักษรอังกฤษหรือตัวเลข 6–20 ตัว · ระบบจะปิดบังเลขก่อนบันทึก"
                      value={form.passportNo}
                      error={err('passportNo')}
                      onChange={(e) =>
                        set('passportNo', e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 20))
                      }
                    />
                  </div>
                )}
              </div>
            </GroupCard>

            {/* ---- ข้อมูลติดต่อ ---- */}
            <Card>
              <CardHeader
                title="ข้อมูลติดต่อ"
                description="เพิ่มช่องทางติดต่อได้หลายรายการ · เลือกรายการหลัก 1 รายการ"
              />
              <div data-field="contacts">
                {err('contacts') && (
                  <p className="mb-3 rounded-lg zego-badge--danger px-3 py-2 text-xs font-medium border">
                    {err('contacts')}
                  </p>
                )}
                <ContactEditor
                  rows={form.contacts}
                  errors={errByField}
                  countries={countries}
                  onChange={(rows) => set('contacts', rows)}
                />
              </div>
            </Card>

            {/* ---- ข้อมูลที่อยู่ ---- */}
            <Card>
              <CardHeader title="ที่อยู่ปัจจุบัน" description="ที่อยู่ที่พักอาศัยจริง" />
              <AddressFields
                address={form.address}
                prefix=""
                errors={errByField}
                geo={geo}
                onChange={setAddr}
              />
            </Card>

            <Card>
              <CardHeader
                title="ที่อยู่ตามบัตรประชาชน"
                description="ใช้กับเอกสารราชการและการทำสัญญา"
              />
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border zego-border-color zego-surface-soft-bg p-3 text-sm zego-text-secondary sm:items-center">
                <input
                  type="checkbox"
                  checked={form.idCardSameAsCurrent}
                  onChange={(e) => toggleSameAsCurrent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--zego-primary-500)] sm:mt-0"
                />
                <span>
                  เหมือนกับที่อยู่ปัจจุบัน
                  <span className="block text-xs zego-text-tertiary sm:inline sm:before:content-['_—_']">
                    ระบบจะคัดลอกข้อมูลให้อัตโนมัติ
                  </span>
                </span>
              </label>

              {form.idCardSameAsCurrent && (
                <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium zego-text-success">
                  <Icon name="check" className="h-3.5 w-3.5" />
                  คัดลอกข้อมูลจากที่อยู่ปัจจุบันแล้ว
                </p>
              )}

              {!form.idCardSameAsCurrent && (
                <div className="mt-4">
                  <AddressFields
                    address={form.idCardAddress}
                    prefix="idCard_"
                    errors={errByField}
                    geo={geo}
                    onChange={setIdAddr}
                  />
                </div>
              )}
            </Card>
          </>
        )}

        {/* ================= 2. ประสบการณ์ทำงาน ================= */}
        {tab === 'experience' && (
          <Card>
            <CardHeader
              title="ประสบการณ์ทำงาน"
              description="เพิ่มได้หลายรายการ · ระบบคำนวณประสบการณ์รวมให้อัตโนมัติ"
            />
            <div data-field="experiences">
              {err('experiences') && (
                <p className="mb-3 rounded-lg zego-badge--danger px-3 py-2 text-xs font-medium border">
                  {err('experiences')}
                </p>
              )}
              <ExperienceEditor
                rows={form.experiences}
                errors={errByField}
                today={today}
                onChange={(rows) => set('experiences', rows)}
              />
            </div>
          </Card>
        )}

        {/* ================= 3. ความสามารถด้านภาษา ================= */}
        {tab === 'language' && (
          <Card>
            <CardHeader
              title="ทักษะด้านภาษา"
              description="ระบุภาษาที่สามารถใช้งาน พร้อมระดับความสามารถ — มาตรฐานเปลี่ยนตามภาษาที่เลือกอัตโนมัติ"
              action={
                <Button size="sm" variant="secondary" icon="plus" onClick={addLang}>
                  เพิ่มภาษา
                </Button>
              }
            />

            <div data-field="languages">
              {err('languages') && (
                <p className="mb-3 rounded-lg zego-badge--danger px-3 py-2 text-xs font-medium border">
                  {err('languages')}
                </p>
              )}

              <LanguageEditor
                rows={form.languages}
                errors={errByField}
                onUpdate={updateLang}
                onRemove={removeLang}
              />
            </div>

            <div className="mt-4">
              <TextArea
                label="รายละเอียดประสบการณ์ใช้ภาษาในการทำงาน"
                optional
                rows={2}
                placeholder="เช่น เคยเป็นล่ามให้กรุ๊ปทัวร์ญี่ปุ่น, บรรยายภาษาอังกฤษให้กรุ๊ป VIP"
                value={form.languageWorkDetail}
                onChange={(e) => set('languageWorkDetail', e.target.value)}
              />
            </div>
          </Card>
        )}

        {/* ================= 4. ความถนัดในการออกทัวร์ ================= */}
        {tab === 'expertise' && (
          <Card>
            <CardHeader
              title="ความถนัดในการออกทัวร์"
              description="เลือกประเภททัวร์ที่ถนัดได้หลายรายการ"
            />

            <div data-field="tourTypes">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium zego-text-secondary">
                  <IndeterminateCheckbox
                    checked={isAllTourTypesSelected(form.tourTypes)}
                    indeterminate={isTourTypesIndeterminate(form.tourTypes)}
                    aria-label="เลือกทั้งหมด"
                    onChange={(e) => toggleAllTourTypes(e.target.checked)}
                    className="h-4 w-4 accent-[var(--zego-primary-500)]"
                  />
                  เลือกทั้งหมด <span className="zego-text-danger">*</span>
                </label>
                <span className="text-xs zego-text-tertiary">
                  เลือกแล้ว {form.tourTypes.length} จาก {WIZARD_TOUR_TYPES.length} รายการ
                </span>
              </div>
              {err('tourTypes') && (
                <p className="mb-2 text-xs font-medium zego-text-danger">{err('tourTypes')}</p>
              )}
              <div role="group" aria-label="ความถนัดในการออกทัวร์" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {WIZARD_TOUR_TYPES.map((t) => {
                  const checked = form.tourTypes.includes(t.code);
                  return (
                    <label
                      key={t.code}
                      className={cx(
                        'flex cursor-pointer items-center gap-2.5 rounded-lg border p-3 text-sm transition-colors',
                        'focus-within:ring-2 focus-within:ring-[var(--zego-focus)]',
                        checked
                          ? 'zego-selected-border zego-selected-tint text-[var(--zego-primary-800)]'
                          : 'zego-border-color zego-text-secondary zego-hover-selected',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTourType(t.code)}
                        className="h-4 w-4 accent-[var(--zego-primary-500)]"
                      />
                      {t.label}
                    </label>
                  );
                })}
              </div>
            </div>

            {/* เงื่อนไข "เน้นทำยอด" */}
            {form.tourTypes.includes('sales') && (
              <div className="mt-4 rounded-xl border zego-badge--info p-4">
                <p className="mb-3 text-sm font-semibold zego-text">
                  ข้อมูลยอดขาย <span className="font-normal zego-text-tertiary">(เน้นทำยอด)</span>
                </p>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div data-field="salesAmount">
                    <TextInput
                      label="ยอดขายสูงสุดที่เคยทำได้"
                      required
                      type="number"
                      min={0}
                      inputMode="numeric"
                      placeholder="เช่น 2500000"
                      value={form.salesAmount}
                      error={err('salesAmount')}
                      onChange={(e) => set('salesAmount', e.target.value)}
                    />
                  </div>
                  <div data-field="salesCurrency">
                    <SelectInput
                      label="สกุลเงิน"
                      required
                      placeholder="เลือกสกุลเงิน"
                      value={form.salesCurrency}
                      error={err('salesCurrency')}
                      onChange={(e) => set('salesCurrency', e.target.value)}
                      options={WIZARD_CURRENCIES.map((c) => ({
                        value: c.code,
                        label: c.code === 'other' ? c.label : `${c.code} — ${c.label}`,
                      }))}
                    />
                  </div>
                  {form.salesCurrency === 'other' && (
                    <div data-field="salesCurrencyOther">
                      <TextInput
                        label="ระบุสกุลเงิน"
                        required
                        placeholder="เช่น AUD"
                        value={form.salesCurrencyOther}
                        error={err('salesCurrencyOther')}
                        onChange={(e) => set('salesCurrencyOther', e.target.value)}
                      />
                    </div>
                  )}
                  <TextInput
                    label="เดือน/ปีที่ทำยอดได้"
                    optional
                    type="month"
                    value={form.salesMonth}
                    onChange={(e) => set('salesMonth', e.target.value)}
                  />
                </div>
                <div className="mt-4">
                  <TextArea
                    label="รายละเอียดผลงาน"
                    optional
                    rows={2}
                    placeholder="เช่น ทัวร์ยุโรป 15 วัน กรุ๊ป VIP 20 ท่าน"
                    value={form.salesDetails}
                    onChange={(e) => set('salesDetails', e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* เงื่อนไข "อื่น ๆ โปรดระบุ" */}
            {form.tourTypes.includes('other') && (
              <div data-field="expertiseOther" className="mt-4">
                <TextInput
                  label="ระบุความถนัดอื่น"
                  required
                  maxLength={WIZARD_EXPERTISE_OTHER_MAX}
                  placeholder="เช่น ทัวร์เดินป่า, ทัวร์ถ่ายภาพ"
                  hint={`ไม่เกิน ${WIZARD_EXPERTISE_OTHER_MAX} ตัวอักษร`}
                  value={form.expertiseOther}
                  error={err('expertiseOther')}
                  onChange={(e) => set('expertiseOther', e.target.value)}
                />
              </div>
            )}

            {/* ประเทศ/เส้นทางที่เชี่ยวชาญ (ลำดับชั้น) */}
            <div data-field="expertiseCountries" className="mt-5 zego-divider-top pt-5">
              <p className="mb-2 text-sm font-semibold zego-text">ประเทศ/เส้นทางที่เชี่ยวชาญ</p>
              <RouteExpertiseEditor
                scope={form.expertiseScope}
                countries={countries}
                routes={routes}
                value={form.expertiseCountries}
                errors={errByField}
                onScopeChange={(scope) => set('expertiseScope', scope)}
                onChange={(next) => set('expertiseCountries', next)}
              />
            </div>

            <div className="mt-4">
              <TextArea
                label="ความถนัดและทักษะเฉพาะเพิ่มเติม"
                optional
                rows={2}
                placeholder="เช่น ถนัดกรุ๊ปสัมมนา, ดูแลผู้สูงอายุ, ปฐมพยาบาลเบื้องต้น"
                value={form.extraSkills}
                onChange={(e) => set('extraSkills', e.target.value)}
              />
            </div>
          </Card>
        )}

        {/* ================= 5. เอกสารประจำตัว ================= */}
        {tab === 'documents' && (
          <Card>
            <CardHeader
              title="เอกสารประจำตัว"
              description={`รองรับไฟล์ JPG, JPEG, PNG และ PDF · ขนาดไม่เกิน ${WIZARD_MAX_FILE_MB} MB ต่อไฟล์`}
            />

            <Callout tone="blue" title="ข้อมูลจากเอกสาร (รองรับ OCR)">
              อัปโหลดรูปหรือ PDF แล้วระบบจะแสดงช่อง <strong>“ข้อมูลจากเอกสาร”</strong> ให้ตรวจสอบ แก้ไข
              และกดยืนยัน — <strong>ยังไม่ได้เชื่อมบริการอ่านเอกสารอัตโนมัติ (OCR)</strong> จึงต้องกรอกข้อมูลเอง
              เมื่อเชื่อมบริการแล้ว ระบบจะเติมข้อมูลให้และทำเครื่องหมายช่องที่ควรตรวจสอบ
            </Callout>

            {/* ด้านหน้าบัตรประชาชน (รายการเดียว) */}
            <div className="mt-4" data-field="idCard">
              <DocumentUploader
                kind="id_card"
                uploadLabel="ด้านหน้าบัตรประชาชน"
                required
                entry={form.idCard}
                countryOptions={countryOptions}
                fileError={err('idCard')}
                fieldError={(fk) => err(docFieldErrorKey('id_card', form.idCard.id, fk))}
                onChange={updateIdCard}
              />
            </div>

            {/* ---- หนังสือเดินทาง (เพิ่มได้หลายเล่ม) ---- */}
            <DocSection
              title="หนังสือเดินทาง"
              addLabel="เพิ่มหนังสือเดินทาง"
              count={form.passports.length}
              onAdd={addPassport}
            >
              {form.passports.map((p, i) => (
                <DocEntryCard
                  key={p.id}
                  title="หนังสือเดินทาง"
                  index={i}
                  onRemove={() =>
                    setDocDelete({
                      message: `ลบหนังสือเดินทาง #${i + 1}? การลบนี้ไม่สามารถย้อนกลับได้`,
                      onConfirm: () => {
                        removePassport(p.id);
                        setDocDelete(null);
                      },
                    })
                  }
                >
                  <DocumentUploader
                    kind="passport"
                    uploadLabel="อัปโหลดหน้าหนังสือเดินทาง"
                    entry={p}
                    countryOptions={countryOptions}
                    fieldError={(fk) => err(docFieldErrorKey('passport', p.id, fk))}
                    onChange={(patch) => updatePassport(p.id, patch)}
                  />
                </DocEntryCard>
              ))}
            </DocSection>

            {/* ---- Visa (เพิ่มได้หลายรายการ) ---- */}
            <DocSection title="Visa" addLabel="เพิ่ม Visa" count={form.visas.length} onAdd={addVisa}>
              {form.visas.map((v, i) => (
                <DocEntryCard
                  key={v.id}
                  title="Visa"
                  index={i}
                  onRemove={() =>
                    setDocDelete({
                      message: `ลบ Visa #${i + 1}? การลบนี้ไม่สามารถย้อนกลับได้`,
                      onConfirm: () => {
                        removeVisa(v.id);
                        setDocDelete(null);
                      },
                    })
                  }
                >
                  <DocumentUploader
                    kind="visa"
                    uploadLabel="อัปโหลดเอกสาร Visa"
                    entry={v}
                    countryOptions={countryOptions}
                    fieldError={(fk) => err(docFieldErrorKey('visa', v.id, fk))}
                    onChange={(patch) => updateVisa(v.id, patch)}
                  />
                </DocEntryCard>
              ))}
            </DocSection>

            {/* ---- บัตรหัวหน้าทัวร์ (เพิ่มได้หลายใบ) ---- */}
            <DocSection
              title="บัตรหัวหน้าทัวร์"
              addLabel="เพิ่มบัตรหัวหน้าทัวร์"
              count={form.tourCards.length}
              onAdd={addTourCard}
            >
              {form.tourCards.map((c, i) => (
                <DocEntryCard
                  key={c.id}
                  title="บัตรหัวหน้าทัวร์"
                  index={i}
                  onRemove={() =>
                    setDocDelete({
                      message: `ลบบัตรหัวหน้าทัวร์ #${i + 1}? การลบนี้ไม่สามารถย้อนกลับได้`,
                      onConfirm: () => {
                        removeTourCard(c.id);
                        setDocDelete(null);
                      },
                    })
                  }
                >
                  <DocumentUploader
                    kind="tour_card"
                    uploadLabel="อัปโหลดรูปหรือเอกสารบัตร"
                    entry={c}
                    countryOptions={countryOptions}
                    fieldError={(fk) => err(docFieldErrorKey('tour_card', c.id, fk))}
                    onChange={(patch) => updateTourCard(c.id, patch)}
                  />
                </DocEntryCard>
              ))}
            </DocSection>


            <ConfirmDialog
              open={docDelete !== null}
              onClose={() => setDocDelete(null)}
              onConfirm={() => docDelete?.onConfirm()}
              tone="danger"
              title="ลบเอกสาร?"
              confirmLabel="ลบรายการนี้"
              message={docDelete?.message ?? ''}
            />
          </Card>
        )}

        {/* ================= 6. เอกสารเพิ่มเติม ================= */}
        {tab === 'additional' && (
          <Card>
            <CardHeader
              title="เอกสารเพิ่มเติม"
              description={`เอกสารอื่น ๆ ของหัวหน้าทัวร์ · รองรับ JPG, JPEG, PNG และ PDF · ไม่เกิน ${WIZARD_MAX_FILE_MB} MB ต่อไฟล์`}
            />

            <Callout tone="blue" title="ข้อมูลจากเอกสาร (รองรับ OCR)">
              อัปโหลดรูปหรือ PDF แล้วระบบจะแสดงช่อง <strong>“ข้อมูลจากเอกสาร”</strong> ให้ตรวจสอบ แก้ไข
              และกดยืนยัน — <strong>ยังไม่ได้เชื่อมบริการอ่านเอกสารอัตโนมัติ (OCR)</strong> จึงต้องกรอกข้อมูลเอง
            </Callout>

            {/* ---- เอกสารประวัติอาชญากรรม ---- */}
            <div className="mt-4" data-field="criminalRecord">
              <p className="mb-2 text-sm font-semibold zego-text">เอกสารประวัติอาชญากรรม</p>
              <DocumentUploader
                kind="criminal_record"
                uploadLabel="อัปโหลดเอกสารประวัติอาชญากรรม"
                entry={form.criminalRecord}
                countryOptions={countryOptions}
                fieldError={(fk) => err(docFieldErrorKey('criminal_record', form.criminalRecord.id, fk))}
                onChange={updateCriminalRecord}
              />
            </div>

            {/* เตรียมโครงสร้างรองรับเอกสารเพิ่มเติมประเภทอื่นในอนาคต */}
            <p className="mt-5 rounded-lg border border-dashed zego-border-color px-4 py-4 text-center text-sm zego-text-tertiary">
              รองรับการเพิ่มประเภทเอกสารอื่นในอนาคต
            </p>

          </Card>
        )}
      </div>

      {/* แถบปุ่มด้านล่าง (ติดขอบล่างบนมือถือ) */}
      <div className="fixed inset-x-0 bottom-0 z-10 zego-divider-top bg-[var(--zego-surface)]/95 backdrop-blur lg:static lg:mt-5 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 px-4 py-3 lg:px-0">
          <Button variant="ghost" onClick={() => router.push('/leaders')} disabled={saving}>
            ยกเลิก
          </Button>

          <div className="flex items-center gap-2">
            {saveError && (
              <span className="inline-flex items-center gap-1 text-xs font-medium zego-text-danger">
                <Icon name="warning" className="h-3.5 w-3.5" />
                {saveError}
              </span>
            )}
            <Button variant="secondary" onClick={back} disabled={saving || tabIndex === 0}>
              ย้อนกลับ
            </Button>
            {!isLast ? (
              <Button variant="primary" icon="chevronRight" onClick={next} disabled={saving}>
                ถัดไป
              </Button>
            ) : (
              <Button variant="success" onClick={submit} loading={saving} disabled={saving}>
                {saving ? 'กำลังบันทึก…' : 'บันทึกข้อมูล'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- ตาราง/การ์ดข้อมูลติดต่อ ------------------------- */

const contactInputCls =
  'w-full rounded-lg border zego-surface-bg px-2 py-1.5 text-sm zego-text shadow-sm ' +
  'focus:outline-none focus:ring-2 focus:ring-[var(--zego-focus)] disabled:bg-[var(--zego-surface-soft)]';

/** สัดส่วนคอลัมน์ตารางติดต่อ (เดสก์ท็อป): ประเภท 24% · ข้อมูล 32% · หลัก 8% · หมายเหตุ 28% · จัดการ 8%
 *  ใช้ minmax(0,…) เพื่อบังคับ min-width:0 ทุกคอลัมน์ (กันล้น/scroll แนวนอน) */
const CONTACT_GRID_COLS =
  'grid-cols-[minmax(0,24fr)_minmax(0,32fr)_minmax(0,8fr)_minmax(0,28fr)_minmax(0,8fr)]';

function ContactEditor({
  rows,
  errors,
  countries,
  onChange,
}: {
  rows: WizardContactRow[];
  errors: Record<string, string>;
  countries: Country[];
  onChange: (rows: WizardContactRow[]) => void;
}) {
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const pendingRow = rows.find((r) => r.id === pendingDelete) ?? null;

  const update = (id: string, patch: Partial<WizardContactRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setPrimary = (id: string) => onChange(setPrimaryContactRow(rows, id));
  const addRow = () => onChange([...rows, newContactRow('mobile')]);
  const doRemove = (id: string) => {
    onChange(removeContactRow(rows, id));
    setPendingDelete(null);
  };
  /** ลบแถว — เหลือแถวเดียวลบไม่ได้ · มีข้อมูลแล้วถามยืนยันก่อน */
  const requestRemove = (row: WizardContactRow) => {
    if (rows.length <= 1) return;
    const hasData =
      row.note.trim() !== '' ||
      (row.type === 'call'
        ? (row.callName ?? '').trim() !== '' || contactRowCallPhone(row).displayPhone.trim() !== ''
        : row.value.trim() !== '');
    if (hasData) setPendingDelete(row.id);
    else doRemove(row.id);
  };

  /** ช่องข้อมูล "โทรศัพท์ (คน Call)" — ใช้ร่วมทั้งตารางและการ์ด */
  const callFields = (row: WizardContactRow) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <TextInput
          label="ชื่อผู้ติดต่อ (คน Call)"
          placeholder="เช่น สมหญิง ใจดี"
          value={row.callName ?? ''}
          onChange={(e) => update(row.id, { callName: e.target.value })}
        />
      </div>
      <div className="sm:col-span-2">
        <PhoneInput
          label="เบอร์โทรศัพท์มือถือ"
          value={contactRowCallPhone(row)}
          countries={countries}
          error={errors[row.id]}
          onChange={(v) => update(row.id, { callPhone: v })}
        />
      </div>
    </div>
  );
  /** กด Enter ในช่องสุดท้ายของแถวสุดท้าย → เพิ่มแถวใหม่ */
  const noteKeyDown = (e: ReactKeyboardEvent, isLastRow: boolean) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (isLastRow) addRow();
    }
  };

  const typeOptions = WIZARD_CONTACT_TYPES.map((t) => ({ value: t.value, label: t.label }));
  const onlyOne = rows.length <= 1;

  return (
    <>
      {/* เดสก์ท็อป (≥1024px): แถวแบบ CSS Grid ตามสัดส่วน · สูงตามเนื้อหา · overflow มองเห็น (ไม่มี scroll ในตัว) */}
      <div className="hidden lg:block">
        {/* หัวคอลัมน์ */}
        <div className={cx('grid gap-3 px-1 pb-2 text-xs font-medium zego-text-tertiary', CONTACT_GRID_COLS)}>
          <div className="min-w-0">ประเภทการติดต่อ</div>
          <div className="min-w-0">ข้อมูลติดต่อ</div>
          <div className="min-w-0 text-center">ติดต่อหลัก</div>
          <div className="min-w-0">หมายเหตุ</div>
          <div className="min-w-0 text-center">จัดการ</div>
        </div>

        <div className="space-y-3">
          {rows.map((row, index) => {
            const rowError = errors[row.id];
            const isCall = row.type === 'call';
            return (
              <div key={row.id}>
                <div className={cx('grid items-start gap-3', CONTACT_GRID_COLS)}>
                  <div className="min-w-0">
                    <select
                      aria-label={`ประเภทการติดต่อ แถวที่ ${index + 1}`}
                      value={row.type}
                      onChange={(e) => update(row.id, { type: e.target.value as WizardContactType })}
                      className={cx(contactInputCls, 'zego-border-color focus:border-[var(--zego-primary-500)]')}
                    >
                      {typeOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="min-w-0">
                    {isCall ? (
                      <p className="py-2 text-xs zego-text-tertiary">
                        กรอกข้อมูลผู้ติดต่อ (คน Call) ด้านล่าง
                      </p>
                    ) : (
                      <>
                        <input
                          aria-label={`ข้อมูลติดต่อ แถวที่ ${index + 1}`}
                          type={contactInputType(row.type)}
                          inputMode={contactInputType(row.type) === 'tel' ? 'tel' : undefined}
                          placeholder={contactPlaceholder(row.type)}
                          value={row.value}
                          onChange={(e) => update(row.id, { value: e.target.value })}
                          className={cx(
                            contactInputCls,
                            rowError ? 'border-[var(--zego-danger)]' : 'zego-border-color focus:border-[var(--zego-primary-500)]',
                          )}
                        />
                        {rowError && (
                          <p className="mt-1 text-xs font-medium zego-text-danger">{rowError}</p>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex min-w-0 justify-center pt-2">
                    <input
                      type="radio"
                      name="wizard-primary-contact"
                      aria-label={`กำหนดเป็นรายการติดต่อหลัก แถวที่ ${index + 1}`}
                      checked={row.isPrimary}
                      onChange={() => setPrimary(row.id)}
                      className="h-4 w-4 accent-[var(--zego-primary-500)]"
                    />
                  </div>
                  <div className="min-w-0">
                    <input
                      aria-label={`หมายเหตุ แถวที่ ${index + 1}`}
                      placeholder="เช่น เบอร์ส่วนตัว"
                      value={row.note}
                      onChange={(e) => update(row.id, { note: e.target.value })}
                      onKeyDown={(e) => noteKeyDown(e, index === rows.length - 1)}
                      className={cx(contactInputCls, 'zego-border-color focus:border-[var(--zego-primary-500)]')}
                    />
                  </div>
                  <div className="flex min-w-0 justify-center pt-1">
                    <button
                      type="button"
                      onClick={() => requestRemove(row)}
                      disabled={onlyOne}
                      aria-label={`ลบช่องทางติดต่อ แถวที่ ${index + 1}`}
                      className="rounded-lg p-1.5 zego-text-tertiary zego-icon-btn--danger disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Icon name="close" className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* รายละเอียดคน Call — อยู่ใต้แถวหลัก เต็มความกว้าง (normal flow ไม่ absolute) */}
                {isCall && (
                  <div className="mt-3 rounded-lg zego-surface-soft-bg p-3 border zego-border-color">
                    {callFields(row)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* แท็บเล็ต/มือถือ (<1024px): การ์ดต่อรายการ (ต่ำกว่า 768px = 1 คอลัมน์) */}
      <div className="space-y-3 lg:hidden">
        {rows.map((row, index) => {
          const rowError = errors[row.id];
          return (
            <div key={row.id} className="rounded-xl border zego-border-color p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold zego-text-tertiary">ช่องทางที่ {index + 1}</span>
                <button
                  type="button"
                  onClick={() => requestRemove(row)}
                  disabled={onlyOne}
                  aria-label={`ลบช่องทางติดต่อ แถวที่ ${index + 1}`}
                  className="rounded-lg p-1 zego-text-tertiary zego-icon-btn--danger disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 space-y-2">
                <label className="block text-xs zego-text-secondary">
                  ประเภทการติดต่อ
                  <select
                    value={row.type}
                    onChange={(e) => update(row.id, { type: e.target.value as WizardContactType })}
                    className={cx(contactInputCls, 'mt-1 zego-border-color focus:border-[var(--zego-primary-500)]')}
                  >
                    {typeOptions.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                {row.type === 'call' ? (
                  <div className="rounded-lg zego-surface-soft-bg p-3 border zego-border-color">
                    {callFields(row)}
                  </div>
                ) : (
                  <label className="block text-xs zego-text-secondary">
                    ข้อมูลติดต่อ
                    <input
                      type={contactInputType(row.type)}
                      inputMode={contactInputType(row.type) === 'tel' ? 'tel' : undefined}
                      placeholder={contactPlaceholder(row.type)}
                      value={row.value}
                      onChange={(e) => update(row.id, { value: e.target.value })}
                      className={cx(
                        contactInputCls,
                        'mt-1',
                        rowError ? 'border-[var(--zego-danger)]' : 'zego-border-color focus:border-[var(--zego-primary-500)]',
                      )}
                    />
                    {rowError && <span className="mt-1 block text-xs font-medium zego-text-danger">{rowError}</span>}
                  </label>
                )}
                <label className="block text-xs zego-text-secondary">
                  หมายเหตุ
                  <input
                    placeholder="เช่น เบอร์ส่วนตัว"
                    value={row.note}
                    onChange={(e) => update(row.id, { note: e.target.value })}
                    onKeyDown={(e) => noteKeyDown(e, index === rows.length - 1)}
                    className={cx(contactInputCls, 'mt-1 zego-border-color focus:border-[var(--zego-primary-500)]')}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm zego-text-secondary">
                  <input
                    type="radio"
                    name="wizard-primary-contact-m"
                    checked={row.isPrimary}
                    onChange={() => setPrimary(row.id)}
                    className="h-4 w-4 accent-[var(--zego-primary-500)]"
                  />
                  กำหนดเป็นรายการติดต่อหลัก
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3">
        <Button size="sm" variant="secondary" icon="plus" onClick={addRow}>
          เพิ่มช่องทางติดต่อ
        </Button>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && doRemove(pendingDelete)}
        tone="danger"
        title="ลบช่องทางติดต่อ?"
        confirmLabel="ลบรายการนี้"
        message={`ลบช่องทางติดต่อ${pendingRow?.value ? ` “${pendingRow.value}”` : ''} — การลบนี้ไม่สามารถย้อนกลับได้`}
      />
    </>
  );
}

/* ---------------------- ตาราง/การ์ดประสบการณ์ทำงาน ---------------------- */

/** จัดรูปแบบวันที่ไทย เช่น "1 มกราคม 2567" (ปี พ.ศ.) */
function formatThaiFullDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso || '—';
  const [, year, month, day] = m;
  return `${Number(day)} ${MONTH_NAMES_TH[Number(month) - 1]} ${Number(year) + 543}`;
}

/** ช่วงเวลา เช่น "1 มกราคม 2565 – 31 ธันวาคม 2566" หรือ "1 มกราคม 2567 – ปัจจุบัน" */
function periodLabel(row: WizardExperienceRow): string {
  const start = row.startDate ? formatThaiFullDate(row.startDate) : '—';
  const end = row.isCurrent ? 'ปัจจุบัน' : row.endDate ? formatThaiFullDate(row.endDate) : '—';
  return `${start} – ${end}`;
}

/** Toggle switch "งานปัจจุบัน" */
function CurrentToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-[var(--zego-success)]' : 'bg-[var(--zego-text-disabled)]',
      )}
    >
      <span
        className={cx(
          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

const EXP_COL = { company: 0, position: 1, start: 2, end: 3 };

function ExperienceEditor({
  rows,
  errors,
  today,
  onChange,
}: {
  rows: WizardExperienceRow[];
  errors: Record<string, string>;
  today: string;
  onChange: (rows: WizardExperienceRow[]) => void;
}) {
  const [pending, setPending] = useState<{ id: string; action: 'clear' | 'delete' } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const detailRow = rows.find((r) => r.id === detailId) ?? null;
  const pendingRow = rows.find((r) => r.id === pending?.id) ?? null;

  const summary = summarizeWizardExperience(rows, today);
  const filledCount = countFilledExperiences(rows);
  const canDelete = rows.length > WIZARD_EXPERIENCE_MIN_ROWS;
  // แสดงตามลำดับที่ผู้ใช้จัดไว้เสมอ (ไม่เรียงตามวันที่อัตโนมัติ)
  const displayed = rows;

  /* สลับลำดับ (ตรรกะร่วมกับหน้าแก้ไขหัวหน้าทัวร์) */
  const { dragId, dragStart, move, indicatorStyle, setRowRef } = useDragReorder(rows, onChange);

  const update = (id: string, patch: Partial<WizardExperienceRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const changeStart = (row: WizardExperienceRow, value: string) =>
    update(row.id, experienceStartPatch(row, value));
  const setCurrent = (id: string, checked: boolean) =>
    onChange(setCurrentExperience(rows, id, checked));
  const addRow = () => onChange([...rows, newExperienceRow()]);

  const menuItems = (row: WizardExperienceRow, index: number): RowMenuItem[] => [
    { label: 'เลื่อนขึ้น', onClick: () => move(row.id, -1), disabled: index === 0 },
    { label: 'เลื่อนลง', onClick: () => move(row.id, 1), disabled: index === rows.length - 1 },
    {
      label: canDelete ? 'ลบรายการ' : 'ล้างข้อมูล',
      onClick: () => requestManage(row),
      danger: true,
    },
  ];

  const focusCell = (r: number, c: number) =>
    gridRef.current?.querySelector<HTMLElement>(`[data-cell="${r}-${c}"]`)?.focus();

  /** เพิ่มแถว หรือโฟกัสแถวว่างที่มีอยู่แทน */
  const addOrFocusEmpty = (col = EXP_COL.company) => {
    const emptyIdx = rows.findIndex((r) => !experienceRowFilled(r));
    if (emptyIdx >= 0) {
      focusCell(emptyIdx, col);
    } else {
      addRow();
      window.setTimeout(() => focusCell(rows.length, col), 0);
    }
  };

  /** คีย์บอร์ดแบบ Excel — Enter/ลูกศรขึ้น-ลง (ช่องข้อความ) · Enter (ช่องวันที่) */
  const gridKey = (e: ReactKeyboardEvent, r: number, c: number, allowArrows: boolean) => {
    if (e.key === 'Enter' || (allowArrows && (e.key === 'ArrowDown' || e.key === 'ArrowUp'))) {
      const target = nextGridCell({ r, c }, e.key, rows.length, EXPERIENCE_GRID_COLS);
      if (!target) return;
      e.preventDefault();
      if (target.addRow) addOrFocusEmpty(c);
      else focusCell(target.r, target.c);
    }
  };

  const requestManage = (row: WizardExperienceRow) => {
    const hasData = experienceRowFilled(row) || experienceHasDetails(row);
    const action: 'clear' | 'delete' = canDelete ? 'delete' : 'clear';
    if (hasData) setPending({ id: row.id, action });
    else if (action === 'delete') doAction(row.id, 'delete');
  };
  const doAction = (id: string, action: 'clear' | 'delete') => {
    if (action === 'delete') onChange(rows.filter((r) => r.id !== id));
    else onChange(rows.map((r) => (r.id === id ? { ...newExperienceRow(), id } : r)));
    setPending(null);
  };

  return (
    <>
      {/* ตาราง Excel — ใช้ความกว้างเนื้อหาเต็ม · แท็บเล็ตเลื่อนแนวนอนภายในตาราง */}
      <div ref={gridRef} className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1040px] table-fixed border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="[&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:border-[var(--zego-border)] [&_th]:bg-[var(--zego-surface-soft)] [&_th]:px-2 [&_th]:py-2 text-left text-xs font-semibold zego-text-secondary">
              <th className="w-14 text-center">สลับลำดับ</th>
              <th className="w-10 text-center">#</th>
              <th>บริษัท/หน่วยงาน</th>
              <th>ตำแหน่ง</th>
              <th className="w-40">วันที่เริ่ม</th>
              <th className="w-40">วันที่สิ้นสุด</th>
              <th className="w-28 text-center">งานปัจจุบัน</th>
              <th className="w-24 text-center">รายละเอียด</th>
              <th className="w-16 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody className="[&_td]:border-b [&_td]:border-[var(--zego-border)] [&_td]:px-2 [&_td]:py-1.5 [&_td]:align-top">
            {displayed.map((row, index) => {
              const rowError = errors[row.id];
              const complete = experienceRowComplete(row);
              const isDragging = dragId === row.id;
              const rowCls = cx(
                'transition-[background-color,box-shadow] duration-150',
                isDragging
                  ? 'bg-[var(--zego-info)]/15'
                  : row.isCurrent
                    ? 'bg-[var(--zego-success)]/10'
                    : editingId === row.id
                      ? 'bg-[var(--zego-info)]/10'
                      : undefined,
              );
              return (
                <tr
                  key={row.id}
                  ref={setRowRef(row.id)}
                  style={indicatorStyle(index)}
                  className={rowCls}
                  onFocus={() => setEditingId(row.id)}
                >
                  <td className="text-center">
                    <div className="flex justify-center">
                      <DragHandle dragging={isDragging} onPointerDown={dragStart(row.id)} />
                    </div>
                  </td>
                  <td className="text-center">
                    <span className="inline-flex flex-col items-center text-xs zego-text-tertiary">
                      {index + 1}
                      {complete && <Icon name="check" className="h-3.5 w-3.5 zego-text-success" />}
                    </span>
                  </td>
                  <td>
                    <input
                      data-cell={`${index}-${EXP_COL.company}`}
                      aria-label={`บริษัท/หน่วยงาน แถวที่ ${index + 1}`}
                      title={rowError}
                      placeholder="ชื่อบริษัทหรือหน่วยงาน"
                      value={row.company}
                      onChange={(e) => update(row.id, { company: e.target.value })}
                      onKeyDown={(e) => gridKey(e, index, EXP_COL.company, true)}
                      className={cx(
                        contactInputCls,
                        rowError ? 'border-[var(--zego-danger)]' : 'zego-border-color focus:border-[var(--zego-primary-500)]',
                      )}
                    />
                    {rowError && <p className="mt-1 text-xs font-medium zego-text-danger">{rowError}</p>}
                  </td>
                  <td>
                    <input
                      data-cell={`${index}-${EXP_COL.position}`}
                      aria-label={`ตำแหน่ง แถวที่ ${index + 1}`}
                      list="wizard-positions"
                      placeholder="เช่น หัวหน้าทัวร์"
                      value={row.position}
                      onChange={(e) => update(row.id, { position: e.target.value })}
                      onKeyDown={(e) => gridKey(e, index, EXP_COL.position, true)}
                      className={cx(contactInputCls, 'zego-border-color focus:border-[var(--zego-primary-500)]')}
                    />
                  </td>
                  <td>
                    <DateInputBase
                      data-cell={`${index}-${EXP_COL.start}`}
                      aria-label={`วันที่เริ่ม แถวที่ ${index + 1}`}
                      value={row.startDate}
                      onChange={(v) => changeStart(row, v)}
                      onKeyDown={(e) => gridKey(e, index, EXP_COL.start, false)}
                      className={cx(contactInputCls, 'zego-border-color focus:border-[var(--zego-primary-500)]')}
                    />
                  </td>
                  <td>
                    {row.isCurrent ? (
                      <span className="inline-flex items-center gap-1 rounded-lg zego-badge--success px-2.5 py-1.5 text-xs font-medium border">
                        ถึงปัจจุบัน
                      </span>
                    ) : (
                      <DateInputBase
                        data-cell={`${index}-${EXP_COL.end}`}
                        aria-label={`วันที่สิ้นสุด แถวที่ ${index + 1}`}
                        disabled={!row.startDate}
                        min={row.startDate || undefined}
                        value={row.endDate ?? ''}
                        onChange={(v) => update(row.id, { endDate: v || null })}
                        onKeyDown={(e) => gridKey(e, index, EXP_COL.end, false)}
                        className={cx(contactInputCls, 'zego-border-color focus:border-[var(--zego-primary-500)] disabled:cursor-not-allowed')}
                      />
                    )}
                  </td>
                  <td className="text-center">
                    <div className="inline-flex flex-col items-center gap-0.5">
                      <CurrentToggle
                        checked={row.isCurrent}
                        label={`งานปัจจุบัน แถวที่ ${index + 1}`}
                        onChange={(checked) => setCurrent(row.id, checked)}
                      />
                      <span className={cx('text-[10px] font-medium', row.isCurrent ? 'zego-text-success' : 'zego-text-tertiary')}>
                        {row.isCurrent ? 'ปัจจุบัน' : 'สิ้นสุดแล้ว'}
                      </span>
                    </div>
                  </td>
                  <td className="text-center">
                    <button
                      type="button"
                      onClick={() => setDetailId(row.id)}
                      aria-label={`แก้ไขรายละเอียด แถวที่ ${index + 1}`}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium zego-text-info border zego-border-color hover:bg-[var(--zego-info)]/10"
                    >
                      <Icon name="edit" className="h-3.5 w-3.5" />
                      {experienceHasDetails(row) ? 'แก้ไข' : 'เพิ่ม'}
                    </button>
                  </td>
                  <td className="text-center">
                    <div className="flex justify-center">
                      <RowMenu items={menuItems(row, index)} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* มือถือ: การ์ด */}
      <div className="space-y-3 md:hidden">
        {displayed.map((row, index) => {
          const rowError = errors[row.id];
          const complete = experienceRowComplete(row);
          const isDragging = dragId === row.id;
          return (
            <div
              key={row.id}
              ref={setRowRef(row.id)}
              style={indicatorStyle(index)}
              className={cx(
                'rounded-xl border p-3 transition-[background-color,box-shadow] duration-150',
                isDragging
                  ? 'border-[var(--zego-info)] bg-[var(--zego-info)]/15 ring-2 ring-[var(--zego-info)]/30'
                  : row.isCurrent
                    ? 'border-[var(--zego-success)] bg-[var(--zego-success)]/10'
                    : 'zego-border-color',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-xs font-semibold zego-text-tertiary">
                  <DragHandle dragging={isDragging} onPointerDown={dragStart(row.id)} />
                  ประสบการณ์ที่ {index + 1}
                  {complete && <Icon name="check" className="h-3.5 w-3.5 zego-text-success" />}
                  {row.isCurrent && (
                    <span className="rounded zego-badge--success px-1.5 py-0.5 text-[10px] font-medium">
                      ปัจจุบัน
                    </span>
                  )}
                </span>
                <RowMenu items={menuItems(row, index)} />
              </div>
              <div className="mt-2 space-y-2">
                <label className="block text-xs zego-text-secondary">
                  บริษัท/หน่วยงาน
                  <input
                    placeholder="ชื่อบริษัทหรือหน่วยงาน"
                    value={row.company}
                    onChange={(e) => update(row.id, { company: e.target.value })}
                    className={cx(
                      contactInputCls,
                      'mt-1',
                      rowError ? 'border-[var(--zego-danger)]' : 'zego-border-color focus:border-[var(--zego-primary-500)]',
                    )}
                  />
                  {rowError && <span className="mt-1 block text-xs font-medium zego-text-danger">{rowError}</span>}
                </label>
                <label className="block text-xs zego-text-secondary">
                  ตำแหน่ง
                  <input
                    list="wizard-positions"
                    placeholder="เช่น หัวหน้าทัวร์"
                    value={row.position}
                    onChange={(e) => update(row.id, { position: e.target.value })}
                    className={cx(contactInputCls, 'mt-1 zego-border-color focus:border-[var(--zego-primary-500)]')}
                  />
                </label>
                <div className="grid grid-cols-1 gap-2">
                  <label className="block text-xs zego-text-secondary">
                    วันที่เริ่ม
                    <DateInputBase
                      value={row.startDate}
                      onChange={(v) => changeStart(row, v)}
                      className={cx(contactInputCls, 'mt-1 zego-border-color focus:border-[var(--zego-primary-500)]')}
                    />
                  </label>
                  <label className="block text-xs zego-text-secondary">
                    วันที่สิ้นสุด
                    {row.isCurrent ? (
                      <span className="mt-1 inline-flex items-center gap-1 rounded-lg zego-badge--success px-2.5 py-1.5 text-sm font-medium border">
                        ถึงปัจจุบัน
                      </span>
                    ) : (
                      <DateInputBase
                        disabled={!row.startDate}
                        min={row.startDate || undefined}
                        value={row.endDate ?? ''}
                        onChange={(v) => update(row.id, { endDate: v || null })}
                        className={cx(
                          contactInputCls,
                          'mt-1 zego-border-color focus:border-[var(--zego-primary-500)] disabled:cursor-not-allowed',
                        )}
                      />
                    )}
                  </label>
                </div>
                <div className="flex items-center gap-2 text-sm zego-text-secondary">
                  <CurrentToggle
                    checked={row.isCurrent}
                    label={`งานปัจจุบัน แถวที่ ${index + 1}`}
                    onChange={(checked) => setCurrent(row.id, checked)}
                  />
                  <span>{row.isCurrent ? 'งานปัจจุบัน' : 'สิ้นสุดแล้ว'}</span>
                </div>
                <Button size="sm" variant="secondary" icon="edit" onClick={() => setDetailId(row.id)}>
                  {experienceHasDetails(row) ? 'แก้ไขรายละเอียด' : 'เพิ่มรายละเอียด'}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      {/* รายการตัวอย่างตำแหน่ง (datalist ใช้ร่วมกันทุกแถว) */}
      <datalist id="wizard-positions">
        {WIZARD_POSITIONS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" icon="plus" onClick={() => addOrFocusEmpty()}>
          เพิ่มประสบการณ์ทำงาน
        </Button>
        <span className="text-sm font-medium zego-text-secondary">
          กรอกแล้ว {filledCount} รายการ ·{' '}
          <span className="zego-text-tertiary">ประสบการณ์รวม</span>{' '}
          <span className="zego-text-info">{summary.totalMonths > 0 ? summary.label : '—'}</span>
        </span>
      </div>

      {/* Modal รายละเอียดของแถว */}
      {detailRow && (
        <ExperienceDetailModal
          row={detailRow}
          onClose={() => setDetailId(null)}
          onChange={(patch) => update(detailRow.id, patch)}
        />
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => pending && doAction(pending.id, pending.action)}
        tone="danger"
        title={pending?.action === 'delete' ? 'ลบประสบการณ์ทำงาน?' : 'ล้างข้อมูลแถวนี้?'}
        confirmLabel={pending?.action === 'delete' ? 'ลบรายการนี้' : 'ล้างข้อมูล'}
        message={`${pending?.action === 'delete' ? 'ลบ' : 'ล้างข้อมูล'}ประสบการณ์${
          pendingRow?.company ? ` ที่ “${pendingRow.company}”` : ''
        } — การดำเนินการนี้ไม่สามารถย้อนกลับได้`}
      />
    </>
  );
}

function ExperienceDetailModal({
  row,
  onClose,
  onChange,
}: {
  row: WizardExperienceRow;
  onClose: () => void;
  onChange: (patch: Partial<WizardExperienceRow>) => void;
}) {
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="รายละเอียดประสบการณ์"
      description={`${row.company || 'ประสบการณ์ทำงาน'} · ${periodLabel(row)}`}
      footer={
        <div className="flex w-full justify-end">
          <Button variant="primary" onClick={onClose}>
            เสร็จสิ้น
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <TextArea
          label="หน้าที่รับผิดชอบ"
          optional
          rows={2}
          placeholder="เช่น ดูแลกรุ๊ปทัวร์ วางแผนการเดินทาง ประสานงานร้านอาหาร"
          value={row.responsibilities}
          onChange={(e) => onChange({ responsibilities: e.target.value })}
        />
        <TextArea
          label="เส้นทางทัวร์ที่เคยดูแล"
          optional
          rows={2}
          placeholder="เช่น ญี่ปุ่น (โตเกียว–โอซาก้า), เกาหลีใต้ (โซล)"
          value={row.routes}
          onChange={(e) => onChange({ routes: e.target.value })}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput
            label="ประเทศ / ภูมิภาค"
            optional
            placeholder="เช่น เอเชียตะวันออก"
            value={row.region}
            onChange={(e) => onChange({ region: e.target.value })}
          />
          <TextInput
            label="จำนวนลูกทัวร์โดยประมาณ"
            optional
            inputMode="numeric"
            placeholder="เช่น 500"
            value={row.paxApprox}
            onChange={(e) => onChange({ paxApprox: e.target.value })}
          />
        </div>
        <TextArea
          label="ผลงานที่เกี่ยวข้อง"
          optional
          rows={2}
          placeholder="เช่น รางวัลหัวหน้าทัวร์ดีเด่น, คะแนนความพึงพอใจเฉลี่ย 4.9"
          value={row.achievements}
          onChange={(e) => onChange({ achievements: e.target.value })}
        />
      </div>
    </Modal>
  );
}

/* --------------------- ประเทศ/เส้นทางที่เชี่ยวชาญ (ลำดับชั้น) --------------------- */

/** ธงจากรหัสประเทศ เช่น C-JP → 🇯🇵 */
function flagOf(countryId: string): string {
  const code = countryId.replace(/^C-/, '');
  if (code.length !== 2) return '🏳️';
  return String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.toUpperCase().charCodeAt(0) - 65));
}

/** ไฮไลต์ส่วนของข้อความที่ตรงกับคำค้น */
function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (q.length < 2) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="rounded zego-badge--warning px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

/**
 * แปลง master TourRoute เป็น WizardRoute (สนามบิน)
 * เชื่อม Airport Master ด้วย IATA เพื่อได้ชื่อเต็ม + ชื่อเมือง → ใช้ค้นหาด้วยชื่อเมือง (ไทย/อังกฤษ) ได้
 */
function toWizardRoute(r: TourRoute): WizardRoute {
  const m = r.routeType === 'airport' ? airportByIata(r.code) : undefined;
  return {
    id: r.id,
    countryCode: r.countryId,
    iataCode: r.code ?? '',
    nameTh: m?.nameTh ?? r.nameTh,
    nameEn: m?.nameEn ?? r.nameEn ?? '',
    keywords: [r.code, m?.nameEn ?? r.nameEn, m?.cityTh, m?.cityEn].filter(Boolean) as string[],
  };
}

/** ชื่อเมือง (ไทย/อังกฤษ) ของสนามบินจาก Airport Master — ใช้แสดงผลในรูปแบบ NRT — Narita (Tokyo) */
function airportCity(iata: string): { th: string; en: string } {
  const m = airportByIata(iata);
  return { th: m?.cityTh ?? '', en: m?.cityEn ?? '' };
}

/** ตำแหน่งของ dropdown (fixed) ที่ยึดกับกล่องควบคุม — ใช้ portal ให้ไม่ถูก container ตัด */
interface DropdownRect {
  top: number;
  left: number;
  width: number;
}

/**
 * Searchable Multi-select Dropdown เลือกสนามบิน/จุดหมายปลายทางของประเทศหนึ่ง
 *  - คลิกช่อง → เปิดรายการสนามบินของประเทศนั้นทันที (ไม่ต้องพิมพ์)
 *  - พิมพ์ค้นหาด้วยรหัส IATA / ชื่อเมือง / ชื่อสนามบิน (ไทย+อังกฤษ) — กรองทันที
 *  - แสดงรูปแบบ `NRT — Narita Intl (Tokyo)` · ติ๊กถูกหน้ารายการที่เลือก · เลือกซ้ำไม่ได้
 *  - รายการที่เลือกแสดงเป็น chip พร้อมปุ่ม × · เลือกแล้วล้างคำค้นแต่คง dropdown ไว้เลือกต่อ
 *  - คีย์บอร์ด: ↑/↓ เลื่อน · Enter สลับเลือก · Esc ปิด · คลิกนอกกรอบปิด
 *  - dropdown ใช้ portal (z สูง) จึงลอยเหนือส่วนอื่นและไม่ถูก Accordion/สกอลล์ตัด
 */
function RouteMultiSelect({
  countryCode,
  pool,
  selected,
  error,
  placeholder,
  onChange,
}: {
  countryCode: string;
  pool: WizardRoute[];
  selected: WizardRoute[];
  error?: string;
  placeholder?: string;
  onChange: (routes: WizardRoute[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [rect, setRect] = useState<DropdownRect | null>(null);
  const listboxId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const ulRef = useRef<HTMLUListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedIds = useMemo(() => new Set(selected.map((r) => r.id)), [selected]);

  /** กรองด้วยคำค้น (ว่าง = แสดงทั้งหมด) — รายการที่เลือกแล้วยังคงอยู่พร้อมติ๊กถูก */
  const q = query.trim();
  const results = useMemo(() => {
    const term = q.toLowerCase();
    if (!term) return pool;
    return pool.filter((r) =>
      [r.iataCode, r.nameTh, r.nameEn, ...r.keywords].join(' ').toLowerCase().includes(term),
    );
  }, [pool, q]);

  const canAddCustom =
    q.length >= 2 &&
    !pool.some(
      (r) => r.nameTh.toLowerCase() === q.toLowerCase() || r.iataCode.toLowerCase() === q.toLowerCase(),
    ) &&
    !isDuplicateRouteName(selected, q);
  const optionCount = results.length + (canAddCustom ? 1 : 0);

  /* ยึดตำแหน่ง dropdown กับกล่อง และตามสกอลล์/รีไซซ์ (ใช้ fixed + portal) */
  useEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = boxRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setRect({ top: r.bottom + 4, left: r.left, width: r.width });
    };
    reposition();
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open]);

  /* คลิกนอกกรอบ (ทั้งกล่องและ dropdown ใน portal) → ปิด */
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!boxRef.current?.contains(t) && !listRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  /* เลื่อนรายการที่ไฮไลต์ให้อยู่ในมุมมองเมื่อใช้คีย์บอร์ด */
  useEffect(() => {
    if (!open) return;
    ulRef.current?.children[highlight]?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const toggle = (route: WizardRoute) => {
    if (selectedIds.has(route.id)) {
      onChange(selected.filter((r) => r.id !== route.id));
    } else {
      if (isDuplicateRouteName(selected, route.nameTh)) return;
      onChange([...selected, route]);
    }
    setQuery(''); // ล้างคำค้นหลังเลือก แต่คง dropdown ไว้เลือกต่อ
    setHighlight(0);
    inputRef.current?.focus();
  };
  const addCustom = () => {
    if (!canAddCustom) return;
    toggle(makeCustomRoute(countryCode, q));
  };
  const remove = (id: string) => onChange(selected.filter((r) => r.id !== id));

  const chooseIndex = (i: number) => {
    if (i < results.length) toggle(results[i]);
    else if (canAddCustom) addCustom();
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && query === '' && selected.length > 0) {
      remove(selected[selected.length - 1].id);
      return;
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (optionCount === 0) return;
      setHighlight((c) => (c + (e.key === 'ArrowDown' ? 1 : -1) + optionCount) % optionCount);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (optionCount > 0) chooseIndex(Math.min(highlight, optionCount - 1));
      return;
    }
    if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        e.nativeEvent.stopImmediatePropagation();
        setOpen(false);
      }
    }
  };

  /** รูปแบบแสดงผลหลัก: `NRT — Narita Intl (Tokyo)` (custom → ชื่อที่กรอก) */
  const primaryLabel = (r: WizardRoute) => {
    if (!r.iataCode || r.isCustom) return r.nameTh || r.iataCode;
    const cityEn = airportCity(r.iataCode).en;
    return `${r.iataCode} — ${r.nameEn || r.nameTh}${cityEn ? ` (${cityEn})` : ''}`;
  };
  const thaiLabel = (r: WizardRoute) => {
    if (r.isCustom) return '';
    const cityTh = airportCity(r.iataCode).th;
    return [r.nameTh, cityTh].filter(Boolean).join(' · ');
  };

  return (
    <div className="relative">
      <div
        ref={boxRef}
        className={cx(
          'flex flex-wrap items-center gap-1.5 rounded-lg border zego-surface-bg px-2 py-1.5 text-sm shadow-sm focus-within:ring-2 focus-within:ring-[var(--zego-focus)]',
          error ? 'border-[var(--zego-danger)]' : 'zego-border-color focus-within:border-[var(--zego-primary-500)]',
        )}
        onClick={() => {
          setOpen(true);
          inputRef.current?.focus();
        }}
      >
        {selected.map((r) => (
          <span
            key={r.id}
            title={`${r.iataCode ? r.iataCode + ' · ' : ''}${r.nameEn || r.nameTh}`}
            className={cx(
              'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium',
              r.isCustom ? 'zego-badge--warning border' : 'zego-selected-tint text-[var(--zego-primary-800)]',
            )}
          >
            {r.iataCode || r.nameTh}
            {r.isCustom && <span className="rounded bg-[var(--zego-warning)] px-1 text-[9px] text-white">รอตรวจสอบ</span>}
            <button
              type="button"
              aria-label={`ลบสนามบิน ${r.iataCode || r.nameTh}`}
              onClick={(e) => {
                e.stopPropagation();
                remove(r.id);
              }}
              className="text-current hover:text-[var(--zego-danger)]"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label="ค้นหาสนามบิน"
          value={query}
          placeholder={selected.length ? 'ค้นหาเพิ่ม…' : placeholder ?? 'ค้นหาด้วยรหัส IATA ชื่อเมือง หรือชื่อสนามบิน'}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-[8rem] flex-1 border-0 bg-transparent px-1 py-0.5 text-sm focus:outline-none"
        />
        <Icon name="chevronDown" className="h-4 w-4 shrink-0 zego-text-tertiary" />
      </div>

      {open &&
        rect &&
        createPortal(
          <div
            ref={listRef}
            style={{ position: 'fixed', top: rect.top, left: rect.left, width: rect.width, zIndex: 50 }}
            className="max-h-72 overflow-auto rounded-lg border zego-border-color zego-surface-bg py-1 shadow-lg"
          >
            <ul id={listboxId} ref={ulRef} role="listbox" aria-label="รายการสนามบิน/จุดหมายปลายทาง">
              {results.map((r, i) => {
                const isSel = selectedIds.has(r.id);
                const th = thaiLabel(r);
                return (
                  <li
                    key={r.id}
                    role="option"
                    aria-selected={isSel}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => toggle(r)}
                    onMouseEnter={() => setHighlight(i)}
                    className={cx(
                      'flex cursor-pointer items-start gap-2 px-3 py-1.5 text-sm',
                      i === highlight ? 'zego-menu-item--selected' : '',
                    )}
                  >
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {isSel && <Icon name="check" className="h-4 w-4 text-[var(--zego-primary-700)]" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cx('block', isSel ? 'font-semibold text-[var(--zego-primary-800)]' : 'font-medium zego-text')}>
                        <HighlightText text={primaryLabel(r)} query={q} />
                      </span>
                      {th && (
                        <span className="block text-xs zego-text-tertiary">
                          <HighlightText text={th} query={q} />
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}

              {canAddCustom && (
                <li
                  role="option"
                  aria-selected={highlight === results.length}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={addCustom}
                  onMouseEnter={() => setHighlight(results.length)}
                  className={cx(
                    'flex cursor-pointer items-center gap-1 px-3 py-1.5 text-sm',
                    highlight === results.length ? 'zego-menu-item--selected' : '',
                  )}
                >
                  <Icon name="plus" className="h-3.5 w-3.5 zego-text-success" />
                  เพิ่ม “{q}” <span className="text-xs zego-text-tertiary">(รอตรวจสอบ)</span>
                </li>
              )}

              {results.length === 0 && !canAddCustom && (
                <li className="px-3 py-2 text-sm zego-text-tertiary">ไม่พบสนามบินที่ค้นหา</li>
              )}
            </ul>
          </div>,
          document.body,
        )}

      {error && <p className="mt-1 text-xs font-medium zego-text-danger">{error}</p>}
    </div>
  );
}

/* ---- ตัวสร้างเส้นทางบินจากสนามบินที่เลือก (ไม่บังคับ) ---- */
function FlightRouteBuilder({
  airports,
  routes,
  onChange,
}: {
  airports: WizardRoute[];
  routes: WizardFlightRoute[];
  onChange: (next: WizardFlightRoute[]) => void;
}) {
  // สนามบินที่ถูกลาก: { เส้นทาง, ตำแหน่ง }
  const [drag, setDrag] = useState<{ routeId: string; index: number } | null>(null);

  const codeOf = (a: WizardRoute) => a.iataCode || a.nameTh;
  const nameOf = (code: string) => {
    const a = airports.find((x) => codeOf(x) === code);
    return a ? a.nameEn || a.nameTh : '';
  };

  const patch = (id: string, airportCodes: string[]) =>
    onChange(routes.map((r) => (r.id === id ? { ...r, airportCodes } : r)));
  const addRoute = () => onChange([...routes, newFlightRoute()]);
  const removeRoute = (id: string) => onChange(routes.filter((r) => r.id !== id));
  const appendAirport = (route: WizardFlightRoute, code: string) => {
    if (!code || !canAppendAirport(route.airportCodes, code)) return;
    patch(route.id, [...route.airportCodes, code]);
  };
  const removeAirport = (route: WizardFlightRoute, index: number) =>
    patch(
      route.id,
      route.airportCodes.filter((_, i) => i !== index),
    );
  const moveAirport = (route: WizardFlightRoute, from: number, to: number) =>
    patch(route.id, moveItem(route.airportCodes, from, to));

  if (airports.length === 0) {
    return (
      <div className="rounded-lg border border-dashed zego-border-color zego-surface-soft-bg p-3 text-xs zego-text-tertiary">
        เลือกสนามบินด้านบนก่อน จึงจะสร้างเส้นทางบินได้ (ไม่บังคับ)
      </div>
    );
  }

  return (
    <div className="rounded-lg border zego-border-color zego-surface-bg p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold zego-text-secondary">
            เส้นทางบิน <span className="font-normal zego-text-tertiary">(ไม่บังคับ)</span>
          </p>
          <p className="text-[11px] zego-text-tertiary">สร้างเส้นทางต่อเนื่องจากสนามบินที่เลือก เช่น BKK → NRT → CTS</p>
        </div>
        <button
          type="button"
          onClick={addRoute}
          className="inline-flex shrink-0 items-center gap-1 rounded-lg border zego-badge--info px-2 py-1 text-xs font-medium"
        >
          <Icon name="plus" className="h-3.5 w-3.5" /> เพิ่มเส้นทางบิน
        </button>
      </div>

      {routes.length === 0 ? (
        <p className="text-[11px] zego-text-tertiary">ยังไม่มีเส้นทางบิน</p>
      ) : (
        <div className="space-y-2.5">
          {routes.map((route, ri) => {
            const valid = isFlightRouteValid(route);
            return (
              <div key={route.id} className="rounded-lg zego-surface-soft-bg p-2.5 border zego-border-color">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-xs font-semibold zego-text">
                    {route.airportCodes.length ? flightRoutePreview(route.airportCodes) : `เส้นทางที่ ${ri + 1}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeRoute(route.id)}
                    aria-label="ลบเส้นทางบิน"
                    className="shrink-0 rounded p-0.5 zego-text-tertiary zego-icon-btn--danger"
                  >
                    <Icon name="close" className="h-3.5 w-3.5" />
                  </button>
                </div>

                {route.airportCodes.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    {route.airportCodes.map((code, i) => (
                      <Fragment key={i}>
                        <span
                          draggable
                          onDragStart={() => setDrag({ routeId: route.id, index: i })}
                          onDragEnd={() => setDrag(null)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={() => {
                            if (drag && drag.routeId === route.id) moveAirport(route, drag.index, i);
                            setDrag(null);
                          }}
                          title={nameOf(code)}
                          className={cx(
                            'inline-flex cursor-grab items-center gap-1 rounded-md zego-surface-bg px-1.5 py-0.5 text-xs font-semibold zego-text border zego-border-color active:cursor-grabbing',
                            drag?.routeId === route.id && drag.index === i && 'opacity-40',
                          )}
                        >
                          <span className="select-none zego-text-disabled">⋮⋮</span>
                          {code}
                          <button
                            type="button"
                            onClick={() => moveAirport(route, i, i - 1)}
                            disabled={i === 0}
                            aria-label="เลื่อนซ้าย"
                            className="zego-text-tertiary enabled:hover:text-[var(--zego-info)] disabled:opacity-30"
                          >
                            ‹
                          </button>
                          <button
                            type="button"
                            onClick={() => moveAirport(route, i, i + 1)}
                            disabled={i === route.airportCodes.length - 1}
                            aria-label="เลื่อนขวา"
                            className="zego-text-tertiary enabled:hover:text-[var(--zego-info)] disabled:opacity-30"
                          >
                            ›
                          </button>
                          <button
                            type="button"
                            onClick={() => removeAirport(route, i)}
                            aria-label={`ลบ ${code} ออกจากเส้นทาง`}
                            className="zego-text-tertiary hover:text-[var(--zego-danger)]"
                          >
                            ×
                          </button>
                        </span>
                        {i < route.airportCodes.length - 1 && <span className="zego-text-tertiary">→</span>}
                      </Fragment>
                    ))}
                  </div>
                )}

                <div className="mt-2 flex items-center gap-2">
                  <select
                    aria-label="เพิ่มสนามบินเข้าเส้นทาง"
                    value=""
                    onChange={(e) => appendAirport(route, e.target.value)}
                    className="rounded-lg border zego-border-color zego-surface-bg px-2 py-1 text-xs zego-text-secondary focus:border-[var(--zego-primary-500)] focus:outline-none"
                  >
                    <option value="">+ เพิ่มสนามบิน…</option>
                    {airports.map((a) => {
                      const code = codeOf(a);
                      return (
                        <option key={a.id} value={code} disabled={!canAppendAirport(route.airportCodes, code)}>
                          {code} — {a.nameEn || a.nameTh}
                        </option>
                      );
                    })}
                  </select>
                  {!valid && route.airportCodes.length > 0 && (
                    <span className="text-[11px] zego-text-warning">ต้องมีอย่างน้อย 2 สนามบิน</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RouteExpertiseEditor({
  scope,
  countries,
  routes,
  value,
  errors,
  onScopeChange,
  onChange,
}: {
  scope: ExpertiseScope;
  countries: Country[];
  routes: TourRoute[];
  value: WizardCountryExpertise[];
  errors: Record<string, string>;
  onScopeChange: (scope: ExpertiseScope) => void;
  onChange: (next: WizardCountryExpertise[]) => void;
}) {
  const [confirm, setConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);

  const activeCountries = useMemo(() => countries.filter((c) => c.isActive), [countries]);
  /** สนามบิน (WizardRoute) ของประเทศหนึ่ง — เฉพาะ routeType = airport */
  const poolFor = (countryId: string): WizardRoute[] =>
    routes
      .filter((r) => r.countryId === countryId && r.isActive && r.routeType === 'airport')
      .map(toWizardRoute);

  const update = (id: string, patch: Partial<WizardCountryExpertise>) =>
    onChange(value.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  /** เพิ่มประเทศ → สร้างการ์ดอัตโนมัติ (กันซ้ำ) */
  const addCountry = (country: Country | null) => {
    if (!country || isDuplicateCountry(value, country.id)) return;
    onChange([...value, newCountryExpertise(country)]);
  };

  const removeCountry = (row: WizardCountryExpertise) => {
    const doRemove = () => {
      onChange(value.filter((c) => c.id !== row.id));
      setConfirm(null);
    };
    if (row.routeScope === 'selected_routes' && row.routes.length > 0) {
      setConfirm({
        message: 'การลบประเทศนี้จะลบเส้นทางที่เลือกไว้ทั้งหมด ต้องการดำเนินการต่อหรือไม่',
        onConfirm: doRemove,
      });
    } else doRemove();
  };

  const changeRouteScope = (row: WizardCountryExpertise, next: CountryRouteScope) => {
    if (next === row.routeScope) return;
    if (next === 'all_routes' && row.routes.length > 0) {
      setConfirm({
        message: 'เปลี่ยนเป็น "ทุกเส้นทางในประเทศ" จะล้างเส้นทางที่เลือกไว้ ต้องการดำเนินการต่อหรือไม่',
        onConfirm: () => {
          update(row.id, { routeScope: next, routes: [] });
          setConfirm(null);
        },
      });
    } else {
      update(row.id, { routeScope: next });
    }
  };

  const requestAllCountries = () => {
    const apply = () => {
      onScopeChange('all_countries');
      onChange([]);
      setConfirm(null);
    };
    if (value.length > 0) {
      setConfirm({
        message: 'เปลี่ยนเป็น "ทุกประเทศ ทุกเส้นทาง" จะล้างประเทศที่เลือกไว้ ต้องการดำเนินการต่อหรือไม่',
        onConfirm: apply,
      });
    } else onScopeChange('all_countries');
  };

  const availableCountries = activeCountries.filter((c) => !isDuplicateCountry(value, c.id));
  const popular = WIZARD_POPULAR_COUNTRY_CODES.map((code) =>
    activeCountries.find((c) => c.code === code),
  ).filter((c): c is Country => Boolean(c));

  const specificRouteCount = countSelectedRoutes(value);

  const scopeCard = (active: boolean, title: string, desc: string, onSelect: () => void) => (
    <label
      className={cx(
        'flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors',
        active ? 'zego-selected-border zego-selected-tint' : 'zego-border-color zego-hover-selected',
      )}
    >
      <input type="radio" name="expertise-scope" checked={active} onChange={onSelect} className="mt-0.5 h-4 w-4 accent-[var(--zego-primary-500)]" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold zego-text">{title}</span>
        <span className="mt-0.5 block text-xs zego-text-tertiary">{desc}</span>
      </span>
    </label>
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        {scopeCard(
          scope === 'all_countries',
          'ทุกประเทศ ทุกเส้นทาง',
          'สามารถดูแลทัวร์ได้ทุกประเทศและทุกเส้นทาง',
          requestAllCountries,
        )}
        {scopeCard(
          scope === 'selected_countries',
          'เลือกเฉพาะประเทศ',
          'ระบุประเทศและเส้นทางที่มีความเชี่ยวชาญ',
          () => onScopeChange('selected_countries'),
        )}
      </div>

      {scope === 'all_countries' ? (
        <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg zego-badge--success px-3 py-2 text-sm font-medium border">
          <Icon name="check" className="h-4 w-4" />
          เชี่ยวชาญทุกประเทศและทุกเส้นทาง
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {/* ค้นหาและเพิ่มประเทศ */}
          <div>
            <CountryCombobox
              value=""
              options={availableCountries}
              onSelect={addCountry}
              placeholder="ค้นหาและเพิ่มประเทศ..."
            />
            {/* ประเทศยอดนิยม */}
            {popular.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-xs zego-text-tertiary">ยอดนิยม:</span>
                {popular.map((c) => {
                  const picked = isDuplicateCountry(value, c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      disabled={picked}
                      onClick={() => addCountry(c)}
                      className={cx(
                        'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        picked
                          ? 'cursor-not-allowed zego-border-color zego-surface-soft-bg zego-text-disabled'
                          : 'zego-border-color zego-text-secondary zego-hover-selected',
                      )}
                    >
                      {flagOf(c.id)} {c.nameTh}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {errors.expertiseCountries && (
            <p className="rounded-lg zego-badge--danger px-3 py-2 text-xs font-medium border">
              {errors.expertiseCountries}
            </p>
          )}

          {/* การ์ดรายประเทศ (จอใหญ่ 2 คอลัมน์) */}
          {value.length > 0 && (
            <div className="grid gap-3 lg:grid-cols-2">
              {value.map((row) => {
                const rowError = errors[row.id];
                return (
                  <div
                    key={row.id}
                    className={cx(
                      'rounded-xl border zego-surface-bg p-3 shadow-sm',
                      rowError ? 'border-[var(--zego-danger)]' : 'zego-border-color',
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => update(row.id, { expanded: !row.expanded })}
                        aria-expanded={row.expanded}
                        className="flex min-w-0 items-center gap-2 text-left"
                      >
                        <Icon
                          name="chevronDown"
                          className={cx('h-4 w-4 shrink-0 zego-text-tertiary transition-transform', !row.expanded && '-rotate-90')}
                        />
                        <span className="truncate text-sm font-semibold zego-text">
                          {flagOf(row.countryCode)} {row.countryNameTh} — {row.countryNameEn}
                        </span>
                      </button>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full zego-surface-soft-bg px-2 py-0.5 text-[11px] font-medium zego-text-secondary">
                          {row.routeScope === 'all_routes' ? 'ทุกสนามบิน' : `${row.routes.length} สนามบิน`}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeCountry(row)}
                          aria-label={`ลบประเทศ ${row.countryNameTh}`}
                          className="rounded-lg p-1 zego-text-tertiary zego-icon-btn--danger"
                        >
                          <Icon name="close" className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {row.expanded && (
                      <div className="mt-3 space-y-2 zego-divider-top pt-3">
                        <div className="flex flex-wrap gap-3">
                          {(['all_routes', 'selected_routes'] as CountryRouteScope[]).map((s) => (
                            <label key={s} className="flex cursor-pointer items-center gap-1.5 text-xs zego-text-secondary">
                              <input
                                type="radio"
                                name={`route-scope-${row.id}`}
                                checked={row.routeScope === s}
                                onChange={() => changeRouteScope(row, s)}
                                className="h-3.5 w-3.5 accent-[var(--zego-primary-500)]"
                              />
                              {s === 'all_routes'
                                ? 'ทุกสนามบิน/ทุกเส้นทางในประเทศ'
                                : 'เลือกเฉพาะสนามบิน/จุดหมายปลายทาง'}
                            </label>
                          ))}
                        </div>

                        {row.routeScope === 'all_routes' ? (
                          <span className="inline-flex items-center gap-1 rounded-md zego-badge--success px-2 py-1 text-xs font-medium border">
                            ทุกสนามบินและทุกเส้นทางในประเทศ {row.countryNameTh}
                          </span>
                        ) : (
                          <div className="space-y-3">
                            <div>
                              <p className="mb-1 text-xs font-medium zego-text-secondary">
                                สนามบิน/จุดหมายปลายทางที่เชี่ยวชาญ
                              </p>
                              <RouteMultiSelect
                                countryCode={row.countryCode}
                                pool={poolFor(row.countryCode)}
                                selected={row.routes}
                                error={rowError}
                                placeholder="ค้นหาด้วยรหัสสนามบิน ชื่อเมือง หรือชื่อสนามบิน"
                                onChange={(next) => update(row.id, { routes: next })}
                              />
                            </div>
                            <FlightRouteBuilder
                              airports={row.routes}
                              routes={row.flightRoutes}
                              onChange={(next) => update(row.id, { flightRoutes: next })}
                            />
                          </div>
                        )}
                        {rowError && row.routeScope === 'all_routes' && (
                          <p className="text-xs font-medium zego-text-danger">{rowError}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ส่วนสรุป */}
          {value.length > 0 && (
            <div className="rounded-xl zego-surface-soft-bg p-3 border zego-border-color">
              <p className="mb-1.5 text-xs font-semibold zego-text-secondary">สรุปความเชี่ยวชาญ</p>
              <ul className="space-y-0.5 text-sm zego-text-secondary">
                {value.map((c) => {
                  const flights = c.flightRoutes.filter(isFlightRouteValid);
                  return (
                    <li key={c.id}>
                      <span className="font-medium">{c.countryNameTh}</span> —{' '}
                      {c.routeScope === 'all_routes' ? (
                        'ทุกสนามบินและทุกเส้นทาง'
                      ) : c.routes.length ? (
                        c.routes.map((r) => r.iataCode || r.nameTh).join(', ')
                      ) : (
                        <span className="zego-text-danger">ยังไม่เลือกสนามบิน</span>
                      )}
                      {flights.length > 0 && (
                        <span className="zego-text-tertiary">
                          {' '}
                          · เส้นทางบิน: {flights.map((fr) => flightRoutePreview(fr.airportCodes)).join(' / ')}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <p className="mt-2 text-xs font-medium zego-text-tertiary">
                เลือกแล้ว {value.length} ประเทศ · {specificRouteCount} เส้นทางเฉพาะ
              </p>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm?.onConfirm()}
        tone="danger"
        title="ยืนยันการเปลี่ยนแปลง"
        confirmLabel="ดำเนินการต่อ"
        message={confirm?.message ?? ''}
      />
    </>
  );
}

/** Combobox เลือกประเทศ (ค้นหาชื่อไทย/อังกฤษ · แสดงธง) */
function CountryCombobox({
  value,
  options,
  error,
  placeholder = 'ค้นหาประเทศ (ไทย/อังกฤษ)',
  onSelect,
}: {
  value: string;
  options: Country[];
  error?: string;
  placeholder?: string;
  onSelect: (country: Country | null) => void;
}) {
  const [query, setQuery] = useState('');
  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (c) =>
        c.nameTh.toLowerCase().includes(q) ||
        c.nameEn.toLowerCase().includes(q) ||
        c.code.toLowerCase().includes(q),
    );
  }, [options, query]);

  return (
    <Combobox<Country>
      label=""
      value={value}
      items={items}
      error={error}
      placeholder={placeholder}
      emptyMessage="ไม่พบประเทศ"
      getKey={(c) => c.id}
      getLabel={(c) => `${flagOf(c.id)} ${c.nameTh}`}
      getSubLabel={(c) => c.nameEn}
      onSearch={setQuery}
      onSelect={onSelect}
    />
  );
}

/** Checkbox ที่รองรับสถานะกึ่งเลือก (indeterminate) — ใช้กับ "เลือกทั้งหมด" */
function IndeterminateCheckbox({
  checked,
  indeterminate,
  onChange,
  className,
  ...rest
}: {
  checked: boolean;
  indeterminate: boolean;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  className?: string;
  'aria-label'?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-checked={indeterminate ? 'mixed' : checked}
      onChange={onChange}
      className={className}
      {...rest}
    />
  );
}

/* ---------------------------- การ์ดกลุ่มมีหมายเลข ---------------------------- */

function GroupCard({
  no,
  title,
  description,
  children,
}: {
  no: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg zego-selected-fill text-sm font-bold tabular-nums">
          {no}
        </span>
        <div className="min-w-0">
          <h3 className="text-base font-semibold zego-text">{title}</h3>
          {description && <p className="mt-0.5 text-sm zego-text-tertiary">{description}</p>}
        </div>
      </div>
      {children}
    </Card>
  );
}

/** หัวข้อย่อยภายในการ์ด (เช่น ชื่อภาษาไทย / ภาษาอังกฤษ ในการ์ดชื่อ-นามสกุล) */
function NameSubheading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-3">
      <h4 className="text-sm font-semibold zego-text">{title}</h4>
      <p className="mt-0.5 text-xs zego-text-tertiary">{description}</p>
    </div>
  );
}

/* ------------------------------ ช่องกรอกที่อยู่ ------------------------------ */

function AddressFields({
  address,
  prefix,
  errors,
  geo,
  onChange,
}: {
  address: WizardAddress;
  prefix: string;
  errors: Record<string, string>;
  geo: { rows: GeographyRow[]; status: GeographyStatus };
  onChange: (patch: Partial<WizardAddress>) => void;
}) {
  const err = (field: string) => errors[`${prefix}${field}`];
  const ready = geo.status === 'ready';

  const provinces = useMemo(() => listProvinces(geo.rows), [geo.rows]);
  const districts = useMemo(
    () => listDistricts(geo.rows, address.province),
    [geo.rows, address.province],
  );
  const subdistricts = useMemo(
    () => listSubdistricts(geo.rows, address.province, address.district),
    [geo.rows, address.province, address.district],
  );

  /** เปลี่ยนจังหวัด → ล้างอำเภอ/ตำบล/รหัสไปรษณีย์ */
  const changeProvince = (province: string) =>
    onChange({ province, district: '', subdistrict: '', postalCode: '' });
  /** เปลี่ยนอำเภอ → ล้างตำบล/รหัสไปรษณีย์ */
  const changeDistrict = (district: string) =>
    onChange({ district, subdistrict: '', postalCode: '' });
  /** เลือกตำบล → เติมรหัสไปรษณีย์ให้อัตโนมัติ */
  const changeSubdistrict = (subdistrict: string) =>
    onChange({
      subdistrict,
      postalCode: lookupPostalCode(geo.rows, address.province, address.district, subdistrict),
    });

  return (
    <div className="space-y-4">
      {/* บ้านเลขที่ / หมู่ / อาคาร / ซอย / ถนน */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div data-field={`${prefix}houseNo`}>
          <TextInput
            label="บ้านเลขที่"
            required
            value={address.houseNo}
            error={err('houseNo')}
            onChange={(e) => onChange({ houseNo: e.target.value })}
          />
        </div>
        <TextInput
          label="หมู่"
          optional
          value={address.villageNo}
          onChange={(e) => onChange({ villageNo: e.target.value })}
        />
        <TextInput
          label="อาคาร / หมู่บ้าน"
          optional
          value={address.building}
          onChange={(e) => onChange({ building: e.target.value })}
        />
        <TextInput
          label="ซอย"
          optional
          value={address.alley}
          onChange={(e) => onChange({ alley: e.target.value })}
        />
        <TextInput
          label="ถนน"
          optional
          value={address.road}
          onChange={(e) => onChange({ road: e.target.value })}
        />
      </div>

      {/* สถานะการโหลดข้อมูลที่อยู่ */}
      {geo.status === 'loading' && (
        <p className="inline-flex items-center gap-1.5 text-xs zego-text-tertiary">
          <span className="h-3 w-3 animate-spin rounded-full border-2 zego-today-border border-t-transparent" />
          กำลังโหลดรายชื่อจังหวัด…
        </p>
      )}
      {geo.status === 'error' && (
        <p className="rounded-lg zego-badge--danger px-3 py-2 text-xs font-medium border">
          {GEOGRAPHY_ERROR_MESSAGE}
        </p>
      )}

      {/* จังหวัด → เขต/อำเภอ → แขวง/ตำบล → รหัสไปรษณีย์ (ต่อเนื่อง) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div data-field={`${prefix}province`}>
          <SelectInput
            label="จังหวัด"
            required
            disabled={!ready}
            placeholder="เลือกจังหวัด"
            value={address.province}
            error={err('province')}
            onChange={(e) => changeProvince(e.target.value)}
            options={provinces.map((p) => ({ value: p, label: p }))}
          />
        </div>
        <div data-field={`${prefix}district`}>
          <SelectInput
            label="เขต / อำเภอ"
            required
            disabled={!ready || !address.province}
            placeholder="เลือกเขต / อำเภอ"
            value={address.district}
            error={err('district')}
            onChange={(e) => changeDistrict(e.target.value)}
            options={districts.map((d) => ({ value: d, label: d }))}
          />
        </div>
        <div data-field={`${prefix}subdistrict`}>
          <SelectInput
            label="แขวง / ตำบล"
            required
            disabled={!ready || !address.district}
            placeholder="เลือกแขวง / ตำบล"
            value={address.subdistrict}
            error={err('subdistrict')}
            onChange={(e) => changeSubdistrict(e.target.value)}
            options={subdistricts.map((s) => ({ value: s, label: s }))}
          />
        </div>
        <div data-field={`${prefix}postalCode`}>
          <TextInput
            label="รหัสไปรษณีย์"
            required
            readOnly
            placeholder="ระบบเติมให้อัตโนมัติ"
            hint="เติมอัตโนมัติเมื่อเลือกตำบล"
            value={address.postalCode}
            error={err('postalCode')}
          />
        </div>
      </div>
    </div>
  );
}

/* --------------------------- ตาราง/การ์ดภาษา --------------------------- */

function LanguageEditor({
  rows,
  errors,
  onUpdate,
  onRemove,
}: {
  rows: WizardLanguageRow[];
  errors: Record<string, string>;
  onUpdate: (id: string, patch: Partial<WizardLanguageRow>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <>
      {/* จอใหญ่: ตาราง — [ภาษา] [ระดับภาษา] [ภาษาแม่] [ลบ] */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="text-left text-xs font-medium zego-text-tertiary">
              <th className="pb-2 pr-3">ภาษา</th>
              <th className="pb-2 pr-3">ระดับภาษา</th>
              <th className="pb-2 pr-3">ภาษาแม่</th>
              <th className="pb-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="align-top">
                <td className="py-1.5 pr-3">
                  <LanguageNameField row={row} error={errors[row.id]} onUpdate={onUpdate} />
                </td>
                <td className="py-1.5 pr-3">
                  <LanguageLevelField row={row} onUpdate={onUpdate} />
                </td>
                <td className="py-1.5 pr-3">
                  <input
                    type="checkbox"
                    aria-label={`ภาษาแม่ — ${resolvedLanguageName(row) || 'ภาษา'}`}
                    checked={row.isNativeLanguage}
                    onChange={(e) =>
                      onUpdate(row.id, {
                        isNativeLanguage: e.target.checked,
                        levelCode: e.target.checked ? '' : row.levelCode,
                      })
                    }
                    className="h-4 w-4 accent-[var(--zego-primary-500)]"
                  />
                </td>
                <td className="py-1.5">
                  <button
                    type="button"
                    onClick={() => onRemove(row.id)}
                    aria-label="ลบภาษา"
                    className="rounded-lg p-1.5 zego-text-tertiary zego-icon-btn--danger"
                  >
                    <Icon name="close" className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* มือถือ: การ์ด */}
      <div className="space-y-3 lg:hidden">
        {rows.map((row, index) => (
          <div key={row.id} className="rounded-xl border zego-border-color p-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs font-semibold zego-text-tertiary">ภาษาที่ {index + 1}</span>
              <button
                type="button"
                onClick={() => onRemove(row.id)}
                aria-label="ลบภาษา"
                className="rounded-lg p-1 zego-text-tertiary zego-icon-btn--danger"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2">
              <LanguageNameField row={row} error={errors[row.id]} onUpdate={onUpdate} />
            </div>
            <div className="mt-3">
              <LanguageLevelField row={row} onUpdate={onUpdate} />
            </div>
            <label className="mt-3 flex cursor-pointer items-center gap-2 text-xs zego-text-secondary">
              <input
                type="checkbox"
                checked={row.isNativeLanguage}
                onChange={(e) =>
                  onUpdate(row.id, {
                    isNativeLanguage: e.target.checked,
                    levelCode: e.target.checked ? '' : row.levelCode,
                  })
                }
                className="h-4 w-4 accent-[var(--zego-primary-500)]"
              />
              ภาษาแม่
            </label>
          </div>
        ))}
      </div>
    </>
  );
}

function LanguageNameField({
  row,
  error,
  onUpdate,
}: {
  row: WizardLanguageRow;
  error?: string;
  onUpdate: (id: string, patch: Partial<WizardLanguageRow>) => void;
}) {
  return (
    <div className="min-w-[8rem] space-y-1.5">
      <select
        aria-label="เลือกภาษา"
        value={row.language}
        // เปลี่ยนภาษาแล้วต้องล้างระดับเดิมทันที — คนละภาษาอาจคนละมาตรฐาน เทียบกันไม่ได้
        onChange={(e) => onUpdate(row.id, { language: e.target.value, levelCode: '' })}
        className={cx(
          'w-full rounded-lg border zego-surface-bg px-2 py-1.5 text-sm zego-text focus:outline-none focus:ring-2 focus:ring-[var(--zego-focus)]',
          error ? 'border-[var(--zego-danger)]' : 'zego-border-color focus:border-[var(--zego-primary-500)]',
        )}
      >
        <option value="">เลือกภาษา</option>
        {WIZARD_LANGUAGES.map((l) => (
          <option key={l} value={l}>
            {l}
          </option>
        ))}
        <option value={WIZARD_LANGUAGE_OTHER}>{WIZARD_LANGUAGE_OTHER}</option>
      </select>
      {row.language === WIZARD_LANGUAGE_OTHER && (
        <input
          aria-label="ระบุภาษาอื่น"
          value={row.customLanguage}
          placeholder="ระบุภาษา"
          onChange={(e) => onUpdate(row.id, { customLanguage: e.target.value })}
          className="w-full rounded-lg border zego-border-color zego-surface-bg px-2 py-1.5 text-sm zego-text focus:border-[var(--zego-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--zego-focus)]"
        />
      )}
      {error && <p className="text-xs font-medium zego-text-danger">{error}</p>}
    </div>
  );
}

/** ตัวเลือกระดับภาษาเปลี่ยนตามมาตรฐานของภาษาที่เลือก (CEFR/HSK/JLPT/TOPIK/GENERAL) — ปิดใช้งานเมื่อเป็นภาษาแม่ */
function LanguageLevelField({
  row,
  onUpdate,
}: {
  row: WizardLanguageRow;
  onUpdate: (id: string, patch: Partial<WizardLanguageRow>) => void;
}) {
  const levelOptions = levelsForStandard(wizardLanguageStandard(row.language));
  return (
    <select
      aria-label={`ระดับภาษา — ${resolvedLanguageName(row) || 'ภาษา'}`}
      value={row.isNativeLanguage ? '' : row.levelCode}
      disabled={row.isNativeLanguage}
      onChange={(e) => onUpdate(row.id, { levelCode: e.target.value })}
      className="w-full rounded-lg border zego-border-color zego-surface-bg px-2 py-1.5 text-sm zego-text focus:border-[var(--zego-primary-500)] focus:outline-none focus:ring-2 focus:ring-[var(--zego-focus)] disabled:bg-[var(--zego-surface-soft)] disabled:text-[var(--zego-text-disabled)]"
    >
      <option value="">{row.isNativeLanguage ? 'ไม่ต้องระบุ (ภาษาแม่)' : 'ไม่ระบุ'}</option>
      {levelOptions.map((o) => (
        <option key={o.code} value={o.code}>
          {o.code} — {o.name}
        </option>
      ))}
    </select>
  );
}

/* ---------------------- เอกสารแบบเพิ่มหลายรายการ (list) ---------------------- */

/** กล่องหมวดเอกสารที่เพิ่มซ้ำได้ — หัวข้อ + จำนวน + ปุ่มเพิ่ม + สถานะว่าง */
function DocSection({
  title,
  addLabel,
  count,
  onAdd,
  children,
}: {
  title: string;
  addLabel: string;
  count: number;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mt-5 zego-divider-top pt-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold zego-text">
          {title}
          {count > 0 && (
            <span className="ml-2 rounded-full zego-surface-soft-bg px-2 py-0.5 text-xs font-medium zego-text-secondary">
              {count}
            </span>
          )}
        </p>
        <Button size="sm" variant="secondary" icon="plus" onClick={onAdd}>
          {addLabel}
        </Button>
      </div>
      {count === 0 ? (
        <p className="rounded-lg border border-dashed zego-border-color px-4 py-4 text-center text-sm zego-text-tertiary">
          ยังไม่มีรายการ — กด “{addLabel}” เพื่อเพิ่ม
        </p>
      ) : (
        <div className="space-y-3">{children}</div>
      )}
    </section>
  );
}

/** การ์ดเอกสาร 1 รายการ — มีหมายเลขลำดับและปุ่มลบ (ยืนยันผ่าน onRemove) */
function DocEntryCard({
  title,
  index,
  onRemove,
  children,
}: {
  title: string;
  index: number;
  onRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border zego-border-color zego-surface-soft-bg p-3">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold zego-text">
          {title} #{index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`ลบ${title} #${index + 1}`}
          className="rounded p-1 zego-text-tertiary zego-icon-btn--danger"
        >
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
      {children}
    </div>
  );
}

/* ------------------------------ อัปโหลดไฟล์ ------------------------------ */

function FileUploadField({
  label,
  required,
  value,
  error,
  onChange,
  onRequestDelete,
}: {
  label: string;
  required?: boolean;
  value: UploadedFile | null;
  error?: string;
  onChange: (file: UploadedFile | null) => void;
  /** ถ้ากำหนด จะเรียกแทนการลบไฟล์ทันที (ให้ผู้เรียกถามยืนยัน/จัดการข้อมูลที่อ่านจากไฟล์) */
  onRequestDelete?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string>();
  const [preview, setPreview] = useState(false);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const message = validateUploadFile(file);
    if (message) {
      setLocalError(message);
      return;
    }
    setLocalError(undefined);
    const reader = new FileReader();
    reader.onload = () =>
      onChange({ name: file.name, type: file.type, size: file.size, dataUrl: String(reader.result) });
    reader.onerror = () => setLocalError('อ่านไฟล์ไม่สำเร็จ กรุณาลองใหม่');
    reader.readAsDataURL(file);
  };

  const shownError = localError ?? error;
  const isImage = value?.type.startsWith('image/');

  return (
    <div data-field={label}>
      <p className="mb-1.5 text-sm font-medium zego-text-secondary">
        {label}
        {required && <span className="ml-0.5 zego-text-danger">*</span>}
      </p>

      {value ? (
        <div
          className={cx(
            'flex items-center gap-3 rounded-lg border p-2.5',
            shownError ? 'zego-status-bar--danger' : 'zego-border-color zego-surface-soft-bg',
          )}
        >
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.dataUrl} alt={value.name} className="h-12 w-12 rounded object-cover" />
          ) : (
            <span className="flex h-12 w-12 items-center justify-center rounded zego-icon-well">
              <Icon name="file" className="h-5 w-5" />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium zego-text-secondary">{value.name}</p>
            <p className="inline-flex items-center gap-1 text-xs zego-text-success">
              <Icon name="check" className="h-3 w-3" />
              อัปโหลดแล้ว · {(value.size / 1024 / 1024).toFixed(2)} MB
            </p>
          </div>
          <button
            type="button"
            onClick={() => setPreview(true)}
            aria-label={`ดูตัวอย่าง ${label}`}
            className="rounded-lg px-2 py-1 text-xs font-medium zego-text-secondary zego-hover-surface"
          >
            ดูตัวอย่าง
          </button>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label={`เปลี่ยนไฟล์ ${label}`}
            className="rounded-lg px-2 py-1 text-xs font-medium zego-text-info hover:bg-[var(--zego-info)]/10"
          >
            เปลี่ยน
          </button>
          <button
            type="button"
            onClick={() => {
              setLocalError(undefined);
              if (onRequestDelete) onRequestDelete();
              else onChange(null);
            }}
            aria-label={`ลบไฟล์ ${label}`}
            className="rounded-lg p-1.5 zego-text-tertiary zego-icon-btn--danger"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cx(
            'flex w-full flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed px-3 py-5 text-center transition-colors',
            shownError
              ? 'zego-status-bar--danger hover:bg-[#ffe9e9]'
              : 'zego-border-color zego-surface-soft-bg zego-hover-selected',
          )}
        >
          <Icon name="file" className="h-5 w-5 zego-text-tertiary" />
          <span className="text-sm font-medium zego-text-secondary">คลิกเพื่อเลือกไฟล์</span>
          <span className="text-xs zego-text-tertiary">JPG, JPEG, PNG, PDF · ไม่เกิน {WIZARD_MAX_FILE_MB} MB</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={WIZARD_FILE_ACCEPT}
        className="sr-only"
        aria-label={`เลือกไฟล์ ${label}`}
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />

      {shownError && <p className="mt-1.5 text-xs font-medium zego-text-danger">{shownError}</p>}

      {value && preview && (
        <Modal open onClose={() => setPreview(false)} title={value.name} size="lg">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value.dataUrl} alt={value.name} className="mx-auto max-h-[75vh] w-auto rounded" />
          ) : (
            <iframe title={value.name} src={value.dataUrl} className="h-[75vh] w-full rounded border-0" />
          )}
        </Modal>
      )}
    </div>
  );
}

/** ป้ายชนิดไฟล์แบบสั้น */
function fileTypeLabel(type: string): string {
  if (type === 'application/pdf') return 'PDF';
  if (type === 'image/png') return 'PNG';
  if (type === 'image/jpeg') return 'JPG';
  return type || 'ไฟล์';
}

/**
 * DocumentUploader — อัปโหลด + แสดงตัวอย่าง + "ข้อมูลจากเอกสาร" (รองรับ OCR) แบบ reusable
 *  - อัปโหลดรูป/PDF → แสดงช่องข้อมูลตาม schema ของเอกสารนั้นทันที (แก้ไขได้ทุกช่อง)
 *  - ปุ่ม "อ่านข้อมูลใหม่" เรียกบริการ OCR (ปัจจุบันยังไม่เชื่อม → ให้กรอกเอง ไม่เดาข้อมูล)
 *  - ต้องกด "ยืนยันข้อมูล" ก่อน จึงถือว่าตรวจสอบแล้ว (ไม่บันทึกอัตโนมัติ)
 *  - ลบไฟล์ → ถามว่าจะลบข้อมูลที่อ่าน/กรอกด้วยหรือไม่
 */
function DocumentUploader({
  kind,
  uploadLabel,
  required,
  entry,
  countryOptions,
  fileError,
  fieldError,
  onChange,
}: {
  kind: DocKind;
  uploadLabel: string;
  required?: boolean;
  entry: DocEntry;
  countryOptions: { value: string; label: string }[];
  fileError?: string;
  fieldError: (fieldKey: string) => string | undefined;
  onChange: (patch: Partial<DocEntry>) => void;
}) {
  const [fileDeleteOpen, setFileDeleteOpen] = useState(false);
  const schema = DOC_SCHEMAS[kind];

  /** เรียกบริการอ่านเอกสาร (OCR) — จำลองสถานะ "กำลังอ่าน" เพื่อ UX; ไม่เดาข้อมูลเมื่อยังไม่เชื่อมบริการ */
  const runOcr = (file: UploadedFile) => {
    onChange({ ocrStatus: 'reading' });
    window.setTimeout(() => {
      readDocumentOcr(file, kind).then((res) => {
        if (res.ok) {
          onChange({
            ocrStatus: 'done',
            extractedData: res.data,
            verifiedData: { ...entry.verifiedData, ...res.data },
            confidence: res.confidence,
            verified: false,
          });
        } else {
          onChange({ ocrStatus: res.reason === 'error' ? 'error' : 'unsupported' });
        }
      });
    }, 700);
  };

  const setField = (key: string, value: string) =>
    onChange({ verifiedData: { ...entry.verifiedData, [key]: value }, verified: false });

  const renderField = (f: DocFieldDef) => {
    const value = entry.verifiedData[f.key] ?? '';
    const lowConfidence = entry.confidence[f.key] !== undefined && entry.confidence[f.key] < 0.7;
    const confidenceHint = lowConfidence ? '⚠ ความมั่นใจต่ำ — ควรตรวจสอบ' : undefined;
    const error = fieldError(f.key);
    const wrapCls = f.full ? 'sm:col-span-2' : undefined;

    if (f.type === 'date') {
      return (
        <DateField
          key={f.key}
          label={withYearEraNote(f.label)}
          wrapperClassName={wrapCls}
          value={value}
          min={f.minKey ? entry.verifiedData[f.minKey] || undefined : undefined}
          error={error}
          hint={confidenceHint}
          onChange={(v) => setField(f.key, v)}
        />
      );
    }
    if (f.type === 'country' || f.type === 'select') {
      return (
        <SelectInput
          key={f.key}
          label={f.label}
          wrapperClassName={wrapCls}
          placeholder={docFieldPlaceholder(f)}
          value={value}
          options={f.type === 'country' ? countryOptions : (f.options ?? [])}
          error={error}
          hint={confidenceHint}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      );
    }
    if (f.type === 'textarea') {
      return (
        <TextArea
          key={f.key}
          label={f.label}
          wrapperClassName={wrapCls}
          placeholder={docFieldPlaceholder(f)}
          value={value}
          error={error}
          hint={confidenceHint}
          onChange={(e) => setField(f.key, e.target.value)}
        />
      );
    }
    // text / idnumber
    const isId = f.type === 'idnumber';
    return (
      <TextInput
        key={f.key}
        label={f.label}
        wrapperClassName={wrapCls}
        placeholder={docFieldPlaceholder(f)}
        inputMode={isId ? 'numeric' : undefined}
        value={value}
        error={error}
        hint={confidenceHint}
        onChange={(e) =>
          setField(f.key, isId ? e.target.value.replace(/\D/g, '').slice(0, 13) : e.target.value)
        }
      />
    );
  };

  return (
    <div>
      <FileUploadField
        label={uploadLabel}
        required={required}
        value={entry.file}
        error={fileError}
        onChange={(f) => {
          if (f) {
            onChange({ file: f, verified: false });
            runOcr(f);
          }
        }}
        onRequestDelete={() => {
          if (docEntryHasData(entry)) setFileDeleteOpen(true);
          else onChange({ file: null, ocrStatus: 'idle' });
        }}
      />

      {/* ข้อมูลไฟล์: ชื่อ · ชนิด · ขนาด */}
      {entry.file && (
        <p className="mt-1 text-xs zego-text-tertiary">
          {entry.file.name} · {fileTypeLabel(entry.file.type)} ·{' '}
          {(entry.file.size / 1024 / 1024).toFixed(2)} MB
        </p>
      )}

      {/* ส่วน "ข้อมูลจากเอกสาร" — แสดงเมื่ออัปโหลดไฟล์แล้ว */}
      {entry.file && (
        <div className="mt-3 rounded-lg border zego-border-color zego-surface-bg p-3">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold zego-text">ข้อมูลจากเอกสาร</p>
            <div className="flex items-center gap-2">
              {entry.verified && (
                <span className="inline-flex items-center gap-1 rounded-full zego-badge--success px-2 py-0.5 text-xs font-medium border">
                  <Icon name="check" className="h-3 w-3" />
                  ยืนยันแล้ว
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => runOcr(entry.file!)}
                disabled={entry.ocrStatus === 'reading'}
              >
                อ่านข้อมูลใหม่
              </Button>
            </div>
          </div>

          {entry.ocrStatus === 'reading' ? (
            <p className="flex items-center gap-2 py-3 text-sm zego-text-info">
              <span className="h-4 w-4 animate-spin rounded-full border-2 zego-today-border border-t-transparent" />
              กำลังอ่านข้อมูลจากเอกสาร…
            </p>
          ) : (
            <>
              {entry.ocrStatus === 'unsupported' && (
                <p className="mb-3 rounded-md zego-badge--warning px-3 py-2 text-xs border">
                  {OCR_ENABLED
                    ? 'ไม่พบข้อมูลจากไฟล์ — กรุณากรอกข้อมูลเอง'
                    : 'ยังไม่ได้เชื่อมบริการอ่านเอกสารอัตโนมัติ (OCR) — กรุณากรอกข้อมูลเอง'}
                </p>
              )}
              {entry.ocrStatus === 'error' && (
                <p className="mb-3 rounded-md zego-badge--danger px-3 py-2 text-xs border">
                  อ่านข้อมูลจากไฟล์ไม่สำเร็จ — กรุณากรอกข้อมูลเอง หรือกด “อ่านข้อมูลใหม่”
                </p>
              )}
              {entry.ocrStatus === 'done' && (
                <p className="mb-3 rounded-md zego-badge--info px-3 py-2 text-xs border">
                  ระบบอ่านข้อมูลจากเอกสารแล้ว — โปรดตรวจสอบและแก้ไขก่อนกดยืนยัน
                </p>
              )}

              <div className="grid gap-3 sm:grid-cols-2">{schema.filter((f) => !f.hidden).map(renderField)}</div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs zego-text-tertiary">
                  ข้อมูลจะยังไม่ถูกบันทึกจนกว่าจะกด “ยืนยันข้อมูล”
                </p>
                <Button
                  size="sm"
                  variant={entry.verified ? 'ghost' : 'primary'}
                  icon="check"
                  disabled={entry.verified}
                  onClick={() => onChange({ verified: true })}
                >
                  {entry.verified ? 'ยืนยันแล้ว' : 'ยืนยันข้อมูล'}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ยืนยันการลบไฟล์ — เลือกได้ว่าจะลบข้อมูลที่อ่าน/กรอกด้วยหรือไม่ */}
      {fileDeleteOpen && (
        <Modal
          open
          onClose={() => setFileDeleteOpen(false)}
          title="ลบไฟล์เอกสาร?"
          size="sm"
          footer={
            <>
              <Button variant="ghost" onClick={() => setFileDeleteOpen(false)}>
                ยกเลิก
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  onChange({ file: null, ocrStatus: 'idle' });
                  setFileDeleteOpen(false);
                }}
              >
                ลบเฉพาะไฟล์
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  onChange({
                    file: null,
                    ocrStatus: 'idle',
                    extractedData: null,
                    verifiedData: emptyDocData(kind),
                    confidence: {},
                    verified: false,
                  });
                  setFileDeleteOpen(false);
                }}
              >
                ลบไฟล์และข้อมูล
              </Button>
            </>
          }
        >
          <p className="text-sm zego-text-secondary">
            คุณกรอก/อ่านข้อมูลจากไฟล์นี้ไว้แล้ว ต้องการลบข้อมูลเหล่านั้นด้วยหรือไม่?
            <br />
            <span className="zego-text-tertiary">“ลบเฉพาะไฟล์” จะเก็บข้อมูลที่กรอกไว้เพื่อแนบไฟล์ใหม่ภายหลัง</span>
          </p>
        </Modal>
      )}
    </div>
  );
}
