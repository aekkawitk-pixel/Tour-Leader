'use client';

/**
 * Tour Leader Master (§10) — ข้อมูลหลักหัวหน้าทัวร์ที่นำเข้าจากไฟล์จริง (อ่าน + ตรวจสอบ)
 * อ่านผ่าน Service กลาง (services/tourLeaderMaster) · ข้อมูลเอกสารสำคัญ Mask ก่อนแสดง (§8)
 */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { formatDate } from '@/lib/format';
import { Button, Card, cx, PageHeader } from '@/components/ui/Primitives';
import { SearchBox, SelectInput } from '@/components/ui/FormField';
import { Drawer } from '@/components/ui/Modal';
import {
  getTourLeaderProfiles, getIdentityDocument, getPassportWarnings, getImportMeta,
} from '@/services/tourLeaderMaster';
import {
  passportStatus, PASSPORT_STATUS_META, LEADER_VALIDATION_META, maskPassport, maskPersonalId, displayNameOf,
} from '@/lib/logic/tourLeaderMaster';
import type { LeaderValidationStatus, PassportStatus, TourLeaderProfile } from '@/data/leaders/masterTypes';
import { TONE_ZEGO_BADGE } from '@/lib/tone-tokens';

const DASH = '-';
const PAGE_SIZES = [25, 50, 100];

