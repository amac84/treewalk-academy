import { jsPDF } from 'jspdf'

export type CpdCompletionCertificateInput = {
  recipientName: string
  providerName: string
  courseTitle: string
  cpdHours: number
  completionDateIso: string
  issuedAtIso: string
  passThreshold: number
  verificationCode: string
  certificateId: string
  awardMethod?: 'quiz_completion' | 'live_attendance'
}

function formatLongDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-CA', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  } catch {
    return iso
  }
}

function slugFilePart(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'course'
  )
}

export function cpdCompletionCertificateFilename(
  courseTitle: string,
  completionDateIso: string,
): string {
  const course = slugFilePart(courseTitle)
  const day = completionDateIso.slice(0, 10).replace(/-/g, '')
  return `treewalk-cpd-certificate-${course}-${day}.pdf`
}

/**
 * Generates a letter-size PDF suitable as third-party CPD completion evidence
 * (activity description, provider, learner, dates, hours, verification id).
 */
export function buildCpdCompletionCertificatePdfBlob(input: CpdCompletionCertificateInput): Blob {
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()

  doc.setFillColor(252, 248, 240)
  doc.rect(0, 0, pageW, pageH, 'F')

  doc.setDrawColor(62, 41, 28)
  doc.setLineWidth(0.6)
  doc.rect(11, 11, pageW - 22, pageH - 22, 'S')
  doc.setLineWidth(0.25)
  doc.rect(14, 14, pageW - 28, pageH - 28, 'S')

  const ink: [number, number, number] = [42, 30, 22]
  const muted: [number, number, number] = [95, 88, 78]
  const marginX = 28
  const contentW = pageW - marginX * 2

  doc.setTextColor(...ink)
  doc.setFont('times', 'normal')
  doc.setFontSize(8.5)
  doc.text('CONTINUING PROFESSIONAL DEVELOPMENT', pageW / 2, 30, { align: 'center' })

  doc.setFont('times', 'bold')
  doc.setFontSize(20)
  doc.text('Certificate of Completion', pageW / 2, 44, { align: 'center' })

  doc.setFont('times', 'italic')
  doc.setFontSize(10)
  doc.setTextColor(...muted)
  doc.text(input.providerName, pageW / 2, 52, { align: 'center' })

  doc.setTextColor(...ink)
  doc.setFont('times', 'normal')
  doc.setFontSize(11)
  const intro =
    input.awardMethod === 'live_attendance'
      ? 'This certificate confirms that the individual named below successfully completed the learning activity and ' +
        'met the published live attendance threshold.'
      : 'This certificate confirms that the individual named below successfully completed the learning activity and ' +
        'met the published pass threshold for the end-of-course knowledge assessment.'
  const introLines = doc.splitTextToSize(intro, contentW)
  doc.text(introLines, pageW / 2, 66, { align: 'center' })

  let y = 66 + introLines.length * 5.5 + 10
  doc.setFont('times', 'bold')
  doc.setFontSize(13)
  doc.text(input.recipientName, pageW / 2, y, { align: 'center' })

  y += 14
  doc.setFont('times', 'normal')
  doc.setFontSize(10.5)
  const rows: [string, string][] = [
    ['Learning activity', input.courseTitle],
    ['Date completed', formatLongDate(input.completionDateIso)],
    ['CPD hours', `${input.cpdHours.toFixed(2)}`],
    ['CPD provider', input.providerName],
    [
      input.awardMethod === 'live_attendance' ? 'Live attendance threshold' : 'Assessment pass threshold',
      `${input.passThreshold}%`,
    ],
    ['Verification reference', input.verificationCode],
    ['Certificate record ID', input.certificateId],
    ['Certificate issued', formatLongDate(input.issuedAtIso)],
  ]

  doc.setFont('times', 'bold')
  for (const [label, value] of rows) {
    doc.setFont('times', 'bold')
    doc.text(`${label}:`, marginX, y)
    doc.setFont('times', 'normal')
    const valueLines = doc.splitTextToSize(value, contentW - 52)
    doc.text(valueLines, marginX + 50, y)
    y += Math.max(6, valueLines.length * 5.2)
  }

  y += 6
  doc.setFontSize(8.5)
  doc.setTextColor(...muted)
  const foot =
    'Retain this document with your CPD records. Hours claimed should reflect your actual time spent, not exceeding ' +
    'the provider’s stated basis unless your provincial CPA body allows additional unverifiable time. ' +
    `${input.providerName} does not accredit courses on behalf of CPA provincial bodies.`
  const footLines = doc.splitTextToSize(foot, contentW)
  doc.text(footLines, marginX, Math.min(y, pageH - 22 - footLines.length * 4))

  return doc.output('blob')
}

export function downloadCpdCompletionCertificate(input: CpdCompletionCertificateInput): void {
  const blob = buildCpdCompletionCertificatePdfBlob(input)
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = cpdCompletionCertificateFilename(input.courseTitle, input.completionDateIso)
  anchor.rel = 'noopener'
  anchor.click()
  URL.revokeObjectURL(url)
}
