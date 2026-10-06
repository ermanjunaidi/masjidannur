// Preview kwitansi gambar + aksi share WhatsApp / unduh PNG.
// Kwitansi dirender 877×620 px lalu di-scale CSS agar muat di layar;
// ekspor tetap dari node tak terskala → PNG 1754×1240 (seperempat A4
// landscape, 300 DPI).

import { useEffect, useRef, useState } from "react"
import { ModalShell } from "@/components/UserModal"
import { Button } from "@/components/ui/button"
import { Download, Loader2, MessageCircle } from "lucide-react"
import { Kwitansi, KWITANSI_H, KWITANSI_W } from "@/components/Kwitansi"
import {
  downloadKwitansiPng,
  exportKwitansiPng,
  shareKwitansiImage,
} from "@/lib/kwitansi"
import type { MasjidSettings, Transaction } from "@/lib/types"

export function KwitansiDialog({
  open,
  tx,
  masjid,
  bookName,
  onClose,
}: {
  open: boolean
  tx: Transaction | null
  masjid: MasjidSettings | null
  bookName?: string
  onClose: () => void
}) {
  const nodeRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [working, setWorking] = useState<"share" | "download" | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  // Skala preview mengikuti lebar layar (kwitansi asli 877 px).
  useEffect(() => {
    if (!open) return
    const fit = () => {
      const avail = Math.min(window.innerWidth - 48, KWITANSI_W)
      setScale(Math.max(0.3, Math.min(1, avail / KWITANSI_W)))
    }
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [open])

  useEffect(() => {
    if (open) setInfo(null)
  }, [open, tx?.id])

  if (!open || !tx) return null

  const filename = `kwitansi-${tx.ref_no || tx.id}.png`

  const build = async (): Promise<string | null> => {
    if (!nodeRef.current) return null
    try {
      return await exportKwitansiPng(nodeRef.current)
    } catch {
      setInfo("Gagal membuat gambar kwitansi. Coba lagi.")
      return null
    }
  }

  const handleShare = async () => {
    setWorking("share")
    setInfo(null)
    const dataUrl = await build()
    if (dataUrl) {
      const result = await shareKwitansiImage(dataUrl, filename)
      if (result === "shared") setInfo("Kwitansi dibagikan ✓")
      else if (result === "downloaded")
        setInfo("Browser ini belum mendukung share file — gambar diunduh. Lampirkan file PNG itu ke WhatsApp.")
    }
    setWorking(null)
  }

  const handleDownload = async () => {
    setWorking("download")
    setInfo(null)
    const dataUrl = await build()
    if (dataUrl) {
      downloadKwitansiPng(dataUrl, filename)
      setInfo("Gambar diunduh ke folder Download.")
    }
    setWorking(null)
  }

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Kwitansi (Gambar)"
      description="Seperempat A4 landscape · 300 DPI · lengkap terbilang"
      size="full"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={!!working}>
            Tutup
          </Button>
          <Button variant="outline" onClick={() => void handleDownload()} disabled={!!working}>
            {working === "download" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Unduh PNG
          </Button>
          <Button onClick={() => void handleShare()} disabled={!!working}>
            {working === "share" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            Bagikan via WhatsApp
          </Button>
        </>
      }
    >
      <div className="flex justify-center overflow-auto py-2">
        <div
          style={{
            width: KWITANSI_W * scale,
            height: KWITANSI_H * scale,
            flexShrink: 0,
          }}
        >
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            {/* Ref menunjuk pembungkus TANPA transform — html-to-image
                menyalin computed style, transform skala tidak ikut. */}
            <div ref={nodeRef} style={{ width: KWITANSI_W, background: "#ffffff" }}>
              <Kwitansi tx={tx} masjid={masjid} bookName={bookName} />
            </div>
          </div>
        </div>
      </div>
      {info && (
        <p className="text-muted-foreground text-center text-sm">{info}</p>
      )}
    </ModalShell>
  )
}
