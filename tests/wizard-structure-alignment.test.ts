/**
 * หน้า "เพิ่มหัวหน้าทัวร์ใหม่" ต้องใช้โครงสร้างข้อมูลชุดเดียวกับหน้าแก้ไข/หน้ารายละเอียด
 *
 * ล็อกสองข้อบกพร่องที่เคยพบ:
 *   1) วิซาร์ดมี enum รูปแบบการร่วมงานของตัวเอง (permanent) ไม่ตรงกับระบบ (regular)
 *   2) ความเชี่ยวชาญที่กรอกตอนสร้าง ไม่ถูกเขียนลง Expertise Scope Store
 *      ทำให้คอลัมน์ "โซน / ประเทศ / เส้นทาง" และหน้า Schedule ไม่แสดงอะไรเลย
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  WIZARD_LEADER_TYPES, emptyWizardForm, wizardToLeaderForm, wizardToExpertiseScopes,
  type WizardForm,
} from '@/modules/tour-leaders/newLeaderWizard';
import { leaderToForm, formToLeader } from '@/modules/tour-leaders/mappers';
import { LEADER_TYPE, LEADER_TYPE_ORDER } from '@/lib/labels';
import { expertiseLines } from '@/lib/logic/expertiseSummary';
import { countries as countryMaster } from '@/data';
import type { TourLeader } from '@/types';

const TODAY = '2026-07-13';
const BUILD = { countries: countryMaster, routes: [], today: TODAY, actor: 'ผู้ทดสอบ' };
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

/** ฟอร์มวิซาร์ดที่กรอกข้อมูลขั้นต่ำพอจะแปลงเป็น record ได้ */
function form(over: Partial<WizardForm> = {}): WizardForm {
  return {
    ...emptyWizardForm('TL-000900'),
    firstName: 'สมชาย', lastName: 'ใจดี', nickname: 'ชาย',
    ...over,
  };
}
const toRecord = (f: WizardForm): TourLeader =>
  formToLeader(wizardToLeaderForm(f, 'TL-000900', TODAY), BUILD as never);

describe('AC2/AC6 รูปแบบการร่วมงานใช้ค่าและป้ายชุดเดียวทั้งระบบ', () => {
  test('ตัวเลือกในวิซาร์ด = LEADER_TYPE_ORDER ของระบบ', () => {
    assert.deepEqual(WIZARD_LEADER_TYPES.map((t) => t.code), LEADER_TYPE_ORDER);
    assert.deepEqual(
      WIZARD_LEADER_TYPES.map((t) => t.label),
      LEADER_TYPE_ORDER.map((c) => LEADER_TYPE[c].label),
    );
  });

  test('ไม่มีค่าเก่า "permanent" หลงเหลือ (ต้องเป็น regular)', () => {
    assert.equal(WIZARD_LEADER_TYPES.some((t) => (t.code as string) === 'permanent'), false);
    assert.ok(WIZARD_LEADER_TYPES.some((t) => t.code === 'regular'));
    const src = read('../src/modules/tour-leaders/newLeaderWizard.ts');
    assert.equal(/'permanent'/.test(src), false, 'ยังเหลือค่าเก่าในซอร์ส');
    assert.equal(src.includes('LEADER_TYPE_MAP'), false, 'ไม่ต้อง map ข้ามชุดค่าแล้ว');
  });

  test('ทุกค่าถูกบันทึกตรงตัว และเปิดหน้าแก้ไขได้ค่าเดียวกัน (Create ↔ Edit)', () => {
    for (const t of LEADER_TYPE_ORDER) {
      const rec = toRecord(form({ leaderType: t }));
      assert.equal(rec.leaderType, t, `บันทึก ${t}`);
      assert.equal(leaderToForm(rec).leaderType, t, `เปิดแก้ไข ${t}`);
    }
  });

  test('ป้ายที่ผู้ใช้เห็นตรงกับที่หน้าอื่นแสดง', () => {
    const rec = toRecord(form({ leaderType: 'regular' }));
    assert.equal(LEADER_TYPE[rec.leaderType].label, 'หัวหน้าทัวร์ประจำ');
  });

  test('ชื่อฟิลด์บนหน้าจอใช้ "รูปแบบการร่วมงาน" ไม่ใช่ชื่อเก่า', () => {
    const ui = read('../src/components/leaders/NewLeaderWizard.tsx');
    assert.ok(ui.includes('label="รูปแบบการร่วมงาน"'));
    assert.equal(ui.includes('label="ประเภทหัวหน้าทัวร์"'), false, 'ยังเหลือชื่อเก่า');
  });
});

