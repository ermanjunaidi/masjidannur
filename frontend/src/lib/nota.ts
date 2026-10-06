// Nota (kuitansi teks) untuk laporan kas, diformat untuk WhatsApp.
// WhatsApp mendukung *bold* pada pesan teks biasa, jadi judul dibungkus
// tanda bintang. Share membuka https://wa.me/?text=… yang bekerja di
// mobile (aplikasi WhatsApp) maupun desktop (WhatsApp Web/Desktop).

import type {
  MasjidSettings,
  MonthlyReport,
  CategoryReportResponse,
  CategoryReportRow,
  WeeklyReport,
  ReportTotals,
  Transaction,
} from "./types"
import { formatRupiah, nomorNota } from "./types"

// ─── Share ke WhatsApp ────────────────────────────────────────────────────────

export function shareWhatsApp(text: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer")
}

// ─── Helper teks ──────────────────────────────────────────────────────────────

const MONTHS_LONG = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]
const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
]

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function parseISO(date: string): Date {
  // Tanpa argumen zona agar "2026-10-02" tidak bergeser ke hari sebelumnya.
  const [y, m, d] = date.split("-").map(Number)
  return new Date(y, (m || 1) - 1, d || 1)
}

/** "2026-10-02" -> "02 Okt 2026" (atau "02 Okt" bila withYear = false). */
function formatTanggalID(date: string, withYear = true): string {
  const d = parseISO(date)
  const base = `${pad(d.getDate())} ${MONTHS_SHORT[d.getMonth()]}`
  return withYear ? `${base} ${d.getFullYear()}` : base
}

/** "2026-10" -> "Oktober 2026". */
function formatBulanID(month: string): string {
  const [y, m] = month.split("-").map(Number)
  return `${MONTHS_LONG[(m || 1) - 1]} ${y}`
}

function formatWaktuCetak(d: Date): string {
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}.${pad(d.getMinutes())}`
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

const SEP = "────────────────"

// ─── Bagian nota yang dipakai bersama ─────────────────────────────────────────

interface NotaContext {
  masjid?: MasjidSettings | null
  bookName?: string
}

/** Kop nota: nama masjid + alamat (dipakai semua jenis nota). */
function notaKop(ctx: NotaContext): string[] {
  const lines: string[] = []
  if (ctx.masjid?.name) lines.push(`*${ctx.masjid.name}*`)
  const addr = [ctx.masjid?.address, ctx.masjid?.city_name].filter(Boolean).join(", ")
  if (addr) lines.push(addr)
  lines.push(SEP)
  return lines
}

function notaHeader(ctx: NotaContext, title: string, period: string): string[] {
  const lines = notaKop(ctx)
  lines.push(`*${title}*`, `Periode: ${period}`)
  if (ctx.bookName) lines.push(`Buku Kas: ${ctx.bookName}`)
  lines.push(SEP)
  return lines
}

function notaRekap(t: ReportTotals): string[] {
  const lines = [SEP, "*REKAP*"]
  if (t.start_cash) lines.push(`Saldo Awal: ${formatRupiah(t.start_cash)}`)
  lines.push(
    `Total Masuk: ${formatRupiah(t.income)}`,
    `Total Keluar: ${formatRupiah(t.expense)}`,
    `*Saldo Akhir: ${formatRupiah(t.end_cash || t.net)}*`,
  )
  return lines
}

function notaFooter(masjid?: MasjidSettings | null): string[] {
  const lines = [`Dicetak: ${formatWaktuCetak(new Date())}`]
  if (masjid?.report_footer) lines.push(masjid.report_footer)
  return lines
}

// ─── Nota Transaksi (kuitansi per item) ───────────────────────────────────

export function buildTransactionNota(
  opts: NotaContext & { tx: Transaction },
): string {
  const { tx } = opts
  const isIn = tx.type === "pemasukan"

  const lines = notaKop(opts)
  lines.push(`*NOTA ${isIn ? "PEMASUKAN" : "PENGELUARAN"}*`)
  lines.push(`No. Bukti: ${nomorNota(tx)}`)
  lines.push(SEP)
  lines.push(`Tanggal: ${formatTanggalID(tx.date)}`)
  if (tx.category?.name) lines.push(`Kategori: ${tx.category.name}`)
  if (opts.bookName) lines.push(`Buku Kas: ${opts.bookName}`)
  if (tx.description) lines.push(`Keterangan: ${truncate(tx.description, 80)}`)
  if (tx.partner_name) {
    lines.push(
      isIn ? `Terima dari: ${tx.partner_name}` : `Dibayarkan ke: ${tx.partner_name}`,
    )
  }
  lines.push(
    SEP,
    `*${isIn ? "Jumlah Terima" : "Jumlah Bayar"}: ${formatRupiah(tx.amount)}*`,
    ...notaFooter(opts.masjid),
  )
  return lines.join("\n")
}

// ─── Nota Laporan Bulanan ─────────────────────────────────────────────────────

export function buildMonthlyNota(
  opts: NotaContext & { report: MonthlyReport },
): string {
  const { report } = opts
  const lines = notaHeader(opts, "NOTA LAPORAN KAS BULANAN", formatBulanID(report.month))

  report.rows.forEach((r, i) => {
    const partner = [r.partner_name, r.ref_no ? `#${r.ref_no}` : ""].filter(Boolean).join(" · ")
    lines.push(
      `${i + 1}. ${formatTanggalID(r.date, false)} · ${truncate(r.description || "—", 48)}` +
        (partner ? ` — ${truncate(partner, 32)}` : ""),
    )
    lines.push(`   ${r.income ? "Masuk" : "Keluar"}: ${formatRupiah(r.income || r.expense)} · ${r.category}`)
  })

  lines.push(...notaRekap(report.totals), ...notaFooter(opts.masjid))
  return lines.join("\n")
}

