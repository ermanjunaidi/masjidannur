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
    const raw = e.target.value
    if (/[^\d.,]/.test(raw)) return

    const cursor = e.target.selectionStart ?? raw.length
    const digitsBefore = raw.slice(0, cursor).replace(/\D/g, "").length
    const parsed = parse(raw)
    const formatted = fmt(parsed)

    setText(formatted)
    onValueChange(parsed)

    // Preserve cursor position relative to digit count
    requestAnimationFrame(() => {
      const el = ref.current
      if (!el) return
      let pos = 0
      for (let seen = 0, i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) seen++
        pos = i + 1
        if (seen >= digitsBefore) break
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