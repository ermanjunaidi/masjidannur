// Standard astronomical prayer time calculator for Indonesia (Kemenag parameters).
// No external dependencies.

export interface PrayerTime {
  name: string
  label: string
  time: string // HH:mm
  isNext: boolean
  isPassed: boolean
}

export function getHijriDate(date: Date = new Date()): string {
  try {
    // Native Intl API with Islamic calendar
    const formatter = new Intl.DateTimeFormat("id-ID-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })
    return formatter.format(date)
  } catch {
    return "1448 H"
  }
}

// Prayer times calculation based on latitude, longitude, and date
export function calculatePrayerTimes(
  date: Date = new Date(),
  lat: number = -6.2, // Jakarta default
  lng: number = 106.816666,
  timezoneOffset: number = 7, // WIB UTC+7
): Record<string, string> {
  const year = date.getFullYear()
  const month = date.getMonth() + 1
  const day = date.getDate()

  // Julian Day
  const a = Math.floor((14 - month) / 12)
  const y = year + 4800 - a
  const m = month + 12 * a - 3
  const jd =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045

  const d = jd - 2451545.0

  // Sun coordinates
  const g = (357.529 + 0.98560028 * d) % 360
  const q = (280.459 + 0.98564736 * d) % 360
  const L = (q + 1.915 * sinD(g) + 0.02 * sinD(2 * g)) % 360
  const e = 23.439 - 0.00000036 * d
  const RA = (atan2D(cosD(e) * sinD(L), cosD(L)) / 15 + 24) % 24

  // Equation of Time (in hours)
  const EqT = q / 15 - RA
  // Solar Declination
  const decl = asinD(sinD(e) * sinD(L))

  // Solar Noon (Dzuhur) in local time
  const noon = (12 + timezoneOffset - lng / 15 - EqT + 24) % 24

  // Calculate prayer angles
  const fajrAngle = 20.0 // Kemenag standard
  const ishaAngle = 18.0 // Kemenag standard

  // Helper to compute time difference for given sun altitude angle
  const hourAngle = (angle: number): number => {
    const cosHA =
      (sinD(-angle) - sinD(lat) * sinD(decl)) / (cosD(lat) * cosD(decl))
    if (cosHA > 1 || cosHA < -1) return 0
    return acosD(cosHA) / 15
  }

  // Sunrise/Sunset (approx 0.833 deg below horizon for atmospheric refraction)
  const sunRiseSetHA = hourAngle(0.833)
  const sunrise = noon - sunRiseSetHA
  const sunset = noon + sunRiseSetHA

  // Fajr (Subuh)
  const fajrHA = hourAngle(fajrAngle)
  const fajr = noon - fajrHA

  // Isha (Isya)
  const ishaHA = hourAngle(ishaAngle)
  const isha = noon + ishaHA

  // Asr (Ashar) - Shafi'i: shadow length = object + noon shadow
  const noonAltitude = 90 - Math.abs(lat - decl)
  const noonShadow = 1 / tanD(noonAltitude)
  const asrAltitude = atanD(1 / (1 + noonShadow))
  const asrHA =
    acosD(
      (sinD(asrAltitude) - sinD(lat) * sinD(decl)) / (cosD(lat) * cosD(decl)),
    ) / 15
  const asr = noon + asrHA

  // Imsak = 10 minutes before Fajr
  const imsak = fajr - 10 / 60
  // Dhuhr ihtiyat = +2 mins
  const dhuhr = noon + 2 / 60
  // Maghrib ihtiyat = +2 mins
  const maghrib = sunset + 2 / 60

  return {
    imsak: formatHour(imsak),
    subuh: formatHour(fajr + 2 / 60),
    terbit: formatHour(sunrise),
    dzuhur: formatHour(dhuhr),
    ashar: formatHour(asr + 2 / 60),
    maghrib: formatHour(maghrib),
    isya: formatHour(isha + 2 / 60),
  }
}

function formatHour(val: number): string {
  const normalized = (val + 24) % 24
  const hours = Math.floor(normalized)
  const minutes = Math.floor((normalized - hours) * 60)
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function sinD(d: number): number {
  return Math.sin((d * Math.PI) / 180)
}
function cosD(d: number): number {
  return Math.cos((d * Math.PI) / 180)
}
function tanD(d: number): number {
  return Math.tan((d * Math.PI) / 180)
}
function asinD(x: number): number {
  return (Math.asin(x) * 180) / Math.PI
}
function acosD(x: number): number {
  return (Math.acos(Math.max(-1, Math.min(1, x))) * 180) / Math.PI
}
function atanD(x: number): number {
  return (Math.atan(x) * 180) / Math.PI
}
function atan2D(y: number, x: number): number {
  return (Math.atan2(y, x) * 180) / Math.PI
}
