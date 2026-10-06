// Layout kwitansi cetak: seperempat A4 landscape (148.5×105 mm = A6
// landscape), rasio tepat 1754×1240 @300DPI. Dirender di layar pada
// 877×620 px (setengah skala) lalu diekspor pixelRatio 2 → hasil PNG
// presisi seperempat A4 landscape 300 DPI, siap share WhatsApp / cetak.
//
// Semua styling inline (bukan Tailwind) supaya html-to-image meng-clone
// computed style dengan akurat tanpa tergantung urutan CSS.

import type { MasjidSettings, Transaction } from "@/lib/types"
import { formatRupiah, nomorNota } from "@/lib/types"
import { terbilang } from "@/lib/kwitansi"

export const KWITANSI_W = 877
export const KWITANSI_H = 620

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
]

/** "2026-10-02" -> "2 Oktober 2026" */
function tanggalPanjang(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  return `${d} ${BULAN[(m || 1) - 1]} ${y}`
}

const LABEL: React.CSSProperties = {
  margin: 0,
  fontSize: 11,
  letterSpacing: 0.8,
  textTransform: "uppercase",
  color: "#64748b",
  fontWeight: 600,
}

export function Kwitansi({
  tx,
  masjid,
  bookName,
}: {
  tx: Transaction
  masjid: MasjidSettings | null
  bookName?: string
}) {
  const isIn = tx.type === "pemasukan"
  const city = masjid?.city_name || ""

  return (
    <div
      style={{
        width: KWITANSI_W,
        height: KWITANSI_H,
        background: "#ffffff",
        color: "#0f172a",
        fontFamily:
          "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif",
        padding: "26px 36px 24px",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* ── Kop ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 16,
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              fontSize: 25,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              lineHeight: 1.15,
            }}
          >
            {masjid?.name || "Bukti Transaksi"}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 12.5, color: "#475569", maxWidth: 520 }}>
            {[
              [masjid?.address, masjid?.city_name].filter(Boolean).join(", "),
              masjid?.phone,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <p
            style={{
              margin: 0,
              fontSize: 23,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 1.2,
            }}
          >
            {isIn ? "Kuitansi" : "Bukti Pengeluaran"}
          </p>
          <p style={{ margin: "3px 0 0", fontSize: 13, color: "#475569" }}>
            No. {nomorNota(tx)}
          </p>
        </div>
      </div>

      {/* garis ganda kop */}
      <div
        style={{
          marginTop: 10,
          height: 4,
          borderTop: "3px solid #0f172a",
          borderBottom: "1px solid #0f172a",
        }}
      />

      {/* ── Terbilang ── */}
      <div
        style={{
          marginTop: 12,
          background: "#f1f5f9",
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          padding: "7px 14px",
          fontSize: 14,
        }}
      >
        <span style={{ fontWeight: 700 }}>Terbilang: </span>
        <span style={{ fontStyle: "italic" }}># {terbilang(tx.amount)} #</span>
      </div>

      {/* ── Isi ── */}
      <div style={{ display: "flex", gap: 24, marginTop: 16, flex: 1, minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={LABEL}>{isIn ? "Telah terima dari" : "Telah dibayarkan kepada"}</p>
          <p
            style={{
              margin: "2px 0 0",
              fontSize: 19,
              fontWeight: 700,
              borderBottom: "1px solid #94a3b8",
              paddingBottom: 6,
              minHeight: 28,
            }}
          >
            {tx.partner_name || "…………………………………"}
          </p>

          <p style={{ ...LABEL, marginTop: 14 }}>Untuk pembayaran</p>
          <p style={{ margin: "2px 0 0", fontSize: 16, fontWeight: 600, lineHeight: 1.35 }}>
            {tx.description || tx.category?.name || "—"}
          </p>
          <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "#64748b" }}>
            {[
              tx.category?.name,
              bookName ? `Buku Kas: ${bookName}` : "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        {/* Kotak jumlah */}
        <div style={{ width: 224, flexShrink: 0 }}>
          <div
            style={{
              border: "2px solid #0f172a",
              borderRadius: 8,
              padding: "12px 14px",
              textAlign: "center",
            }}
          >
            <p style={{ ...LABEL, margin: 0 }}>
              {isIn ? "Jumlah Terima" : "Jumlah Bayar"}
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 23,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                whiteSpace: "nowrap",
              }}
            >
              {formatRupiah(tx.amount)}
            </p>
          </div>
        </div>
      </div>

      {/* ── Tanda tangan ── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: "auto",
        }}
      >
        <div style={{ fontSize: 13, color: "#334155", paddingBottom: 4 }}>
          {[city, tanggalPanjang(tx.date)].filter(Boolean).join(", ")}
        </div>
        <div style={{ textAlign: "center", width: 210 }}>
          <p style={{ margin: 0, fontSize: 13 }}>Bendahara,</p>
          <div style={{ height: 54 }} />
          <div style={{ borderTop: "1px solid #0f172a" }} />
        </div>
      </div>

      {/* footer kecil (catatan laporan dari Settings) */}
      {masjid?.report_footer && (
        <p
          style={{
            position: "absolute",
            bottom: 5,
            left: 36,
            right: 36,
            margin: 0,
            textAlign: "center",
            fontSize: 9.5,
            color: "#94a3b8",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {masjid.report_footer}
        </p>
      )}
    </div>
  )
}
