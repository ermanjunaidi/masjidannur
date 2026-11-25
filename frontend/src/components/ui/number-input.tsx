// Input angka yang otomatis memformat ribuan (titik) saat diketik.
//   - value: number (mentah)
//   - onValueChange: (n: number) => void
//   - maxFraction: jumlah digit desimal (0 = integer, 2 = dua desimal)
//   - support cursor positioning agar tidak lompat.

import { useRef, useState } from "react"
import { Input } from "./input"

interface Props {
  value: number
  onValueChange: (n: number) => void
  placeholder?: string
  maxFraction?: number
  className?: string
  id?: string
  disabled?: boolean
}

export function NumberInput({
  value,
  onValueChange,
  placeholder,
  maxFraction = 0,
  className,
  id,
  disabled,
}: Props) {
  const ref = useRef<HTMLInputElement>(null)

  const fmt = (n: number): string => {
    if (n === 0) return ""
    return n.toLocaleString("id-ID", {
      maximumFractionDigits: maxFraction,
      minimumFractionDigits: 0,
    })
  }

  const [text, setText] = useState(() => fmt(value))

  // Sync external value → display text (adjusted during render, not in an
  // effect, so there is no extra render with stale text).
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    // Keep the user's text while mid-edit (it already parses to value).
    if (parseIdNumber(text) !== value) setText(fmt(value))
  }
  const parse = (s: string): number => {
    const norm = s.replace(/\./g, "").replace(",", ".")
    const n = parseFloat(norm)
    return isNaN(n) ? 0 : n
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let raw = e.target.value
    if (/[^\d.,]/.test(raw)) return

    const cursor = e.target.selectionStart ?? raw.length
    let formatted: string
    if (maxFraction > 0) {
      // Keypad angka di sebagian HP hanya punya titik: titik yang baru
      // diketik (di posisi kursor, belum ada koma) dianggap koma desimal.
      if (!raw.includes(",") && raw[cursor - 1] === "." && raw.length === text.length + 1) {
        raw = raw.slice(0, cursor - 1) + "," + raw.slice(cursor)
      }
      // Bagian desimal dipertahankan persis seperti diketik ("2," atau
      // "2,50"): memformat ulang dari angkanya akan membuang koma dan nol
      // di belakang sehingga desimal tidak pernah bisa diketik.
      const comma = raw.indexOf(",")
      if (comma >= 0) {
        const whole = raw.slice(0, comma).replace(/\D/g, "")
        const frac = raw.slice(comma + 1).replace(/\D/g, "").slice(0, maxFraction)
        formatted = `${Number(whole || "0").toLocaleString("id-ID")},${frac}`
      } else {
        formatted = fmt(parse(raw))
      }
    } else {
      formatted = fmt(parse(raw))
    }
    const parsed = parse(formatted)
    // Posisi kursor dihitung dari digit dan koma di sebelah kirinya (titik
    // ribuan bisa bertambah/berkurang saat diformat).
    const keep = /[\d,]/
    const before = raw.slice(0, cursor).replace(/[^\d,]/g, "").length

    setText(formatted)
    onValueChange(parsed)

    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      let pos = 0
      for (let seen = 0, i = 0; i < formatted.length && seen < before; i++) {
        if (keep.test(formatted[i])) seen++
        pos = i + 1
      }
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <Input
      ref={ref}
      id={id}
      type="text"
      inputMode="decimal"
      value={text}
      onChange={handleChange}
      onFocus={(e) => e.target.select()}
      // Rapikan saat keluar: "2," → "2", "2,50" → "2,5".
      onBlur={() => setText(fmt(value))}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
    />
  )
}

function parseIdNumber(s: string): number {
  const norm = s.replace(/\./g, "").replace(",", ".")
  const n = parseFloat(norm)
  return isNaN(n) ? 0 : n
}