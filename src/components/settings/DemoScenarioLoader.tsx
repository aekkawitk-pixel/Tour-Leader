'use client';

/**
 * ตั้งค่าระบบ → ล้างข้อมูลทดสอบ → โหลดข้อมูลตัวอย่าง (Demo)
 * สร้างกรุ๊ปตัวอย่างครบทุกสถานการณ์ (services/demoScenario.ts) · ลบเฉพาะข้อมูลตัวอย่างได้ · โหลดหน้าใหม่ให้ทุกหน้าอ่านข้อมูลล่าสุด
 */

import { useEffect, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { Button, Callout, CardHeader } from '@/components/ui/Primitives';
import { ConfirmDialog } from '@/components/ui/Modal';
import { saveErrorMessage } from '@/services/browserStorage';
import { DEMO_SCENARIOS, demoScenarioLoaded, loadDemoScenario, removeDemoScenario } from '@/services/demoScenario';

const PHASE = (start: number, days: number) => (start > 0 ? 'ก่อนเดินทาง' : start + days > 0 ? 'ระหว่างทาง' : 'หลังเดินทาง');

export function DemoScenarioLoader() {
  const { leaders, pushToast } = useDemo();
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState<'load' | 'remove' | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- อ่านจากภายนอก (localStorage) ตอน mount
    setLoaded(demoScenarioLoaded());
  }, []);
  const leaderName = (i: number) => {
    const l = leaders.find((x) => x.id === `TL-00000${i + 1}`);
    return l ? `${l.firstName} ${l.lastName}`.trim() : `TL-00000${i + 1}`;
  };

  const run = (kind: 'load' | 'remove') => {
    setBusy(true);
    try {
      if (kind === 'load') {
        const r = loadDemoScenario(leaders);
        pushToast('success', `โหลดข้อมูลตัวอย่าง ${r.groups} กรุ๊ปแล้ว`, 'กำลังโหลดหน้าใหม่…');
      } else {
        removeDemoScenario();
        pushToast('success', 'ลบข้อมูลตัวอย่างแล้ว', 'กำลังโหลดหน้าใหม่…');
      }
      window.setTimeout(() => window.location.reload(), 600);
    } catch (e) {
      pushToast('error', 'ทำรายการไม่สำเร็จ', saveErrorMessage(e));
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <>
      <CardHeader
        title="ข้อมูลตัวอย่างสำหรับ Demo"
        description={`สร้างกรุ๊ปตัวอย่าง ${DEMO_SCENARIOS.length} กรุ๊ป ครบทุกขั้นตั้งแต่จัดหัวหน้าทัวร์จนปิดเคลียร์เงิน — วันที่นับจากวันที่โหลด · ข้อมูลอื่นไม่ถูกแตะ`}
      />
      <div className="space-y-4">
        <ol className="divide-y divide-[var(--zego-border-soft)] rounded-lg border zego-border-color text-sm">
          {DEMO_SCENARIOS.map((s) => (
            <li key={s.key} className="flex items-start gap-3 px-3 py-2">
              <span className="w-6 shrink-0 font-semibold tabular-nums zego-text-tertiary">{s.key}</span>
              <span className="min-w-0 flex-1">
                <span className="block zego-text">{s.title}</span>
                <span className="block text-xs zego-text-tertiary">{PHASE(s.start, s.days)} · หัวหน้าทัวร์ {leaderName(s.leader)}{s.leader === 0 ? ' (ผู้ใช้ "หัวหน้าทัวร์" ใน Demo)' : ''}</span>
              </span>
            </li>
          ))}
        </ol>
        <Callout tone="sky" title="ดูแต่ละมุมมอง">
          ฝ่ายบัญชี: เมนูจัดการค่าใช้จ่ายกรุ๊ป · เคลียร์เงินกรุ๊ป · นัดหมาย — หัวหน้าทัวร์: สลับผู้ใช้เป็น &quot;หัวหน้าทัวร์&quot; (หรือเลือกหัวหน้าทัวร์คนอื่นจากเมนูผู้ใช้) — เจ้าหน้าที่ส่งกรุ๊ป: สลับเป็นเจ้าหน้าที่ที่ถือซอง
        </Callout>
        <div className="flex flex-wrap justify-end gap-2">
          {loaded && <Button variant="secondary" disabled={busy} onClick={() => setConfirm('remove')}>ลบข้อมูลตัวอย่าง</Button>}
          <Button variant="primary" icon="download" loading={busy} onClick={() => setConfirm('load')}>{loaded ? 'โหลดข้อมูลตัวอย่างใหม่' : 'โหลดข้อมูลตัวอย่าง'}</Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={() => confirm && run(confirm)}
        title={confirm === 'remove' ? 'ลบข้อมูลตัวอย่าง?' : 'โหลดข้อมูลตัวอย่าง?'}
        tone={confirm === 'remove' ? 'danger' : 'primary'}
        message={confirm === 'remove'
          ? 'ลบกรุ๊ปตัวอย่างทั้งหมดและทุกรายการที่ผูกกับกรุ๊ปเหล่านั้น — ข้อมูลอื่นยังอยู่'
          : `สร้างกรุ๊ปตัวอย่าง ${DEMO_SCENARIOS.length} กรุ๊ป${loaded ? ' (ชุดเดิมจะถูกแทนที่ด้วยชุดใหม่ที่นับวันจากวันนี้)' : ''} — ข้อมูลอื่นไม่ถูกแตะ`}
        confirmLabel={confirm === 'remove' ? 'ลบ' : 'โหลด'}
        loading={busy}
      />
    </>
  );
}
