/**
 * เมนูที่เห็นได้เฉพาะผู้ดูแลระบบ — ข้อมูลตั้งต้นและการเชื่อมต่อระบบภายนอก
 * แก้แล้วกระทบทั้งระบบ จึงไม่เปิดให้บทบาทที่ทำงานประจำวัน
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { navForRole, NAV_ITEMS, type NavKey } from '../src/lib/permissions';
import { ROLE_ORDER } from '../src/lib/labels';

const ADMIN_ONLY: NavKey[] = ['zego', 'tourPeriods', 'leaderMaster', 'holidays', 'settings'];

describe('เมนูเฉพาะผู้ดูแลระบบ', () => {
  test('ผู้ดูแลระบบเห็นครบทุกเมนูในกลุ่มนี้', () => {
    const keys = navForRole('admin').map((i) => i.key);
    for (const k of ADMIN_ONLY) assert.ok(keys.includes(k), `admin ต้องเห็นเมนู ${k}`);
  });

  test('บทบาทอื่นไม่เห็นเมนูกลุ่มนี้เลย', () => {
    for (const role of ROLE_ORDER.filter((r) => r !== 'admin')) {
      const keys = navForRole(role).map((i) => i.key);
      for (const k of ADMIN_ONLY) {
        assert.equal(keys.includes(k), false, `${role} ต้องไม่เห็นเมนู ${k}`);
      }
    }
  });

  test('เมนูกลุ่มนี้ระบุ roles เป็น admin อย่างเดียว ไม่ใช่พึ่งการกรองที่อื่น', () => {
    for (const k of ADMIN_ONLY) {
      const item = NAV_ITEMS.find((i) => i.key === k);
      assert.ok(item, `ต้องมีเมนู ${k}`);
      assert.deepEqual(item!.roles, ['admin'], `เมนู ${k} ต้องเปิดให้ admin เท่านั้น`);
    }
  });

  test('เมนูงานประจำวันยังเปิดให้บทบาทอื่นตามเดิม', () => {
    const coordinator = navForRole('coordinator').map((i) => i.key);
    for (const k of ['dashboard', 'leaders', 'jobs', 'calendar'] as NavKey[]) {
      assert.ok(coordinator.includes(k), `coordinator ต้องยังเห็นเมนู ${k}`);
    }
  });
});

/* ------------------- สิทธิ์ของบทบาทหัวหน้าทัวร์ ------------------- */

import { ownLeaderScope } from '../src/lib/permissions';
import { demoUsers } from '../src/data/users';
import { TOUR_LEADER_PROFILES } from '../src/data/leaders/tourLeaderMaster.seed';

describe('บทบาทหัวหน้าทัวร์', () => {
  test('ไม่เห็นเมนูการจัดสเก็ต — เป็นหน้าจัดคนลงงาน ไม่ใช่หน้าดูงานของตัวเอง', () => {
    assert.equal(navForRole('leader').map((i) => i.key).includes('jobs'), false);
  });

  test('ผู้ดูแลระบบและฝ่ายจัดหัวหน้าทัวร์ยังเห็นเมนูการจัดสเก็ตตามเดิม', () => {
    for (const role of ['admin', 'coordinator'] as const) {
      assert.ok(navForRole(role).map((i) => i.key).includes('jobs'), `${role} ต้องยังเห็นเมนูจัดสเก็ต`);
    }
  });

  test('เห็นได้แค่ ภาพรวม กับ ปฏิทินงาน (นอกจากเมนูที่ยังพัฒนาอยู่)', () => {
    const keys = navForRole('leader').map((i) => i.key);
    assert.ok(keys.includes('dashboard'));
    assert.ok(keys.includes('calendar'));
    for (const k of ['jobs', 'leaders', 'zego', 'tourPeriods', 'leaderMaster', 'holidays', 'settings'] as NavKey[]) {
      assert.equal(keys.includes(k), false, `หัวหน้าทัวร์ต้องไม่เห็นเมนู ${k}`);
    }
  });
});

describe('บทบาทฝ่ายบัญชี', () => {
  const HIDDEN: NavKey[] = ['dashboard', 'leaders', 'jobs'];

  test('ไม่เห็นเมนู ภาพรวม / หัวหน้าทัวร์ / การจัดสเก็ต — เป็นงานของฝ่ายจัดหัวหน้าทัวร์', () => {
    const keys = navForRole('accounting').map((i) => i.key);
    for (const k of HIDDEN) assert.equal(keys.includes(k), false, `ฝ่ายบัญชีต้องไม่เห็นเมนู ${k}`);
  });

  test('ยังเห็นเมนูงานการเงินครบ', () => {
    const keys = navForRole('accounting').map((i) => i.key);
    for (const k of ['groupExpenses', 'expenses', 'payments', 'settlements', 'calendar'] as NavKey[]) {
      assert.ok(keys.includes(k), `ฝ่ายบัญชีต้องยังเห็นเมนู ${k}`);
    }
  });

  test('พิมพ์ URL ตรงก็เปิดไม่ได้ (รวมหน้าย่อย) — ไม่ใช่แค่ซ่อนเมนู', async () => {
    const { canViewPath } = await import('../src/lib/permissions');
    for (const path of ['/', '/leaders', '/leaders/TL-000001', '/jobs', '/jobs/programs']) {
      assert.equal(canViewPath('accounting', path), false, `ฝ่ายบัญชีต้องเปิด ${path} ไม่ได้`);
    }
  });
});

