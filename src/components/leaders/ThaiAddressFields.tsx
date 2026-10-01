'use client';

/**
 * ช่องที่อยู่ไทยแบบลำดับต่อเนื่อง — ใช้ร่วมกันทุกที่อยู่ในระบบ (ที่อยู่ปัจจุบัน / ตามบัตรประชาชน)
 *
 *   จังหวัด (Autocomplete · เลือกจากรายการเท่านั้น)
 *     → อำเภอ/เขต (เปิดใช้เมื่อเลือกจังหวัดแล้ว)
 *       → ตำบล/แขวง (เปิดใช้เมื่อเลือกอำเภอแล้ว)
 *         → รหัสไปรษณีย์ (เติมให้เมื่อมีรหัสเดียว · เลือกเองเมื่อมีหลายรหัส)
 *
 * กรุงเทพฯ ใช้คำว่า "เขต / แขวง" · จังหวัดอื่นใช้ "อำเภอ / ตำบล"
 * จังหวัดที่ Master ยังไม่มีข้อมูลอำเภอ → ช่องอำเภอ/ตำบลเปิดให้พิมพ์เอง (ไม่บล็อกการบันทึก)
 */

import { useState } from 'react';
import { Combobox } from '@/components/ui/Combobox';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import {
  districtLabel,
  districtsOf,
  searchDistricts,
  searchProvinces,
  searchSubdistricts,
  subdistrictLabel,
  type District,
  type Province,
  type Subdistrict,
} from '@/data/thaiAdmin';
import {
  postalOptionsFor,
  selectDistrict,
  selectProvince,
  selectSubdistrict,
} from '@/modules/tour-leaders/address';
import type { LeaderAddress } from '@/types';

