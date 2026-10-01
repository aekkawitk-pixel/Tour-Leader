/**
 * นำ 5 โซนออกจากตัวเลือก “โซนที่เชี่ยวชาญ” — Middle East / Africa / North America /
 * South America / Oceania
 *
 * นำออกด้วยการปิดใช้งาน (active: false) ไม่ลบถาวร:
 *   • getZones() (แหล่งเดียวของทุก Dropdown) ต้องไม่คืน 5 รายการนี้
 *   • zoneById() ต้องยังแปลง id เดิมได้ ข้อมูลหัวหน้าทัวร์เก่าจึงไม่พังและไม่แสดงเป็น id ดิบ
 *   • ประเทศ/เส้นทาง/สนามบินของภูมิภาคเหล่านั้นต้องไม่ถูกแตะ
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ZONE_MASTER,
  getZones,
  getAllZones,
  zoneById,
  zoneCountries,
} from '../src/data/leaders/zoneMaster';
import { buildSeedCountries } from '../src/data/countryMaster';
import { airportsOfCountry } from '../src/data/airports';

const REMOVED = ['Z-MIDDLE-EAST', 'Z-AFRICA', 'Z-NORTH-AMERICA', 'Z-SOUTH-AMERICA', 'Z-OCEANIA'];
const KEPT = ['Z-ASIA', 'Z-EUROPE', 'Z-SCANDINAVIA'];

/** Country Master ชุดเดียวกับที่ระบบใช้ตอนรัน */
const COUNTRIES = buildSeedCountries();

describe('Zone Master — นำ 5 โซนออกจากตัวเลือก', () => {
  test('getZones() คืนเฉพาะโซนที่เปิดใช้งาน 3 รายการ เรียงตามลำดับ', () => {
    assert.deepEqual(getZones().map((z) => z.id), KEPT);
  });

  test('5 โซนที่นำออกไม่อยู่ในตัวเลือก (เลือก/ค้นหาไม่ได้)', () => {
    const ids = new Set(getZones().map((z) => z.id));
    for (const id of REMOVED) assert.ok(!ids.has(id), `${id} ต้องไม่อยู่ใน Dropdown`);
  });

  test('ค้นหาด้วยชื่อโซนที่นำออกแล้วไม่พบ (ทั้งอังกฤษและไทย)', () => {
    const names = getZones().flatMap((z) => [z.nameEn, z.nameTh]);
    for (const n of ['Middle East', 'ตะวันออกกลาง', 'Africa', 'แอฟริกา', 'North America',
      'อเมริกาเหนือ', 'South America', 'อเมริกาใต้', 'Oceania', 'โอเชียเนีย']) {
      assert.ok(!names.includes(n), `ต้องค้นหา “${n}” ไม่พบ`);
    }
  });

  test('ลำดับต่อเนื่องไม่มีช่องว่าง', () => {
    assert.deepEqual(getZones().map((z) => z.order), [1, 2, 3]);
  });

  test('ไม่มี id ซ้ำใน Master', () => {
    const ids = ZONE_MASTER.map((z) => z.id);
    assert.equal(new Set(ids).size, ids.length);
  });

  test('ปิดใช้งานแทนการลบถาวร — ยังอยู่ใน Master ครบ', () => {
    assert.equal(getAllZones().length, 8);
    for (const id of REMOVED) {
      const z = zoneById(id);
      assert.ok(z, `${id} ต้องยังอยู่ใน Master`);
      assert.equal(z!.active, false, `${id} ต้องเป็น Inactive`);
    }
    for (const id of KEPT) assert.equal(zoneById(id)!.active, true);
  });

  test('ข้อมูลเดิมที่อ้างโซนที่ถูกนำออก ยังแปลงเป็นชื่อโซนได้ (ไม่พัง/ไม่โชว์ id ดิบ)', () => {
    assert.equal(zoneById('Z-OCEANIA')?.nameEn, 'Oceania');
    assert.equal(zoneById('Z-MIDDLE-EAST')?.nameTh, 'ตะวันออกกลาง');
  });
});

describe('Zone Master — ประเทศ/เส้นทางของภูมิภาคที่นำโซนออกต้องไม่ถูกแตะ', () => {
  test('ประเทศใน Country Master ยังอยู่ครบ เลือกจากช่องประเทศได้', () => {
    // ตัวแทนของแต่ละภูมิภาคที่ถูกนำโซนออก
    for (const alpha2 of ['AE', 'ZA', 'US', 'BR', 'AU']) {
      const c = COUNTRIES.find((x) => x.alpha2 === alpha2);
      assert.ok(c, `ประเทศ ${alpha2} ต้องยังอยู่ใน Country Master`);
      assert.ok(c!.isActive, `ประเทศ ${alpha2} ต้องยังเปิดใช้งาน`);
    }
  });

  test('zoneCountries ของโซนที่ปิดใช้งานยังคำนวณได้ (ใช้แสดงข้อมูลเดิม)', () => {
    const oceania = zoneById('Z-OCEANIA')!;
    assert.ok(zoneCountries(oceania, COUNTRIES).length > 0);
  });

  test('เส้นทาง/รหัสสนามบินของประเทศเหล่านั้นยังใช้งานได้', () => {
    for (const alpha2 of ['AE', 'US', 'AU']) {
      assert.ok(
        airportsOfCountry(alpha2).length > 0,
        `สนามบินของ ${alpha2} ต้องยังอยู่`,
      );
    }
  });
});