describe('ขอบเขตข้อมูลของหัวหน้าทัวร์ (ownLeaderScope)', () => {
  test('บทบาทอื่นไม่ถูกกรอง', () => {
    for (const role of ['admin', 'coordinator', 'accounting'] as const) {
      assert.equal(ownLeaderScope({ role }), null, `${role} ต้องเห็นข้อมูลทั้งหมด`);
    }
  });

  test('หัวหน้าทัวร์ถูกกรองด้วยรหัสของตัวเอง', () => {
    assert.equal(ownLeaderScope({ role: 'leader', leaderId: 'TL-000001' }), 'TL-000001');
  });

  test('หัวหน้าทัวร์ที่ยังไม่ผูกรหัส ต้องไม่เห็นข้อมูลใครเลย (ไม่ใช่เห็นทั้งหมด)', () => {
    const scope = ownLeaderScope({ role: 'leader' });
    assert.equal(scope, '', 'ต้องคืนค่าที่กรองแล้วไม่เหลืออะไร');
    assert.notEqual(scope, null, 'ห้ามคืน null เพราะจะกลายเป็นเห็นทุกคน');
  });
});

describe('ผู้ใช้ Demo บทบาทหัวหน้าทัวร์', () => {
  const leaderUser = demoUsers.find((u) => u.role === 'leader');

  test('ผูกกับรหัสหัวหน้าทัวร์ที่มีอยู่จริงใน Master', () => {
    assert.ok(leaderUser?.leaderId, 'ต้องระบุ leaderId');
    const found = TOUR_LEADER_PROFILES.find((l) => l.tourLeaderId === leaderUser!.leaderId);
    assert.ok(found, `ไม่พบหัวหน้าทัวร์รหัส ${leaderUser!.leaderId} ใน Master — กรองแล้วจะไม่เหลืออะไรเลย`);
  });

  test('ชื่อผู้ใช้ตรงกับชื่อหัวหน้าทัวร์ที่ผูกไว้', () => {
    const found = TOUR_LEADER_PROFILES.find((l) => l.tourLeaderId === leaderUser!.leaderId)!;
    assert.equal(leaderUser!.name, `${found.firstNameTH} ${found.lastNameTH}`);
  });
});

/* --------------- กั้นการเข้าถึงหน้าตามบทบาท (ไม่ใช่แค่ซ่อนเมนู) --------------- */

import { canViewPath, isNavEnabled, landingPathForRole, navItemForPath } from '../src/lib/permissions';

describe('กั้นการเข้าถึงหน้าตามบทบาท', () => {
  test('หัวหน้าทัวร์เปิดหน้าจัดสเก็ตไม่ได้ แม้พิมพ์ URL ตรงหรือค้างอยู่ตอนสลับบทบาท', () => {
    assert.equal(canViewPath('leader', '/jobs'), false);
    assert.equal(canViewPath('leader', '/jobs/programs'), false, 'หน้าย่อยต้องถูกกั้นด้วย');
  });

  test('หัวหน้าทัวร์ยังเปิด ภาพรวม กับ ปฏิทินงาน ได้', () => {
    assert.equal(canViewPath('leader', '/'), true);
    assert.equal(canViewPath('leader', '/calendar'), true);
  });

  test('เมนูเฉพาะผู้ดูแลระบบ กั้นบทบาทอื่นครบ', () => {
    for (const path of ['/zego', '/tour-periods', '/leader-master', '/holidays', '/settings']) {
      assert.equal(canViewPath('admin', path), true, `admin ต้องเปิด ${path} ได้`);
      for (const role of ['coordinator', 'accounting', 'leader'] as const) {
        assert.equal(canViewPath(role, path), false, `${role} ต้องเปิด ${path} ไม่ได้`);
      }
    }
  });

  test('จับคู่ path กับเมนูที่ href ยาวที่สุด — /leaders กับ /leader-master ต้องไม่สลับกัน', () => {
    assert.equal(navItemForPath('/leader-master')?.key, 'leaderMaster');
    assert.equal(navItemForPath('/leaders')?.key, 'leaders');
    assert.equal(navItemForPath('/leaders/TL-000001')?.key, 'leaders');
  });

  test('หน้าแรก (/) ต้องจับเฉพาะตัวเอง ไม่ใช่จับทุก path', () => {
    assert.equal(navItemForPath('/')?.key, 'dashboard');
    assert.notEqual(navItemForPath('/calendar')?.key, 'dashboard');
  });

  test('path ที่ไม่ตรงเมนูไหนเลย ไม่ถูกกั้น', () => {
    assert.equal(navItemForPath('/some-unknown-page'), null);
    assert.equal(canViewPath('leader', '/some-unknown-page'), true);
  });

  test('มีหน้าปลายทางให้ทุกบทบาทเสมอ และเป็นหน้าที่บทบาทนั้นเปิดได้จริง', () => {
    for (const role of ROLE_ORDER) {
      const home = landingPathForRole(role);
      assert.ok(home, `${role} ต้องมีหน้าปลายทาง`);
      assert.equal(canViewPath(role, home), true, `${role} ต้องเปิด ${home} ได้`);
    }
  });
});

