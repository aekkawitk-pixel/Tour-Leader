'use client';

/**
 * ตัวแก้ไขความเชี่ยวชาญแบบลำดับชั้น โซน → ประเทศ → เส้นทาง (§3/§4/§6/§7/§9/§10)
 * สร้างได้หลาย Rule ก่อนบันทึก · ตรวจ validation + ครอบคลุมกันแบบสด (§12/§13)
 */

import { useCallback, useMemo, useState } from 'react';
import { Button, cx, Pill } from '@/components/ui/Primitives';
import { TextInput } from '@/components/ui/FormField';
import { Combobox } from '@/components/ui/Combobox';
import { Icon } from '@/components/ui/Icon';
import { getZones, zoneById, zoneCountries, type Zone } from '@/data/leaders/zoneMaster';
import { airportsOfCountry } from '@/data/airports';
import {
  emptyScope, formatScope, validateScopes, coverageWarnings,
  setPrimaryZone, setPrimaryCountry, allZonesScope, isAllZonesScope,
  type ExpertiseScope, type ScopeValidationContext, type ScopeNames,
} from '@/lib/logic/expertiseScope';
import type { Airport, Country } from '@/types';

let seq = 0;

/* ค้นหาแบบไม่สนตัวพิมพ์ · ตัดช่องว่างส่วนเกิน · ทุกตำแหน่งในคำ (§2) — ตัวช่วยระดับโมดูล (identity คงที่) */
const matchZone = (z: Zone, q: string): boolean => {
  const s = q.trim().toLowerCase();
  return !s || [z.nameEn, z.nameTh].some((v) => v.toLowerCase().includes(s));
};
const matchCountry = (c: Country, q: string): boolean => {
  const s = q.trim().toLowerCase();
  return !s || [c.nameEn, c.nameTh, c.alpha2, c.alpha3, c.code].some((v) => (v ?? '').toLowerCase().includes(s));
};
const matchAirport = (a: Airport, q: string): boolean => {
  const s = q.trim().toLowerCase();
  return !s || [a.iata, a.nameEn, a.nameTh, a.cityTh, a.cityEn, a.countryCode].some((v) => (v ?? '').toLowerCase().includes(s));
};
const countryLabel = (c: Country) => `${c.nameEn} (${c.nameTh})`;
const zoneLabelFull = (z: Zone) => (z.nameTh ? `${z.nameEn} (${z.nameTh})` : z.nameEn);

/** ตัวเลือก "ไม่ระบุโซน" ในรายการค้นหา — ไม่ใช่ข้อมูลใน Zone Master (order 0 = อยู่บนสุด) */
const NO_ZONE: Zone = {
  id: '__none__',
  nameEn: '— ไม่ระบุโซน (เลือกประเทศตรงได้) —',
  nameTh: '',
  active: true,
  order: 0,
};

/** Searchable Select ใช้ร่วมกันทุกช่อง Master (§7) — ห่อ Combobox + จัดการคำค้นภายใน */
function SearchSelect<T>({
  label, placeholder, valueLabel, items, match, getKey, getLabel, getSubLabel, onSelect, error, emptyMessage,
}: {
  label: string;
  placeholder?: string;
  valueLabel: string;
  items: T[];
  match: (item: T, q: string) => boolean;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string | undefined;
  onSelect: (item: T | null) => void;
  error?: string;
  emptyMessage?: string;
}) {
  const [q, setQ] = useState('');
  const filtered = useMemo(() => items.filter((i) => match(i, q)), [items, q, match]);
  return (
    <Combobox<T>
      label={label}
      placeholder={placeholder}
      value={valueLabel}
      items={filtered}
      getKey={getKey}
      getLabel={getLabel}
      getSubLabel={getSubLabel}
      onSearch={setQ}
      onSelect={(i) => { setQ(''); onSelect(i); }}
      error={error}
      emptyMessage={emptyMessage}
    />
  );
}

