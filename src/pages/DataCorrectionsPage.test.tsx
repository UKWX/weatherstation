import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DataCorrectionsPage, {
  buildPatchPayload,
  validateForm,
} from '@/pages/DataCorrectionsPage'
import type { AdminDailyRecord } from '@/types/admin'
import type { AdminPermissionState } from '@/types/admin'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockGetAdminDaily = vi.fn()
const mockPatchAdminDaily = vi.fn()

vi.mock('@/api/stationAdminApi', () => ({
  getAdminDaily: (...args: unknown[]) => mockGetAdminDaily(...args),
  patchAdminDaily: (...args: unknown[]) => mockPatchAdminDaily(...args),
  StationAdminError: class extends Error {
    status: number
    constructor(status: number, msg: string) {
      super(msg)
      this.status = status
    }
  },
}))

let mockPermissionState: AdminPermissionState = 'authorised'

vi.mock('@/features/adminAuth/useAdminAuth', () => ({
  useAdminAuth: () => ({ permissionState: mockPermissionState, session: null }),
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeRecord(overrides: Partial<AdminDailyRecord> = {}): AdminDailyRecord {
  return {
    date: '2026-07-29' as AdminDailyRecord['date'],
    year: 2026,
    month: 7,
    day: 29,
    max_temp_c: 26.3,
    min_temp_c: 17.5,
    mean_temp_c: 21.9,
    rainfall_mm: 0.0,
    temperature_source: 'automatic',
    rainfall_source: 'automatic',
    ...overrides,
  }
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function renderPage(queryClient?: QueryClient) {
  const qc = queryClient ?? makeQueryClient()
  return {
    qc,
    ...render(
      <QueryClientProvider client={qc}>
        <DataCorrectionsPage />
      </QueryClientProvider>,
    ),
  }
}

// Load a record by clicking "Load record"
async function loadRecord(record: AdminDailyRecord) {
  mockGetAdminDaily.mockResolvedValueOnce({ record })
  const btn = screen.getByRole('button', { name: /load record/i })
  fireEvent.click(btn)
  await waitFor(() => screen.getByText(`Record for ${record.date}`))
}

// Enter edit mode
async function enterEditMode(record: AdminDailyRecord) {
  await loadRecord(record)
  fireEvent.click(screen.getByRole('button', { name: /edit this record/i }))
}

// ── Permission state tests ─────────────────────────────────────────────────────

describe('DataCorrectionsPage – permission states', () => {
  afterEach(() => {
    mockPermissionState = 'authorised'
    vi.clearAllMocks()
  })

  it('shows skeleton while loading', () => {
    mockPermissionState = 'loading'
    renderPage()
    expect(screen.getByLabelText(/checking permissions/i)).toBeInTheDocument()
  })

  it('shows redirecting message when signed out', () => {
    mockPermissionState = 'signed-out'
    renderPage()
    expect(screen.getByText(/redirecting to login/i)).toBeInTheDocument()
  })

  it('shows access denied when unauthorised', () => {
    mockPermissionState = 'unauthorised'
    renderPage()
    expect(screen.getByText(/access denied/i)).toBeInTheDocument()
  })

  it('shows service unavailable message', () => {
    mockPermissionState = 'unavailable'
    renderPage()
    expect(
      screen.getByText(/authentication service unavailable/i),
    ).toBeInTheDocument()
  })
})

// ── Record loading ─────────────────────────────────────────────────────────────

describe('DataCorrectionsPage – record loading', () => {
  afterEach(() => {
    mockPermissionState = 'authorised'
    vi.clearAllMocks()
  })

  it('shows idle prompt by default', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /load record/i })).toBeInTheDocument()
    expect(screen.getByText(/select a date above/i)).toBeInTheDocument()
  })

  it('loads and displays a record', async () => {
    renderPage()
    const record = makeRecord()
    await loadRecord(record)

    expect(screen.getByText('26.3 °C')).toBeInTheDocument()
    expect(screen.getByText('17.5 °C')).toBeInTheDocument()
    expect(screen.getByText('0.0 mm')).toBeInTheDocument()
  })

  it('shows absent-record state on 404', async () => {
    renderPage()
    const err = Object.assign(new Error('Not found'), { status: 404 })
    mockGetAdminDaily.mockRejectedValueOnce(err)

    fireEvent.click(screen.getByRole('button', { name: /load record/i }))
    await waitFor(() => screen.getByText(/no record for/i))
  })
})

