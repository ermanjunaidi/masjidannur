// Kwitansi gambar untuk satu transaksi.
//   • terbilang()          — angka → kata-kata bahasa Indonesia
//   • exportKwitansiPng()  — render node kwitansi jadi PNG seperempat A4
//                            landscape (1754×1240 px = 300 DPI)
//   • shareKwitansiImage() — Web Share API (pilih WhatsApp di HP);
//                            fallback: unduh PNG untuk dilampirkan manual.
//
// Referensi ukuran: A4 landscape @300DPI = 3508×2480 px. Dibagi 4 (grid
// 2×2) → tiap kwitansi 1754×1240 px = 148.5×105 mm (A6 landscape).

import { toPng } from "html-to-image"

// ─── Terbilang ────────────────────────────────────────────────────────────────

const ANGKA = [
  "", "satu", "dua", "tiga", "empat", "lima",
  "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas",
]

function angkaKeKata(n: number): string {
  n = Math.floor(Math.abs(n))
  if (n < 12) return ANGKA[n]
  if (n < 20) return `${angkaKeKata(n - 10)} belas`
  if (n < 100)
    return `${angkaKeKata(Math.floor(n / 10))} puluh${n % 10 ? ` ${angkaKeKata(n % 10)}` : ""}`
  if (n < 200) return `seratus${n % 100 ? ` ${angkaKeKata(n % 100)}` : ""}`
  if (n < 1000)
    return `${angkaKeKata(Math.floor(n / 100))} ratus${n % 100 ? ` ${angkaKeKata(n % 100)}` : ""}`
  if (n < 2000) return `seribu${n % 1000 ? ` ${angkaKeKata(n % 1000)}` : ""}`
  if (n < 1_000_000)
    return `${angkaKeKata(Math.floor(n / 1000))} ribu${n % 1000 ? ` ${angkaKeKata(n % 1000)}` : ""}`
  if (n < 1_000_000_000)
    return `${angkaKeKata(Math.floor(n / 1_000_000))} juta${
      n % 1_000_000 ? ` ${angkaKeKata(n % 1_000_000)}` : ""
    }`
  if (n < 1_000_000_000_000)
    return `${angkaKeKata(Math.floor(n / 1_000_000_000))} miliar${
      n % 1_000_000_000 ? ` ${angkaKeKata(n % 1_000_000_000)}` : ""
    }`
  return `${angkaKeKata(Math.floor(n / 1_000_000_000_000))} triliun${
    n % 1_000_000_000_000 ? ` ${angkaKeKata(n % 1_000_000_000_000)}` : ""
  }`
}

/** 150000 -> "Seratus lima puluh ribu rupiah" */
export function terbilang(value: number): string {
  const n = Math.floor(Math.abs(value || 0))
  const kata = n === 0 ? "nol" : angkaKeKata(n)
  const kapital = kata.charAt(0).toUpperCase() + kata.slice(1)
  return `${kapital} rupiah`
}

// ─── Export PNG ───────────────────────────────────────────────────────────────

/**
 * Render node kwitansi (877×620 px, setengah skala) menjadi PNG
 * 1754×1240 px — pas seperempat A4 landscape pada 300 DPI.
 */
export async function exportKwitansiPng(node: HTMLElement): Promise<string> {
  return toPng(node, {
    pixelRatio: 2,
    backgroundColor: "#ffffff",
    cacheBust: true,
  })
}

// ─── Share / Download ─────────────────────────────────────────────────────────

export type ShareResult = "shared" | "downloaded" | "aborted"

/**
 * Bagikan gambar kwitansi. Di HP/Chrome memakai Web Share API sehingga
 * WhatsApp muncul di share sheet. Browser tanpa dukungan file-share
 * fallback ke unduhan PNG (user lampirkan manual ke WA).
 */
export async function shareKwitansiImage(
  dataUrl: string,
  filename: string,
): Promise<ShareResult> {
  const blob = await (await fetch(dataUrl)).blob()
  const file = new File([blob], filename, { type: "image/png" })

  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean
  }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: "Kwitansi" })
      return "shared"
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "aborted"
      // Gagal share (mis. desktop tanpa target) → lanjut unduh di bawah.
    }
  }

  const a = document.createElement("a")
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  return "downloaded"
}

/** Unduh data URL langsung sebagai file PNG. */
export function downloadKwitansiPng(dataUrl: string, filename: string) {
  const a = document.createElement("a")
  a.href = dataUrl
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
}
