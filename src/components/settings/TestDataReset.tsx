'use client';

/**
 * ตั้งค่าระบบ → ล้างข้อมูลทดสอบ — ล้างทรานแซกชันเพื่อทดสอบขั้นตอนใหม่ตั้งแต่ต้นจนจบ
 * เลือกกลุ่มที่จะล้าง (การจัดงานเลือกเพิ่มได้) → ยืนยัน → ล้าง แล้วโหลดหน้าใหม่ให้ทุกหน้าอ่านข้อมูลล่าสุด
 */

import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, CardHeader, cx } from '@/components/ui/Primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { saveErrorMessage } from '@/services/browserStorage';
import { RESET_GROUPS, resetTestData, type ResetGroupKey } from '@/services/testDataReset';

const KEEP = ['ข้อมูลหัวหน้าทัวร์ สัญญา และเอกสาร', 'อัตราเบี้ยเลี้ยง / เรทค่าส่งกรุ๊ป / ค่าทิป', 'ข้อมูลโปรแกรมทัวร์ (Period Master)', 'เจ้าหน้าที่ส่งกรุ๊ป และกฎต่าง ๆ', 'เอกสารเบิกค่าใช้จ่ายกรุ๊ป', 'ข้อมูลตั้งต้นในหน้านี้ทั้งหมด'];

export function TestDataReset() {
  const { pushToast } = useDemo();
  const [selected, setSelected] = useState<Set<ResetGroupKey>>(() => new Set(RESET_GROUPS.filter((g) => !g.optional).map((g) => g.key)));
  const [counts, setCounts] = useState<Partial<Record<ResetGroupKey, number>>>({});
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- นับจากภายนอก (localStorage) ตอน mount
    setCounts(Object.fromEntries(RESET_GROUPS.map((g) => [g.key, g.count()])));
  }, []);

  const toggle = (k: ResetGroupKey) => setSelected((s) => {
    const n = new Set(s);
    if (n.has(k)) n.delete(k); else n.add(k);
    return n;
  });
  const chosen = RESET_GROUPS.filter((g) => selected.has(g.key));
  const total = chosen.reduce((n, g) => n + (counts[g.key] ?? 0), 0);

  const run = async () => {
    setBusy(true);
    try {
      await resetTestData([...selected]);
      pushToast('success', 'ล้างข้อมูลทดสอบแล้ว', 'กำลังโหลดหน้าใหม่…');
      // ทุก Store โหลดจาก localStorage ตอนเริ่ม — โหลดหน้าใหม่ให้ทุกหน้าเห็นข้อมูลที่ล้างแล้ว
      window.setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      pushToast('error', 'ล้างข้อมูลไม่สำเร็จ', saveErrorMessage(e));
      setBusy(false);
      setConfirm(false);
    }
  };

  return (
    <>
      <CardHeader title="ล้างข้อมูลทดสอบ" description="ล้างรายการที่เกิดจากการใช้งาน เพื่อทดสอบขั้นตอนใหม่ตั้งแต่ต้นจนจบ — ข้อมูลหลักและการตั้งค่ายังอยู่" />
      <div className="space-y-4">
        <ul className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color">
          {RESET_GROUPS.map((g) => (
            <li key={g.key}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 zego-hover-surface">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-rose-600" checked={selected.has(g.key)} onChange={() => toggle(g.key)} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium zego-text">
                    {g.label}
                    {g.optional && <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-normal text-slate-600">เลือกเพิ่ม</span>}
                  </span>
                  <span className="block text-xs zego-text-tertiary">{g.detail}</span>
                </span>
                <span className={cx('shrink-0 text-xs tabular-nums', (counts[g.key] ?? 0) > 0 ? 'font-semibold zego-text' : 'zego-text-tertiary')}>{counts[g.key] ?? '…'} รายการ</span>
              </label>
            </li>
          ))}
        </ul>

        <Callout tone="blue" title="ข้อมูลที่ไม่ถูกล้าง">
          {KEEP.join(' · ')}
        </Callout>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs zego-text-secondary">เลือก {chosen.length} กลุ่ม · {total} รายการ</span>
          <Button variant="danger" icon="warning" disabled={chosen.length === 0 || busy} onClick={() => setConfirm(true)}>ล้างข้อมูลที่เลือก</Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => !busy && setConfirm(false)}
        onConfirm={() => void run()}
        loading={busy}
        title="ยืนยันล้างข้อมูลทดสอบ"
        message={`จะลบ ${chosen.map((g) => g.label).join(', ')} รวม ${total} รายการ — ลบแล้วกู้คืนไม่ได้`}
        confirmLabel="ล้างข้อมูล"
      />
    </>
  );
}