// ── Edit mode ─────────────────────────────────────────────────────────────────

describe('DataCorrectionsPage – edit mode', () => {
  afterEach(() => {
    mockPermissionState = 'authorised'
    vi.clearAllMocks()
  })

  it('enters edit mode on Edit button click', async () => {
    renderPage()
    await enterEditMode(makeRecord())

    expect(screen.getByLabelText(/max temperature/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/min temperature/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/rainfall/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/correction reason/i)).toBeInTheDocument()
  })

  it('shows validation error when reason is too short', async () => {
    renderPage()
    await enterEditMode(makeRecord())

    // Change a value so the form is dirty
    const maxInput = screen.getByLabelText(/max temperature/i)
    fireEvent.change(maxInput, { target: { value: '27.0' } })

    // Enter a short reason
    const reasonInput = screen.getByLabelText(/correction reason/i)
    fireEvent.change(reasonInput, { target: { value: 'ab' } })

    fireEvent.click(screen.getByRole('button', { name: /review changes/i }))

    await waitFor(() =>
      expect(screen.getByText(/reason must be at least 3 characters/i)).toBeInTheDocument(),
    )
  })

  it('warns when min exceeds max', async () => {
    renderPage()
    await enterEditMode(makeRecord())

    const maxInput = screen.getByLabelText(/max temperature/i)
    const minInput = screen.getByLabelText(/min temperature/i)
    fireEvent.change(maxInput, { target: { value: '10' } })
    fireEvent.change(minInput, { target: { value: '20' } })

    const reasonInput = screen.getByLabelText(/correction reason/i)
    fireEvent.change(reasonInput, { target: { value: 'Fixing inverted values in records' } })

    fireEvent.click(screen.getByRole('button', { name: /review changes/i }))

    await waitFor(() =>
      expect(screen.getByText(/minimum.*exceeds maximum/i)).toBeInTheDocument(),
    )
  })
})

// ── PATCH payload construction ────────────────────────────────────────────────

describe('buildPatchPayload', () => {
  const record = makeRecord()
  const baseForm = {
    maxTempC: '',
    maxTempCCleared: false,
    minTempC: '',
    minTempCCleared: false,
    rainfallMm: '',
    rainfallMmCleared: false,
    reason: 'Test reason',
  }

  it('returns null payload when no fields are changed', () => {
    const { payload } = buildPatchPayload(record.date, record, baseForm)
    expect(payload).toBeNull()
  })

  it('only includes changed fields in the PATCH (partial patch)', () => {
    const form = { ...baseForm, maxTempC: '27.0' }
    const { payload } = buildPatchPayload(record.date, record, form)

    expect(payload).not.toBeNull()
    expect(payload?.max_temp_c).toBe(27.0)
    expect(payload).not.toHaveProperty('min_temp_c')
    expect(payload).not.toHaveProperty('rainfall_mm')
    expect(payload?.reason).toBe('Test reason')
  })

  it('sends null for an explicitly cleared field', () => {
    const form = { ...baseForm, maxTempCCleared: true }
    const { payload } = buildPatchPayload(record.date, record, form)

    expect(payload?.max_temp_c).toBeNull()
  })

  it('omits a field that is unchanged even when it matches the original', () => {
    const form = { ...baseForm, maxTempC: String(record.max_temp_c) }
    const { payload } = buildPatchPayload(record.date, record, form)
    // Same value — payload should be null
    expect(payload).toBeNull()
  })

  it('treats blank input as unchanged, not zero', () => {
    const nullRecord = makeRecord({ rainfall_mm: null })
    const form = { ...baseForm, rainfallMm: '' }
    const { payload } = buildPatchPayload(nullRecord.date, nullRecord, form)
    // Blank = no change; no rainfall field in payload
    expect(payload).toBeNull()
  })
})

// ── Validation rules ───────────────────────────────────────────────────────────

