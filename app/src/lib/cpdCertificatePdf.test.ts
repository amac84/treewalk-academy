import { describe, expect, it } from 'vitest'

import {
  buildCpdCompletionCertificatePdfBlob,
  cpdCompletionCertificateFilename,
} from './cpdCertificatePdf'

const sample = {
  recipientName: 'Alex Example',
  providerName: 'Treewalk Consulting Inc.',
  courseTitle: 'Memo Writing',
  cpdHours: 0.5,
  completionDateIso: '2026-04-13T12:00:00.000Z',
  issuedAtIso: '2026-04-13T12:00:00.000Z',
  passThreshold: 70,
  verificationCode: 'TW-1TPU6D60',
  certificateId: 'cert-abc',
}

describe('cpdCertificatePdf', () => {
  it('buildCpdCompletionCertificatePdfBlob returns a non-trivial PDF blob', () => {
    const blob = buildCpdCompletionCertificatePdfBlob(sample)
    expect(blob.type).toBe('application/pdf')
    expect(blob.size).toBeGreaterThan(900)
  })

  it('cpdCompletionCertificateFilename is stable and filesystem-safe', () => {
    expect(cpdCompletionCertificateFilename('Memo Writing', '2026-04-13T00:00:00.000Z')).toBe(
      'treewalk-cpd-certificate-memo-writing-20260413.pdf',
    )
  })
})