export function TourLeaderMasterView() {
  const { today, currentUser } = useDemo();
  const canViewIdentity = currentUser.role === 'admin' || currentUser.role === 'coordinator';
  const canViewFull = currentUser.role === 'admin'; // §9 System/Document Admin เท่านั้นที่เห็นเลขเต็ม

  const meta = useMemo(() => getImportMeta(), []);
  const warnings = useMemo(() => getPassportWarnings(today), [today]);

  const [search, setSearch] = useState('');
  const [validation, setValidation] = useState<'all' | LeaderValidationStatus>('all');
  const [pStatus, setPStatus] = useState<'all' | PassportStatus>('all');
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<TourLeaderProfile | null>(null);

  const filtered = useMemo(() => getTourLeaderProfiles({
    search: search.trim() || undefined,
    validationStatus: validation === 'all' ? undefined : validation,
    passportStatus: pStatus === 'all' ? undefined : pStatus,
    today,
  }), [search, validation, pStatus, today]);

  const sig = [search, validation, pStatus, pageSize].join('|');
  const [prevSig, setPrevSig] = useState(sig);
  if (prevSig !== sig) { setPrevSig(sig); setPage(1); }
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const rows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <>
      <PageHeader title="Tour Leader Master — ข้อมูลหลักหัวหน้าทัวร์" description={`นำเข้าจาก ${meta.sourceFileName} · ${meta.imported} รายการ`} />

      {/* Import Report (§16) + คำเตือนหนังสือเดินทาง (§15) */}
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        <Stat label="นำเข้าทั้งหมด" value={meta.imported} tone="slate" />
        <Stat label="ควรตรวจสอบ" value={meta.warning} tone="amber" />
        <Stat label="อาจซ้ำ (Review)" value={meta.possibleDuplicates} tone="amber" />
        <Stat label="Passport หมดอายุ" value={warnings.expired} tone="rose" />
        <Stat label="≤ 30 วัน" value={warnings.within30} tone="rose" />
        <Stat label="≤ 90 วัน" value={warnings.within90} tone="amber" />
      </div>

      <Card className="mb-4" padded={false}>
        <div className="flex flex-wrap items-end gap-3 px-4 py-2.5">
          <div className="min-w-[16rem] flex-1"><SearchBox value={search} onChange={setSearch} placeholder="ค้นหา ชื่อไทย / อังกฤษ / ชื่อเล่น / เบอร์โทร" label="ค้นหาหัวหน้าทัวร์" /></div>
          <SelectInput label="ตรวจสอบ" value={validation} onChange={(e) => setValidation(e.target.value as typeof validation)} wrapperClassName="w-36"
            options={[{ value: 'all', label: 'ทั้งหมด' }, { value: 'VALID', label: 'ถูกต้อง' }, { value: 'WARNING', label: 'ควรตรวจสอบ' }, { value: 'INVALID', label: 'ไม่ถูกต้อง' }]} />
          <SelectInput label="หนังสือเดินทาง" value={pStatus} onChange={(e) => setPStatus(e.target.value as typeof pStatus)} wrapperClassName="w-44"
            options={[{ value: 'all', label: 'ทุกสถานะ' }, { value: 'EXPIRED', label: 'หมดอายุ' }, { value: 'EXPIRING_WITHIN_30_DAYS', label: '≤ 30 วัน' }, { value: 'EXPIRING_WITHIN_90_DAYS', label: '≤ 90 วัน' }, { value: 'EXPIRING_WITHIN_180_DAYS', label: '≤ 180 วัน' }, { value: 'VALID', label: 'ใช้งานได้' }, { value: 'UNKNOWN', label: 'ไม่ทราบ' }]} />
        </div>
      </Card>

      <div className="overflow-x-auto zego-card-surface">
        <table className="zego-table w-full min-w-[980px] text-sm">
          <thead>
            <tr className="zego-divider-bottom zego-surface-soft-bg text-left text-xs zego-text-tertiary">
              <th className="px-3 py-2">ชื่อหัวหน้าทัวร์</th>
              <th className="px-3 py-2">ชื่อภาษาอังกฤษ</th>
              <th className="px-3 py-2">ชื่อเล่น</th>
              <th className="px-3 py-2">เบอร์โทร</th>
              <th className="px-3 py-2">สัญชาติ</th>
              <th className="px-3 py-2">หนังสือเดินทางหมดอายุ</th>
              <th className="px-3 py-2 text-center">สถานะ</th>
              <th className="px-3 py-2 text-center">จัดการ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const expiry = getPassportExpiryDisplay(p.tourLeaderId, canViewIdentity);
              const st = passportStatus(expiry.iso, today);
              return (
                <tr key={p.tourLeaderId} onClick={() => setDetail(p)} className="zego-divider-bottom zego-hover-surface cursor-pointer align-top">
                  <td className="px-3 py-2.5">
                    <p className="zego-text font-semibold">{displayNameOf(p)}</p>
                    <p className="zego-text-tertiary text-xs">{p.fullNameTH || DASH}</p>
                  </td>
                  <td className="zego-text-secondary px-3 py-2.5 text-xs">{p.fullNameEN || DASH}</td>
                  <td className="zego-text-secondary px-3 py-2.5">{p.nickName ?? DASH}</td>
                  <td className="zego-text-secondary whitespace-nowrap px-3 py-2.5 tabular-nums">{p.contactNumberRaw ?? DASH}</td>
                  <td className="zego-text-secondary px-3 py-2.5">{p.nationality ?? DASH}</td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span className={cx('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] font-medium border', TONE_ZEGO_BADGE[PASSPORT_STATUS_META[st].tone])}>
                      {PASSPORT_STATUS_META[st].label}
                    </span>
                    <span className="zego-text-tertiary ml-1 text-xs">{expiry.iso ? formatDate(expiry.iso) : ''}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <span className={cx('inline-flex rounded px-1.5 py-0.5 text-[11px] font-medium border', TONE_ZEGO_BADGE[LEADER_VALIDATION_META[p.validationStatus].tone])}>{LEADER_VALIDATION_META[p.validationStatus].label}</span>
                  </td>
                  <td className="px-3 py-2.5 text-center"><span className="zego-text-info">ดู</span></td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={8} className="px-4 py-16 text-center text-sm"><span className="zego-text-tertiary">ไม่พบหัวหน้าทัวร์ตามเงื่อนไข</span></td></tr>}
          </tbody>
        </table>
      </div>

      <div className="zego-text-secondary mt-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <span>พบ <strong className="zego-text">{filtered.length}</strong> รายการ</span>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs">แสดง
            <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} className="zego-border-color zego-surface-bg rounded-lg border px-2 py-1 text-sm">{PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}</select>/หน้า
          </label>
          <span className="tabular-nums">หน้า {safePage}/{totalPages}</span>
          <div className="inline-flex gap-1">
            <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>ก่อนหน้า</Button>
            <Button variant="secondary" size="sm" disabled={safePage >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>ถัดไป</Button>
          </div>
        </div>
      </div>

      <LeaderMasterDetail profile={detail} onClose={() => setDetail(null)} today={today} canViewIdentity={canViewIdentity} canViewFull={canViewFull} />
    </>
  );
}

