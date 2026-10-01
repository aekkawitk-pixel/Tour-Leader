'use client';

/**
 * Stepper — Desktop แสดงแนวนอน · มือถือแสดง "ขั้นตอนที่ X จาก N" + แถบความคืบหน้า
 * ⚠️ ไม่มี Horizontal Scroll สำหรับขั้นตอน (ใช้ flex-1 แบ่งพื้นที่เท่ากัน)
 */

import { Icon } from './Icon';
import { cx } from './Primitives';
import type { StepStatus } from '@/modules/tour-leaders/constants';
import { STEP_STATUS_LABEL } from '@/modules/tour-leaders/constants';

export interface StepItem {
  key: string;
  label: string;
  hint?: string;
  status: StepStatus;
}

const STATUS_STYLE: Record<StepStatus, { circle: string; text: string; badge: string; bar: string; line: string }> = {
  empty: { circle: '', text: 'zego-text-disabled', badge: 'zego-badge--slate', bar: 'zego-step-bar', line: 'zego-step-line' },
  in_progress: {
    circle: 'zego-step-circle--info',
    text: 'zego-text-info',
    badge: 'zego-badge--info',
    bar: 'zego-step-bar--current',
    line: 'zego-step-line',
  },
  complete: {
    circle: 'zego-step-circle--success',
    text: 'zego-text-success',
    badge: 'zego-badge--success',
    bar: 'zego-step-bar--success',
    line: 'zego-step-line--success',
  },
  error: {
    circle: 'zego-step-circle--danger',
    text: 'zego-text-danger',
    badge: 'zego-badge--danger',
    bar: 'zego-step-bar--danger',
    line: 'zego-step-line',
  },
};

export function Stepper({
  steps,
  current,
  onSelect,
}: {
  steps: StepItem[];
  current: string;
  onSelect: (key: string) => void;
}) {
  const index = steps.findIndex((s) => s.key === current);
  const activeStep = steps[index];

  return (
    <div>
      {/* ---------------------------- มือถือ ---------------------------- */}
      <div className="sm:hidden">
        <div className="flex items-center justify-between gap-2">
          <p className="zego-text text-sm font-semibold">
            ขั้นตอนที่ {index + 1} จาก {steps.length}
          </p>
          {activeStep && (
            <span className={cx('zego-badge zego-badge--sm', STATUS_STYLE[activeStep.status].badge)}>
              {STEP_STATUS_LABEL[activeStep.status]}
            </span>
          )}
        </div>
        <p className="zego-text mt-0.5 text-base font-bold">{activeStep?.label}</p>
        {activeStep?.hint && <p className="zego-text-secondary text-xs">{activeStep.hint}</p>}

        {/* แถบความคืบหน้า — แตะเพื่อกระโดดไปแต่ละขั้นตอนได้ */}
        <div className="mt-3 flex gap-1">
          {steps.map((step, i) => (
            <button
              key={step.key}
              type="button"
              onClick={() => onSelect(step.key)}
              aria-label={`ไปขั้นตอนที่ ${i + 1}: ${step.label} (${STEP_STATUS_LABEL[step.status]})`}
              aria-current={step.key === current ? 'step' : undefined}
              className={cx(
                'h-1.5 flex-1 rounded-full transition-colors',
                step.status === 'error'
                  ? 'zego-step-bar--danger'
                  : step.key === current
                    ? 'zego-step-bar--current'
                    : step.status === 'complete'
                      ? 'zego-step-bar--success'
                      : 'zego-step-bar',
              )}
            />
          ))}
        </div>
      </div>

      {/* --------------------------- Desktop --------------------------- */}
      <ol className="hidden items-start gap-1 sm:flex">
        {steps.map((step, i) => {
          const style = STATUS_STYLE[step.status];
          const isCurrent = step.key === current;
          return (
            <li key={step.key} className="flex min-w-0 flex-1 items-start">
              <button
                type="button"
                onClick={() => onSelect(step.key)}
                aria-current={isCurrent ? 'step' : undefined}
                className={cx(
                  'zego-step-btn flex min-w-0 flex-1 flex-col items-center gap-1.5 rounded-lg px-1 py-2 text-center transition-colors',
                  isCurrent && 'zego-step-btn--current',
                )}
              >
                <span
                  className={cx(
                    'zego-step-circle flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    style.circle,
                    isCurrent && 'zego-step-circle--current',
                  )}
                >
                  {step.status === 'complete' ? (
                    <Icon name="check" className="h-4 w-4" />
                  ) : step.status === 'error' ? (
                    <Icon name="warning" className="h-4 w-4" />
                  ) : (
                    i + 1
                  )}
                </span>

                <span className="min-w-0">
                  <span className={cx('block truncate text-xs font-semibold', isCurrent ? 'zego-text-info' : style.text)}>
                    {step.label}
                  </span>
                  <span className={cx('zego-badge zego-badge--sm mt-0.5 inline-flex', style.badge)}>
                    {STEP_STATUS_LABEL[step.status]}
                  </span>
                </span>
              </button>

              {i < steps.length - 1 && (
                <span aria-hidden="true" className={cx('mt-4 h-0.5 w-4 shrink-0 rounded', style.line)} />
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
