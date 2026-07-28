import { describe, it, expect } from 'vitest'
import {
  planDraftRecovery,
  isStatusClobbered,
  hasFinishedDesign,
  STUCK_GENERATION_MS,
  STUCK_REASON,
  type RecoverableDraft,
} from '@/lib/drafts/recovery'

// The draft GET's lazy recovery: heal a status clobbered by the old copy-edit
// flip (EXPORTED → IN_PROGRESS on any PATCH of copyText), sweep a genuinely
// interrupted generation to FAILED, clear a stale in-flight async action.

const NOW = new Date('2026-07-28T12:00:00Z').getTime()
const fresh = new Date(NOW - 1_000)
const ancient = new Date(NOW - STUCK_GENERATION_MS - 1_000)

// A finished post: rendered export + html + revision pointer.
function draft(over: Partial<RecoverableDraft> = {}): RecoverableDraft {
  return {
    status: 'EXPORTED',
    failureReason: null,
    pendingAction: null,
    updatedAt: fresh,
    exportUrl: 'exports/draft-1.png',
    htmlContent: '<html></html>',
    currentRevisionNumber: 1,
    ...over,
  }
}

describe('hasFinishedDesign', () => {
  it('is true only when export, html and revision pointer are all present', () => {
    expect(hasFinishedDesign(draft())).toBe(true)
    expect(hasFinishedDesign(draft({ exportUrl: null }))).toBe(false)
    expect(hasFinishedDesign(draft({ htmlContent: null }))).toBe(false)
    expect(hasFinishedDesign(draft({ currentRevisionNumber: null }))).toBe(false)
  })
})

describe('isStatusClobbered', () => {
  it('flags an IN_PROGRESS draft that already has a finished design', () => {
    expect(isStatusClobbered(draft({ status: 'IN_PROGRESS' }))).toBe(true)
  })

  it('flags a design-bearing draft swept to FAILED by the interruption sweep', () => {
    expect(
      isStatusClobbered(draft({ status: 'FAILED', failureReason: STUCK_REASON })),
    ).toBe(true)
  })

  it('leaves a genuine first-time generation alone (no export yet)', () => {
    expect(
      isStatusClobbered(
        draft({ status: 'IN_PROGRESS', exportUrl: null, htmlContent: null, currentRevisionNumber: null }),
      ),
    ).toBe(false)
  })

  it('leaves a real generation failure alone', () => {
    expect(
      isStatusClobbered(
        draft({
          status: 'FAILED',
          failureReason: 'No brand kit found',
          exportUrl: null,
          htmlContent: null,
          currentRevisionNumber: null,
        }),
      ),
    ).toBe(false)
  })

  it('never touches a healthy EXPORTED or PUBLISHED draft', () => {
    expect(isStatusClobbered(draft())).toBe(false)
    expect(isStatusClobbered(draft({ status: 'PUBLISHED' }))).toBe(false)
  })
})

describe('planDraftRecovery', () => {
  it('heals a clobbered status immediately, with no waiting period', () => {
    const plan = planDraftRecovery(draft({ status: 'IN_PROGRESS' }), NOW)
    expect(plan.healStatus).toBe(true)
    expect(plan.failStuckGeneration).toBe(false)
  })

  it('heals rather than fails a clobbered draft that is also stale', () => {
    // The regression that made this bug destructive: 15 minutes after a copy
    // edit the sweep declared a nonexistent generation interrupted.
    const plan = planDraftRecovery(draft({ status: 'IN_PROGRESS', updatedAt: ancient }), NOW)
    expect(plan.healStatus).toBe(true)
    expect(plan.failStuckGeneration).toBe(false)
  })

  it('still fails a real generation stranded past the lease', () => {
    const plan = planDraftRecovery(
      draft({
        status: 'IN_PROGRESS',
        updatedAt: ancient,
        exportUrl: null,
        htmlContent: null,
        currentRevisionNumber: null,
      }),
      NOW,
    )
    expect(plan.failStuckGeneration).toBe(true)
    expect(plan.healStatus).toBe(false)
  })

  it('does not fail a generation that is still within the lease', () => {
    const plan = planDraftRecovery(
      draft({
        status: 'IN_PROGRESS',
        exportUrl: null,
        htmlContent: null,
        currentRevisionNumber: null,
      }),
      NOW,
    )
    expect(plan.failStuckGeneration).toBe(false)
    expect(plan.healStatus).toBe(false)
  })

  it('clears a stale action, independently of the status branches', () => {
    const plan = planDraftRecovery(draft({ pendingAction: 'REFINE', updatedAt: ancient }), NOW)
    expect(plan.clearStuckAction).toBe(true)
    expect(plan.healStatus).toBe(false)
    expect(plan.failStuckGeneration).toBe(false)
  })

  it('keeps a fresh in-flight action', () => {
    const plan = planDraftRecovery(draft({ pendingAction: 'REGENERATE_COPY' }), NOW)
    expect(plan.clearStuckAction).toBe(false)
  })

  it('does nothing to a healthy exported draft', () => {
    expect(planDraftRecovery(draft(), NOW)).toEqual({
      healStatus: false,
      failStuckGeneration: false,
      clearStuckAction: false,
    })
  })
})
