// Laporan keuangan periode, disusun agar mudah dibaca jamaah:
//   1. Ringkasan posisi kas per buku + total (angka terpenting di atas).
//   2. Rincian per buku dengan alur yang sama: saldo awal → pemasukan →
//      pengeluaran → saldo akhir.
// Selalu berlatar putih (seperti kertas) agar hasil cetak/PDF sama dengan layar.

import type { LedgerEntry, MasjidSettings, PeriodBook, PeriodReport } from "@/lib/types"

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]
const BULAN_PENDEK = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number)
  return [y, m, d]
}

/** "2026-11-06" -> "6 November 2026" */
function tglPanjang(date: string): string {
  const [y, m, d] = parts(date)
  return `${d} ${BULAN[m - 1]} ${y}`
}

/** "2026-10-30" -> "30 Okt" */
function tglPendek(date: string): string {
  const [, m, d] = parts(date)
  return `${d} ${BULAN_PENDEK[m - 1]}`
}

/** "30 Oktober – 6 November 2026" (tahun awal ditulis bila beda tahun). */
function periodeLabel(from: string, to: string): string {
  const [fy, fm, fd] = parts(from)
  const [ty] = parts(to)
  return `${fd} ${BULAN[fm - 1]}${fy !== ty ? ` ${fy}` : ""} – ${tglPanjang(to)}`
}

/** 1948700 -> "1.948.700" */
function angka(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n || 0)
}

/** Buku tanpa saldo dan tanpa transaksi tidak perlu ditampilkan. */
function isEmpty(b: PeriodBook): boolean {
  return b.totals.opening === 0 && b.incomes.length === 0 && b.expenses.length === 0
}

export default function PeriodReportSheet({
  report,
  masjid,
}: {
  report: PeriodReport
  masjid: MasjidSettings | null
}) {
  const books = report.books.filter((b) => !isEmpty(b))

  return (
    <div
      id="period-print"
      className="mx-auto max-w-[760px] bg-white px-4 py-6 font-sans text-[13px] leading-relaxed text-neutral-900 sm:px-8 sm:py-8 sm:text-sm"
    >
      {/* Kop */}
      <header className="border-b-2 border-neutral-900 pb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500">
          Laporan Keuangan
        </p>
        {masjid?.name && <h2 className="mt-1 text-lg font-bold sm:text-xl">Takmir {masjid.name}</h2>}
        {masjid?.address && <p className="text-xs text-neutral-500">{masjid.address}</p>}
        <p className="mt-2 inline-block rounded-full bg-neutral-100 px-3 py-0.5 text-xs font-medium sm:text-sm">
          Periode {periodeLabel(report.from, report.to)}
        </p>
      </header>

      {books.length === 0 && (
        <p className="py-10 text-center text-neutral-500">Belum ada data pada periode ini.</p>
      )}

      {books.length > 0 && (
        <>
          {/* Ringkasan posisi kas */}
          <section className="mt-6 break-inside-avoid">
            <h3 className="mb-2 font-bold">Posisi Kas per {tglPanjang(report.to)}</h3>
            <div className="overflow-hidden rounded-lg border border-neutral-300">
              {books.map((b) => (
                <div
                  key={b.book_id}
                  className="flex items-baseline justify-between gap-3 border-b border-neutral-200 px-3 py-1.5 last:border-b-0"
                >
                  <span>{b.name}</span>
                  <span className="shrink-0 tabular-nums">{angka(b.totals.closing)}</span>
                </div>
              ))}
              <div className="flex items-baseline justify-between gap-3 bg-emerald-700 px-3 py-2 font-bold text-white">
                <span>Total Kas</span>
                <span className="shrink-0 text-base tabular-nums sm:text-lg">
                  Rp {angka(report.totals.closing)}
                </span>
              </div>
            </div>
          </section>

          {/* Rincian per buku (saat cetak: 2 kolom, lihat .print-layout di index.css) */}
          <div className="period-books">
            {books.map((b) => (
              <BookSection key={b.book_id} book={b} from={report.from} to={report.to} />
            ))}
          </div>
        </>
      )}

      <footer className="mt-8 border-t border-neutral-300 pt-3 text-center text-xs text-neutral-500">
        Semua angka dalam Rupiah.
        {masjid?.report_footer && <p className="mt-1">{masjid.report_footer}</p>}
      </footer>
    </div>
  )
}

function BookSection({ book, from, to }: { book: PeriodBook; from: string; to: string }) {
  const quiet = book.incomes.length === 0 && book.expenses.length === 0
  return (
    <section className="mt-7 break-inside-avoid">
      <h3 className="mb-2 border-l-4 border-emerald-700 pl-2 text-[15px] font-bold sm:text-base">
        {book.name}
      </h3>

      <div className="rounded-lg border border-neutral-300">
        <Line label={`Saldo awal (${tglPanjang(from)})`} amount={book.totals.opening} />

        {quiet && (
          <p className="border-t border-neutral-200 px-3 py-1.5 italic text-neutral-500">
            Tidak ada transaksi pada periode ini.
          </p>
        )}

        {book.incomes.length > 0 && (
          <Group
            title="Pemasukan"
            tone="in"
            rows={book.incomes}
            total={book.totals.income}
            pick={(r) => r.income}
          />
        )}
        {book.expenses.length > 0 && (
          <Group
            title="Pengeluaran"
            tone="out"
            rows={book.expenses}
            total={book.totals.expense}
            pick={(r) => r.expense}
          />
        )}

        <div className="period-closing flex items-baseline justify-between gap-3 rounded-b-lg border-t-2 border-neutral-900 bg-emerald-50 px-3 py-2 font-bold">
          <span>Saldo akhir ({tglPanjang(to)})</span>
          <span className="shrink-0 tabular-nums">{angka(book.totals.closing)}</span>
        </div>
      </div>
    </section>
  )
}

function Group({
  title,
  tone,
  rows,
  total,
  pick,
}: {
  title: string
  tone: "in" | "out"
  rows: LedgerEntry[]
  total: number
  pick: (r: LedgerEntry) => number
}) {
  const color = tone === "in" ? "text-emerald-700" : "text-rose-700"
  const sign = tone === "in" ? "+" : "−"
  return (
    <div className="border-t border-neutral-200">
      <p className={`px-3 pt-2 text-xs font-bold uppercase tracking-wider ${color}`}>{title}</p>
      <div className="px-3 pb-1">
        {rows.map((r) => (
          <div key={r.id} className="grid grid-cols-[3.25rem_1fr_auto] items-baseline gap-x-2 py-1">
            <span className="text-xs tabular-nums text-neutral-500">{tglPendek(r.date)}</span>
            <span className="min-w-0">
              {r.description || r.category || "—"}
              {r.partner_name && <span className="text-neutral-500"> · {r.partner_name}</span>}
            </span>
            <span className="tabular-nums">{angka(pick(r))}</span>
          </div>
        ))}
      </div>
      <div className={`flex items-baseline justify-between gap-3 border-t border-dashed border-neutral-300 px-3 py-1.5 font-semibold ${color}`}>
        <span>Total {title.toLowerCase()}</span>
        <span className="shrink-0 tabular-nums">
          {sign} {angka(total)}
        </span>
      </div>
    </div>
  )
}

function Line({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-3 py-1.5">
      <span>{label}</span>
      <span className="shrink-0 tabular-nums">{angka(amount)}</span>
    </div>
  )
}
