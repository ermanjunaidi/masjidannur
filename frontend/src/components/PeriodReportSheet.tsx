// Laporan keuangan periode dengan tata letak seperti kertas laporan takmir:
// buku utama ditampilkan rinci (KAS MASUK / KAS KELUAR), buku lain dalam
// kotak ringkas (saldo awal, mutasi, saldo akhir), lalu TOTAL KAS semua buku.
// Selalu berlatar putih (seperti kertas) agar hasil cetak/PDF sama dengan layar.

import type { LedgerEntry, MasjidSettings, PeriodBook, PeriodReport } from "@/lib/types"

const MONTHS = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
]

/** "2026-10-30" -> "30/10/2026" */
function tglSlash(date: string): string {
  const [y, m, d] = date.split("-")
  return `${d}/${m}/${y}`
}

/** Periode: "30 OKTOBER S.D 06 NOVEMBER 2026" (tahun awal ditulis bila beda). */
function periodeLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number)
  const [ty, tm, td] = to.split("-").map(Number)
  const pad = (n: number) => String(n).padStart(2, "0")
  const left = `${pad(fd)} ${MONTHS[fm - 1]}${fy !== ty ? ` ${fy}` : ""}`
  return `${left} S.D ${pad(td)} ${MONTHS[tm - 1]} ${ty}`
}

/** 1948700 -> "1.948.700" (tanpa "Rp", seperti di kertas). */
function angka(n: number): string {
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 }).format(n || 0)
}

function label(r: LedgerEntry): string {
  return (r.description || r.category || "—").toUpperCase()
}

// Warna bar saldo untuk kotak buku lain, bergiliran seperti di kertas.
const BOX_BARS = ["bg-[#c5d9f1]", "bg-[#ffd966]", "bg-[#fdf2d0]", "bg-[#d9ead3]"]

export default function PeriodReportSheet({
  report,
  masjid,
  mainBookId,
}: {
  report: PeriodReport
  masjid: MasjidSettings | null
  mainBookId: number | null
}) {
  const main = report.books.find((b) => b.book_id === mainBookId) ?? report.books[0]
  const others = report.books.filter((b) => b !== main)

  return (
    <div>
      <div
        id="period-print"
        className="mx-auto max-w-[720px] bg-white px-3 py-6 font-sans text-[11px] sm:px-6 sm:py-8 sm:text-[13px] text-black"
      >
        <div className="mb-6 text-center font-bold leading-snug">
          <p>LAPORAN KEUANGAN</p>
          {masjid?.name && <p>TAKMIR {masjid.name.toUpperCase()}</p>}
          <p>PERIODE {periodeLabel(report.from, report.to)}</p>
        </div>

        {main && <MainBook book={main} from={report.from} to={report.to} />}

        {others.map((b, i) => (
          <OtherBook key={b.book_id} book={b} from={report.from} to={report.to} bar={BOX_BARS[i % BOX_BARS.length]} />
        ))}

        <div className="mt-6 grid grid-cols-[1fr_6.5rem] sm:grid-cols-[1fr_160px] border-2 border-black bg-[#a9d08e] font-bold">
          <p className="px-2 py-1 text-center">TOTAL KAS {tglSlash(report.to)}</p>
          <p className="border-l-2 border-black px-2 py-1 text-right tabular-nums">
            {angka(report.totals.closing)}
          </p>
        </div>

        {masjid?.report_footer && (
          <p className="mt-6 text-center text-xs text-neutral-600">{masjid.report_footer}</p>
        )}
      </div>
    </div>
  )
}

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <p className="border border-black bg-[#d0cece] py-0.5 text-center font-bold">{children}</p>
  )
}

function MainBook({ book, from, to }: { book: PeriodBook; from: string; to: string }) {
  const totalMasuk = book.totals.opening + book.totals.income
  return (
    <div className="space-y-5">
      {/* KAS MASUK */}
      <div>
        <SectionHeader>KAS MASUK</SectionHeader>
        <div className="space-y-0.5 py-1 pl-3 pr-1 sm:pl-14">
          <Row text={`SALDO KAS ${tglSlash(from)}`} amount={book.totals.opening} />
          {book.incomes.map((r) => (
            <Row key={r.id} text={label(r)} amount={r.income} />
          ))}
        </div>
        <div className="grid grid-cols-[1fr_6.5rem] sm:grid-cols-[1fr_160px] border-y border-black bg-[#c5d9f1] font-bold">
          <p className="py-0.5 text-center">TOTAL KAS MASUK</p>
          <p className="px-1 py-0.5 text-right tabular-nums">{angka(totalMasuk)}</p>
        </div>
      </div>

      {/* KAS KELUAR */}
      <div>
        <SectionHeader>KAS KELUAR</SectionHeader>
        <div className="space-y-0.5 py-1 pl-1 pr-1">
          {book.expenses.length === 0 && <p className="text-neutral-500">—</p>}
          {book.expenses.map((r) => (
            <div key={r.id} className="grid grid-cols-[1fr_5.5rem_2rem] sm:grid-cols-[1fr_120px_160px]">
              <p>
                {tglSlash(r.date)} {label(r)}
              </p>
              <p className="text-right tabular-nums">{angka(r.expense)}</p>
              <span />
            </div>
          ))}
        </div>
        <div className="grid grid-cols-[1fr_6.5rem] sm:grid-cols-[1fr_160px] border-y border-black bg-[#f8cbad] font-bold">
          <p className="py-0.5 text-center">TOTAL KAS KELUAR</p>
          <p className="px-1 py-0.5 text-right tabular-nums">{angka(book.totals.expense)}</p>
        </div>
      </div>

      <div className="grid grid-cols-[1fr_6.5rem] sm:grid-cols-[1fr_160px] border border-black bg-[#a9d08e] text-[12px] sm:text-[15px] font-bold">
        <p className="py-1 text-center">SALDO {tglSlash(to)}</p>
        <p className="px-1 py-1 text-right tabular-nums">{angka(book.totals.closing)}</p>
      </div>
    </div>
  )
}

function OtherBook({
  book,
  from,
  to,
  bar,
}: {
  book: PeriodBook
  from: string
  to: string
  bar: string
}) {
  const name = book.name.toUpperCase()
  return (
    <div className="mt-6 border-2 border-[#e02424]">
      <div className="space-y-0.5 py-3 pl-3 pr-1 sm:pl-14">
        <Row text={`SALDO ${name} ${tglSlash(from)}`} amount={book.totals.opening} />
        {book.incomes.map((r) => (
          <Row key={r.id} text={label(r)} amount={r.income} />
        ))}
        {book.expenses.map((r) => (
          <Row key={r.id} text={label(r)} amount={r.expense} expense />
        ))}
      </div>
      <div className={`grid grid-cols-[1fr_6.5rem] sm:grid-cols-[1fr_160px] font-bold ${bar}`}>
        <p className="py-0.5 text-center text-[12px] sm:text-[15px]">
          SALDO {name} S.D {tglSlash(to)}
        </p>
        <p className="px-1 py-0.5 text-right text-[12px] sm:text-[15px] tabular-nums">{angka(book.totals.closing)}</p>
      </div>
    </div>
  )
}

function Row({ text, amount, expense }: { text: string; amount: number; expense?: boolean }) {
  return (
    <div className={`grid grid-cols-[1fr_6.5rem] sm:grid-cols-[1fr_160px] ${expense ? "text-[#e02424]" : ""}`}>
      <p>{text}</p>
      <p className="text-right tabular-nums">{angka(amount)}</p>
    </div>
  )
}
