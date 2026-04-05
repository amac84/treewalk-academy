import { CPD_QUARTER_HOUR_INCREMENT } from '../constants'

export const calculateCPDHours = (videoMinutes: number): number => {
  if (!Number.isFinite(videoMinutes) || videoMinutes <= 0) {
    return 0
  }

  const rawHours = videoMinutes / 60
  const quarterUnits = Math.round(rawHours / CPD_QUARTER_HOUR_INCREMENT)

  return quarterUnits * CPD_QUARTER_HOUR_INCREMENT
}

export const calculateCpdHours = calculateCPDHours

export function formatCpdHours(hours: number): string {
  return `${hours.toFixed(2)} CPD hours`
}
