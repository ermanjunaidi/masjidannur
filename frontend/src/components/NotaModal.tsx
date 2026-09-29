// Nota (receipt) modal with print and WhatsApp image share.
// Renders a clean receipt layout in #nota-print-area so print CSS
// and html-to-image can capture just the receipt portion.

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { ModalShell } from "@/components/UserModal"
import { Loader2, Printer, Share2, Wrench } from "lucide-react"
import { toPng } from "html-to-image"
import { organizationApi } from "@/lib/api"
import type { Invoice, Organization } from "@/lib/types"
import { formatRupiah, formatNumber } from "@/lib/types"

/** Convert local phone number (e.g. 081234567890) to international
 * wa.me format (e.g. 6281234567890). */
function toWaNumber(phone: string): string {
  const p = phone.replace(/[^\d+]/g, "")
  if (p.startsWith("+")) return p.slice(1)
  if (p.startsWith("0")) return "62" + p.slice(1)
  // "8xxxxxxxxx" (angka 0 depan hilang saat input) → 628xxxxxxxxx
  if (/^8\d{8,11}$/.test(p)) return "62" + p
  return p
}

interface NotaModalProps {
  invoice: Invoice
  onClose: () => void
}

export default function NotaModal({ invoice, onClose }: NotaModalProps) {
  const printRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState<"print" | "whatsapp" | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [org, setOrg] = useState<Organization | null>(null)

  useEffect(() => {
    void organizationApi.get().then(setOrg).catch(() => setOrg(null))
  }, [])

  const inv = invoice
  const cust = inv.work_order?.customer
  const wo = inv.work_order
  const phone = cust?.phone ?? ""
  const waNumber = phone ? toWaNumber(phone) : ""

  const handlePrint = () => {
    window.print()
  }

  const handleWhatsApp = async () => {
    if (!printRef.current || !waNumber) return
    setBusy("whatsapp")
    setError(null)
    try {
      const dataUrl = await toPng(printRef.current, {
        quality: 0.95,
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#ffffff",
        width: printRef.current.offsetWidth,
        height: printRef.current.offsetHeight,
      })
      const blob = await (await fetch(dataUrl)).blob()
      const file = new File([blob], "nota.png", { type: "image/png" })

      // Try native share (mobile — WhatsApp appears in the share sheet)
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Nota ${inv.invoice_no}`,
          text: `Nota ${inv.invoice_no} — ${cust?.name || ""} — ${formatRupiah(inv.total)}`,
        })
      } else {
        // Desktop fallback: download image + open wa.me
        const a = document.createElement("a")
        a.href = dataUrl
        a.download = `nota-${inv.invoice_no}.png`
        a.click()
        const waText = encodeURIComponent(
          `Nota ${inv.invoice_no} — ${cust?.name || ""} — Total ${formatRupiah(inv.total)}`,
        )
        window.open(`https://wa.me/${waNumber}?text=${waText}`, "_blank")
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membagikan nota")
    } finally {
      setBusy(null)
    }
  }

  const orgName = org?.name || "TAMZ Garage"
  const orgAddress = org?.address || ""
  const orgPhone = org?.phone || ""

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #nota-print-area, #nota-print-area * { visibility: visible; }
          #nota-print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-shadow: none;
            margin: 0;
          }
        }
      `}</style>
      <ModalShell
        open
        onClose={onClose}
        title="Cetak / Bagikan Nota"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={onClose} disabled={busy !== null}>
              Tutup
            </Button>
            <Button
              variant="outline"
              onClick={handlePrint}
              disabled={busy !== null}
            >
              <Printer className="h-4 w-4" />
              Cetak
            </Button>
            <Button
              onClick={handleWhatsApp}
              disabled={busy !== null || !waNumber}
              title={!waNumber ? "Pelanggan tidak memiliki nomor HP" : "Bagikan ke WhatsApp"}
            >
              {busy === "whatsapp" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Share2 className="h-4 w-4" />
              )}
              WhatsApp
            </Button>
          </>
        }
      >
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

<div className="flex justify-center">
          <div
            id="nota-print-area"
            ref={printRef}
            className="w-[360px] max-w-full rounded-xl border bg-white p-6 text-sm text-black shadow-lg"
            style={{ fontFamily: "monospace" }}
          >
            {/* Header — bengkel name + address from admin profile */}
            <div className="text-center border-b pb-3 mb-3">
              <div className="flex justify-center items-center gap-1.5 mb-1">
                <Wrench className="h-4 w-4 text-primary" />
                <span className="font-bold text-base">{orgName}</span>
              </div>
              {orgAddress && (
                <p className="text-[10px] text-gray-500 leading-snug">{orgAddress}</p>
              )}
              {orgPhone && (
                <p className="text-[10px] text-gray-500">{orgPhone}</p>
              )}
            </div>

          {/* Invoice info */}
          <div className="space-y-1 mb-3 text-xs">
            <p className="font-bold text-sm">{inv.invoice_no}</p>
            <p className="text-gray-500">
              {new Date(inv.issued_at).toLocaleDateString("id-ID", {
                day: "numeric", month: "long", year: "numeric",
              })}
            </p>
          </div>

          {/* Customer */}
          <div className="border-t pt-2 mb-3 text-xs">
            <p className="font-medium">{cust?.name || "—"}</p>
            <p className="text-gray-500">{cust?.phone || ""}</p>
            {wo?.vehicle && (
              <p className="text-gray-500">
                {wo.vehicle.brand} {wo.vehicle.model} — {wo.vehicle.plate}
              </p>
            )}
          </div>

          {/* Items */}
          <div className="border-t border-b py-2 mb-3">
            <div className="flex justify-between text-[10px] text-gray-500 font-medium mb-1.5">
              <span>Jasa / Part</span>
              <span>Jml</span>
              <span>Subtotal</span>
            </div>
            {(wo?.items ?? []).map((it) => (
              <div key={it.id} className="flex justify-between text-xs py-0.5">
                <span className="flex-1 truncate">{it.name}</span>
                <span className="w-10 text-right">{formatNumber(it.qty)}</span>
                <span className="w-20 text-right">{formatRupiah(it.line_total)}</span>
              </div>
            ))}
            {(wo?.parts ?? []).map((p) => (
              <div key={p.id} className="flex justify-between text-xs py-0.5">
                <span className="flex-1 truncate">{p.sparepart?.name ?? `Part #${p.sparepart_id}`}</span>
                <span className="w-10 text-right">{formatNumber(p.qty)}</span>
                <span className="w-20 text-right">{formatRupiah(p.line_total)}</span>
              </div>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1 text-xs mb-4">
            <div className="flex justify-between">
              <span className="text-gray-500">Subtotal</span>
              <span>{formatRupiah(inv.subtotal)}</span>
            </div>
            {inv.discount > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Diskon</span>
                <span>-{formatRupiah(inv.discount)}</span>
              </div>
            )}
            {inv.tax > 0 && (
              <div className="flex justify-between text-gray-500">
                <span>Pajak</span>
                <span>{formatRupiah(inv.tax)}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-base pt-1 border-t">
              <span>Total</span>
              <span>{formatRupiah(inv.total)}</span>
            </div>
          </div>

          {/* Payments */}
          {(inv.payments ?? []).length > 0 && (
            <div className="border-t pt-2 mb-3 text-xs">
              <p className="font-medium mb-1">Pembayaran</p>
              {inv.payments!.map((p) => (
                <div key={p.id} className="border-b border-dashed py-1 last:border-0">
                  <div className="flex justify-between text-gray-700">
                    <span>
                      Bayar ({p.method}) — {new Date(p.paid_at).toLocaleDateString("id-ID")}
                    </span>
                    <span className="font-semibold">
                      {formatRupiah(p.amount)}
                    </span>
                  </div>
                  {p.change > 0 && (
                    <div className="flex justify-between text-gray-500">
                      <span>Kembalian</span>
                      <span>{formatRupiah(p.change)}</span>
                    </div>
                  )}
                </div>
              ))}
              {inv.status === "paid" && (
                <p className="text-emerald-600 font-medium mt-1">✓ LUNAS</p>
              )}
              {inv.status === "partial" && (
                <p className="text-amber-600 font-medium mt-1">Sebagian ({formatRupiah(inv.total - (inv.payments ?? []).reduce((s, p) => s + p.amount, 0))})</p>
              )}
              {inv.status === "unpaid" && (
                <p className="text-red-600 font-medium mt-1">Belum Dibayar</p>
              )}
            </div>
          )}

            {/* Footer */}
            <div className="border-t pt-2 text-center text-[10px] text-gray-400">
              <p>Terima kasih telah menggunakan jasa {orgName}</p>
              <p className="mt-1">Nota ini sah tanpa tanda tangan</p>
            </div>
          </div>
        </div>

        {!waNumber && (
          <p className="text-xs text-muted-foreground text-center">
            Pelanggan tidak memiliki nomor HP — WhatsApp tidak tersedia
          </p>
        )}
      </ModalShell>
    </>
  )
}