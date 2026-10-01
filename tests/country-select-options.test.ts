/**
 * เทสต์ตัวเลือกที่อ้างอิง Country Master — ช่อง "ประเทศผู้ออก" กับช่อง "สัญชาติ"
 *
 * บนหน้าหนังสือเดินทางสองช่องนี้คนละรูปแบบ: Country Code = THA · Nationality = THAI
 * master จึงต้องเก็บทั้งรหัสและคำสัญชาติ และค่าที่ให้เลือกต้องผ่าน validation เสมอ
 *
 * รันด้วย: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  countrySelectOptions,
  nationalitySelectOptions,
  passportCountryCodeOf,
  buildSeedCountries,
} from '@/data/countryMaster';
import { ISO_COUNTRY_SEED } from '@/data/isoCountries';
import { resolveCountry } from '@/lib/logic/passportValidation';
import type { Country } from '@/types';

const country = (over: Partial<Country> & { code: string }): Country => ({
  id: `C-${over.code}`,
  nameTh: 'ทดสอบ',
  nameEn: 'TEST',
  isActive: true,
  ...over,
});

const TH = country({ code: 'TH', alpha2: 'TH', alpha3: 'THA', nationality: 'THAI', nameTh: 'ไทย', nameEn: 'THAILAND' });
const JP = country({ code: 'JP', alpha2: 'JP', alpha3: 'JPN', nationality: 'JAPANESE', nameTh: 'ญี่ปุ่น', nameEn: 'JAPAN' });
const GB = country({ code: 'GB', alpha2: 'GB', alpha3: 'GBR', nationality: 'BRITISH', nameTh: 'สหราชอาณาจักร', nameEn: 'UNITED KINGDOM' });
const JE = country({ code: 'JE', alpha2: 'JE', alpha3: 'JEY', nationality: 'BRITISH', nameTh: 'เจอร์ซีย์', nameEn: 'JERSEY' });
const OFF = country({ code: 'XX', alpha2: 'XX', alpha3: 'XXX', nationality: 'TESTIAN', isActive: false });
const LEGACY = country({ code: 'KR', alpha2: 'KR', nameTh: 'เกาหลีใต้', nameEn: 'SOUTH KOREA' }); // ยังไม่มี alpha-3/สัญชาติ

describe('countrySelectOptions — ช่องประเทศผู้ออก (รหัส)', () => {
  test('ใช้รหัส alpha-3 ตามที่พิมพ์บนหน้าเล่ม', () => {
    assert.equal(passportCountryCodeOf(TH), 'THA');
    assert.deepEqual(countrySelectOptions([TH])[0], { value: 'THA', label: 'THA · ไทย (THAILAND)' });
  });

  test('ประเทศที่ยังไม่มี alpha-3 ใช้ alpha-2 แทน — ตัวเลือกต้องไม่หาย', () => {
    assert.equal(passportCountryCodeOf(LEGACY), 'KR');
    assert.ok(countrySelectOptions([LEGACY]).some((o) => o.value === 'KR'));
  });

  test('ประเทศที่ปิดใช้งานไม่อยู่ในตัวเลือก (เลือกใหม่ไม่ได้)', () => {
    assert.deepEqual(countrySelectOptions([OFF]), []);
  });

  test('คงลำดับตาม master — ไทยอยู่ต้นตามที่ master จัดไว้', () => {
    assert.deepEqual(countrySelectOptions([TH, JP]).map((o) => o.value), ['THA', 'JPN']);
  });

  test('รหัสซ้ำถูกตัดออก (ตัวเลือกซ้ำทำให้ผู้ใช้สับสนว่าต่างกันตรงไหน)', () => {
    const dup = country({ code: 'T2', alpha2: 'T2', alpha3: 'THA', nameTh: 'ไทย (ซ้ำ)', nameEn: 'THAILAND DUP' });
    assert.equal(countrySelectOptions([TH, dup]).length, 1);
  });
});

describe('nationalitySelectOptions — ช่องสัญชาติ (คำเต็ม)', () => {
  test('ใช้คำสัญชาติตามที่พิมพ์บนหน้าเล่ม — THAI ไม่ใช่ THA', () => {
    assert.deepEqual(nationalitySelectOptions([TH])[0], { value: 'THAI', label: 'THAI · ไทย' });
  });

  test('ดินแดนที่ใช้สัญชาติเดียวกับประเทศแม่ รวมเป็นตัวเลือกเดียว', () => {
    const options = nationalitySelectOptions([GB, JE]);
    assert.equal(options.length, 1);
    assert.equal(options[0].value, 'BRITISH');
    assert.ok(options[0].label.includes('เจอร์ซีย์'), 'ป้ายต้องบอกด้วยว่าครอบคลุมดินแดนไหนบ้าง');
  });

  test('ประเทศที่ยังไม่มีสัญชาติใน master ไม่โผล่เป็นตัวเลือกว่าง', () => {
    assert.deepEqual(nationalitySelectOptions([LEGACY]), []);
  });

  test('ประเทศที่ปิดใช้งานไม่อยู่ในตัวเลือก', () => {
    assert.deepEqual(nationalitySelectOptions([OFF]), []);
  });
});

describe('ตัวเลือกทั้งสองชุดต้องผ่าน validation', () => {
  const master = [TH, JP, GB, JE, LEGACY];

  test('ทุกรหัสประเทศที่ให้เลือก resolveCountry หาเจอ', () => {
    for (const option of countrySelectOptions(master)) {
      assert.ok(resolveCountry(option.value, master), `เลือก ${option.value} แล้ว validation หาไม่เจอ`);
    }
  });

  test('ทุกสัญชาติที่ให้เลือก resolveCountry หาเจอ', () => {
    for (const option of nationalitySelectOptions(master)) {
      assert.ok(resolveCountry(option.value, master), `เลือก ${option.value} แล้ว validation หาไม่เจอ`);
    }
  });
});

describe('ชุดข้อมูล ISO — สัญชาติต้องครบ', () => {
  const seeded = buildSeedCountries();

  test('ทุกประเทศมีสัญชาติ ยกเว้นดินแดนที่ไม่มีสัญชาติจริง ๆ', () => {
    const blank = ISO_COUNTRY_SEED.filter((s) => !s.nationality).map((s) => s.alpha2);
    assert.deepEqual(blank, ['AQ'], 'มีแค่แอนตาร์กติกาที่ไม่มีสัญชาติ');
  });

  test('THA/THAI ของไทยตรงกับที่พิมพ์บนเล่มจริง', () => {
    const th = seeded.find((c) => c.alpha2 === 'TH');
    assert.equal(th?.alpha3, 'THA');
    assert.equal(th?.nationality, 'THAI');
  });

  test('"THAI" จากหน้าเล่ม/OCR resolve กลับมาเป็นไทยได้ (เดิมบันทึกไม่ผ่าน)', () => {
    assert.equal(resolveCountry('THAI', seeded)?.alpha2, 'TH');
  });

  test('สัญชาติเป็นตัวพิมพ์ใหญ่ล้วนเหมือนที่พิมพ์บนเล่ม', () => {
    const lower = seeded.filter((c) => c.nationality && c.nationality !== c.nationality.toUpperCase());
    assert.deepEqual(lower, []);
  });
});
