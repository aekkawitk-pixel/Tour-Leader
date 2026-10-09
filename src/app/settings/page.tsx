'use client';

/** หน้าตั้งค่าระบบ — จัดการข้อมูลตั้งต้นและผู้ใช้ (ปิดใช้งานแทนการลบเสมอ) */

import { useMemo, useState } from 'react';
import { useDemo } from '@/store/DemoStore';
import { MASTER_EXTRA_LABEL, MASTER_GROUP_LABEL } from '@/data';
import { ROUTE_TYPE, userRoleMeta } from '@/lib/labels';
import { ROLE_SCOPE } from '@/lib/permissions';
import {
  Button,
  Card,
  CardHeader,
  Callout,
  cx,
  PageHeader,
  Pill,
  StatusBadge,
} from '@/components/ui/Primitives';
import { SearchBox, SelectInput, TextInput } from '@/components/ui/FormField';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { ConfirmDialog, Modal } from '@/components/ui/Modal';
import { Icon } from '@/components/ui/Icon';
import { SendOffFeeSettings } from '@/components/settings/SendOffFeeSettings';
import { TipRateSettings } from '@/components/settings/TipRateSettings';
import { TestDataReset } from '@/components/settings/TestDataReset';
import type {
  Country,
  DemoUser,
  MasterItem,
  MasterKey,
  RouteType,
  TourRoute,
} from '@/types';

const MASTER_KEYS: MasterKey[] = [
  'languages',
  'customerGroups',
  'workSkills',
  'expenseTypes',
  'currencies',
  'banks',
];

type TabKey = MasterKey | 'countries' | 'routes' | 'users' | 'sendoffFee' | 'tipRates' | 'testReset';

const ACTIVE_META = { label: 'ใช้งาน', tone: 'green' } as const;
const INACTIVE_META = { label: 'ปิดใช้งาน', tone: 'slate' } as const;

