/**
 * เทสต์ข้อมูลภูมิศาสตร์ไทย (จังหวัด/อำเภอ/ตำบล/รหัสไปรษณีย์)
 *   - ตรวจโครงสร้างข้อมูลก่อนใช้งาน
 *   - ตัวเลือกแบบต่อเนื่อง (จังหวัด → อำเภอ → ตำบล)
 *   - การเติมรหัสไปรษณีย์อัตโนมัติ
 *   - สถานะการโหลด (สำเร็จ / ล้มเหลว / โครงสร้างผิด)
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchGeography,
  isValidGeographyRow,
  listDistricts,
  listProvinces,
  listSubdistricts,
  lookupPostalCode,
  parseGeography,
  type GeographyRow,
} from '@/lib/thaiGeography';

const FIXTURE: GeographyRow[] = [
  { provinceNameTh: 'กรุงเทพมหานคร', districtNameTh: 'ห้วยขวาง', subdistrictNameTh: 'ห้วยขวาง', postalCode: 10310 },
  { provinceNameTh: 'กรุงเทพมหานคร', districtNameTh: 'ห้วยขวาง', subdistrictNameTh: 'บางกะปิ', postalCode: 10310 },
  { provinceNameTh: 'กรุงเทพมหานคร', districtNameTh: 'จตุจักร', subdistrictNameTh: 'จอมพล', postalCode: 10900 },
  { provinceNameTh: 'เชียงใหม่', districtNameTh: 'เมืองเชียงใหม่', subdistrictNameTh: 'ศรีภูมิ', postalCode: 50200 },
];

/* --------------------------- ตรวจโครงสร้างข้อมูล --------------------------- */

describe('ตรวจโครงสร้างข้อมูลที่อยู่', () => {
  test('แถวที่มีฟิลด์ครบผ่าน · ขาดฟิลด์ไม่ผ่าน', () => {
    assert.ok(isValidGeographyRow(FIXTURE[0]));
    assert.ok(isValidGeographyRow({ ...FIXTURE[0], postalCode: '10310' })); // postalCode เป็น string ก็ได้
    assert.ok(!isValidGeographyRow({ provinceNameTh: 'x' }));
    assert.ok(!isValidGeographyRow({ ...FIXTURE[0], postalCode: null }));
    assert.ok(!isValidGeographyRow(null));
  });

  test('parseGeography คืนข้อมูลเมื่อถูกต้อง · โยน error เมื่อผิด', () => {
    assert.equal(parseGeography(FIXTURE).length, 4);
    assert.throws(() => parseGeography([]), /ไม่ถูกต้อง/);
    assert.throws(() => parseGeography('nope'), /ไม่ถูกต้อง/);
    assert.throws(() => parseGeography([{ provinceNameTh: 'x' }]), /ไม่ครบ/);
  });
});

/* -------------------------- ตัวเลือกแบบต่อเนื่อง -------------------------- */

describe('ตัวเลือกที่อยู่แบบต่อเนื่อง', () => {
  test('จังหวัดไม่ซ้ำและเรียงตามอักษรไทย', () => {
    assert.deepEqual(listProvinces(FIXTURE), ['กรุงเทพมหานคร', 'เชียงใหม่']);
  });

  test('อำเภอถูกจำกัดเฉพาะจังหวัดที่เลือก (ไม่ซ้ำ)', () => {
    assert.deepEqual(listDistricts(FIXTURE, 'กรุงเทพมหานคร'), ['จตุจักร', 'ห้วยขวาง']);
    assert.deepEqual(listDistricts(FIXTURE, 'เชียงใหม่'), ['เมืองเชียงใหม่']);
    assert.deepEqual(listDistricts(FIXTURE, ''), [], 'ยังไม่เลือกจังหวัด = ไม่มีอำเภอ');
  });

  test('ตำบลถูกจำกัดเฉพาะอำเภอที่เลือก', () => {
    assert.deepEqual(listSubdistricts(FIXTURE, 'กรุงเทพมหานคร', 'ห้วยขวาง'), ['บางกะปิ', 'ห้วยขวาง']);
    assert.deepEqual(listSubdistricts(FIXTURE, 'กรุงเทพมหานคร', ''), [], 'ยังไม่เลือกอำเภอ = ไม่มีตำบล');
  });
});

/* ---------------------------- เติมรหัสไปรษณีย์ ---------------------------- */

describe('เติมรหัสไปรษณีย์อัตโนมัติ', () => {
  test('เลือกตำบลแล้วได้รหัสไปรษณีย์ที่ตรงกัน (เป็นสตริง)', () => {
    assert.equal(lookupPostalCode(FIXTURE, 'กรุงเทพมหานคร', 'จตุจักร', 'จอมพล'), '10900');
    assert.equal(lookupPostalCode(FIXTURE, 'เชียงใหม่', 'เมืองเชียงใหม่', 'ศรีภูมิ'), '50200');
  });

  test('ไม่พบตำบล → คืนค่าว่าง', () => {
    assert.equal(lookupPostalCode(FIXTURE, 'กรุงเทพมหานคร', 'จตุจักร', 'ไม่มีจริง'), '');
  });
});

/* ------------------------------ สถานะการโหลด ----------------------------- */

describe('โหลดข้อมูลที่อยู่ (fetchGeography)', () => {
  const okResponse = (data: unknown) =>
    ({ ok: true, status: 200, json: async () => data }) as unknown as Response;

  test('โหลดสำเร็จ → คืนข้อมูลที่ตรวจแล้ว', async () => {
    const fakeFetch = (async () => okResponse(FIXTURE)) as unknown as typeof fetch;
    const rows = await fetchGeography(undefined, fakeFetch);
    assert.equal(rows.length, 4);
    assert.equal(rows[0].provinceNameTh, 'กรุงเทพมหานคร');
  });

  test('HTTP ไม่สำเร็จ → โยน error', async () => {
    const fakeFetch = (async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response) as unknown as typeof fetch;
    await assert.rejects(fetchGeography(undefined, fakeFetch), /ไม่สำเร็จ/);
  });

  test('โครงสร้างข้อมูลผิด → โยน error (ไม่ปล่อยให้ใช้งานต่อ)', async () => {
    const fakeFetch = (async () => okResponse([{ provinceNameTh: 'x' }])) as unknown as typeof fetch;
    await assert.rejects(fetchGeography(undefined, fakeFetch), /ไม่ครบ/);
  });

  test('ส่ง AbortSignal ต่อไปยัง fetch เพื่อให้ยกเลิกได้', async () => {
    const controller = new AbortController();
    let receivedSignal: AbortSignal | undefined;
    const fakeFetch = (async (_url: string, init?: RequestInit) => {
      receivedSignal = init?.signal ?? undefined;
      return okResponse(FIXTURE);
    }) as unknown as typeof fetch;
    await fetchGeography(controller.signal, fakeFetch);
    assert.equal(receivedSignal, controller.signal);
  });
});