/** ดึงวันหมดอายุเพื่อแสดง (เปิดเผยได้เฉพาะวันหมดอายุ ไม่ใช่เลขเอกสาร §15) */
function getPassportExpiryDisplay(id: string, canView: boolean): { iso: string | null } {
  const doc = getIdentityDocument(id, canView);
  return { iso: doc?.passportExpiryDate ?? null };
}

function Stat({ label, value, tone }: { label: string; value: number; tone: 'slate' | 'amber' | 'rose' }) {
  const cls = { slate: 'zego-text-secondary', amber: 'zego-text-warning', rose: 'zego-text-danger' }[tone];
  return (
    <div className="zego-border-color zego-surface-bg rounded-xl border px-3 py-2">
      <p className="zego-text-tertiary text-[11px]">{label}</p>
      <p className={cx('text-lg font-bold tabular-nums', cls)}>{value.toLocaleString('th-TH')}</p>
    </div>
  );
}

/* ------------------------------ Detail (§11 tabs ย่อ + Mask §8) ------------------------------ */

function LeaderMasterDetail({ profile, onClose, today, canViewIdentity, canViewFull }: {
  profile: TourLeaderProfile | null; onClose: () => void; today: string; canViewIdentity: boolean; canViewFull: boolean;
}) {
  const [showFull, setShowFull] = useState(false);
  const identity = profile ? getIdentityDocument(profile.tourLeaderId, canViewIdentity) : null;
  const st = passportStatus(identity?.passportExpiryDate ?? null, today);

  return (
    <Drawer open={!!profile} onClose={onClose} size="xl" title={profile ? displayNameOf(profile) : ''} description={profile?.fullNameTH}>
      {profile && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx('rounded px-2 py-0.5 text-xs font-medium border', TONE_ZEGO_BADGE[LEADER_VALIDATION_META[profile.validationStatus].tone])}>{LEADER_VALIDATION_META[profile.validationStatus].label}</span>
            <span className={cx('rounded px-2 py-0.5 text-xs font-medium border', TONE_ZEGO_BADGE[PASSPORT_STATUS_META[st].tone])}>หนังสือเดินทาง: {PASSPORT_STATUS_META[st].label}</span>
            {profile.duplicateStatus !== 'NEW_RECORD' && <span className={cx('rounded px-2 py-0.5 text-xs border', TONE_ZEGO_BADGE.amber)}>{profile.duplicateStatus}</span>}
            <span className={cx('rounded px-2 py-0.5 text-xs', TONE_ZEGO_BADGE.slate)}>tourLeaderId: {profile.tourLeaderId}</span>
          </div>

          {profile.validationMessages.length > 0 && (
            <div className={cx('rounded-lg px-3 py-2 text-xs border', TONE_ZEGO_BADGE.amber)}>
              <p className="mb-1 font-semibold">ผลตรวจสอบข้อมูล (§18)</p>
              <ul className="list-inside list-disc space-y-0.5">{profile.validationMessages.map((m, i) => <li key={i}>{m}</li>)}</ul>
            </div>
          )}

          <Section title="ข้อมูลพื้นฐาน">
            <F label="คำนำหน้า (ไทย)" value={profile.titleNameTH ?? DASH} />
            <F label="ชื่อ (ไทย)" value={profile.firstNameTH ?? DASH} />
            <F label="นามสกุล (ไทย)" value={profile.lastNameTH ?? DASH} />
            <F label="คำนำหน้า (อังกฤษ)" value={profile.titleNameEN ?? DASH} />
            <F label="ชื่อ (อังกฤษ)" value={profile.firstNameEN ?? DASH} />
            <F label="นามสกุล (อังกฤษ)" value={profile.lastNameEN ?? DASH} />
            <F label="ชื่อเล่น" value={profile.nickName ?? '(ยังไม่ระบุ)'} />
            <F label="เบอร์โทร" value={profile.contactNumberRaw ?? DASH} />
            <F label="เพศ" value={profile.gender || DASH} />
            <F label="สัญชาติ" value={profile.nationality ?? DASH} />
          </Section>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="zego-text-tertiary text-xs font-semibold">หนังสือเดินทางและเอกสาร (§8 ปกปิดข้อมูลสำคัญ)</p>
              {canViewFull && identity && (
                <button type="button" onClick={() => setShowFull((v) => !v)} className="zego-text-info text-xs font-medium hover:underline">{showFull ? 'ซ่อนข้อมูลเต็ม' : 'แสดงข้อมูลเต็ม (มีสิทธิ์)'}</button>
              )}
            </div>
            {!canViewIdentity ? (
              <p className="zego-surface-soft-bg zego-border-color zego-text-tertiary rounded-lg border px-3 py-2 text-xs">คุณไม่มีสิทธิ์ดูข้อมูลเอกสารของหัวหน้าทัวร์</p>
            ) : (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
                <F label="ประเภทหนังสือเดินทาง" value={identity?.passportType ?? DASH} />
                <F label="ประเทศผู้ออก" value={profile.countryCode ?? DASH} />
                <F label="เลขหนังสือเดินทาง" value={showFull ? (identity?.passportNo ?? DASH) : maskPassport(identity?.passportNo)} mono />
                <F label="วันออก" value={identity?.passportIssueDate ? formatDate(identity.passportIssueDate) : DASH} />
                <F label="วันหมดอายุ" value={identity?.passportExpiryDate ? formatDate(identity.passportExpiryDate) : DASH} />
                <F label="หน่วยงานผู้ออก" value={identity?.issuingAuthority ?? DASH} />
                <F label="หมายเหตุ" value={identity?.authorityRemark ?? DASH} />
                <F label="เลขบัตรประชาชน" value={showFull ? (identity?.personalID ?? DASH) : maskPersonalId(identity?.personalID)} mono />
                <F label="วันเกิด" value={showFull ? (identity?.dateOfBirth ? formatDate(identity.dateOfBirth) : DASH) : '••/••/••'} />
                <F label="สถานที่เกิด" value={showFull ? (identity?.placeOfBirth ?? DASH) : '•••'} />
              </dl>
            )}
          </div>

          <Section title="ความรู้/ความสามารถ/ประสบการณ์ (§13 เตรียมไว้ — ให้ผู้ดูแลเพิ่มภายหลัง)">
            <F label="ภาษา" value={profile.languages.length ? profile.languages.join(', ') : 'ยังไม่มีข้อมูล'} />
            <F label="ประเทศที่ถนัด" value={profile.skilledCountries.length ? profile.skilledCountries.join(', ') : 'ยังไม่มีข้อมูล'} />
            <F label="กลุ่มไกด์" value={profile.guideGroups.length ? profile.guideGroups.join(', ') : 'ยังไม่มีข้อมูล'} />
            <F label="ประสบการณ์ (ปี)" value={profile.yearsOfExperience?.toString() ?? 'ยังไม่มีข้อมูล'} />
          </Section>

          <Section title="ข้อมูลการนำเข้า (§16/§17)">
            <F label="ไฟล์ต้นทาง" value={profile.sourceFileName} />
            <F label="แถวต้นทาง" value={`#${profile.sourceRowNumber}`} />
            <F label="สถานะ" value={`${profile.activeStatus} · ${profile.employmentStatus}${profile.statusNeedsReview ? ' · ต้องตรวจสอบ' : ''}`} />
            <F label="นำเข้าเมื่อ" value={formatDate(profile.importedAt)} />
          </Section>
        </div>
      )}
    </Drawer>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="zego-text-tertiary mb-1.5 text-xs font-semibold">{title}</p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">{children}</dl>
    </div>
  );
}

function F({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="zego-text-tertiary text-xs">{label}</dt>
      <dd className={cx('zego-text font-medium', mono && 'font-mono')}>{value}</dd>
    </div>
  );
}