export function ExpertiseScopeEditor({
  scopes,
  countries,
  onChange,
}: {
  scopes: ExpertiseScope[];
  countries: Country[];
  onChange: (next: ExpertiseScope[]) => void;
}) {
  const zones = getZones();
  const countryById = useMemo(() => new Map(countries.map((c) => [c.id, c])), [countries]);
  const alpha2Of2 = (countryId: string | null) => (countryId ? countryId.slice(2) : '');

  const namesOf = useCallback((s: ExpertiseScope): ScopeNames => ({
    zoneName: zoneById(s.zoneId ?? '')?.nameEn,
    countryName: s.countryId ? `${countryById.get(s.countryId)?.nameEn ?? s.countryId}` : undefined,
  }), [countryById]);

  const ctx: ScopeValidationContext = useMemo(() => ({
    countryExists: (id) => countryById.has(id),
    routeInCountry: (code, countryId) =>
      airportsOfCountry(countryId ? countryId.slice(2) : '').some((a) => a.iata === code),
    zoneCovers: (zoneId, countryId) => {
      const z = zoneById(zoneId);
      const c = countryById.get(countryId);
      return Boolean(z && c) && zoneCountries(z!, [c!]).length > 0;
    },
  }), [countryById]);

  const issues = useMemo(() => validateScopes(scopes, ctx), [scopes, ctx]);
  const warnings = useMemo(() => coverageWarnings(scopes, ctx, namesOf), [scopes, ctx, namesOf]);
  const issuesOf = (id: string) => issues.filter((i) => i.scopeId === id);
  const warningsOf = (id: string) => warnings.filter((w) => w.scopeId === id);

  const update = (id: string, patch: Partial<ExpertiseScope>) =>
    onChange(scopes.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addRow = () => {
    seq += 1;
    onChange([...scopes, { ...emptyScope(scopes.length), id: `EXP-${Date.now()}-${seq}` }]);
  };
  const removeRow = (id: string) => onChange(scopes.filter((s) => s.id !== id));
  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= scopes.length) return;
    const next = [...scopes];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  /* เปลี่ยนโซน — ล้างประเทศถ้าไม่อยู่ในโซนใหม่ (แต่ยังเลือกประเทศอื่นได้ §6) */
  const changeZone = (s: ExpertiseScope, zoneId: string) => {
    const patch: Partial<ExpertiseScope> = { zoneId: zoneId || null };
    if (!zoneId) { patch.countryScope = 'specific'; patch.isPrimaryZone = false; }
    update(s.id, patch);
  };

  const changeCountryScope = (s: ExpertiseScope, scope: 'all_zone_countries' | 'specific') => {
    if (scope === 'all_zone_countries') {
      update(s.id, { countryScope: 'all_zone_countries', countryId: null, isPrimaryCountry: false, routeScope: 'all_routes', routeCodes: [], primaryRouteCodes: [] });
    } else {
      update(s.id, { countryScope: 'specific' });
    }
  };

  const changeCountry = (s: ExpertiseScope, countryId: string) =>
    update(s.id, { countryId: countryId || null, routeCodes: [], primaryRouteCodes: [] });

  const changeRouteScope = (s: ExpertiseScope, scope: 'all_routes' | 'specific') => {
    if (scope === 'all_routes') update(s.id, { routeScope: 'all_routes', routeCodes: [], primaryRouteCodes: [] });
    else update(s.id, { routeScope: 'specific' });
  };

  const toggleRoute = (s: ExpertiseScope, code: string) => {
    const has = s.routeCodes.includes(code);
    const routeCodes = has ? s.routeCodes.filter((c) => c !== code) : [...s.routeCodes, code];
    const primaryRouteCodes = s.primaryRouteCodes.filter((c) => routeCodes.includes(c));
    update(s.id, { routeCodes, primaryRouteCodes });
  };

  const togglePrimaryRoute = (s: ExpertiseScope, code: string) => {
    const has = s.primaryRouteCodes.includes(code);
    update(s.id, { primaryRouteCodes: has ? s.primaryRouteCodes.filter((c) => c !== code) : [...s.primaryRouteCodes, code] });
  };

  const togglePrimaryZone = (s: ExpertiseScope) =>
    onChange(setPrimaryZone(scopes, s.isPrimaryZone ? '' : s.id));
  const togglePrimaryCountry = (s: ExpertiseScope) =>
    onChange(setPrimaryCountry(scopes, s.isPrimaryCountry ? '' : s.id));

  /*
   * "ได้ทุกโซน ทุกประเทศ ทุกเส้นทาง" — ติ๊กแล้วแทนที่ทุกรายการด้วย Rule เดียว (รายการย่อยไม่มีความหมายอีก)
   * เอาติ๊กออก → กลับเป็นว่าง ให้เริ่มระบุรายการใหม่
   */
  const allZones = scopes.some(isAllZonesScope);
  const toggleAllZones = (on: boolean) => {
    seq += 1;
    onChange(on ? [allZonesScope(`EXP-${Date.now()}-${seq}`)] : []);
  };

  return (
    <div className="space-y-4">
      <label className={cx(
        'flex cursor-pointer items-start gap-2.5 rounded-xl border p-3',
        allZones ? 'zego-selected-fill' : 'zego-border-color zego-hover-surface',
      )}>
        <input type="checkbox" checked={allZones} onChange={(e) => toggleAllZones(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[var(--zego-border-strong)]" />
        <span>
          <span className="block text-sm font-semibold zego-text">ได้ทุกโซน ทุกประเทศ ทุกเส้นทาง</span>
          <span className="block text-xs zego-text-tertiary">
            {allZones
              ? 'ถือว่าเชี่ยวชาญทุกงาน — เอาติ๊กออกเพื่อระบุโซน/ประเทศ/เส้นทางเป็นรายการแทน'
              : 'ติ๊กเมื่อไปได้ทุกที่ ไม่ต้องไล่เพิ่มทีละโซน (รายการที่ระบุไว้ด้านล่างจะถูกแทนที่)'}
          </span>
        </span>
      </label>

      {!allZones && (<>
      {scopes.length === 0 && (
        <p className="rounded-lg border border-dashed zego-border-color px-4 py-6 text-center text-sm zego-text-tertiary">
          ยังไม่ได้ระบุความเชี่ยวชาญ — กด “+ เพิ่มรายการความเชี่ยวชาญ” เพื่อเริ่ม
        </p>
      )}

      {scopes.map((s, idx) => {
        const zone = zoneById(s.zoneId ?? '');
        const alpha2 = alpha2Of2(s.countryId);
        const zoneCountryList = zone ? zoneCountries(zone, countries) : [];
        const zoneCountryIds = new Set(zoneCountryList.map((c) => c.id));
        // ประเทศในโซนก่อน แล้วประเทศอื่นเรียงตามชื่ออังกฤษ (§3/§6 ยังเลือกประเทศนอกโซนได้)
        const countryItems: Country[] = [
          ...zoneCountryList,
          ...countries.filter((c) => c.isActive && !zoneCountryIds.has(c.id)).sort((a, b) => a.nameEn.localeCompare(b.nameEn)),
        ];
        const airports = s.countryScope === 'specific' && alpha2 ? airportsOfCountry(alpha2) : [];
        const primaryRouteChoices = s.routeScope === 'specific' ? s.routeCodes : airports.map((a) => a.iata);
        const rowIssues = issuesOf(s.id);
        const rowWarnings = warningsOf(s.id);

        return (
          <div key={s.id} className="rounded-xl border zego-border-color zego-surface-soft-bg p-3">
            {/* หัวรายการ: preview + จัดการ */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-semibold zego-text">{formatScope(s, namesOf(s))}</span>
                {s.isPrimaryZone && <Pill tone="blue">โซนหลัก</Pill>}
                {s.isPrimaryCountry && <Pill tone="green">ประเทศหลัก</Pill>}
                {s.primaryRouteCodes.length > 0 && <Pill tone="amber">เส้นทางหลัก {s.primaryRouteCodes.join(', ')}</Pill>}
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" aria-label="เลื่อนขึ้น" onClick={() => move(idx, -1)} disabled={idx === 0} className="rounded p-1 zego-text-tertiary zego-hover-surface disabled:opacity-30"><Icon name="chevronDown" className="h-3.5 w-3.5 rotate-180" /></button>
                <button type="button" aria-label="เลื่อนลง" onClick={() => move(idx, 1)} disabled={idx === scopes.length - 1} className="rounded p-1 zego-text-tertiary zego-hover-surface disabled:opacity-30"><Icon name="chevronDown" className="h-3.5 w-3.5" /></button>
                <button type="button" aria-label="ลบรายการ" onClick={() => removeRow(s.id)} className="rounded p-1 zego-text-danger hover:bg-rose-50"><Icon name="close" className="h-4 w-4" /></button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {/* โซน (§4/§7) — Searchable */}
              <SearchSelect<Zone>
                label="โซนที่เชี่ยวชาญ"
                placeholder="ค้นหาโซน หรือเว้นว่างเพื่อไม่ระบุโซน"
                valueLabel={zone ? zoneLabelFull(zone) : ''}
                items={[NO_ZONE, ...zones]}
                match={matchZone}
                getKey={(z) => z.id}
                getLabel={zoneLabelFull}
                onSelect={(z) => changeZone(s, z && z.id !== '__none__' ? z.id : '')}
                emptyMessage="ไม่พบโซนที่ค้นหา"
              />

              {/* ขอบเขตประเทศ (§4/§6) */}
              {s.zoneId ? (
                <div>
                  <span className="mb-1 block text-sm font-medium zego-text-secondary">ขอบเขตประเทศ</span>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`cs-${s.id}`} checked={s.countryScope === 'all_zone_countries'} onChange={() => changeCountryScope(s, 'all_zone_countries')} /> ทุกประเทศในโซน</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`cs-${s.id}`} checked={s.countryScope === 'specific'} onChange={() => changeCountryScope(s, 'specific')} /> เลือกเฉพาะประเทศ</label>
                  </div>
                </div>
              ) : <div />}

              {/* ประเทศ (§6/§7) — Searchable · เมื่อ specific หรือไม่มีโซน */}
              {s.countryScope === 'specific' && (
                <div data-field={s.id}>
                  <SearchSelect<Country>
                    label="ประเทศที่เชี่ยวชาญ"
                    placeholder="ค้นหาประเทศ รหัสประเทศ หรือชื่อภาษาไทย"
                    valueLabel={s.countryId ? (countryById.get(s.countryId) ? countryLabel(countryById.get(s.countryId)!) : s.countryId) : ''}
                    items={countryItems}
                    match={matchCountry}
                    getKey={(c) => c.id}
                    getLabel={countryLabel}
                    getSubLabel={(c) => `· ${c.alpha3 ?? c.code ?? ''}`}
                    onSelect={(c) => changeCountry(s, c?.id ?? '')}
                    error={rowIssues.find((i) => i.field === 'country')?.message}
                    emptyMessage="ไม่พบประเทศที่ค้นหา"
                  />
                </div>
              )}

              {/* ขอบเขตเส้นทาง (§7) — เฉพาะเมื่อเลือกประเทศเจาะจง */}
              {s.countryScope === 'specific' && s.countryId && (
                <div>
                  <span className="mb-1 block text-sm font-medium zego-text-secondary">ขอบเขตเส้นทาง</span>
                  <div className="flex flex-wrap gap-3 text-sm">
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`rs-${s.id}`} checked={s.routeScope === 'all_routes'} onChange={() => changeRouteScope(s, 'all_routes')} /> ทุกเส้นทาง</label>
                    <label className="inline-flex items-center gap-1.5"><input type="radio" name={`rs-${s.id}`} checked={s.routeScope === 'specific'} onChange={() => changeRouteScope(s, 'specific')} /> เลือกเฉพาะเส้นทาง</label>
                  </div>
                </div>
              )}
            </div>

            {/* เลือกเส้นทาง (§7) — Searchable ค้นหาด้วยรหัส/เมือง/ชื่อ/ประเทศ */}
            {s.countryScope === 'specific' && s.countryId && s.routeScope === 'specific' && (
              <div className="mt-3">
                {airports.length === 0 ? (
                  <p className="text-xs zego-text-tertiary">ประเทศนี้ยังไม่มีสนามบินใน Master</p>
                ) : (
                  <SearchSelect<Airport>
                    label="เพิ่มสนามบิน / เส้นทาง"
                    placeholder="ค้นหา NRT, KIX, เมือง หรือชื่อสนามบิน"
                    valueLabel=""
                    items={airports.filter((a) => !s.routeCodes.includes(a.iata))}
                    match={matchAirport}
                    getKey={(a) => a.iata}
                    getLabel={(a) => `${a.iata} — ${a.cityTh}`}
                    getSubLabel={(a) => a.nameTh}
                    onSelect={(a) => a && toggleRoute(s, a.iata)}
                    emptyMessage="ไม่พบสนามบินที่ค้นหา"
                  />
                )}
                {s.routeCodes.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {s.routeCodes.map((code) => (
                      <span key={code} className="inline-flex items-center gap-1 rounded-full zego-selected-fill px-2 py-0.5 text-xs">
                        <span className="font-mono font-semibold">{code}</span>
                        <button type="button" aria-label={`นำ ${code} ออก`} onClick={() => toggleRoute(s, code)} className="rounded hover:opacity-80"><Icon name="close" className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
                {rowIssues.find((i) => i.field === 'routes') && (
                  <p className="mt-1 text-xs font-medium zego-text-danger">{rowIssues.find((i) => i.field === 'routes')!.message}</p>
                )}
              </div>
            )}

            {/* ความเชี่ยวชาญหลัก (§9) */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 zego-divider-top pt-2.5 text-xs">
              <span className="font-medium zego-text-tertiary">กำหนดเป็นหลัก:</span>
              {s.zoneId && (
                <label className="inline-flex items-center gap-1.5 zego-text-secondary"><input type="checkbox" checked={s.isPrimaryZone} onChange={() => togglePrimaryZone(s)} /> โซนหลัก</label>
              )}
              {s.countryScope === 'specific' && s.countryId && (
                <label className="inline-flex items-center gap-1.5 zego-text-secondary"><input type="checkbox" checked={s.isPrimaryCountry} onChange={() => togglePrimaryCountry(s)} /> ประเทศหลัก</label>
              )}
              {s.countryScope === 'specific' && s.countryId && primaryRouteChoices.length > 0 && (
                <span className="inline-flex flex-wrap items-center gap-1.5 zego-text-secondary">
                  เส้นทางหลัก:
                  {primaryRouteChoices.map((code) => {
                    const on = s.primaryRouteCodes.includes(code);
                    return (
                      <button key={code} type="button" onClick={() => togglePrimaryRoute(s, code)}
                        className={cx('rounded border px-1.5 py-0.5 font-mono', on ? 'bg-amber-500 text-white border-amber-500' : 'zego-surface-bg zego-text-tertiary zego-border-color zego-hover-surface')}>
                        {code}
                      </button>
                    );
                  })}
                </span>
              )}
            </div>

            <div className="mt-2">
              <TextInput label="หมายเหตุ" optional value={s.note ?? ''} onChange={(e) => update(s.id, { note: e.target.value })} />
            </div>

            {/* error/warning ระดับรายการ */}
            {rowIssues.filter((i) => i.field === 'primary' || i.field === 'duplicate' || i.field === 'zone').map((i, k) => (
              <p key={k} className="mt-2 rounded bg-rose-50 px-2 py-1 text-xs font-medium zego-text-danger">{i.message}</p>
            ))}
            {rowWarnings.map((w, k) => (
              <p key={k} className={cx('mt-2 rounded px-2 py-1 text-xs', w.allowWithReason ? 'bg-amber-50 text-amber-700' : 'bg-amber-50 text-amber-800')}>
                ⚠️ {w.message}{w.allowWithReason ? ' (บันทึกได้เพราะมีเงื่อนไขเฉพาะ)' : ''}
              </p>
            ))}
          </div>
        );
      })}

      <Button variant="secondary" icon="plus" onClick={addRow}>เพิ่มรายการความเชี่ยวชาญ</Button>
      </>)}

      {/* กัน scopeKey ซ้ำ (แจ้งรวม) */}
      {issues.some((i) => i.field === 'duplicate') && (
        <p className="text-xs font-medium zego-text-danger">มีรายการซ้ำกัน — กรุณารวมเป็นรายการเดียว</p>
      )}
    </div>
  );
}