describe('AC7/AC8 ความเชี่ยวชาญจากหน้าสร้าง ต้องแสดงในหน้ารายชื่อ/Schedule', () => {
  const jp = countryMaster.find((c) => c.nameEn === 'Japan') ?? countryMaster[0];
  const kr = countryMaster.find((c) => c.nameEn !== jp.nameEn) ?? countryMaster[1];
  const withCountries = () => form({
    expertiseScope: 'selected_countries',
    expertiseCountries: [
      {
        id: 'w1', countryCode: jp.id, countryNameTh: jp.nameTh, countryNameEn: jp.nameEn,
        routeScope: 'selected_routes',
        routes: [{ id: 'r1', countryCode: jp.id, iataCode: 'nrt', nameTh: '', nameEn: '', keywords: [], isCustom: false }],
        flightRoutes: [], expanded: true,
      },
      {
        id: 'w2', countryCode: kr.id, countryNameTh: kr.nameTh, countryNameEn: kr.nameEn,
        routeScope: 'all_routes', routes: [], flightRoutes: [], expanded: true,
      },
    ] as never,
  });

  test('แปลงเป็น ExpertiseScope ตามที่ผู้ใช้กรอกจริง', () => {
    const scopes = wizardToExpertiseScopes(withCountries());
    assert.equal(scopes.length, 2);
    assert.equal(scopes[0].countryId, jp.id);
    assert.equal(scopes[0].routeScope, 'specific');
    assert.deepEqual(scopes[0].routeCodes, ['NRT'], 'IATA ต้องเป็นตัวพิมพ์ใหญ่');
    assert.equal(scopes[0].isPrimaryCountry, true, 'ประเทศแรกเป็นรายการหลัก');
    assert.equal(scopes[1].routeScope, 'all_routes');
    assert.deepEqual(scopes[1].routeCodes, []);
  });

  test('ผลลัพธ์ render เป็นบรรทัดในคอลัมน์ "โซน / ประเทศ / เส้นทาง" ได้', () => {
    const lines = expertiseLines(wizardToExpertiseScopes(withCountries()), countryMaster);
    assert.equal(lines.length, 2);
    assert.ok(lines[0].headline.includes(jp.nameEn));
    assert.equal(lines[0].detail, 'NRT');
    assert.equal(lines[0].isPrimary, true);
    assert.equal(lines[1].detail, 'ทุกเส้นทาง');
  });

  test('ไม่เลือกประเทศ → ไม่สร้างข้อมูลลอย', () => {
    assert.deepEqual(wizardToExpertiseScopes(form()), []);
    assert.deepEqual(wizardToExpertiseScopes(form({ expertiseScope: 'all_countries' })), []);
  });

  test('หน้าสร้างบันทึกลง Expertise Scope Store ด้วย id จริงที่ระบบออกให้', () => {
    const ui = read('../src/components/leaders/NewLeaderWizard.tsx');
    assert.ok(ui.includes('saveExpertiseScopes(saved.id, scopes)'), 'ต้องใช้ saved.id ไม่ใช่ previewCode');
    // ลำดับภายในตัวจัดการ submit เท่านั้น (บรรทัด import อยู่ต้นไฟล์ จึงตัดออกก่อนเทียบ)
    const submit = ui.match(/const leaderForm = wizardToLeaderForm[\s\S]{0,800}?router\.push/)?.[0] ?? '';
    assert.ok(submit, 'ต้องหาตัวจัดการ submit เจอ');
    assert.ok(submit.indexOf('await saveLeaderForm') < submit.indexOf('saveExpertiseScopes'),
      'ต้องบันทึก record ให้สำเร็จก่อนจึงเขียนความเชี่ยวชาญ');
  });
});

describe('AC1/AC3 ค่าเริ่มต้นและการคงค่าเดิม', () => {
  test('AC3 สร้างบุคคลสัญชาติไทย → เปิดแก้ไขได้ค่าเดิม (Test 1)', () => {
    const rec = toRecord(form({ nationality: 'thai' }));
    assert.equal(rec.personType, 'thai');
    assert.equal(leaderToForm(rec).personType, 'thai');
  });

  test('AC3 สร้างบุคคลต่างชาติ → ต้องไม่ถูกเปลี่ยนกลับเป็นไทย (Test 2)', () => {
    const rec = toRecord(form({ nationality: 'foreign' }));
    assert.equal(rec.personType, 'foreigner');
    assert.equal(leaderToForm(rec).personType, 'foreigner');
  });

  test('§10 ค่าเริ่มต้นของวิซาร์ด — ไม่เดาข้อมูลที่ผู้ใช้ยังไม่กรอก', () => {
    const f = emptyWizardForm('TL-000900');
    assert.equal(f.nationality, 'thai', 'ประเภทบุคคลเริ่มต้น = ไทย');
    assert.deepEqual(f.expertiseCountries, [], 'ยังไม่มีความเชี่ยวชาญ');
    assert.deepEqual(f.passports, [], 'ยังไม่มี Passport');
  });

  test('AC14 แถวภาษาเริ่มต้นที่ไม่ได้กรอก ต้องไม่ถูกบันทึกเป็นข้อมูลจริง', () => {
    // ฟอร์มมีแถว "อังกฤษ" ไว้ให้กรอก — ถ้าไม่แตะระดับหรือติ๊กภาษาแม่ ต้องไม่กลายเป็นข้อมูลจริง
    const untouched = wizardToLeaderForm(form(), 'TL-000900', TODAY);
    assert.deepEqual(untouched.languages, [], 'ยังไม่กรอกระดับ → ต้องไม่บันทึกภาษา');

    // เลือกระดับ → บันทึกตามที่กรอกจริง
    const filled = wizardToLeaderForm(
      form({ languages: [{ ...form().languages[0], levelCode: 'B2' }] }),
      'TL-000900', TODAY,
    );
    assert.equal(filled.languages.length, 1);
    assert.equal(filled.languages[0].levelCode, 'B2', 'ระดับต้องมาจากที่ผู้ใช้เลือก');
    assert.equal(filled.languages[0].standard, 'CEFR');
  });

  test('AC10 ข้อมูลไม่สูญหายเมื่อวนกลับ record → form → record', () => {
    const rec = toRecord(form({ leaderType: 'agent', nationality: 'foreign' }));
    const again = formToLeader(leaderToForm(rec), BUILD as never);
    assert.equal(again.leaderType, rec.leaderType);
    assert.equal(again.personType, rec.personType);
    assert.equal(again.id, rec.id, 'รหัสหัวหน้าทัวร์ต้องคงเดิม');
  });
});
