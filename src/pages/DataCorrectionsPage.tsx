import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAdminAuth } from '@/features/adminAuth/useAdminAuth'
import { getAdminDaily, patchAdminDaily } from '@/api/stationAdminApi'
import { weatherQueryKeys } from '@/api/publicWeatherApi'
import { RAINFALL_START_DATE } from '@/config/weather'
import { Modal, Skeleton } from '@/components/ui'
import type { AdminDailyRecord, AdminPatchPayload } from '@/types/admin'
import type { AdminPermissionState } from '@/types/admin'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatTempC(value: number | null): string {
  if (value == null) return '—'
  return `${value.toFixed(1)} °C`
}

function formatRainMm(value: number | null, date: string): string {
  if (value == null) {
    return date < RAINFALL_START_DATE ? 'Unavailable' : '—'
  }
  return `${value.toFixed(1)} mm`
}

function getErrorStatus(err: unknown): number {
  if (err != null && typeof err === 'object' && 'status' in err) {
    const s = (err as { status: unknown }).status
    if (typeof s === 'number') return s
  }
  return 0
}

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return 'An unexpected error occurred'
}

// ── Types ─────────────────────────────────────────────────────────────────────

type RecordStatus =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'absent'; date: string }
  | { kind: 'error'; message: string }
  | { kind: 'loaded'; record: AdminDailyRecord }

type EditMode =
  | { kind: 'view' }
  | { kind: 'editing' }
  | { kind: 'confirming' }
  | { kind: 'saving' }
  | { kind: 'saved'; auditId: string; message: string }

type FormState = {
  maxTempC: string
  maxTempCCleared: boolean
  minTempC: string
  minTempCCleared: boolean
  rainfallMm: string
  rainfallMmCleared: boolean
  reason: string
}

type ValidationErrors = {
  maxTempC?: string
  minTempC?: string
  rainfallMm?: string
  reason?: string
  minExceedsMax?: string
}

