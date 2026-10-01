/**
 * ข้อมูลภูมิศาสตร์ไทย (จังหวัด / อำเภอ / ตำบล / รหัสไปรษณีย์)
 * โหลดจากโครงการ thailand-geography-data (JSON แบนราบ 1 แถวต่อ 1 ตำบล)
 *   https://github.com/thailand-geography-data/thailand-geography-json
 *
 * ⚠️ ฟังก์ชันแปลงข้อมูลเป็นฟังก์ชันบริสุทธิ์ ทดสอบแยกจาก network ได้
 */

export const GEOGRAPHY_URL =
  'https://raw.githubusercontent.com/thailand-geography-data/thailand-geography-json/main/src/geography.json';

/** ข้อความแจ้งเมื่อโหลดข้อมูลที่อยู่ไม่สำเร็จ */
export const GEOGRAPHY_ERROR_MESSAGE =
  'ไม่สามารถโหลดรายการที่อยู่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วเปิดหน้าใหม่';

export interface GeographyRow {
  provinceNameTh: string;
  districtNameTh: string;
  subdistrictNameTh: string;
  postalCode: number | string;
}

/** ตรวจว่า 1 แถวมีฟิลด์ที่จำเป็นครบตามที่ระบบต้องใช้ */
export function isValidGeographyRow(row: unknown): row is GeographyRow {
  if (!row || typeof row !== 'object') return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.provinceNameTh === 'string' &&
    typeof r.districtNameTh === 'string' &&
    typeof r.subdistrictNameTh === 'string' &&
    (typeof r.postalCode === 'number' || typeof r.postalCode === 'string')
  );
}

/**
 * ตรวจโครงสร้างข้อมูลทั้งชุดก่อนใช้งาน — คืนเฉพาะแถวที่ถูกต้อง
 * โยน error ถ้าไม่ใช่ array, ว่างเปล่า หรือฟิลด์ที่จำเป็นไม่ครบ
 */
export function parseGeography(data: unknown): GeographyRow[] {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('โครงสร้างข้อมูลที่อยู่ไม่ถูกต้อง (ต้องเป็นรายการที่ไม่ว่าง)');
  }
  // ตรวจตัวอย่างแถวแรก ๆ ว่ามีฟิลด์ครบ (provinceNameTh/districtNameTh/subdistrictNameTh/postalCode)
  const sample = data.slice(0, 5);
  if (!sample.every(isValidGeographyRow)) {
    throw new Error(
      'โครงสร้างข้อมูลที่อยู่ไม่ครบ — ต้องมี provinceNameTh, districtNameTh, subdistrictNameTh และ postalCode',
    );
  }
  return data.filter(isValidGeographyRow);
}

/**
 * โหลดข้อมูลที่อยู่จาก URL (รองรับ AbortSignal เพื่อยกเลิกได้)
 * รับ `fetchImpl` เพื่อให้ทดสอบโดยไม่ต้องต่อ network ได้
 */
export async function fetchGeography(
  signal?: AbortSignal,
  fetchImpl: typeof fetch = fetch,
): Promise<GeographyRow[]> {
  const response = await fetchImpl(GEOGRAPHY_URL, { signal });
  if (!response.ok) {
    throw new Error(`โหลดข้อมูลที่อยู่ไม่สำเร็จ (HTTP ${response.status})`);
  }
  const data = await response.json();
  return parseGeography(data);
}

const byThai = (a: string, b: string) => a.localeCompare(b, 'th');

/** รายชื่อจังหวัดทั้งหมด (ไม่ซ้ำ เรียงตามอักษรไทย) */
export function listProvinces(rows: GeographyRow[]): string[] {
  return Array.from(new Set(rows.map((r) => r.provinceNameTh))).sort(byThai);
}

/** อำเภอ/เขตในจังหวัดที่เลือก */
export function listDistricts(rows: GeographyRow[], province: string): string[] {
  if (!province) return [];
  return Array.from(
    new Set(rows.filter((r) => r.provinceNameTh === province).map((r) => r.districtNameTh)),
  ).sort(byThai);
}

/** ตำบล/แขวงในอำเภอที่เลือก */
export function listSubdistricts(
  rows: GeographyRow[],
  province: string,
  district: string,
): string[] {
  if (!province || !district) return [];
  return Array.from(
    new Set(
      rows
        .filter((r) => r.provinceNameTh === province && r.districtNameTh === district)
        .map((r) => r.subdistrictNameTh),
    ),
  ).sort(byThai);
}

/** รหัสไปรษณีย์ของตำบลที่เลือก (คืน '' ถ้าไม่พบ) */
export function lookupPostalCode(
  rows: GeographyRow[],
  province: string,
  district: string,
  subdistrict: string,
): string {
  const row = rows.find(
    (r) =>
      r.provinceNameTh === province &&
      r.districtNameTh === district &&
      r.subdistrictNameTh === subdistrict,
  );
  return row ? String(row.postalCode) : '';
}