export default function SettingsPage() {
  const {
    master,
    countries,
    routes,
    users,
    saveMasterItem,
    toggleMasterItem,
    createMasterId,
    saveCountry,
    toggleCountry,
    saveRoute,
    toggleRoute,
    toggleUserActive,
    saving,
  } = useDemo();

  const [tab, setTab] = useState<TabKey>('languages');
  const [query, setQuery] = useState('');

  // ฟอร์มข้อมูลตั้งต้นทั่วไป
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<MasterItem | null>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [extra, setExtra] = useState('');
  const [order, setOrder] = useState('');
  const [errors, setErrors] = useState<{ code?: string; name?: string }>({});

  // ฟอร์มประเทศ
  const [countryOpen, setCountryOpen] = useState(false);
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);
  const [cForm, setCForm] = useState({
    code: '',
    alpha3: '',
    nameTh: '',
    nameEn: '',
    region: '',
    subregion: '',
    callingCode: '',
  });
  const [cErrors, setCErrors] = useState<Record<string, string>>({});

  // ฟอร์มเส้นทาง
  const [routeOpen, setRouteOpen] = useState(false);
  const [editingRoute, setEditingRoute] = useState<TourRoute | null>(null);
  const [rForm, setRForm] = useState({
    countryId: '',
    routeType: 'city' as RouteType,
    code: '',
    nameTh: '',
    nameEn: '',
  });
  const [rErrors, setRErrors] = useState<Record<string, string>>({});
  const [routeCountryFilter, setRouteCountryFilter] = useState('all');

  const [toggleTarget, setToggleTarget] = useState<MasterItem | null>(null);
  const [countryToggle, setCountryToggle] = useState<Country | null>(null);
  const [routeToggle, setRouteToggle] = useState<TourRoute | null>(null);
  const [userToggleTarget, setUserToggleTarget] = useState<DemoUser | null>(null);

  const isMasterTab = MASTER_KEYS.includes(tab as MasterKey);

  const masterList = useMemo(() => {
    if (!isMasterTab) return [];
    const q = query.trim().toLowerCase();
    return master[tab as MasterKey]
      .filter((item) => !q || `${item.code} ${item.name}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.order - b.order);
  }, [master, tab, query, isMasterTab]);

  const countryList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return countries
      .filter((c) => !q || `${c.code} ${c.nameTh} ${c.nameEn}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }, [countries, query]);

  const routeList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return routes
      .filter((r) => routeCountryFilter === 'all' || r.countryId === routeCountryFilter)
      .filter(
        (r) =>
          !q ||
          `${r.code ?? ''} ${r.nameTh} ${r.nameEn ?? ''}`.toLowerCase().includes(q),
      )
      .slice()
      .sort(
        (a, b) =>
          a.countryId.localeCompare(b.countryId) || (a.order ?? 0) - (b.order ?? 0),
      );
  }, [routes, query, routeCountryFilter]);

  /* ------------------------------ ข้อมูลตั้งต้น ----------------------------- */

  const openForm = (item: MasterItem | null) => {
    setEditing(item);
    setCode(item?.code ?? '');
    setName(item?.name ?? '');
    setExtra(item?.extra ?? '');
    setOrder(item ? String(item.order) : String(masterList.length + 1));
    setErrors({});
    setFormOpen(true);
  };

  const submitMaster = async () => {
    if (!isMasterTab) return;
    const key = tab as MasterKey;
    const next: typeof errors = {};
    if (!code.trim()) next.code = 'กรุณากรอกรหัส';
    if (!name.trim()) next.name = 'กรุณากรอกชื่อ';

    const duplicate = master[key].some(
      (i) => i.code.toLowerCase() === code.trim().toLowerCase() && i.id !== editing?.id,
    );
    if (!next.code && duplicate) next.code = 'รหัสนี้มีอยู่แล้วในกลุ่มนี้';

    setErrors(next);
    if (Object.keys(next).length > 0) return;

    await saveMasterItem(key, {
      id: editing?.id ?? createMasterId(),
      code: code.trim().toUpperCase(),
      name: name.trim(),
      extra: extra.trim() || undefined,
      order: Number(order || 0),
      active: editing?.active ?? true,
    });
    setFormOpen(false);
  };

  /* --------------------------------- ประเทศ -------------------------------- */

  const openCountry = (country: Country | null) => {
    setEditingCountry(country);
    setCForm({
      code: country?.code ?? '',
      alpha3: country?.alpha3 ?? '',
      nameTh: country?.nameTh ?? '',
      nameEn: country?.nameEn ?? '',
      region: country?.region ?? '',
      subregion: country?.subregion ?? '',
      callingCode: country?.callingCode ?? '',
    });
    setCErrors({});
    setCountryOpen(true);
  };

  const submitCountry = async () => {
    const next: Record<string, string> = {};
    if (!cForm.code.trim()) next.code = 'กรุณากรอกรหัสประเทศ (เช่น JP)';
    if (!cForm.nameTh.trim()) next.nameTh = 'กรุณากรอกชื่อภาษาไทย';
    if (!cForm.nameEn.trim()) next.nameEn = 'กรุณากรอกชื่อภาษาอังกฤษ';
    if (
      !next.code &&
      countries.some(
        (c) =>
          c.code.toLowerCase() === cForm.code.trim().toLowerCase() &&
          c.id !== editingCountry?.id,
      )
    ) {
      next.code = 'รหัสประเทศนี้มีอยู่แล้ว';
    }
    setCErrors(next);
    if (Object.keys(next).length > 0) return;

    const code = cForm.code.trim().toUpperCase();
    const callingCode = cForm.callingCode.trim();
    await saveCountry({
      ...editingCountry,
      id: editingCountry?.id ?? `C-${code}`,
      code,
      alpha2: code,
      alpha3: cForm.alpha3.trim().toUpperCase() || undefined,
      nameTh: cForm.nameTh.trim(),
      nameEn: cForm.nameEn.trim().toUpperCase(),
      region: cForm.region.trim() || undefined,
      subregion: cForm.subregion.trim() || undefined,
      callingCode: callingCode
        ? callingCode.startsWith('+')
          ? callingCode
          : `+${callingCode.replace(/\D/g, '')}`
        : undefined,
      isActive: editingCountry?.isActive ?? true,
      order: editingCountry?.order ?? countries.length + 1,
    });
    setCountryOpen(false);
  };

  /* -------------------------------- เส้นทาง -------------------------------- */

  const openRoute = (route: TourRoute | null) => {
    setEditingRoute(route);
    setRForm({
      countryId: route?.countryId ?? (routeCountryFilter !== 'all' ? routeCountryFilter : ''),
      routeType: route?.routeType ?? 'city',
      code: route?.code ?? '',
      nameTh: route?.nameTh ?? '',
      nameEn: route?.nameEn ?? '',
    });
    setRErrors({});
    setRouteOpen(true);
  };

  const submitRoute = async () => {
    const next: Record<string, string> = {};
    if (!rForm.countryId) next.countryId = 'กรุณาเลือกประเทศ';
    if (!rForm.nameTh.trim()) next.nameTh = 'กรุณากรอกชื่อเส้นทาง';
    if (rForm.routeType === 'airport' && !rForm.code.trim())
      next.code = 'สนามบินต้องระบุรหัส 3 ตัวอักษร (เช่น NRT)';
    if (
      rForm.code.trim() &&
      routes.some(
        (r) =>
          r.countryId === rForm.countryId &&
          (r.code ?? '').toLowerCase() === rForm.code.trim().toLowerCase() &&
          r.id !== editingRoute?.id,
      )
    ) {
      next.code = 'รหัสนี้มีอยู่แล้วในประเทศนี้';
    }
    setRErrors(next);
    if (Object.keys(next).length > 0) return;

    const countryRoutes = routes.filter((r) => r.countryId === rForm.countryId);
    await saveRoute({
      id: editingRoute?.id ?? `R-NEW-${Date.now()}`,
      countryId: rForm.countryId,
      routeType: rForm.routeType,
      code: rForm.code.trim().toUpperCase() || undefined,
      nameTh: rForm.nameTh.trim(),
      nameEn: rForm.nameEn.trim() || undefined,
      isActive: editingRoute?.isActive ?? true,
      order: editingRoute?.order ?? countryRoutes.length + 1,
    });
    setRouteOpen(false);
  };

  /* -------------------------------- คอลัมน์ -------------------------------- */

  const masterColumns: Column<MasterItem>[] = [
    {
      key: 'order',
      header: 'ลำดับ',
      align: 'center',
      hideOnMobile: true,
      render: (item) => <span className="tabular-nums text-xs zego-text-tertiary">{item.order}</span>,
    },
    {
      key: 'code',
      header: 'รหัส',
      render: (item) => (
        <span className="font-mono text-xs font-semibold zego-text-secondary">{item.code}</span>
      ),
    },
    {
      key: 'name',
      header: 'ชื่อ',
      render: (item) => (
        <span className={cx('font-medium', item.active ? 'zego-text' : 'zego-text-tertiary')}>
          {item.name}
        </span>
      ),
    },
    {
      key: 'extra',
      header: isMasterTab ? MASTER_EXTRA_LABEL[tab as MasterKey] : '',
      hideOnMobile: true,
      render: (item) => <span className="text-sm zego-text-secondary">{item.extra ?? '—'}</span>,
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (item) => <StatusBadge meta={item.active ? ACTIVE_META : INACTIVE_META} size="sm" />,
    },
    {
      key: 'actions',
      header: 'จัดการ',
      align: 'right',
      render: (item) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon="edit" onClick={() => openForm(item)}>
            แก้ไข
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setToggleTarget(item)}>
            {item.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </Button>
        </div>
      ),
    },
  ];

  const countryColumns: Column<Country>[] = [
    {
      key: 'code',
      header: 'รหัส',
      render: (c) => (
        <span className="font-mono text-xs font-semibold zego-text-secondary">
          {c.code}
          {c.alpha3 && <span className="ml-1 font-normal zego-text-tertiary">/ {c.alpha3}</span>}
        </span>
      ),
    },
    {
      key: 'nameEn',
      header: 'ชื่อ (อังกฤษ)',
      render: (c) => (
        <span className={cx('font-medium', c.isActive ? 'zego-text' : 'zego-text-tertiary')}>
          {c.nameEn}
        </span>
      ),
    },
    { key: 'nameTh', header: 'ชื่อ (ไทย)', render: (c) => c.nameTh },
    {
      key: 'region',
      header: 'ภูมิภาค',
      hideOnMobile: true,
      render: (c) =>
        c.region ? (
          <span className="zego-text-secondary">
            {c.region}
            {c.subregion && <span className="zego-text-tertiary"> · {c.subregion}</span>}
          </span>
        ) : (
          <span className="zego-text-disabled">—</span>
        ),
    },
    {
      key: 'calling',
      header: 'รหัสโทร',
      hideOnMobile: true,
      render: (c) => <span className="font-mono text-xs tabular-nums zego-text-secondary">{c.callingCode ?? '—'}</span>,
    },
    {
      key: 'routes',
      header: 'จำนวนเส้นทาง',
      align: 'right',
      hideOnMobile: true,
      render: (c) => (
        <span className="tabular-nums">
          {routes.filter((r) => r.countryId === c.id).length}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (c) => <StatusBadge meta={c.isActive ? ACTIVE_META : INACTIVE_META} size="sm" />,
    },
    {
      key: 'actions',
      header: 'จัดการ',
      align: 'right',
      render: (c) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon="edit" onClick={() => openCountry(c)}>
            แก้ไข
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setCountryToggle(c)}>
            {c.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </Button>
        </div>
      ),
    },
  ];

  const routeColumns: Column<TourRoute>[] = [
    {
      key: 'country',
      header: 'ประเทศ',
      render: (r) => {
        const country = countries.find((c) => c.id === r.countryId);
        return (
          <span className="whitespace-nowrap text-xs font-medium zego-text-secondary">
            {country?.nameEn ?? r.countryId}
          </span>
        );
      },
    },
    {
      key: 'type',
      header: 'ประเภท',
      render: (r) => <StatusBadge meta={ROUTE_TYPE[r.routeType]} size="sm" dot={false} />,
    },
    {
      key: 'code',
      header: 'รหัส',
      render: (r) =>
        r.code ? (
          <span className="font-mono text-xs font-bold zego-text">{r.code}</span>
        ) : (
          <span className="text-xs zego-text-tertiary">—</span>
        ),
    },
    {
      key: 'name',
      header: 'ชื่อเส้นทาง',
      render: (r) => (
        <div className="min-w-0">
          <p className={cx('font-medium', r.isActive ? 'zego-text' : 'zego-text-tertiary')}>
            {r.nameTh}
          </p>
          {r.nameEn && <p className="text-xs zego-text-tertiary">{r.nameEn}</p>}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (r) => <StatusBadge meta={r.isActive ? ACTIVE_META : INACTIVE_META} size="sm" />,
    },
    {
      key: 'actions',
      header: 'จัดการ',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" icon="edit" onClick={() => openRoute(r)}>
            แก้ไข
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setRouteToggle(r)}>
            {r.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
          </Button>
        </div>
      ),
    },
  ];

  const userColumns: Column<DemoUser>[] = [
    {
      key: 'name',
      header: 'ผู้ใช้',
      render: (user) => (
        <div>
          <p className={cx('font-medium', user.active ? 'zego-text' : 'zego-text-tertiary')}>
            {user.name}
          </p>
          <p className="text-xs zego-text-tertiary">
            {user.id} · {user.position}
          </p>
        </div>
      ),
    },
    { key: 'role', header: 'บทบาท', render: (user) => <StatusBadge meta={userRoleMeta(user)} size="sm" /> },
    {
      key: 'scope',
      header: 'สิทธิ์การเข้าถึง',
      hideOnMobile: true,
      render: (user) => <span className="text-xs zego-text-secondary">{ROLE_SCOPE[user.role]}</span>,
    },
    {
      key: 'status',
      header: 'สถานะ',
      render: (user) => <StatusBadge meta={user.active ? ACTIVE_META : INACTIVE_META} size="sm" />,
    },
    {
      key: 'actions',
      header: 'จัดการ',
      align: 'right',
      render: (user) => (
        <Button size="sm" variant="secondary" onClick={() => setUserToggleTarget(user)}>
          {user.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        </Button>
      ),
    },
  ];

  const tabs = [
    { key: 'countries', label: 'ประเทศ', badge: countries.filter((c) => c.isActive).length },
    { key: 'routes', label: 'เส้นทาง', badge: routes.filter((r) => r.isActive).length },
    ...MASTER_KEYS.map((key) => ({
      key,
      label: MASTER_GROUP_LABEL[key],
      badge: master[key].filter((i) => i.active).length,
    })),
    { key: 'users', label: 'ผู้ใช้และสิทธิ์', badge: users.filter((u) => u.active).length },
    // มาตรฐานค่าส่งกรุ๊ป (ค่าที่เจ้าหน้าที่ส่งกรุ๊ปเบิกได้) — ไม่ใช่ข้อมูลตั้งต้นแบบรายการ จึงเป็นฟอร์มของตัวเอง
    { key: 'sendoffFee', label: 'ค่าส่งกรุ๊ป' },
    // อัตราค่าทิปหัวหน้าทัวร์ (ตามประเทศ + เฉพาะโปรแกรม)
    { key: 'tipRates', label: 'ค่าทิป' },
    // ล้างทรานแซกชันเพื่อทดสอบขั้นตอนใหม่ตั้งแต่ต้น — ข้อมูลหลัก/ตั้งค่ายังอยู่
    { key: 'testReset', label: 'ล้างข้อมูลทดสอบ' },
  ];

  const addButton =
    tab === 'countries' ? (
      <Button variant="primary" icon="plus" onClick={() => openCountry(null)}>
        เพิ่มประเทศ
      </Button>
    ) : tab === 'routes' ? (
      <Button variant="primary" icon="plus" onClick={() => openRoute(null)}>
        เพิ่มเส้นทาง
      </Button>
    ) : isMasterTab ? (
      <Button variant="primary" icon="plus" onClick={() => openForm(null)}>
        เพิ่มรายการ
      </Button>
    ) : null;

  return (
    <>
      <PageHeader
        title="ตั้งค่าระบบ"
        description="จัดการข้อมูลตั้งต้นที่ใช้ทั่วทั้งระบบ"
        actions={addButton}
      />

      <div className="mb-5">
        <Callout tone="blue" title="ระบบใช้การปิดใช้งานแทนการลบ">
          รายการที่ปิดใช้งานจะไม่ปรากฏในตัวเลือกของฟอร์มใหม่ แต่ข้อมูลเดิมที่เคยใช้รายการนั้นจะยังคงอยู่
          ไม่ถูกลบทิ้ง — จึงไม่มีปุ่มลบ Master Data ที่เคยถูกใช้งาน
        </Callout>
      </div>

      <Card className="mb-5">
        <Tabs
          items={tabs}
          value={tab}
          onChange={(k) => {
            setTab(k as TabKey);
            setQuery('');
          }}
        />

        {tab !== 'users' && tab !== 'sendoffFee' && tab !== 'tipRates' && tab !== 'testReset' && (
          <div className="mt-4 flex flex-wrap gap-3">
            <div className="min-w-56 flex-1 sm:max-w-sm">
              <SearchBox
                value={query}
                onChange={setQuery}
                placeholder="ค้นหารหัสหรือชื่อ"
                label="ค้นหาข้อมูลตั้งต้น"
              />
            </div>
            {tab === 'routes' && (
              <SelectInput
                label=""
                wrapperClassName="min-w-48"
                value={routeCountryFilter}
                onChange={(e) => setRouteCountryFilter(e.target.value)}
                options={[
                  { value: 'all', label: 'ทุกประเทศ' },
                  ...countries.map((c) => ({ value: c.id, label: `${c.nameEn} — ${c.nameTh}` })),
                ]}
              />
            )}
          </div>
        )}
      </Card>

      <Card>
        {tab === 'sendoffFee' ? (
          <SendOffFeeSettings />
        ) : tab === 'tipRates' ? (
          <TipRateSettings />
        ) : tab === 'testReset' ? (
          <TestDataReset />
        ) : tab === 'users' ? (
          <>
            <CardHeader
              title="ผู้ใช้และสิทธิ์"
              description="Demo ไม่มีระบบ Login จริง — สลับบทบาทได้จากเมนูผู้ใช้มุมขวาบน"
            />
            <DataTable
              mobileCards
              columns={userColumns}
              rows={users}
              rowKey={(u) => u.id}
              rowClassName={(u) => (u.active ? undefined : 'zego-surface-soft-bg')}
              emptyTitle="ไม่มีผู้ใช้"
            />
          </>
        ) : tab === 'countries' ? (
          <>
            <CardHeader
              title="ประเทศ"
              description={`ทั้งหมด ${countries.length} ประเทศ · ใช้งาน ${countries.filter((c) => c.isActive).length}`}
            />
            <DataTable
              mobileCards
              columns={countryColumns}
              rows={countryList}
              rowKey={(c) => c.id}
              rowClassName={(c) => (c.isActive ? undefined : 'zego-surface-soft-bg')}
              emptyIcon="search"
              emptyTitle="ไม่พบประเทศที่ตรงกับคำค้นหา"
            />
          </>
        ) : tab === 'routes' ? (
          <>
            <CardHeader
              title="เส้นทาง"
              description="ภูมิภาค / เมือง / สนามบิน / เส้นทางทัวร์ — ใช้ในการระบุความเชี่ยวชาญของหัวหน้าทัวร์"
            />
            <DataTable
              mobileCards
              columns={routeColumns}
              rows={routeList}
              rowKey={(r) => r.id}
              rowClassName={(r) => (r.isActive ? undefined : 'zego-surface-soft-bg')}
              emptyIcon="search"
              emptyTitle="ไม่พบเส้นทางที่ตรงกับเงื่อนไข"
            />
          </>
        ) : (
          <>
            <CardHeader
              title={MASTER_GROUP_LABEL[tab as MasterKey]}
              description={`ทั้งหมด ${master[tab as MasterKey].length} รายการ · ใช้งาน ${
                master[tab as MasterKey].filter((i) => i.active).length
              } รายการ`}
            />
            <DataTable
              mobileCards
              columns={masterColumns}
              rows={masterList}
              rowKey={(item) => item.id}
              rowClassName={(item) => (item.active ? undefined : 'zego-surface-soft-bg')}
              emptyIcon={query ? 'search' : 'settings'}
              emptyTitle={
                query ? 'ไม่พบรายการที่ตรงกับคำค้นหา' : 'ยังไม่มีข้อมูลตั้งต้นในกลุ่มนี้'
              }
            />
          </>
        )}
      </Card>

      {/* ---------------------- ฟอร์มข้อมูลตั้งต้นทั่วไป --------------------- */}
      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        size="sm"
        title={editing ? 'แก้ไขรายการ' : 'เพิ่มรายการใหม่'}
        description={isMasterTab ? MASTER_GROUP_LABEL[tab as MasterKey] : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setFormOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submitMaster} loading={saving}>
              บันทึก
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <TextInput
            label="รหัส"
            required
            value={code}
            error={errors.code}
            hint="ตัวอักษรภาษาอังกฤษ เช่น JA, HOTEL"
            onChange={(e) => {
              setCode(e.target.value);
              setErrors((p) => ({ ...p, code: undefined }));
            }}
          />
          <TextInput
            label="ชื่อ"
            required
            value={name}
            error={errors.name}
            onChange={(e) => {
              setName(e.target.value);
              setErrors((p) => ({ ...p, name: undefined }));
            }}
          />
          <TextInput
            label={isMasterTab ? MASTER_EXTRA_LABEL[tab as MasterKey] : 'ข้อมูลเสริม'}
            value={extra}
            onChange={(e) => setExtra(e.target.value)}
          />
          <TextInput
            label="ลำดับการแสดงผล"
            inputMode="numeric"
            value={order}
            hint="ตัวเลขน้อยจะอยู่ด้านบน"
            onChange={(e) => setOrder(e.target.value)}
          />
        </div>
      </Modal>

      {/* ------------------------------ ฟอร์มประเทศ ----------------------------- */}
      <Modal
        open={countryOpen}
        onClose={() => setCountryOpen(false)}
        size="md"
        title={editingCountry ? `แก้ไขประเทศ ${editingCountry.code}` : 'เพิ่มประเทศใหม่'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCountryOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submitCountry} loading={saving}>
              บันทึก
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="รหัส alpha-2"
              required
              placeholder="เช่น JP"
              value={cForm.code}
              error={cErrors.code}
              disabled={Boolean(editingCountry)}
              hint={editingCountry ? 'แก้ไขรหัสประเทศเดิมไม่ได้' : 'รหัส 2 ตัวอักษร (ISO 3166-1)'}
              onChange={(e) => setCForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
            <TextInput
              label="รหัส alpha-3"
              placeholder="เช่น JPN"
              value={cForm.alpha3}
              hint="รหัส 3 ตัวอักษร (ISO 3166-1)"
              onChange={(e) => setCForm((f) => ({ ...f, alpha3: e.target.value.toUpperCase() }))}
            />
          </div>
          <TextInput
            label="ชื่อ (อังกฤษ)"
            required
            placeholder="JAPAN"
            value={cForm.nameEn}
            error={cErrors.nameEn}
            onChange={(e) => setCForm((f) => ({ ...f, nameEn: e.target.value }))}
          />
          <TextInput
            label="ชื่อ (ไทย)"
            required
            placeholder="ญี่ปุ่น"
            value={cForm.nameTh}
            error={cErrors.nameTh}
            onChange={(e) => setCForm((f) => ({ ...f, nameTh: e.target.value }))}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput
              label="ภูมิภาค"
              placeholder="เช่น เอเชีย"
              value={cForm.region}
              onChange={(e) => setCForm((f) => ({ ...f, region: e.target.value }))}
            />
            <TextInput
              label="อนุภูมิภาค"
              placeholder="เช่น เอเชียตะวันออก"
              value={cForm.subregion}
              onChange={(e) => setCForm((f) => ({ ...f, subregion: e.target.value }))}
            />
          </div>
          <TextInput
            label="รหัสโทรศัพท์ระหว่างประเทศ"
            placeholder="เช่น +81"
            value={cForm.callingCode}
            hint="ใส่เครื่องหมาย + นำหน้า (ระบบเติมให้อัตโนมัติหากลืม)"
            onChange={(e) => setCForm((f) => ({ ...f, callingCode: e.target.value }))}
          />
        </div>
      </Modal>

      {/* ------------------------------ ฟอร์มเส้นทาง ---------------------------- */}
      <Modal
        open={routeOpen}
        onClose={() => setRouteOpen(false)}
        size="sm"
        title={editingRoute ? `แก้ไขเส้นทาง ${editingRoute.nameTh}` : 'เพิ่มเส้นทางใหม่'}
        description="เส้นทางย่อยอยู่ภายใต้ประเทศ — ใช้เลือกตอนระบุความเชี่ยวชาญของหัวหน้าทัวร์"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRouteOpen(false)} disabled={saving}>
              ยกเลิก
            </Button>
            <Button variant="primary" onClick={submitRoute} loading={saving}>
              บันทึก
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <SelectInput
            label="ประเทศ"
            required
            placeholder="เลือกประเทศ"
            value={rForm.countryId}
            error={rErrors.countryId}
            disabled={Boolean(editingRoute)}
            onChange={(e) => setRForm((f) => ({ ...f, countryId: e.target.value }))}
            options={countries
              .filter((c) => c.isActive)
              .map((c) => ({ value: c.id, label: `${c.nameEn} — ${c.nameTh}` }))}
          />
          <SelectInput
            label="ประเภทเส้นทาง"
            required
            value={rForm.routeType}
            onChange={(e) => setRForm((f) => ({ ...f, routeType: e.target.value as RouteType }))}
            options={(['region', 'city', 'airport', 'tour_route'] as RouteType[]).map((t) => ({
              value: t,
              label: ROUTE_TYPE[t].label,
            }))}
          />
          <TextInput
            label="รหัส"
            required={rForm.routeType === 'airport'}
            placeholder={rForm.routeType === 'airport' ? 'เช่น NRT' : 'ไม่บังคับ'}
            value={rForm.code}
            error={rErrors.code}
            hint={rForm.routeType === 'airport' ? 'รหัสสนามบิน 3 ตัวอักษร' : undefined}
            onChange={(e) => setRForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
          />
          <TextInput
            label="ชื่อ (ไทย)"
            required
            value={rForm.nameTh}
            error={rErrors.nameTh}
            onChange={(e) => setRForm((f) => ({ ...f, nameTh: e.target.value }))}
          />
          <TextInput
            label="ชื่อ (อังกฤษ)"
            value={rForm.nameEn}
            onChange={(e) => setRForm((f) => ({ ...f, nameEn: e.target.value }))}
          />

          {rForm.countryId && (
            <div className="rounded-lg zego-surface-soft-bg px-3 py-2">
              <p className="mb-1 text-xs font-medium zego-text-secondary">
                เส้นทางที่มีอยู่ของประเทศนี้
              </p>
              <div className="flex flex-wrap gap-1">
                {routes
                  .filter((r) => r.countryId === rForm.countryId)
                  .map((r) => (
                    <Pill key={r.id} tone={r.isActive ? 'slate' : 'red'}>
                      {r.code ? `${r.code} · ` : ''}
                      {r.nameTh}
                    </Pill>
                  ))}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* ----------------------------- ยืนยันปิด/เปิด ---------------------------- */}
      <ConfirmDialog
        open={toggleTarget !== null}
        onClose={() => setToggleTarget(null)}
        onConfirm={async () => {
          if (!toggleTarget || !isMasterTab) return;
          const target = toggleTarget;
          setToggleTarget(null);
          await toggleMasterItem(tab as MasterKey, target.id);
        }}
        loading={saving}
        tone={toggleTarget?.active ? 'danger' : 'primary'}
        title={toggleTarget?.active ? 'ยืนยันการปิดใช้งาน' : 'ยืนยันการเปิดใช้งาน'}
        confirmLabel={toggleTarget?.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        message={
          toggleTarget?.active
            ? `ปิดใช้งาน “${toggleTarget?.name}” — รายการนี้จะไม่ปรากฏในตัวเลือกของฟอร์มใหม่ แต่ข้อมูลเดิมที่ใช้รายการนี้จะยังคงอยู่ (ไม่ลบข้อมูล)`
            : `เปิดใช้งาน “${toggleTarget?.name}” ให้กลับมาเลือกได้อีกครั้ง`
        }
      />

      <ConfirmDialog
        open={countryToggle !== null}
        onClose={() => setCountryToggle(null)}
        onConfirm={async () => {
          if (!countryToggle) return;
          const target = countryToggle;
          setCountryToggle(null);
          await toggleCountry(target.id);
        }}
        loading={saving}
        tone={countryToggle?.isActive ? 'danger' : 'primary'}
        title={countryToggle?.isActive ? 'ยืนยันการปิดใช้งานประเทศ' : 'ยืนยันการเปิดใช้งานประเทศ'}
        confirmLabel={countryToggle?.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        message={
          countryToggle?.isActive
            ? `ปิดใช้งาน “${countryToggle?.nameTh}” — จะไม่ปรากฏในตัวเลือกใหม่ แต่หัวหน้าทัวร์ที่เคยระบุประเทศนี้ยังคงข้อมูลไว้ครบ`
            : `เปิดใช้งาน “${countryToggle?.nameTh}” อีกครั้ง`
        }
      />

      <ConfirmDialog
        open={routeToggle !== null}
        onClose={() => setRouteToggle(null)}
        onConfirm={async () => {
          if (!routeToggle) return;
          const target = routeToggle;
          setRouteToggle(null);
          await toggleRoute(target.id);
        }}
        loading={saving}
        tone={routeToggle?.isActive ? 'danger' : 'primary'}
        title={routeToggle?.isActive ? 'ยืนยันการปิดใช้งานเส้นทาง' : 'ยืนยันการเปิดใช้งานเส้นทาง'}
        confirmLabel={routeToggle?.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        message={
          routeToggle?.isActive
            ? `ปิดใช้งาน “${routeToggle?.nameTh}” — จะไม่ปรากฏในตัวเลือกใหม่ แต่ข้อมูลเดิมยังคงอยู่`
            : `เปิดใช้งาน “${routeToggle?.nameTh}” อีกครั้ง`
        }
      />

      <ConfirmDialog
        open={userToggleTarget !== null}
        onClose={() => setUserToggleTarget(null)}
        onConfirm={() => {
          if (!userToggleTarget) return;
          toggleUserActive(userToggleTarget.id);
          setUserToggleTarget(null);
        }}
        tone={userToggleTarget?.active ? 'danger' : 'primary'}
        title={userToggleTarget?.active ? 'ยืนยันการปิดใช้งานผู้ใช้' : 'ยืนยันการเปิดใช้งานผู้ใช้'}
        confirmLabel={userToggleTarget?.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
        message={
          userToggleTarget?.active
            ? `ปิดใช้งานผู้ใช้ “${userToggleTarget?.name}” — จะไม่สามารถสลับไปใช้บทบาทนี้ได้ แต่ข้อมูลยังคงอยู่ในระบบ`
            : `เปิดใช้งานผู้ใช้ “${userToggleTarget?.name}” อีกครั้ง`
        }
      />

      <div className="mt-5">
        <Card>
          <CardHeader title="เกี่ยวกับระบบต้นแบบนี้" />
          <ul className="space-y-2 text-sm zego-text-secondary">
            <li className="flex gap-2">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 zego-text-tertiary" />
              ข้อมูลทั้งหมดเป็นข้อมูลจำลอง เก็บไว้ใน memory เท่านั้น — รีเฟรชหน้าเว็บแล้วข้อมูลจะกลับสู่ค่าเริ่มต้น
            </li>
            <li className="flex gap-2">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 zego-text-tertiary" />
              ไม่มีระบบ Login จริง ไม่มีการอัปโหลดไฟล์ขึ้น Server ไม่ส่ง LINE/อีเมล และไม่เชื่อมโปรแกรมบัญชี
            </li>
            <li className="flex gap-2">
              <Icon name="info" className="mt-0.5 h-4 w-4 shrink-0 zego-text-tertiary" />
              ไม่จัดเก็บเลขบัตรประชาชนหรือเลขบัญชีธนาคารจริง — แสดงเป็นข้อมูลปิดบังเสมอ
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