/* ------------- สลับบทบาทแล้วต้องพาไปหน้าที่ใช้ได้ ------------- */

import { readFileSync } from 'node:fs';

describe('สลับบทบาทขณะอยู่หน้าที่บทบาทใหม่เข้าไม่ได้', () => {
  const SHELL = readFileSync(new URL('../src/components/layout/AppShell.tsx', import.meta.url), 'utf8');

  test('พาไปหน้าแรกของบทบาทใหม่ ไม่ปล่อยค้างจนไม่มีเมนูไหนถูกไฮไลต์', () => {
    assert.ok(SHELL.includes('landingPathForRole('), 'ต้องรู้ว่าบทบาทใหม่ไปหน้าไหนได้');
    assert.ok(/router\.replace\(landingPathForRole\(/.test(SHELL), 'ต้องพาไปหน้านั้นจริง');
  });

  test('ทำเฉพาะตอนบทบาทเปลี่ยน — พิมพ์ URL ตรงยังต้องเห็นคำอธิบาย ไม่เด้งเงียบ ๆ', () => {
    const start = SHELL.indexOf('const lastRole = useRef');
    const effect = start < 0 ? '' : SHELL.slice(start, SHELL.indexOf('}, [currentUser.role, userSwitchSeq, router]);', start));
    assert.ok(effect, 'ต้องหา effect เจอ');
    assert.ok(effect.includes('if (lastRole.current === currentUser.role) return;'),
      'บทบาทไม่เปลี่ยนต้องไม่ทำอะไร');
  });

  test('คืนผู้ใช้ที่จำไว้ตอนรีเฟรช (ไม่ได้กดสลับเอง) ต้องอยู่หน้าเดิม ไม่เด้งไปหน้าแรก', () => {
    const start = SHELL.indexOf('const lastRole = useRef');
    const effect = start < 0 ? '' : SHELL.slice(start, SHELL.indexOf('}, [currentUser.role, userSwitchSeq, router]);', start));
    assert.ok(effect.includes('if (!switched) return;'), 'ต้องย้ายเฉพาะตอนผู้ใช้กดสลับเอง (userSwitchSeq เปลี่ยน)');
    assert.ok(effect.indexOf('if (!switched) return;') < effect.indexOf('router.replace('), 'ต้องเช็คก่อนพาไปหน้าอื่น');
  });

  test('ย้ายเสมอ ไม่ใช่เฉพาะตอนหน้าเดิมเข้าไม่ได้', () => {
    const start = SHELL.indexOf('const lastRole = useRef');
    const effect = start < 0 ? '' : SHELL.slice(start, SHELL.indexOf('}, [currentUser.role, userSwitchSeq, router]);', start));
    assert.ok(effect, 'ต้องหา effect เจอ');
    assert.equal(effect.includes('canViewPath'), false,
      'ต้องไม่เช็คว่าหน้าเดิมเข้าได้ไหม — เปลี่ยนบทบาทคือเปลี่ยนบริบท ต้องเริ่มที่เมนูแรกเสมอ');
  });

  test('ทุกบทบาทมีเมนูแรกที่เข้าได้จริง', () => {
    for (const role of ROLE_ORDER) {
      // หัวหน้าทัวร์ไม่ใช้เมนูฝั่งผู้จัดเลย — มีพอร์ทัลมือถือของตัวเองที่ /guide ซึ่งไม่อยู่ใน NAV_ITEMS
      if (role === 'leader') {
        assert.equal(landingPathForRole(role), '/guide', 'หัวหน้าทัวร์ต้องไปที่พอร์ทัลของตัวเอง (/guide)');
        continue;
      }
      // เจ้าหน้าที่ส่งกรุ๊ปก็มีพอร์ทัลมือถือของตัวเอง (/staff) — ไม่มีเมนูฝั่งผู้จัด
      if (role === 'sendoff') {
        assert.equal(landingPathForRole(role), '/staff', 'เจ้าหน้าที่ส่งกรุ๊ปต้องไปที่พอร์ทัลของตัวเอง (/staff)');
        assert.equal(navForRole(role).length, 0, 'เจ้าหน้าที่ส่งกรุ๊ปต้องไม่เห็นเมนูฝั่งผู้จัด');
        continue;
      }
      const first = navForRole(role).find((i) => isNavEnabled(i.key));
      assert.ok(first, role + ' ต้องมีเมนูแรกที่เปิดใช้ได้');
      assert.equal(landingPathForRole(role), first!.href, role + ' ต้องไปที่เมนูแรกของตัวเอง');
    }
  });
});