type FieldChange = {
  label: string
  before: number | null
  after: number | null
  unit: string
  changed: boolean
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function initFormState(record: AdminDailyRecord): FormState {
  return {
    maxTempC: record.max_temp_c != null ? String(record.max_temp_c) : '',
    maxTempCCleared: false,
    minTempC: record.min_temp_c != null ? String(record.min_temp_c) : '',
    minTempCCleared: false,
    rainfallMm: record.rainfall_mm != null ? String(record.rainfall_mm) : '',
    rainfallMmCleared: false,
    reason: '',
  }
}

function effectiveValue(
  valueStr: string,
  cleared: boolean,
  original: number | null,
): number | null {
  if (cleared) return null
  const trimmed = valueStr.trim()
  if (trimmed === '') return original
  const parsed = parseFloat(trimmed)
  return isNaN(parsed) ? original : parsed
}

export function buildPatchPayload(
  date: string,
  record: AdminDailyRecord,
  form: FormState,
): { payload: AdminPatchPayload | null; changes: FieldChange[] } {
  const newMax = effectiveValue(form.maxTempC, form.maxTempCCleared, record.max_temp_c)
  const newMin = effectiveValue(form.minTempC, form.minTempCCleared, record.min_temp_c)
  const newRain = effectiveValue(form.rainfallMm, form.rainfallMmCleared, record.rainfall_mm)

  const partial: Omit<AdminPatchPayload, 'reason'> = {}
  if (newMax !== record.max_temp_c) partial.max_temp_c = newMax
  if (newMin !== record.min_temp_c) partial.min_temp_c = newMin
  if (newRain !== record.rainfall_mm) partial.rainfall_mm = newRain

  const changes: FieldChange[] = [
    {
      label: 'Max temperature',
      before: record.max_temp_c,
      after: newMax,
      unit: ' °C',
      changed: newMax !== record.max_temp_c,
    },
    {
      label: 'Min temperature',
      before: record.min_temp_c,
      after: newMin,
      unit: ' °C',
      changed: newMin !== record.min_temp_c,
    },
    {
      label: 'Rainfall',
      before: record.rainfall_mm,
      after: date < RAINFALL_START_DATE ? record.rainfall_mm : newRain,
      unit: ' mm',
      changed: date >= RAINFALL_START_DATE && newRain !== record.rainfall_mm,
    },
  ]

  if (Object.keys(partial).length === 0) {
    return { payload: null, changes }
  }

  return { payload: { ...partial, reason: form.reason }, changes }
}

export function validateForm(
  date: string,
  form: FormState,
  record: AdminDailyRecord,
): ValidationErrors {
  const errors: ValidationErrors = {}

  if (!form.maxTempCCleared && form.maxTempC.trim() !== '') {
    if (isNaN(parseFloat(form.maxTempC))) errors.maxTempC = 'Must be a valid number'
  }

  if (!form.minTempCCleared && form.minTempC.trim() !== '') {
    if (isNaN(parseFloat(form.minTempC))) errors.minTempC = 'Must be a valid number'
  }

  if (date < RAINFALL_START_DATE) {
    if (form.rainfallMmCleared || form.rainfallMm.trim() !== '') {
      errors.rainfallMm = 'Rainfall before 2020-05-01 must remain null'
    }
  } else if (!form.rainfallMmCleared && form.rainfallMm.trim() !== '') {
    const v = parseFloat(form.rainfallMm)
    if (isNaN(v)) {
      errors.rainfallMm = 'Must be a valid number'
    } else if (v < 0) {
      errors.rainfallMm = 'Rainfall cannot be negative'
    }
  }

  const resolvedMax = form.maxTempCCleared
    ? null
    : form.maxTempC.trim()
      ? parseFloat(form.maxTempC)
      : record.max_temp_c
  const resolvedMin = form.minTempCCleared
    ? null
    : form.minTempC.trim()
      ? parseFloat(form.minTempC)
      : record.min_temp_c
  if (resolvedMax != null && resolvedMin != null && resolvedMin > resolvedMax) {
    errors.minExceedsMax = `Warning: minimum (${resolvedMin} °C) exceeds maximum (${resolvedMax} °C)`
  }

  const trimmedReason = form.reason.trim()
  if (trimmedReason.length < 3) {
    errors.reason = 'Reason must be at least 3 characters'
  } else if (trimmedReason.length > 500) {
    errors.reason = 'Reason must not exceed 500 characters'
  }

  return errors
}

function hasBlockingErrors(errors: ValidationErrors): boolean {
  return !!(errors.maxTempC ?? errors.minTempC ?? errors.rainfallMm ?? errors.reason)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MeanPreview({
  form,
  record,
}: {
  readonly form: FormState
  readonly record: AdminDailyRecord
}) {
  const maxStr = form.maxTempCCleared
    ? null
    : form.maxTempC.trim() || (record.max_temp_c != null ? String(record.max_temp_c) : null)
  const minStr = form.minTempCCleared
    ? null
    : form.minTempC.trim() || (record.min_temp_c != null ? String(record.min_temp_c) : null)

  if (!maxStr || !minStr) return null

  const maxV = parseFloat(maxStr)
  const minV = parseFloat(minStr)
  if (isNaN(maxV) || isNaN(minV)) return null

  const mean = (maxV + minV) / 2

  return (
    <p className="corrections-mean-preview">
      Calculated mean: <strong>{mean.toFixed(1)} °C</strong>
    </p>
  )
}

function PermissionOverlay({
  permissionState,
}: {
  readonly permissionState: Exclude<AdminPermissionState, 'authorised'>
}) {
  if (permissionState === 'loading') {
    return (
      <section className="card" aria-live="polite" aria-label="Checking permissions">
        <Skeleton lines={3} />
      </section>
    )
  }

  if (permissionState === 'signed-out') {
    return (
      <section className="state-card" aria-live="polite">
        <p>Redirecting to login&hellip;</p>
      </section>
    )
  }

  if (permissionState === 'unauthorised') {
    return (
      <section className="state-card state-error" role="alert">
        <h2>Access denied</h2>
        <p>
          Your account is not authorised to edit climate records. Contact the
          station administrator if you believe this is an error.
        </p>
      </section>
    )
  }

  return (
    <section className="state-card state-error" role="alert">
      <h2>Authentication service unavailable</h2>
      <p>
        The authorisation service is temporarily unavailable. Please try again
        in a few minutes.
      </p>
    </section>
  )
}

// ── Correction editor ─────────────────────────────────────────────────────────

function CorrectionEditor() {
  const queryClient = useQueryClient()

  const [selectedDate, setSelectedDate] = useState(todayDateString())
  const [recordStatus, setRecordStatus] = useState<RecordStatus>({ kind: 'idle' })
  const [editMode, setEditMode] = useState<EditMode>({ kind: 'view' })
  const [form, setForm] = useState<FormState>({
    maxTempC: '',
    maxTempCCleared: false,
    minTempC: '',
    minTempCCleared: false,
    rainfallMm: '',
    rainfallMmCleared: false,
    reason: '',
  })
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  const loadRecord = useCallback(async (date: string) => {
    setRecordStatus({ kind: 'loading' })
    setEditMode({ kind: 'view' })
    setSaveError(null)
    try {
      const resp = await getAdminDaily(date)
      setRecordStatus({ kind: 'loaded', record: resp.record })
    } catch (err) {
      const status = getErrorStatus(err)
      if (status === 404) {
        setRecordStatus({ kind: 'absent', date })
      } else {
        setRecordStatus({ kind: 'error', message: getErrorMessage(err) })
      }
    }
  }, [])

  const enterEdit = useCallback(() => {
    if (recordStatus.kind !== 'loaded') return
    setForm(initFormState(recordStatus.record))
    setValidationErrors({})
    setSaveError(null)
    setEditMode({ kind: 'editing' })
  }, [recordStatus])

  const cancelEdit = useCallback(() => {
    setEditMode({ kind: 'view' })
    setValidationErrors({})
    setSaveError(null)
  }, [])

  const handleReviewChanges = useCallback(() => {
    if (recordStatus.kind !== 'loaded') return
    const errors = validateForm(selectedDate, form, recordStatus.record)
    setValidationErrors(errors)
    if (hasBlockingErrors(errors)) return
    const { payload } = buildPatchPayload(selectedDate, recordStatus.record, form)
    if (!payload) {
      setValidationErrors((prev) => ({ ...prev, reason: 'No fields have been changed' }))
      return
    }
    setEditMode({ kind: 'confirming' })
  }, [recordStatus, selectedDate, form])

  const handleConfirmSave = useCallback(async () => {
    if (recordStatus.kind !== 'loaded') return
    const { payload } = buildPatchPayload(selectedDate, recordStatus.record, form)
    if (!payload) return

    setEditMode({ kind: 'saving' })
    setSaveError(null)

    try {
      const resp = await patchAdminDaily(selectedDate, payload)

      setRecordStatus({ kind: 'loaded', record: resp.record })
      setEditMode({
        kind: 'saved',
        auditId: resp.audit_id,
        message: resp.message ?? resp.status,
      })

      const year = new Date(selectedDate).getUTCFullYear()
      const keysToInvalidate = weatherQueryKeys.invalidationKeysForYear(year)
      await Promise.all(
        keysToInvalidate.map((key) =>
          queryClient.invalidateQueries({ queryKey: key as readonly unknown[] }),
        ),
      )
    } catch (err) {
      const status = getErrorStatus(err)
      let message = getErrorMessage(err)

      if (status === 400) message = `Invalid request: ${message}`
      else if (status === 401) message = 'Session expired. Please refresh and try again.'
      else if (status === 403) message = 'Access denied.'
      else if (status === 404) message = 'Record not found. It may have been removed.'
      else if (status === 409)
        message = 'Conflict: this record has changed since you loaded it. Please reload.'
      else if (status === 422) message = `Validation failed: ${message}`
      else if (status === 500) message = `Server error: ${message}`
      else if (status === 503)
        message = 'Authentication service unavailable. Please try again later.'

      setSaveError(message)
      setEditMode({ kind: 'editing' })
    }
  }, [recordStatus, selectedDate, form, queryClient])

  const record = recordStatus.kind === 'loaded' ? recordStatus.record : null
  const showModal = editMode.kind === 'confirming' || editMode.kind === 'saving'
  const { changes } =
    showModal && record
      ? buildPatchPayload(selectedDate, record, form)
      : { changes: [] as FieldChange[] }

  return (
    <div className="corrections-layout">
      <div className="page-header">
        <h1>Data Corrections</h1>
        <p>Edit finalised daily climate records. All changes are audited.</p>
      </div>

      <div className="card corrections-date-row">
        <label htmlFor="corrections-date-input" className="corrections-date-label">
          Select date
        </label>
        <div className="corrections-date-controls">
          <input
            id="corrections-date-input"
            type="date"
            value={selectedDate}
            max={todayDateString()}
            onChange={(e) => {
              setSelectedDate(e.target.value)
              setRecordStatus({ kind: 'idle' })
              setEditMode({ kind: 'view' })
              setSaveError(null)
            }}
          />
          <button
            type="button"
            className="button"
            disabled={!selectedDate}
            onClick={() => { void loadRecord(selectedDate) }}
          >
            Load record
          </button>
        </div>
      </div>

      {recordStatus.kind === 'idle' && (
        <section className="state-card" aria-live="polite">
          <p>
            Select a date above and click <strong>Load record</strong> to view and
            edit the stored climate values.
          </p>
        </section>
      )}

      {recordStatus.kind === 'loading' && (
        <section className="card" aria-live="polite" aria-label="Loading record">
          <Skeleton lines={4} />
        </section>
      )}

      {recordStatus.kind === 'absent' && (
        <section className="state-card" role="status" aria-live="polite">
          <h2>No record for {recordStatus.date}</h2>
          <p>
            There is no stored daily record for this date. Missing dates cannot be
            created through this interface.
          </p>
        </section>
      )}

      {recordStatus.kind === 'error' && (
        <section className="state-card state-error" role="alert">
          <h2>Failed to load record</h2>
          <p>{recordStatus.message}</p>
          <button
            type="button"
            className="button"
            onClick={() => { void loadRecord(selectedDate) }}
          >
            Retry
          </button>
        </section>
      )}

      {record && (
        <>
          {editMode.kind === 'saved' && (
            <section className="state-card state-success" role="status" aria-live="polite">
              <h2>Correction saved</h2>
              <p>{editMode.message}</p>
              <p>
                Audit ID: <code>{editMode.auditId}</code>
              </p>
              <button
                type="button"
                className="button button-ghost"
                onClick={() => setEditMode({ kind: 'view' })}
              >
                Dismiss
              </button>
            </section>
          )}

          {editMode.kind === 'view' && (
            <section
              className="card corrections-record"
              onDoubleClick={enterEdit}
              aria-label={`Daily record for ${record.date}. Double-click or tap Edit to correct values.`}
            >
              <div className="corrections-record-header">
                <h2>Record for {record.date}</h2>
                <button
                  type="button"
                  className="button corrections-mobile-edit"
                  onClick={enterEdit}
                  aria-label="Edit this record"
                >
                  Edit
                </button>
              </div>

              <table>
                <tbody>
                  <tr>
                    <th scope="row">Max temperature</th>
                    <td>{formatTempC(record.max_temp_c)}</td>
                    <td className="corrections-source">{record.temperature_source ?? '—'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Min temperature</th>
                    <td>{formatTempC(record.min_temp_c)}</td>
                    <td className="corrections-source">{record.temperature_source ?? '—'}</td>
                  </tr>
                  <tr>
                    <th scope="row">Mean temperature</th>
                    <td>{formatTempC(record.mean_temp_c)}</td>
                    <td />
                  </tr>
                  <tr>
                    <th scope="row">Rainfall</th>
                    <td>{formatRainMm(record.rainfall_mm, record.date)}</td>
                    <td className="corrections-source">{record.rainfall_source ?? '—'}</td>
                  </tr>
                </tbody>
              </table>

              <p className="corrections-hint">
                <span className="corrections-desktop-hint">Double-click to edit</span>
                <span className="corrections-mobile-hint">Tap Edit to modify values</span>
              </p>
            </section>
          )}

          {(editMode.kind === 'editing' ||
            editMode.kind === 'confirming' ||
            editMode.kind === 'saving') && (
            <section className="card corrections-form" aria-label="Edit daily record">
              <h2>Edit record: {record.date}</h2>

              {saveError && (
                <div className="state-error corrections-save-error" role="alert">
                  <strong>Error: </strong>
                  {saveError}
                </div>
              )}

              <div className="corrections-fields">
                <div className="corrections-form-row">
                  <label htmlFor="corrections-max-temp">Max temperature (°C)</label>
                  <div className="corrections-input-group">
                    <input
                      id="corrections-max-temp"
                      type="number"
                      step="0.1"
                      value={form.maxTempCCleared ? '' : form.maxTempC}
                      disabled={form.maxTempCCleared}
                      placeholder={record.max_temp_c != null ? String(record.max_temp_c) : 'null'}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, maxTempC: e.target.value, maxTempCCleared: false }))
                      }
                    />
                    <button
                      type="button"
                      className="button button-ghost"
                      aria-pressed={form.maxTempCCleared}
                      onClick={() =>
                        setForm((f) => ({ ...f, maxTempCCleared: !f.maxTempCCleared, maxTempC: '' }))
                      }
                    >
                      {form.maxTempCCleared ? 'Cleared (null)' : 'Clear'}
                    </button>
                  </div>
                  {validationErrors.maxTempC && (
                    <p className="corrections-field-error" role="alert">
                      {validationErrors.maxTempC}
                    </p>
                  )}
                </div>

                <div className="corrections-form-row">
                  <label htmlFor="corrections-min-temp">Min temperature (°C)</label>
                  <div className="corrections-input-group">
                    <input
                      id="corrections-min-temp"
                      type="number"
                      step="0.1"
                      value={form.minTempCCleared ? '' : form.minTempC}
                      disabled={form.minTempCCleared}
                      placeholder={record.min_temp_c != null ? String(record.min_temp_c) : 'null'}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, minTempC: e.target.value, minTempCCleared: false }))
                      }
                    />
                    <button
                      type="button"
                      className="button button-ghost"
                      aria-pressed={form.minTempCCleared}
                      onClick={() =>
                        setForm((f) => ({ ...f, minTempCCleared: !f.minTempCCleared, minTempC: '' }))
                      }
                    >
                      {form.minTempCCleared ? 'Cleared (null)' : 'Clear'}
                    </button>
                  </div>
                  {validationErrors.minTempC && (
                    <p className="corrections-field-error" role="alert">
                      {validationErrors.minTempC}
                    </p>
                  )}
                </div>

                <div className="corrections-form-row">
                  <label htmlFor="corrections-rainfall">Rainfall (mm)</label>
                  <div className="corrections-input-group">
                    <input
                      id="corrections-rainfall"
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.rainfallMmCleared ? '' : form.rainfallMm}
                      disabled={form.rainfallMmCleared || selectedDate < RAINFALL_START_DATE}
                      placeholder={
                        record.rainfall_mm != null
                          ? String(record.rainfall_mm)
                          : selectedDate < RAINFALL_START_DATE
                            ? 'Unavailable'
                            : 'null'
                      }
                      onChange={(e) =>
                        setForm((f) => ({
                          ...f,
                          rainfallMm: e.target.value,
                          rainfallMmCleared: false,
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="button button-ghost"
                      disabled={selectedDate < RAINFALL_START_DATE}
                      aria-pressed={form.rainfallMmCleared}
                      onClick={() =>
                        setForm((f) => ({
                          ...f,
                          rainfallMmCleared: !f.rainfallMmCleared,
                          rainfallMm: '',
                        }))
                      }
                    >
                      {form.rainfallMmCleared ? 'Cleared (null)' : 'Clear'}
                    </button>
                  </div>
                  {selectedDate < RAINFALL_START_DATE && (
                    <p className="corrections-field-note">
                      Rainfall before 2020-05-01 must remain null.
                    </p>
                  )}
                  {validationErrors.rainfallMm && (
                    <p className="corrections-field-error" role="alert">
                      {validationErrors.rainfallMm}
                    </p>
                  )}
                </div>
              </div>

              <MeanPreview form={form} record={record} />

              {validationErrors.minExceedsMax && (
                <p className="corrections-validation-warning" role="alert">
                  {'\u26a0'} {validationErrors.minExceedsMax}
                </p>
              )}

              <div className="corrections-form-row">
                <label htmlFor="corrections-reason">
                  Correction reason{' '}
                  <span className="corrections-field-note">(required, 3{'\u2013'}500 characters)</span>
                </label>
                <textarea
                  id="corrections-reason"
                  rows={3}
                  value={form.reason}
                  maxLength={500}
                  placeholder="Describe why this correction is needed"
                  aria-required="true"
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                />
                {validationErrors.reason && (
                  <p className="corrections-field-error" role="alert">
                    {validationErrors.reason}
                  </p>
                )}
              </div>

              <div className="corrections-action-row">
                <button type="button" className="button button-ghost" onClick={cancelEdit}>
                  Cancel
                </button>
                <button type="button" className="button" onClick={handleReviewChanges}>
                  Review changes
                </button>
              </div>
            </section>
          )}

          <Modal
            title="Confirm data correction"
            open={showModal}
            onClose={() => {
              if (editMode.kind !== 'saving') setEditMode({ kind: 'editing' })
            }}
          >
            <div className="corrections-before-after">
              <table>
                <thead>
                  <tr>
                    <th>Field</th>
                    <th>Before</th>
                    <th>After</th>
                  </tr>
                </thead>
                <tbody>
                  {changes.map((c) => (
                    <tr key={c.label} className={c.changed ? 'corrections-changed-row' : ''}>
                      <td>{c.label}</td>
                      <td>{c.before != null ? `${c.before}${c.unit}` : '—'}</td>
                      <td>
                        {c.after != null ? `${c.after}${c.unit}` : '—'}
                        {!c.changed && (
                          <span className="corrections-unchanged"> (unchanged)</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="corrections-reason-preview">
                <strong>Reason: </strong>
                {form.reason}
              </p>
            </div>

            <div className="corrections-action-row">
              <button
                type="button"
                className="button button-ghost"
                disabled={editMode.kind === 'saving'}
                onClick={() => setEditMode({ kind: 'editing' })}
              >
                Back
              </button>
              <button
                type="button"
                className="button"
                disabled={editMode.kind === 'saving'}
                aria-busy={editMode.kind === 'saving'}
                onClick={() => { void handleConfirmSave() }}
              >
                {editMode.kind === 'saving' ? 'Saving\u2026' : 'Confirm save'}
              </button>
            </div>
          </Modal>
        </>
      )}
    </div>
  )
}

// ── Page entry point ──────────────────────────────────────────────────────────

export default function DataCorrectionsPage() {
  const { permissionState } = useAdminAuth()

  if (permissionState !== 'authorised') {
    return (
      <div className="corrections-layout">
        <div className="page-header">
          <h1>Data Corrections</h1>
          <p>Correction workflow for authenticated administrators.</p>
        </div>
        <PermissionOverlay permissionState={permissionState} />
      </div>
    )
  }

  return <CorrectionEditor />
}
