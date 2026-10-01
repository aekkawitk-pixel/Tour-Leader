'use client';

/**
 * แสดงความเชี่ยวชาญแบบลำดับชั้น โซน → ประเทศ → เส้นทาง ในหน้า Detail (§11)
 * จัดกลุ่ม: โซนหลัก → โซนอื่น → ประเทศที่ระบุโดยตรง (ไม่รวมเป็นข้อความบรรทัดเดียว)
 */

import { Pill } from '@/components/ui/Primitives';
import { zoneById } from '@/data/leaders/zoneMaster';
import { airportByIata } from '@/data/airports';
import { isAllZonesScope, type ExpertiseScope } from '@/lib/logic/expertiseScope';
import type { Country } from '@/types';

function RouteLine({ scope }: { scope: ExpertiseScope }) {
  if (scope.routeScope === 'all_routes') {
    return (
      <li className="text-sm zego-text-secondary">
        ทุกเส้นทาง
        {scope.primaryRouteCodes.map((c) => (
          <span key={c} className="ml-1.5 font-mono text-xs zego-text-warning">{c} <Pill tone="amber">เส้นทางหลัก</Pill></span>
        ))}
      </li>
    );
  }
  return (
    <>
      {scope.routeCodes.map((code) => {
        const ap = airportByIata(code);
        const primary = scope.primaryRouteCodes.includes(code);
        return (
          <li key={code} className="flex flex-wrap items-center gap-1.5 text-sm zego-text-secondary">
            <span className="font-mono font-semibold zego-text">{code}</span>
            {ap?.cityTh && <span className="text-xs zego-text-tertiary">{ap.cityTh}</span>}
            {primary && <Pill tone="amber">เส้นทางหลัก</Pill>}
          </li>
        );
      })}
    </>
  );
}

function CountryBlock({ scope, countryName }: { scope: ExpertiseScope; countryName: string }) {
  return (
    <div className="ml-3">
      <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium zego-text">
        {scope.countryScope === 'all_zone_countries' ? 'ทุกประเทศ' : countryName}
        {scope.isPrimaryCountry && <Pill tone="green">ประเทศหลัก</Pill>}
      </p>
      <ul className="ml-4 mt-0.5 list-disc space-y-0.5">
        <RouteLine scope={scope} />
      </ul>
      {scope.note?.trim() && <p className="ml-4 text-xs zego-text-tertiary">หมายเหตุ: {scope.note}</p>}
    </div>
  );
}

export function ExpertiseScopeView({ scopes, countries }: { scopes: ExpertiseScope[]; countries: Country[] }) {
  const countryName = (id: string | null) => (id ? (countries.find((c) => c.id === id)?.nameEn ?? id) : '');

  // ติ๊ก "ได้ทุกโซน ทุกประเทศ ทุกเส้นทาง" — ไม่มีลำดับชั้นให้แจก แสดงเป็นกล่องเดียว
  if (scopes.some(isAllZonesScope)) {
    return (
      <div className="rounded-lg border zego-border-color p-3">
        <p className="text-base font-semibold zego-text">ได้ทุกโซน ทุกประเทศ ทุกเส้นทาง</p>
        <p className="mt-0.5 text-xs zego-text-tertiary">ถือว่าเชี่ยวชาญทุกงาน ไม่จำกัดโซน/ประเทศ/เส้นทาง</p>
      </div>
    );
  }

  // จัดกลุ่มตามโซน
  const zoneGroups = new Map<string, ExpertiseScope[]>();
  const directCountries: ExpertiseScope[] = [];
  for (const s of scopes) {
    if (s.zoneId) {
      if (!zoneGroups.has(s.zoneId)) zoneGroups.set(s.zoneId, []);
      zoneGroups.get(s.zoneId)!.push(s);
    } else {
      directCountries.push(s);
    }
  }
  const isPrimaryZone = (zoneId: string) => (zoneGroups.get(zoneId) ?? []).some((s) => s.isPrimaryZone);
  const zoneIds = [...zoneGroups.keys()].sort((a, b) => Number(isPrimaryZone(b)) - Number(isPrimaryZone(a)));
  const primaryZoneIds = zoneIds.filter(isPrimaryZone);
  const otherZoneIds = zoneIds.filter((z) => !isPrimaryZone(z));

  const ZoneBlock = ({ zoneId }: { zoneId: string }) => {
    const z = zoneById(zoneId);
    const list = zoneGroups.get(zoneId) ?? [];
    return (
      <div className="rounded-lg border zego-border-color p-3">
        <p className="flex flex-wrap items-center gap-1.5 text-base font-semibold zego-text">
          {z?.nameEn ?? zoneId}
          {z?.nameTh && <span className="text-sm font-normal zego-text-tertiary">({z.nameTh})</span>}
          {isPrimaryZone(zoneId) && <Pill tone="blue">โซนหลัก</Pill>}
        </p>
        <div className="mt-1.5 space-y-2">
          {list.map((s) => <CountryBlock key={s.id} scope={s} countryName={countryName(s.countryId)} />)}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {primaryZoneIds.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide zego-text-tertiary">โซนหลัก</p>
          <div className="space-y-2">{primaryZoneIds.map((z) => <ZoneBlock key={z} zoneId={z} />)}</div>
        </div>
      )}
      {otherZoneIds.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide zego-text-tertiary">โซนอื่น</p>
          <div className="space-y-2">{otherZoneIds.map((z) => <ZoneBlock key={z} zoneId={z} />)}</div>
        </div>
      )}
      {directCountries.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-bold uppercase tracking-wide zego-text-tertiary">ประเทศที่ระบุโดยตรง</p>
          <div className="space-y-2">
            {directCountries.map((s) => (
              <div key={s.id} className="rounded-lg border zego-border-color p-3">
                <p className="flex flex-wrap items-center gap-1.5 text-base font-semibold zego-text">
                  {countryName(s.countryId)}
                  {s.isPrimaryCountry && <Pill tone="green">ประเทศหลัก</Pill>}
                </p>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  <RouteLine scope={s} />
                </ul>
                {s.note?.trim() && <p className="ml-4 text-xs zego-text-tertiary">หมายเหตุ: {s.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
