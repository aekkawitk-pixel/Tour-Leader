/**
 * ตรรกะที่อยู่แบบลำดับต่อเนื่อง จังหวัด → อำเภอ/เขต → ตำบล/แขวง → รหัสไปรษณีย์
 * ฟังก์ชันบริสุทธิ์ ไม่มี UI — ใช้ร่วมกันทุกที่อยู่ในระบบเพื่อให้พฤติกรรมเหมือนกัน
 */

import {
  findProvinceByName,
  postalCodesOf,
  type District,
  type Province,
  type Subdistrict,
} from '@/data/thaiAdmin';
import type { LeaderAddress } from '@/types';

/** เลือกจังหวัด — เก็บทั้งรหัสและชื่อ · เปลี่ยนจังหวัด = ล้างอำเภอ/ตำบล/รหัสไปรษณีย์ที่ไม่สัมพันธ์ */
export function selectProvince(address: LeaderAddress, province: Province | null): LeaderAddress {
  if (!province) {
    return {
      ...address,
      province: '',
      provinceCode: undefined,
      district: '',
      districtCode: undefined,
      subdistrict: '',
      postalCode: '',
    };
  }
  if (address.provinceCode === province.code) return address;

  return {
    ...address,
    province: province.nameTh,
    provinceCode: province.code,
    district: '',
    districtCode: undefined,
    subdistrict: '',
    postalCode: '',
  };
}

/** เลือกอำเภอ/เขต — เปลี่ยนอำเภอ = ล้างตำบลและรหัสไปรษณีย์ */
export function selectDistrict(address: LeaderAddress, district: District | null): LeaderAddress {
  if (!district) {
    return { ...address, district: '', districtCode: undefined, subdistrict: '', postalCode: '' };
  }
  if (address.districtCode === district.code) return address;

  return {
    ...address,
    district: district.nameTh,
    districtCode: district.code,
    subdistrict: '',
    postalCode: '',
  };
}

/**
 * เลือกตำบล/แขวง — เติมรหัสไปรษณีย์ให้เมื่อระบุได้แน่นอน (มีรหัสเดียว)
 * ถ้ามีหลายรหัส ให้ผู้ใช้เลือกเองจากรายการ (คืนค่าว่างไว้ก่อน)
 */
export function selectSubdistrict(
  address: LeaderAddress,
  subdistrict: Subdistrict | null,
): LeaderAddress {
  if (!subdistrict) return { ...address, subdistrict: '', postalCode: '' };

  const codes = subdistrict.postalCodes;
  return {
    ...address,
    subdistrict: subdistrict.nameTh,
    postalCode: codes.length === 1 ? codes[0] : '',
  };
}

/** รหัสไปรษณีย์ที่เลือกได้ของที่อยู่นี้ (ตามตำบลที่เลือกไว้) */
export function postalOptionsFor(address: LeaderAddress): string[] {
  if (!address.subdistrict) return [];
  return postalCodesOf(address.districtCode, address.subdistrict);
}

/**
 * ข้อมูลเดิมที่เก็บไว้ก่อนมี Master (มีแต่ชื่อจังหวัด ไม่มีรหัส) — เติมรหัสให้ถ้าชื่อตรงกับรายการ
 * ใช้ตอนโหลด record เข้าฟอร์ม เพื่อให้ Autocomplete รู้ว่าเลือกจังหวัดไหนอยู่
 */
export function withResolvedProvinceCode(address: LeaderAddress): LeaderAddress {
  if (address.provinceCode || !address.province?.trim()) return address;
  const province = findProvinceByName(address.province);
  return province ? { ...address, provinceCode: province.code } : address;
}
