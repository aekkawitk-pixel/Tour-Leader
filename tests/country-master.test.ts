/**
 * เทสต์ Master "ประเทศ" ตาม ISO 3166-1
 *   - ชุด seed ครบและไม่ซ้ำ (ป้องกันข้อมูลซ้ำด้วย alpha-2)
 *   - upsert รันซ้ำได้ (idempotent) และไม่เขียนทับข้อมูลเดิมที่ผู้ใช้บันทึกไว้
 *   - เรียงชื่อไทยตามตัวอักษร โดยประเทศไทยอยู่ลำดับต้น
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  ISO_COUNTRY_SEED,
  upsertCountries,
  buildSeedCountries,
  sortCountries,
  alpha2Of,
} from '@/data/countryMaster';
import { countries } from '@/data/geo';
import type { Country } from '@/types';

/* --------------------------------- ชุด seed --------------------------------- */

describe('ชุดข้อมูล ISO 3166-1', () => {
  test('มีครบ 249 ประเทศ/ดินแดน', () => {
    assert.equal(ISO_COUNTRY_SEED.length, 249);
  });

  test('ไม่มี alpha-2 ซ้ำ', () => {
    const set = new Set(ISO_COUNTRY_SEED.map((c) => c.alpha2));
    assert.equal(set.size, ISO_COUNTRY_SEED.length);
  });

  test('ทุกรายการมีข้อมูลครบตามที่กำหนด', () => {
    for (const c of ISO_COUNTRY_SEED) {
      assert.match(c.alpha2, /^[A-Z]{2}$/, `alpha2 ผิดรูปแบบ: ${c.alpha2}`);
      assert.match(c.alpha3, /^[A-Z]{3}$/, `alpha3 ผิดรูปแบบ: ${c.alpha3}`);
      assert.match(c.callingCode, /^\+\d+$/, `รหัสโทรผิดรูปแบบ: ${c.alpha2}`);
      assert.ok(c.nameTh.trim(), `ไม่มีชื่อไทย: ${c.alpha2}`);
      assert.ok(c.nameEn.trim(), `ไม่มีชื่ออังกฤษ: ${c.alpha2}`);
      assert.ok(c.region.trim() && c.subregion.trim(), `ไม่มีภูมิภาค: ${c.alpha2}`);
    }
  });

  test('มีประเทศไทยและข้อมูลถูกต้อง', () => {
    const th = ISO_COUNTRY_SEED.find((c) => c.alpha2 === 'TH');
    assert.ok(th);
    assert.equal(th?.alpha3, 'THA');
    assert.equal(th?.callingCode, '+66');
    assert.equal(th?.nameTh, 'ไทย');
  });
});

/* --------------------------------- upsert --------------------------------- */

describe('upsertCountries', () => {
  test('เพิ่มทุกประเทศเมื่อเริ่มจากรายการว่าง', () => {
    const result = upsertCountries([]);
    assert.equal(result.length, ISO_COUNTRY_SEED.length);
  });

  test('รันซ้ำแล้วจำนวนไม่เพิ่ม (idempotent) และกันซ้ำด้วย alpha-2', () => {
    const once = upsertCountries([]);
    const twice = upsertCountries(once);
    assert.equal(twice.length, once.length);
    const set = new Set(twice.map((c) => alpha2Of(c)));
    assert.equal(set.size, twice.length);
  });

  test('ไม่เขียนทับข้อมูลเดิมที่ผู้ใช้บันทึกไว้ (ชื่อ/สถานะ)', () => {
    const existing: Country[] = [
      { id: 'C-JP', code: 'JP', nameTh: 'ญี่ปุ่น (แก้เอง)', nameEn: 'NIPPON', isActive: false },
    ];
    const result = upsertCountries(existing);
    const jp = result.find((c) => alpha2Of(c) === 'JP');
    assert.equal(jp?.nameTh, 'ญี่ปุ่น (แก้เอง)');
    assert.equal(jp?.nameEn, 'NIPPON');
    assert.equal(jp?.isActive, false);
    // แต่ยังเติมข้อมูลมาตรฐานที่ยังว่างให้
    assert.equal(jp?.alpha3, 'JPN');
    assert.equal(jp?.callingCode, '+81');
  });

  test('ไม่ลบรายการเดิมที่ไม่อยู่ใน seed', () => {
    const existing: Country[] = [
      { id: 'C-ZZ', code: 'ZZ', nameTh: 'ดินแดนสมมติ', nameEn: 'CUSTOM', isActive: true },
    ];
    const result = upsertCountries(existing);
    assert.ok(result.some((c) => c.id === 'C-ZZ'));
    assert.equal(result.length, ISO_COUNTRY_SEED.length + 1);
  });
});

/* --------------------------------- การเรียง --------------------------------- */

describe('sortCountries / buildSeedCountries', () => {
  test('ประเทศไทยอยู่ลำดับต้นเสมอ', () => {
    const list = buildSeedCountries();
    assert.equal(alpha2Of(list[0]), 'TH');
    assert.equal(list[0].order, 0);
  });

  test('ที่เหลือเรียงตามชื่อไทย', () => {
    const list = buildSeedCountries().slice(1); // ตัดไทยออก
    const collator = new Intl.Collator('th');
    for (let i = 1; i < list.length; i += 1) {
      assert.ok(
        collator.compare(list[i - 1].nameTh, list[i].nameTh) <= 0,
        `ลำดับผิดที่ ${list[i - 1].nameTh} / ${list[i].nameTh}`,
      );
    }
  });

  test('order ต่อเนื่องตามตำแหน่งจริง', () => {
    const list = sortCountries(upsertCountries([]));
    list.forEach((c, i) => assert.equal(c.order, i));
  });
});

/* ------------------------ Master ที่ระบบใช้งานจริง (geo) ------------------------ */

describe('countries ที่ระบบใช้งาน', () => {
  test('คง id เดิมของประเทศที่เส้นทาง/หัวหน้าทัวร์อ้างถึง', () => {
    for (const id of ['C-TH', 'C-JP', 'C-KR', 'C-TW', 'C-TR']) {
      assert.ok(countries.some((c) => c.id === id), `หาย id: ${id}`);
    }
  });

  test('รวมเป็น 249 ประเทศและไม่มี alpha-2 ซ้ำ', () => {
    assert.equal(countries.length, 249);
    const set = new Set(countries.map((c) => alpha2Of(c)));
    assert.equal(set.size, 249);
  });

  test('ประเทศไทยอยู่ลำดับแรก', () => {
    assert.equal(countries[0].id, 'C-TH');
  });
});
