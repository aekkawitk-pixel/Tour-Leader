/**
 * ประเทศของกรุ๊ปจาก Zego — แก้เมื่อ Zego ระบุไม่ตรงกับปลายทางตามหัวรหัสกรุ๊ป (lib/logic/zegoCountry)
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { resolveZegoCountry } from '../src/lib/logic/zegoCountry';

describe('resolveZegoCountry', () => {
  test('Zego ระบุผิดประเทศ (กรุ๊ปจีนเป็น AMERICA) → ใช้ประเทศปลายทาง', () => {
    const r = resolveZegoCountry('AMERICA', 'US', 'CKG-261001A-HU');
    assert.equal(r.countryName, 'CHINA');
    assert.equal(r.countryCode, 'CN');
    assert.equal(r.correctedFrom, 'AMERICA');
  });

  test('ตรงอยู่แล้ว → คงค่า Zego ไม่ติดข้อความแก้ไข', () => {
    const r = resolveZegoCountry('CHINA', 'CN', 'CKG-261015A-QW');
    assert.equal(r.countryName, 'CHINA');
    assert.equal(r.correctedFrom, null);
  });

  test('ดูปลายทางจากหัวรหัสกรุ๊ป ไม่ใช่เที่ยวบินขาแรก — จอร์เจียที่ต่อเครื่องอิสตันบูลยังเป็นจอร์เจีย', () => {
    assert.equal(resolveZegoCountry('GEORGIA', 'GE', 'TBS-261017A-TK').correctedFrom, null);
  });

  test('ปลายทางที่ไม่อยู่ใน Airport Master ใช้ตารางสำรอง (HBE อเล็กซานเดรีย)', () => {
    assert.equal(resolveZegoCountry('AMERICA', 'US', 'HBE-261019H-SV').countryName, 'EGYPT');
    assert.equal(resolveZegoCountry('EGYPT', 'EG', 'HBE-261019H-SV').correctedFrom, null);
  });

  test('ภูมิภาคที่รวมปลายทางไว้แล้ว → คงค่า Zego (EUROPE ลงแฟรงก์เฟิร์ต ไม่กลายเป็น GERMANY)', () => {
    const r = resolveZegoCountry('EUROPE', '', 'FRA-261010A-TG');
    assert.equal(r.countryName, 'EUROPE');
    assert.equal(r.correctedFrom, null);
  });

  test('ภูมิภาคที่ไม่รวมปลายทาง → แก้เป็นประเทศปลายทาง', () => {
    assert.equal(resolveZegoCountry('EUROPE', '', 'NRT-261010A-TG').countryName, 'JAPAN');
  });

  test('ค่าที่ไม่รู้จัก หรือหาปลายทางไม่ได้ → คงค่า Zego (ไม่เดา)', () => {
    assert.equal(resolveZegoCountry('ทัวร์พิเศษ', '', 'CKG-261001A-HU').countryName, 'ทัวร์พิเศษ');
    assert.equal(resolveZegoCountry('AMERICA', 'US', 'XXX-261001A-HU').countryName, 'AMERICA');
    assert.equal(resolveZegoCountry('AMERICA', 'US', '').countryName, 'AMERICA');
  });
});