// ─── Nota Laporan per Kategori ────────────────────────────────────────────────

export function buildCategoryNota(
  opts: NotaContext & { report: CategoryReportResponse; from: string; to: string },
): string {
  const { report } = opts
  const lines = notaHeader(
    opts,
    "NOTA LAPORAN KAS PER KATEGORI",
    `${formatTanggalID(opts.from)} – ${formatTanggalID(opts.to)}`,
  )

  // Kelompokkan baris berurutan dengan group yang sama (urutan sudah dari API).
  const groups: { name: string; rows: CategoryReportRow[] }[] = []
  for (const r of report.rows) {
    const last = groups[groups.length - 1]
    if (last && last.name === r.group) last.rows.push(r)
    else groups.push({ name: r.group, rows: [r] })
  }

  let no = 0
  for (const g of groups) {
    lines.push(`*${g.name.toUpperCase()}*`)
    for (const r of g.rows) {
      no += 1
      const amounts = [
        r.income ? `Masuk: ${formatRupiah(r.income)}` : "",
        r.expense ? `Keluar: ${formatRupiah(r.expense)}` : "",
      ].filter(Boolean)
      lines.push(`${no}. ${r.name || "—"} (${r.count} trx)`)
      lines.push(`   ${amounts.join(" · ")}`)
    }
  }

  lines.push(...notaRekap(report.totals), ...notaFooter(opts.masjid))
  return lines.join("\n")
}

// ─── Nota Laporan Mingguan ────────────────────────────────────────────────────

export function buildWeeklyNota(
  opts: NotaContext & { report: WeeklyReport },
): string {
  const { report } = opts
  const lines = notaHeader(
    opts,
    "NOTA LAPORAN KAS MINGGUAN",
    `${formatTanggalID(report.from)} – ${formatTanggalID(report.to)}`,
  )

  report.weeks.forEach((w, i) => {
    lines.push(
      `*Pekan ${i + 1}* · ${formatTanggalID(w.start, false)} – ${formatTanggalID(w.end, false)}`,
      `  Masuk: ${formatRupiah(w.income)}`,
      `  Keluar: ${formatRupiah(w.expense)}`,
      `  Selisih: ${formatRupiah(w.net)}`,
    )
  })

  lines.push(...notaRekap(report.totals), ...notaFooter(opts.masjid))
  return lines.join("\n")
}