describe('validateForm', () => {
  const record = makeRecord()
  const validForm = {
    maxTempC: '',
    maxTempCCleared: false,
    minTempC: '',
    minTempCCleared: false,
    rainfallMm: '',
    rainfallMmCleared: false,
    reason: 'A valid reason for the correction',
  }

  it('passes with no changes and valid reason', () => {
    const errors = validateForm(record.date, validForm, record)
    expect(Object.keys(errors)).toHaveLength(0)
  })

  it('accepts negative temperatures', () => {
    const form = { ...validForm, minTempC: '-5.0' }
    const errors = validateForm(record.date, form, record)
    expect(errors.minTempC).toBeUndefined()
  })

  it('rejects negative rainfall', () => {
    const form = { ...validForm, rainfallMm: '-1.0' }
    const errors = validateForm(record.date, form, record)
    expect(errors.rainfallMm).toMatch(/cannot be negative/i)
  })

  it('rejects rainfall changes before 2020-05-01', () => {
    const form = { ...validForm, rainfallMm: '5.0' }
    const errors = validateForm('2019-12-01', form, record)
    expect(errors.rainfallMm).toMatch(/2020-05-01/i)
  })

  it('rejects reason shorter than 3 characters', () => {
    const form = { ...validForm, reason: 'ab' }
    const errors = validateForm(record.date, form, record)
    expect(errors.reason).toMatch(/at least 3/i)
  })

  it('rejects reason longer than 500 characters', () => {
    const form = { ...validForm, reason: 'x'.repeat(501) }
    const errors = validateForm(record.date, form, record)
    expect(errors.reason).toMatch(/500/i)
  })

  it('warns when min exceeds max', () => {
    const form = { ...validForm, maxTempC: '10', minTempC: '20' }
    const errors = validateForm(record.date, form, record)
    expect(errors.minExceedsMax).toMatch(/exceeds maximum/i)
  })
})

// ── PATCH save and query invalidation ─────────────────────────────────────────

describe('DataCorrectionsPage – save and invalidation', () => {
  afterEach(() => {
    mockPermissionState = 'authorised'
    vi.clearAllMocks()
  })

  it('invalidates affected public annual queries after successful save', async () => {
    const qc = makeQueryClient()
    vi.spyOn(qc, 'invalidateQueries')

    renderPage(qc)
    const record = makeRecord()
    await enterEditMode(record)

    // Change max temp
    const maxInput = screen.getByLabelText(/max temperature/i)
    fireEvent.change(maxInput, { target: { value: '27.5' } })

    const reasonInput = screen.getByLabelText(/correction reason/i)
    fireEvent.change(reasonInput, {
      target: { value: 'Corrected from verified station logbook entry' },
    })

    fireEvent.click(screen.getByRole('button', { name: /review changes/i }))
    await waitFor(() => screen.getByRole('dialog'))

    const updatedRecord = makeRecord({ max_temp_c: 27.5, mean_temp_c: 22.5 })
    mockPatchAdminDaily.mockResolvedValueOnce({
      status: 'ok',
      record: updatedRecord,
      audit_id: 'audit-123',
      backup: 'backup-file',
      message: 'Record updated successfully',
    })

    fireEvent.click(screen.getByRole('button', { name: /confirm save/i }))

    await waitFor(() => screen.getByText(/correction saved/i))
    expect(screen.getByText('audit-123')).toBeInTheDocument()
    expect(qc.invalidateQueries).toHaveBeenCalled()
  })

  it('shows backend error message on failed save', async () => {
    renderPage()
    const record = makeRecord()
    await enterEditMode(record)

    const maxInput = screen.getByLabelText(/max temperature/i)
    fireEvent.change(maxInput, { target: { value: '27.5' } })

    const reasonInput = screen.getByLabelText(/correction reason/i)
    fireEvent.change(reasonInput, {
      target: { value: 'Corrected from verified station logbook entry' },
    })

    fireEvent.click(screen.getByRole('button', { name: /review changes/i }))
    await waitFor(() => screen.getByRole('dialog'))

    const err = Object.assign(new Error('Conflict detected'), { status: 409 })
    mockPatchAdminDaily.mockRejectedValueOnce(err)

    fireEvent.click(screen.getByRole('button', { name: /confirm save/i }))

    await waitFor(() =>
      expect(screen.getByText(/conflict/i)).toBeInTheDocument(),
    )
  })
})
