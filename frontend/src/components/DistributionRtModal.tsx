// Bagikan per RT — dua cara:
//   • "Tiap warga": semua warga di satu RT (dari Daftar Warga) dicatat
//     menerima jumlah yang sama; yang sudah menerima dilewati.
//   • "Kolektif": satu baris untuk RT itu sebagai satu kesatuan, mis. beras
//     diserahkan ke ketua RT untuk dibagikan sendiri.

import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ModalShell } from "@/components/UserModal"
import { NumberInput } from "@/components/ui/number-input"
import { Loader2 } from "lucide-react"
import { ApiError, distributionsApi } from "@/lib/api"
import type { Book, Resident, Transaction } from "@/lib/types"
import { formatKg, formatRupiah, todayISO } from "@/lib/types"

const selectClass = "h-9 w-full rounded-lg border bg-background px-3 text-sm"

function personKey(name: string, rt?: string, rw?: string): string {
  return `${name.trim().toLowerCase()}|${rt ?? ""}|${rw ?? ""}`
}

const rtLabel = (rt: string, rw: string) => `RT ${rt || "—"} / RW ${rw || "—"}`

export function DistributionRtModal({
  open,
  book,
  residents,
  given,
  onClose,
  onDone,
}: {
  open: boolean
  book: Book
  residents: Resident[]
  /** Pembagian yang sudah tercatat di buku ini. */
  given: Transaction[]
  onClose: () => void
  /** Dipanggil setelah ada baris yang tersimpan (daftar perlu dimuat ulang). */
  onDone: () => void
}) {
  const [mode, setMode] = useState<"warga" | "kolektif">("warga")
  const [group, setGroup] = useState("") // "rw|rt" dari daftar warga
  const [rt, setRt] = useState("")
  const [rw, setRw] = useState("")
  const [pic, setPic] = useState("")
  const [amount, setAmount] = useState(0)
  // Beras bisa diisi per warga ATAU total yang dibagikan ke RT itu; isian
  // yang terakhir diubah menjadi acuan, yang satunya dihitung otomatis.
  const [riceInput, setRiceInput] = useState<{ source: "per" | "total"; value: number }>({
    source: "per",
    value: 0,
  })
  const [date, setDate] = useState(todayISO())
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)

  // RT yang ada di Daftar Warga, urut RW lalu RT.
  const groups = useMemo(() => {
    const map = new Map<string, { rt: string; rw: string; members: Resident[] }>()
    residents.forEach((r) => {
      const key = `${r.rw}|${r.rt}`
      const g = map.get(key) ?? { rt: r.rt, rw: r.rw, members: [] }
      g.members.push(r)
      map.set(key, g)
    })
    return [...map.entries()]
      .map(([key, g]) => ({ key, ...g }))
      .sort(
        (a, b) =>
          a.rw.localeCompare(b.rw, "id", { numeric: true }) ||
          a.rt.localeCompare(b.rt, "id", { numeric: true }),
      )
  }, [residents])

  useEffect(() => {
    if (!open) return
    setMode(residents.length > 0 ? "warga" : "kolektif")
    setGroup("")
    setRt("")
    setRw("")
    setPic("")
    setAmount(0)
    setRiceInput({ source: "per", value: 0 })
    setDate(todayISO())
    setError(null)
    setProgress(null)
    // Hanya saat modal dibuka; daftar warga tidak perlu memicu reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const givenKeys = useMemo(
    () => new Set(given.map((g) => personKey(g.partner_name, g.rt, g.rw))),
    [given],
  )
  const selected = groups.find((g) => g.key === group) ?? null
  const pending = selected?.members.filter((m) => !givenKeys.has(personKey(m.name, m.rt, m.rw))) ?? []
  const already = (selected?.members.length ?? 0) - pending.length
  const saving = progress !== null
  const count = mode === "warga" ? pending.length : 1
  const round2 = (n: number) => Math.round(n * 100) / 100
  // Beras per penerima yang benar-benar dicatat.
  const rice =
    riceInput.source === "per" || mode === "kolektif"
      ? riceInput.value
      : count > 0
        ? round2(riceInput.value / count)
        : 0
  const riceTotal = riceInput.source === "total" && mode === "warga" ? riceInput.value : round2(rice * count)

  const handleSave = async () => {
    setError(null)
    if (amount <= 0 && rice <= 0) {
      setError("Isi uang (Rp) atau beras (kg) yang dibagikan")
      return
    }
    if (mode === "kolektif") {
      if (!rt.trim()) {
        setError("RT wajib diisi")
        return
      }
      setProgress({ done: 0, total: 1 })
      try {
        await distributionsApi.create(book.id, {
          partner_name: `Kolektif RT ${rt.trim()}${rw.trim() ? ` / RW ${rw.trim()}` : ""}`,
          rt: rt.trim(),
          rw: rw.trim(),
          amount,
          rice_kg: rice,
          date,
          description: pic.trim() ? `Diterima oleh: ${pic.trim()}` : "Dibagikan kolektif lewat RT",
        })
        onDone()
        onClose()
      } catch (e) {
        setError(e instanceof ApiError ? e.message : "Gagal menyimpan")
      } finally {
        setProgress(null)
      }
      return
    }

    if (!selected) {
      setError("Pilih RT")
      return
    }
    if (pending.length === 0) {
      setError("Semua warga di RT ini sudah tercatat menerima")
      return
    }
    // Satu per satu supaya bila ada yang gagal, yang sudah tersimpan tetap
    // tercatat dan sisanya bisa diulang (yang sudah menerima dilewati).
    let done = 0
    setProgress({ done, total: pending.length })
    try {
      for (const m of pending) {
        await distributionsApi.create(book.id, {
          partner_name: m.name,
          rt: m.rt,
          rw: m.rw,
          amount,
          rice_kg: rice,
          date,
          description: m.note,
        })
        done++
        setProgress({ done, total: pending.length })
      }
      onDone()
      onClose()
    } catch (e) {
      if (done > 0) onDone()
      setError(
        `${done} dari ${pending.length} warga tersimpan, lalu gagal: ${
          e instanceof ApiError ? e.message : "koneksi terputus"
        }. Klik Simpan lagi untuk melanjutkan sisanya.`,
      )
    } finally {
      setProgress(null)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={saving ? () => {} : onClose}
      title="Bagikan per RT"
      description={`Buku kas: ${book.name}`}
      size="md"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Batal
          </Button>
          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {progress && progress.total > 1 ? `Menyimpan ${progress.done}/${progress.total}` : "Simpan"}
          </Button>
        </>
      }
    >
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["warga", "Tiap warga di RT", "Semua warga satu RT menerima jumlah yang sama"],
            ["kolektif", "Kolektif ke RT", "Satu catatan untuk RT, mis. diserahkan ke ketua RT"],
          ] as const
        ).map(([key, label, hint]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            disabled={saving}
            className={`rounded-lg border p-3 text-left text-sm transition-colors ${
              mode === key ? "border-primary bg-primary/5" : "hover:bg-muted"
            }`}
          >
            <span className="block font-medium">{label}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {mode === "warga" ? (
          <div className="col-span-2 space-y-1.5">
            <Label htmlFor="rt-group">RT *</Label>
            {groups.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Daftar warga masih kosong. Isi dulu di tab Daftar Warga, atau pakai Kolektif ke RT.
              </p>
            ) : (
              <select
                id="rt-group"
                className={selectClass}
                value={group}
                onChange={(e) => setGroup(e.target.value)}
              >
                <option value="">— pilih RT —</option>
                {groups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {rtLabel(g.rt, g.rw)} · {g.members.length} warga
                  </option>
                ))}
              </select>
            )}
            {selected && (
              <p className="text-xs text-muted-foreground">
                {pending.length} warga akan dicatat menerima
                {already > 0 && `, ${already} dilewati karena sudah menerima`}.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rt-rt">RT *</Label>
              <Input id="rt-rt" value={rt} onChange={(e) => setRt(e.target.value)} placeholder="01" inputMode="numeric" maxLength={10} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-rw">RW</Label>
              <Input id="rt-rw" value={rw} onChange={(e) => setRw(e.target.value)} placeholder="05" inputMode="numeric" maxLength={10} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="rt-pic">Diterima oleh</Label>
              <Input id="rt-pic" value={pic} onChange={(e) => setPic(e.target.value)} placeholder="Mis. nama ketua RT" />
            </div>
          </>
        )}
        {mode === "warga" ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="rt-rice">Beras per warga (kg)</Label>
              <NumberInput
                id="rt-rice"
                value={rice}
                onValueChange={(n) => setRiceInput({ source: "per", value: n })}
                maxFraction={2}
                placeholder="0"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rt-rice-total">Total beras dibagikan (kg)</Label>
              <NumberInput
                id="rt-rice-total"
                value={riceTotal}
                onValueChange={(n) => setRiceInput({ source: "total", value: n })}
                maxFraction={2}
                placeholder="0"
                disabled={count === 0}
              />
            </div>
            <p className="col-span-2 -mt-1 text-xs text-muted-foreground">
              Isi salah satu: beras per warga, atau total yang dibagikan ke RT ini (dibagi rata ke{" "}
              {count} warga).
            </p>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label htmlFor="rt-rice">Beras yang dibagikan (kg)</Label>
            <NumberInput
              id="rt-rice"
              value={rice}
              onValueChange={(n) => setRiceInput({ source: "per", value: n })}
              maxFraction={2}
              placeholder="0"
            />
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="rt-amount">Uang (Rp){mode === "warga" ? " per warga" : ""}</Label>
          <NumberInput id="rt-amount" value={amount} onValueChange={setAmount} placeholder="0" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="rt-date">Tanggal</Label>
          <Input id="rt-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        {count > 0 && (amount > 0 || rice > 0) && (
          <div className="col-span-2 rounded-lg bg-muted/50 p-3 text-sm">
            Total dibagikan: <b>{formatKg(round2(rice * count))}</b> beras dan{" "}
            <b>{formatRupiah(amount * count)}</b>
            {mode === "warga" && ` untuk ${count} warga (${formatKg(rice)} per warga)`}.
            {mode === "warga" && riceInput.source === "total" && round2(rice * count) !== riceInput.value && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {formatKg(riceInput.value)} tidak habis dibagi rata; per warga dibulatkan ke dua desimal.
              </span>
            )}
          </div>
        )}
      </div>
    </ModalShell>
  )
}
