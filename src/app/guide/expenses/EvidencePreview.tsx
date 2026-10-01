'use client';

/**
 * แสดงหลักฐานของรายการค่าใช้จ่าย — มีรูป = ภาพย่อ แตะเพื่อดูเต็มจอ · ไม่มีรูป = ชื่อไฟล์/สถานะหลักฐานเหมือนเดิม
 * (รายการเก่าก่อนมีการเก็บรูป หรือ "ไม่มีหลักฐาน" / "รอแนบหลักฐาน" จะไม่มีรูป)
 */

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/ui/Icon';
import { OCR_LANGS, recognizeLines, translateLines, TranslateClientError, type OcrLang, type OcrLine, type TranslateProvider } from '@/services/imageTextOcr';

export function EvidencePreview({ fileName, image }: { fileName?: string; image?: string }) {
  const [open, setOpen] = useState(false);

  if (!image) {
    const noFile = fileName === 'ไม่มีหลักฐาน' || fileName === 'รอแนบหลักฐาน';
    return (
      <span className="flex items-center gap-1.5">
        <Icon name="file" className="h-4 w-4 shrink-0 zego-text-tertiary" />
        {noFile ? (
          <span className="font-medium zego-text-secondary">{fileName}</span>
        ) : (
          <span>
            <span className="block">ใบเสร็จ 1 ไฟล์</span>
            <span className="block truncate font-medium zego-text-secondary">{fileName || '—'}</span>
          </span>
        )}
      </span>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group flex items-center gap-2 text-left" aria-label="ดูรูปหลักฐาน">
        {/* data URL ของรูปที่ผู้ใช้แนบเอง — next/image ไม่จำเป็น/ไม่รองรับ data URL ขนาดนี้ได้ดี */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt="รูปหลักฐาน" className="h-14 w-14 shrink-0 rounded-md border zego-border-color object-cover" />
        <span>
          <span className="block">ใบเสร็จ 1 ไฟล์</span>
          <span className="block max-w-[10rem] truncate font-medium zego-text-secondary">{fileName}</span>
          <span className="block font-medium zego-text-info group-hover:underline">แตะเพื่อดูรูป</span>
        </span>
      </button>
      {open && <ImageLightbox src={image} alt={fileName ?? 'รูปหลักฐาน'} onClose={() => setOpen(false)} />}
    </>
  );
}

/** ผลอ่าน+แปลต่อรูปและภาษา — เก็บไว้ทั้งหน้า เปิดรูปเดิมซ้ำไม่ต้องอ่าน/แปลใหม่ (ไม่เก็บลงเครื่อง) */
interface OverlayLine extends OcrLine {
  th: string;
}
const overlayCache = new Map<string, { lines: OverlayLine[]; provider: TranslateProvider }>();
const LANG_KEY = 'evidenceTranslateLang';

function loadLang(): OcrLang {
  try {
    const v = window.localStorage.getItem(LANG_KEY);
    if (v && OCR_LANGS.some((l) => l.value === v)) return v as OcrLang;
  } catch { /* ไม่มี storage */ }
  return 'en';
}

type Phase = 'idle' | 'reading' | 'translating' | 'done' | 'error';

/**
 * ดูรูปเต็มจอ — แตะพื้นหลัง / ปุ่มปิด / Esc เพื่อปิด
 *
 * "แปลภาษา" = แปลทับบนรูป: อ่านข้อความ+ตำแหน่งในเครื่อง (tesseract.js) → ส่งเฉพาะตัวหนังสือไปแปลเป็นไทย
 * (/api/translate-lines) → วางคำแปลทับตรงบรรทัดเดิมบนรูป · สลับ "ดูต้นฉบับ" ได้ · แตะกรอบเพื่ออ่านคำแปลเต็ม
 * เลือกภาษาในรูปก่อนกด (จำค่าล่าสุดไว้) — คำแปลใช้ประกอบการตรวจ ไม่แก้ข้อมูลในใบเบิก
 */
export function ImageLightbox({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [lang, setLang] = useState<OcrLang>(loadLang);
  const [lines, setLines] = useState<OverlayLine[] | null>(null);
  /** แปลด้วยบริการของระบบ หรือโหมดทดลองฟรี (เซิร์ฟเวอร์ยังไม่ตั้ง Key) — แจ้งผู้ใช้ใต้รูป */
  const [provider, setProvider] = useState<TranslateProvider | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [picked, setPicked] = useState<OverlayLine | null>(null);
  /** ขนาดรูปจริง (พิกัด OCR) และขนาดที่แสดงบนจอ (ใช้คำนวณขนาดตัวอักษรของคำแปล) */
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [shownH, setShownH] = useState(0);
  const imgRef = useRef<HTMLImageElement>(null);

  /*
   * ซูม/เลื่อน — รูปและกรอบคำแปลอยู่ใน "stage" เดียวกันที่ถูก scale+translate พร้อมกัน คำแปลจึงไม่เลื่อนหลุดบรรทัด
   * transform-origin มุมซ้ายบน: ซูมรอบจุดใดก็ได้ (ตำแหน่งเมาส์/จุดกึ่งกลางสองนิ้ว/กลางจอสำหรับปุ่ม)
   */
  const [view, setViewState] = useState({ z: 1, x: 0, y: 0 });
  const viewRef = useRef(view);
  const setView = (v: { z: number; x: number; y: number }) => {
    viewRef.current = v;
    setViewState(v);
  };
  const areaRef = useRef<HTMLDivElement>(null);
  /** ความสูงพื้นที่ดูรูปจริง — แถบคำแปล/ข้อความเตือนด้านล่างทำให้พื้นที่เตี้ยลง รูปต้องย่อตาม ไม่งั้นล้นกรอบแล้วคำแปลเหลื่อม */
  const [areaH, setAreaH] = useState(0);
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setAreaH(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const stageRef = useRef<HTMLDivElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; z: number } | null>(null);
  const dragFrom = useRef<{ x: number; y: number } | null>(null);
  /** มีการลาก/บีบจริง (เกิน 4px) — ใช้กันไม่ให้การลากถูกนับเป็นคลิก (ปิดรูป/เปิดคำแปล) */
  const moved = useRef(false);

  const MIN_ZOOM = 1;
  const MAX_ZOOM = 6;

  const zoomAt = (pt: { x: number; y: number }, nextZoom: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
    if (z === MIN_ZOOM) {
      setView({ z: 1, x: 0, y: 0 });
      return;
    }
    const cur = viewRef.current;
    const r = stage.getBoundingClientRect();
    // จุดที่ชี้บนรูป (พิกัดก่อนซูม) ต้องอยู่ที่เดิมบนจอหลังซูม
    const lx = (pt.x - r.left) / cur.z;
    const ly = (pt.y - r.top) / cur.z;
    setView({ z, x: cur.x + (pt.x - lx * z - r.left), y: cur.y + (pt.y - ly * z - r.top) });
  };

  const zoomFromCenter = (factor: number) => {
    const a = areaRef.current?.getBoundingClientRect();
    if (!a) return;
    zoomAt({ x: a.left + a.width / 2, y: a.top + a.height / 2 }, viewRef.current.z * factor);
  };

  // ล้อเมาส์ = ซูมรอบตำแหน่งเมาส์ (ต้อง passive:false เพื่อกันหน้าเลื่อน — ใส่ผ่าน addEventListener)
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt({ x: e.clientX, y: e.clientY }, viewRef.current.z * Math.exp(-e.deltaY * 0.0015));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // zoomAt อ่านค่าล่าสุดผ่าน ref เท่านั้น — ผูก listener ครั้งเดียวพอ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    moved.current = false;
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), z: viewRef.current.z };
      dragFrom.current = null;
    } else {
      dragFrom.current = { x: e.clientX, y: e.clientY };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2 && pinch.current) {
      const [a, b] = [...pointers.current.values()];
      moved.current = true;
      zoomAt({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, (pinch.current.z * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.current.dist);
      return;
    }
    const from = dragFrom.current;
    if (!from || viewRef.current.z <= 1) return;
    if (!moved.current && Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4) return;
    if (!moved.current) {
      moved.current = true;
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        /* pointer หายไปแล้ว (เช่น ยกนิ้วพอดี) — ลากต่อได้ตามปกติโดยไม่ capture */
      }
    }
    const cur = viewRef.current;
    setView({ ...cur, x: cur.x + e.clientX - prev.x, y: cur.y + e.clientY - prev.y });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (pointers.current.size === 0) dragFrom.current = null;
  };

  /** หลังลาก/บีบ ไม่ให้คลิกที่ตามมาไปปิดรูปหรือเปิดคำแปล */
  const swallowClickAfterDrag = (e: React.MouseEvent) => {
    if (moved.current) {
      e.stopPropagation();
      e.preventDefault();
      moved.current = false;
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const ro = new ResizeObserver(() => setShownH(img.clientHeight));
    ro.observe(img);
    return () => ro.disconnect();
  }, []);

  const busy = phase === 'reading' || phase === 'translating';

  const run = async (which: OcrLang) => {
    const key = `${which}|${src}`;
    const cached = overlayCache.get(key);
    setPicked(null);
    setShowOverlay(true);
    if (cached) {
      setLines(cached.lines);
      setProvider(cached.provider);
      setPhase('done');
      return;
    }
    setError(null);
    setLines(null);
    setProgress(0);
    setPhase('reading');
    try {
      const found = await recognizeLines(src, which, setProgress);
      if (found.length === 0) {
        setLines([]);
        setPhase('done');
        return;
      }
      setPhase('translating');
      const { translations: th, provider: used } = await translateLines(found.map((l) => l.text), which);
      // คำแปลเหมือนต้นฉบับ (ชื่อเฉพาะ/URL/รหัส) → ไม่ต้องปิดทับ ให้เห็นต้นฉบับบนรูปตามเดิม
      const same = (x: string, y: string) => x.replace(/\s/g, '').toLowerCase() === y.replace(/\s/g, '').toLowerCase();
      const result = found
        .map((l, i) => ({ ...l, th: th[i] || l.text }))
        .filter((l) => !same(l.th, l.text));
      overlayCache.set(key, { lines: result, provider: used });
      setLines(result);
      setProvider(used);
      setPhase('done');
    } catch (err) {
      setError(err instanceof TranslateClientError ? err.message : 'อ่านข้อความบนรูปไม่สำเร็จ — ลองใหม่อีกครั้ง');
      setPhase('error');
    }
  };

  const chooseLang = (value: OcrLang) => {
    setLang(value);
    try { window.localStorage.setItem(LANG_KEY, value); } catch { /* ไม่มี storage */ }
    if (phase !== 'idle') void run(value);
  };

  const scale = natural && shownH ? shownH / natural.h : 0;

  // portal ไปที่ body — ถ้าอยู่ใน Drawer (มี transform) position:fixed จะถูกจำกัดแค่กรอบ Drawer ไม่เต็มจอ
  // z-180: เหนือ Modal/Drawer (z-160, ดู @/lib/z-index) แต่ใต้ Toast (z-190) — เปิดจากในแผงรายละเอียดแล้วต้องอยู่บนสุด
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="รูปหลักฐาน"
      className="fixed inset-0 z-[180] flex flex-col bg-black/90"
      onClick={onClose}
    >
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white" onClick={(e) => e.stopPropagation()}>
        <span className="min-w-0 flex-1 truncate text-sm">{alt}</span>
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="ปิดรูป" style={{ color: '#ffffff' }}>
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>

      {(error || (phase === 'done' && lines?.length === 0)) && (
        <div className="px-4 pb-2" onClick={(e) => e.stopPropagation()}>
          <p className="rounded-lg px-3 py-2 text-xs" style={{ background: '#fef3c7', color: '#92400e' }}>
            {error ?? 'ไม่พบข้อความบนรูป — ลองเลือกภาษาในรูปให้ถูก หรือใช้รูปที่ชัดขึ้น'}
          </p>
        </div>
      )}

      {/* พื้นที่ดูรูป — ซูม (ล้อเมาส์/บีบสองนิ้ว/ดับเบิลคลิก/ปุ่ม) และลากเลื่อนเมื่อซูมอยู่ */}
      <div
        ref={areaRef}
        className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-2"
        style={{ touchAction: 'none', cursor: view.z > 1 ? 'grab' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onClickCapture={swallowClickAfterDrag}
        onDoubleClick={(e) => {
          e.stopPropagation();
          if (viewRef.current.z > 1.01) setView({ z: 1, x: 0, y: 0 });
          else zoomAt({ x: e.clientX, y: e.clientY }, 2.5);
        }}
      >
        {/* กรอบขนาดเท่ารูปที่แสดง — คำแปลวางด้วย % ของรูปจริง จึงตรงตำแหน่งทุกขนาดจอและทุกระดับซูม */}
        <div
          ref={stageRef}
          className="relative inline-block max-w-full"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})`, transformOrigin: '0 0' }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            className="block max-w-full object-contain"
            // 16px = padding บน-ล่างของพื้นที่ดูรูป (p-2)
            style={{ maxHeight: areaH > 0 ? areaH - 16 : 'calc(100vh - 9rem)' }}
            onLoad={(e) => {
              setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight });
              setShownH(e.currentTarget.clientHeight);
            }}
          />
          {showOverlay && natural && scale > 0 && lines?.map((l, i) => {
            const h = l.bbox.y1 - l.bbox.y0;
            // บรรทัดเดียวเสมอ (ไม่ตัดขึ้นบรรทัดใหม่ไปทับบรรทัดถัดไป) — ย่อตัวอักษรให้คำแปลพอดีความกว้างกรอบเดิม
            // (ตัวอักษรไทยกว้างเฉลี่ยราว 0.55 เท่าของขนาดฟอนต์) · ยาวจนย่อไม่พอ = ตัดท้าย แตะกรอบเพื่ออ่านเต็ม
            const widthPx = (l.bbox.x1 - l.bbox.x0) * scale;
            const fitWidth = widthPx / (Math.max(1, l.th.length) * 0.55);
            const fontSize = Math.max(7, Math.min(28, h * scale * 0.72, fitWidth));
            return (
              <button
                key={i}
                type="button"
                onClick={() => setPicked(l)}
                title={`${l.th}\n(${l.text})`}
                className="absolute flex items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-sm px-0.5 text-left leading-tight shadow-sm"
                style={{
                  left: `${(l.bbox.x0 / natural.w) * 100}%`,
                  top: `${(l.bbox.y0 / natural.h) * 100}%`,
                  width: `${((l.bbox.x1 - l.bbox.x0) / natural.w) * 100}%`,
                  height: `${(h / natural.h) * 100}%`,
                  fontSize: `${fontSize}px`,
                  // ทึบเต็ม — โปร่งแม้นิดเดียวตัวหนังสือต้นฉบับจะซ้อนเป็นเงาอ่านยาก (ดูต้นฉบับได้จากปุ่ม "ดูต้นฉบับ")
                  background: '#ffffff',
                  color: '#0f172a',
                  outline: picked === l ? '2px solid #059669' : '1px solid rgba(5,150,105,0.35)',
                }}
              >
                {l.th}
              </button>
            );
          })}
        </div>

        {/* แถบควบคุมบนเอกสาร (ไม่ถูกซูมตาม ปุ่มขนาดคงที่) — ภาษาในรูป · แปล/ดูต้นฉบับ · ซูม */}
        <div
          className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 flex-nowrap items-center gap-1.5 whitespace-nowrap rounded-full p-1.5 shadow-lg"
          style={{ background: 'rgba(15,23,42,0.82)' }}
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
            <div className="flex overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.12)' }} role="group" aria-label="ภาษาในรูป">
              {OCR_LANGS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  onClick={() => chooseLang(l.value)}
                  disabled={busy}
                  aria-pressed={lang === l.value}
                  className="px-2.5 py-1.5 text-xs font-medium disabled:opacity-50"
                  style={lang === l.value ? { background: '#ffffff', color: '#0f172a' } : { color: '#ffffff' }}
                >
                  {l.label}
                </button>
              ))}
            </div>
            {phase === 'done' && lines && lines.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowOverlay((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium"
                style={showOverlay ? { background: '#ffffff', color: '#0f172a' } : { background: '#059669', color: '#ffffff' }}
              >
                <Icon name="eye" className="h-4 w-4" />
                {showOverlay ? 'ดูต้นฉบับ' : 'ดูคำแปล'}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void run(lang)}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium disabled:opacity-80"
                style={{ background: '#059669', color: '#ffffff' }}
              >
                <Icon name="chat" className="h-4 w-4" />
                {busy ? (phase === 'reading' ? `กำลังอ่านข้อความ ${Math.round(progress * 100)}%` : 'กำลังแปล...') : 'แปลภาษา'}
              </button>
            )}
          <div className="flex items-center overflow-hidden rounded-full" style={{ background: 'rgba(255,255,255,0.12)', color: '#ffffff' }} role="group" aria-label="ซูม">
            <button type="button" onClick={() => zoomFromCenter(1 / 1.5)} disabled={view.z <= MIN_ZOOM} className="px-2.5 py-1.5 text-sm font-semibold disabled:opacity-40" aria-label="ซูมออก">
              −
            </button>
            <button type="button" onClick={() => setView({ z: 1, x: 0, y: 0 })} className="min-w-[3.25rem] px-1 py-1.5 text-xs font-medium tabular-nums" title="กลับขนาดเดิม" aria-label="กลับขนาดเดิม">
              {Math.round(view.z * 100)}%
            </button>
            <button type="button" onClick={() => zoomFromCenter(1.5)} disabled={view.z >= MAX_ZOOM} className="px-2.5 py-1.5 text-sm font-semibold disabled:opacity-40" aria-label="ซูมเข้า">
              +
            </button>
          </div>
        </div>
      </div>

      {/* แตะกรอบ = อ่านคำแปลเต็ม (กรอบบนรูปอาจเล็กจนตัดข้อความ) */}
      {picked && (
        <div className="px-3 pb-3" onClick={(e) => e.stopPropagation()}>
          <div className="mx-auto flex max-w-2xl items-start gap-3 rounded-xl px-4 py-3 text-sm" style={{ background: '#ffffff', color: '#0f172a' }}>
            <div className="min-w-0 flex-1">
              <p className="font-medium">{picked.th}</p>
              <p className="mt-0.5 text-xs" style={{ color: '#64748b' }}>ต้นฉบับ: {picked.text}</p>
            </div>
            <button type="button" onClick={() => setPicked(null)} aria-label="ปิดคำแปล" style={{ color: '#64748b' }}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      {phase === 'done' && lines && lines.length > 0 && !picked && (
        <p className="pb-2 text-center text-[11px]" style={{ color: 'rgba(255,255,255,0.6)' }} onClick={(e) => e.stopPropagation()}>
          {provider === 'free'
            ? 'โหมดทดลองฟรี (MyMemory) — คุณภาพต่ำกว่าบริการของระบบ และข้อความบนรูปถูกส่งไปบริการภายนอก'
            : 'แปลอัตโนมัติ'}{' '}
          — ใช้ประกอบการตรวจ ควรเทียบกับรูปจริงทุกครั้ง · แตะข้อความเพื่ออ่านเต็ม · ล้อเมาส์/บีบสองนิ้วเพื่อซูม
        </p>
      )}
    </div>,
    document.body,
  );
}
