'use client';

/**
 * ตั้งค่าการเชื่อมต่อ Zego API — กรอก Token และเลือกขอบเขตข้อมูลที่จะดึง
 *
 * ทดสอบการเชื่อมต่อได้ก่อนดึงจริง เพื่อไม่ต้องเดาว่าตั้งค่าถูกหรือยัง
 * ค่าที่กรอกเก็บใน localStorage ของเครื่องนั้น — env var ฝั่งเซิร์ฟเวอร์ชนะเสมอ
 */

import { useState } from 'react';
import { Button, Callout, Card, CardHeader, Pill } from '@/components/ui/Primitives';
import { SelectInput, TextInput } from '@/components/ui/FormField';
import { StorageWriteError } from '@/services/browserStorage';
import {
  clearZegoConfig, EMPTY_ZEGO_CONFIG, maskToken, saveZegoConfig, scopeLabel,
  type ZegoConfig, type ZegoScopeKind,
} from '@/services/zegoConfigStore';

/** ผลการทดสอบการเชื่อมต่อ — null = ยังไม่ได้ทดสอบในรอบนี้ */
export interface ZegoStatus {
  ok: boolean;
  tokenSource: 'env' | 'setup' | 'none';
  updatedAt?: string | null;
  error?: string;
}

const SCOPE_OPTIONS: { value: ZegoScopeKind; label: string }[] = [
  { value: 'all', label: 'ทั้งหมด' },
  { value: 'country', label: 'ระบุรหัสประเทศ (CountryCode)' },
  { value: 'iso', label: 'ระบุรหัสประเทศ ISO (ISO2/ISO3)' },
  { value: 'product', label: 'ระบุรหัสโปรแกรม (ProductCode)' },
];

const SCOPE_HINT: Record<ZegoScopeKind, string> = {
  all: '',
  country: 'เช่น JP · ใช้ endpoint /programtours/country/{CountryCode}',
  iso: 'เช่น JPN · ใช้ endpoint /programtours/country-iso/{ISOCode}',
  product: 'ดึงเฉพาะโปรแกรมเดียว · ใช้ endpoint /programtours/{ProductCode}',
};

export function ZegoSetupPanel({
  config, onChange, status, onTest, testing,
}: {
  config: ZegoConfig;
  onChange: (next: ZegoConfig) => void;
  status: ZegoStatus | null;
  onTest: (config: ZegoConfig) => void;
  testing: boolean;
}) {
  const [draft, setDraft] = useState<ZegoConfig>(config);
  const [showToken, setShowToken] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const dirty = JSON.stringify(draft) !== JSON.stringify(config);
  const needsValue = draft.scopeKind !== 'all';

  const set = (patch: Partial<ZegoConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setSaved(false);
    setSaveError(null);
  };

  /** บันทึกลงเครื่อง — เขียนไม่สำเร็จต้องไม่ขึ้นว่า "บันทึกแล้ว" */
  const save = () => {
    try {
      saveZegoConfig(draft);
      onChange(draft);
      setSaved(true);
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof StorageWriteError ? e.message : 'บันทึกค่าตั้งไม่สำเร็จ');
    }
  };

  const clear = () => {
    try {
      clearZegoConfig();
      setDraft(EMPTY_ZEGO_CONFIG);
      onChange(EMPTY_ZEGO_CONFIG);
      setSaved(false);
      setSaveError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'ล้างค่าตั้งไม่สำเร็จ');
    }
  };

  return (
    <Card>
      <CardHeader
        title="ตั้งค่าการเชื่อมต่อ Zego API"
        description="เอกสาร v1.5 · ส่ง Token ผ่าน header auth-token — ระบบยิงผ่านเซิร์ฟเวอร์ให้ ไม่ยิงจากเบราว์เซอร์ตรง"
        action={<StatusPill status={status} />}
      />

      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <TextInput
            label="Token"
            type={showToken ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={draft.token}
            onChange={(e) => set({ token: e.target.value })}
            placeholder="วาง Token ที่ได้จาก Zego"
            hint={config.token ? `บันทึกไว้แล้ว: ${maskToken(config.token)}` : 'ยังไม่ได้บันทึก Token ไว้ในเครื่องนี้'}
          />
          <button type="button" onClick={() => setShowToken((v) => !v)}
            className="zego-text-info mt-1 text-xs underline">
            {showToken ? 'ซ่อน Token' : 'แสดง Token'}
          </button>
        </div>

        <div className="space-y-3">
          <SelectInput
            label="ขอบเขตข้อมูลที่จะดึง"
            options={SCOPE_OPTIONS}
            value={draft.scopeKind}
            onChange={(e) => set({ scopeKind: e.target.value as ZegoScopeKind, scopeValue: '' })}
          />
          {needsValue && (
            <TextInput
              label="ค่าที่ใช้กับขอบเขต"
              value={draft.scopeValue}
              onChange={(e) => set({ scopeValue: e.target.value })}
              placeholder={draft.scopeKind === 'country' ? 'JP' : draft.scopeKind === 'iso' ? 'JPN' : 'JP-KIX-5D3N'}
              hint={SCOPE_HINT[draft.scopeKind]}
            />
          )}
        </div>
      </div>

      {saveError && (
        <p className="zego-text-danger mt-2 text-sm">บันทึกไม่สำเร็จ: {saveError}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={save} disabled={!dirty}>บันทึกค่าตั้ง</Button>
        <Button variant="secondary" size="sm" onClick={() => onTest(draft)} disabled={testing || (!draft.token.trim() && status?.tokenSource !== 'env')}>
          {testing ? 'กำลังทดสอบ…' : 'ทดสอบการเชื่อมต่อ'}
        </Button>
        {(config.token || config.scopeKind !== 'all') && (
          <Button variant="ghost" size="sm" onClick={clear}>ล้างค่าตั้ง</Button>
        )}
        {saved && !dirty && <span className="zego-text-success text-sm">บันทึกแล้ว</span>}
        <span className="zego-text-tertiary ms-auto text-xs">ขอบเขตปัจจุบัน: {scopeLabel(config)}</span>
      </div>

      {status && !status.ok && (
        <Callout tone="red" title="เชื่อมต่อไม่สำเร็จ">
          <p className="text-sm">{status.error}</p>
        </Callout>
      )}

      {status?.ok && (
        <Callout tone="green" title="เชื่อมต่อสำเร็จ">
          <p className="text-sm">
            ใช้ Token จาก{status.tokenSource === 'env' ? ' Environment Variable ของเซิร์ฟเวอร์' : 'ค่าที่ตั้งไว้ในหน้านี้'}
            {status.updatedAt ? ` · ข้อมูลต้นทางอัปเดตล่าสุด ${status.updatedAt}` : ''}
          </p>
        </Callout>
      )}

      {status?.tokenSource === 'env' && (
        <p className="zego-text-tertiary mt-2 text-xs">
          เซิร์ฟเวอร์ตั้ง ZEGO_API_TOKEN ไว้แล้ว — ระบบจะใช้ค่านั้นเสมอ ค่าที่กรอกในหน้านี้จะไม่ถูกใช้
        </p>
      )}
    </Card>
  );
}

/** ป้ายสถานะย่อบนหัวการ์ด — เห็นได้ทันทีว่าเชื่อมได้หรือยัง */
function StatusPill({ status }: { status: ZegoStatus | null }) {
  if (!status) return <Pill tone="slate">ยังไม่ได้ทดสอบ</Pill>;
  if (status.ok) return <Pill tone="green">เชื่อมต่อได้</Pill>;
  return <Pill tone="red">เชื่อมต่อไม่ได้</Pill>;
}