export function ThaiAddressFields({
  address,
  errors,
  fieldPrefix,
  disabled = false,
  required = true,
  onChange,
}: {
  address: LeaderAddress;
  /** map: ชื่อฟิลด์ → ข้อความผิดพลาด (คีย์ = `${fieldPrefix}Province` เป็นต้น) */
  errors: Record<string, string>;
  /** เช่น '' (ที่อยู่ปัจจุบัน) หรือ 'idCard' (ที่อยู่ตามบัตรประชาชน) */
  fieldPrefix: string;
  disabled?: boolean;
  required?: boolean;
  onChange: (next: LeaderAddress) => void;
}) {
  const [provinceQuery, setProvinceQuery] = useState('');
  const [districtQuery, setDistrictQuery] = useState('');
  const [subdistrictQuery, setSubdistrictQuery] = useState('');

  const field = (name: string) =>
    fieldPrefix ? `${fieldPrefix}${name[0].toUpperCase()}${name.slice(1)}` : name;

  const provinceCode = address.provinceCode;
  const hasDistrictMaster = districtsOf(provinceCode).length > 0;
  const subdistrictOptions = searchSubdistricts(address.districtCode, subdistrictQuery);
  const postalOptions = postalOptionsFor(address);

  const dLabel = districtLabel(provinceCode);
  const sLabel = subdistrictLabel(provinceCode);

  return (
    <>
      <div data-field={field('province')}>
        <Combobox<Province>
          label="จังหวัด"
          required={required}
          disabled={disabled}
          value={address.province ?? ''}
          error={errors[field('province')]}
          hint="พิมพ์ชื่อไทยหรืออังกฤษเพื่อค้นหา · เลือกจากรายการเท่านั้น"
          placeholder="ระบุจังหวัด"
          emptyMessage="ไม่พบจังหวัดที่ค้นหา"
          items={searchProvinces(provinceQuery)}
          getKey={(p) => p.code}
          getLabel={(p) => p.nameTh}
          getSubLabel={(p) => p.nameEn}
          onSearch={setProvinceQuery}
          onSelect={(province) => {
            onChange(selectProvince(address, province));
            setDistrictQuery('');
            setSubdistrictQuery('');
          }}
        />
      </div>

      {/* อำเภอ/เขต — ต้องเลือกจังหวัดก่อน · จังหวัดที่ยังไม่มี Master ให้พิมพ์เอง */}
      <div data-field={field('district')}>
        {hasDistrictMaster ? (
          <Combobox<District>
            label={dLabel}
            required={required}
            disabled={disabled || !provinceCode}
            disabledHint={disabled ? undefined : 'เลือกจังหวัดก่อน'}
            value={address.district ?? ''}
            error={errors[field('district')]}
            placeholder={`ระบุ${dLabel}`}
            emptyMessage={`ไม่พบ${dLabel}ที่ค้นหา`}
            items={searchDistricts(provinceCode, districtQuery)}
            getKey={(d) => d.code}
            getLabel={(d) => d.nameTh}
            getSubLabel={(d) => d.nameEn}
            onSearch={setDistrictQuery}
            onSelect={(district) => {
              onChange(selectDistrict(address, district));
              setSubdistrictQuery('');
            }}
          />
        ) : (
          <TextInput
            label={dLabel}
            required={required}
            disabled={disabled || !provinceCode}
            hint={
              provinceCode
                ? 'จังหวัดนี้ยังไม่มีข้อมูลใน Master — พิมพ์เองได้'
                : undefined
            }
            placeholder={provinceCode ? `ระบุ${dLabel}` : 'เลือกจังหวัดก่อน'}
            value={address.district ?? ''}
            error={errors[field('district')]}
            onChange={(e) =>
              onChange({ ...address, district: e.target.value, districtCode: undefined })
            }
          />
        )}
      </div>

      {/* ตำบล/แขวง — ต้องเลือกอำเภอก่อน */}
      <div data-field={field('subdistrict')}>
        {hasDistrictMaster && address.districtCode ? (
          <Combobox<Subdistrict>
            label={sLabel}
            required={required}
            disabled={disabled}
            value={address.subdistrict ?? ''}
            error={errors[field('subdistrict')]}
            placeholder={`ระบุ${sLabel}`}
            emptyMessage={`ไม่พบ${sLabel}ที่ค้นหา`}
            items={subdistrictOptions}
            getKey={(s) => `${s.districtCode}-${s.nameEn}`}
            getLabel={(s) => s.nameTh}
            getSubLabel={(s) => s.nameEn}
            onSearch={setSubdistrictQuery}
            onSelect={(subdistrict) => onChange(selectSubdistrict(address, subdistrict))}
          />
        ) : (
          <TextInput
            label={sLabel}
            required={required}
            disabled={disabled || !address.district?.trim()}
            hint={
              address.district?.trim() && hasDistrictMaster
                ? undefined
                : address.district?.trim()
                  ? 'พิมพ์เองได้'
                  : undefined
            }
            placeholder={address.district?.trim() ? `ระบุ${sLabel}` : `เลือก${dLabel}ก่อน`}
            value={address.subdistrict ?? ''}
            error={errors[field('subdistrict')]}
            onChange={(e) => onChange({ ...address, subdistrict: e.target.value })}
          />
        )}
      </div>

      {/* รหัสไปรษณีย์ — หลายรหัสให้เลือก · รหัสเดียวถูกเติมให้แล้ว */}
      <div data-field={field('postalCode')}>
        {postalOptions.length > 1 ? (
          <SelectInput
            label="รหัสไปรษณีย์"
            required={required}
            disabled={disabled}
            placeholder="ระบุรหัสไปรษณีย์"
            hint={`${sLabel}นี้มีหลายรหัส — เลือกให้ตรงกับที่อยู่`}
            value={address.postalCode ?? ''}
            error={errors[field('postalCode')]}
            onChange={(e) => onChange({ ...address, postalCode: e.target.value })}
            options={postalOptions.map((code) => ({ value: code, label: code }))}
          />
        ) : (
          <TextInput
            label="รหัสไปรษณีย์"
            required={required}
            disabled={disabled}
            inputMode="numeric"
            maxLength={5}
            placeholder="ระบุรหัสไปรษณีย์"
            hint={
              postalOptions.length === 1
                ? `เติมให้อัตโนมัติจาก${sLabel}ที่เลือก`
                : 'ตัวเลข 5 หลัก'
            }
            value={address.postalCode ?? ''}
            error={errors[field('postalCode')]}
            onChange={(e) => onChange({ ...address, postalCode: e.target.value })}
          />
        )}
      </div>
    </>
  );
}
