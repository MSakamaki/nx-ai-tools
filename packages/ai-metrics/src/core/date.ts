/** UTC-based so the same event resolves to the same day file regardless of the machine's local timezone. */
export function formatDateStamp(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateStampFromTimestamp(timestamp: string): string {
  return formatDateStamp(new Date(timestamp));
}
