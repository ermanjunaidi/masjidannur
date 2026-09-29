import { useCallback, useEffect, useState } from "react"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ModalShell } from "@/components/UserModal"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Loader2,
  CalendarPlus,
  Check,
  X,
  UserCheck,
  Plus,
  Pencil,
  Trash2,
} from "lucide-react"
import { ApiError, attendanceApi, shiftsApi, leavesApi, usersApi, type SalaryEntry } from "@/lib/api"
import type { AttendanceDay, LeaveRequest, Shift, User } from "@/lib/types"
import { ATTENDANCE_STATUS_LABELS, LEAVE_TYPE_LABELS, formatNumber, formatRupiah } from "@/lib/types"
import { useAuth } from "@/context/AuthContext"

const TABS = [
  { key: "today", label: "Absen Hari Ini" },
  { key: "rekap", label: "Rekap" },
  { key: "gaji", label: "Rekap Gaji" },
  { key: "shift", label: "Shift" },
  { key: "izin", label: "Izin / Cuti" },
] as const

type TabKey = (typeof TABS)[number]["key"]

export default function AttendancePage() {
  const { hasPermission } = useAuth()
  const [tab, setTab] = useState<TabKey>("today")

  const canReport = hasPermission("attendance_reports:read")
  const canShifts = hasPermission("shifts:read")
  const canLeaves = hasPermission("leaves:read")

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Absensi Karyawan</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Check-in/out, rekap kehadiran, shift, dan izin/cuti.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "today" && <TodayTab />}
      {tab === "rekap" && canReport && <RekapTab />}
      {tab === "gaji" && canReport && <SalaryTab />}
      {tab === "shift" && canShifts && <ShiftTab />}
      {tab === "izin" && canLeaves && <LeaveTab />}
    </div>
  )
}

// ─── Tab: Absen Hari Ini (admin input manual) ────────────────────────────────

function TodayTab() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("attendance_reports:read")
  const today = new Date().toISOString().slice(0, 10)
  const [rows, setRows] = useState<AttendanceDay[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<AttendanceDay | null>(null)
  const [pendingDelete, setPendingDelete] = useState<AttendanceDay | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [attResp, userResp] = await Promise.all([
        attendanceApi.list({ date: today }),
        usersApi.list(),
      ])
      setRows(attResp.attendance ?? [])
      setUsers(userResp.users ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat data")
    } finally {
      setLoading(false)
    }
  }, [today])

  useEffect(() => {
    void load()
  }, [load])

  const handleDelete = async () => {
    if (!pendingDelete) return
    try {
      await attendanceApi.remove(pendingDelete.id)
      setPendingDelete(null)
      void load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus")
    }
  }

  // unused

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Daftar Absensi — {today}</CardTitle>
            <CardDescription>
              {rows.length} dari {users.length} karyawan sudah tercatat.
            </CardDescription>
          </div>
          {canWrite && (
            <Button size="sm" onClick={() => { setEditTarget(null); setFormOpen(true) }}>
              <Plus className="h-4 w-4" /> Input Manual
            </Button>
          )}
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Karyawan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Masuk</TableHead>
                <TableHead>Keluar</TableHead>
                <TableHead>Keterangan</TableHead>
                {canWrite && <TableHead className="text-right">Aksi</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={canWrite ? 6 : 5} className="py-8 text-center text-muted-foreground">
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={canWrite ? 6 : 5} className="py-8 text-center text-muted-foreground">
                    Belum ada karyawan.
                  </TableCell>
                </TableRow>
              ) : (
                users.map((u) => {
                  const row = rows.find((r) => r.user_id === u.id)
                  return (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>
                        {row ? (
                          <Badge variant="outline" className={STATUS_COLORS[row.status] ?? ""}>
                            {ATTENDANCE_STATUS_LABELS[row.status] ?? row.status}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
                            Belum Absen
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row?.check_in_at ? new Date(row.check_in_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {row?.check_out_at ? new Date(row.check_out_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-32 truncate">
                        {row?.note || (row ? "" : "—")}
                      </TableCell>
                      {canWrite && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="outline" size="icon-sm" title="Edit" onClick={() => { setEditTarget(row ?? null); setFormOpen(true) }} disabled={!row}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button variant="outline" size="icon-sm" title="Hapus" className="text-destructive hover:text-destructive" onClick={() => setPendingDelete(row ?? null)} disabled={!row}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <ManualInputModal
        open={formOpen}
        edit={editTarget}
        users={users}
        today={today}
        onClose={() => { setFormOpen(false); setEditTarget(null) }}
        onSaved={() => { setFormOpen(false); setEditTarget(null); void load() }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Hapus data absensi?"
        description={
          <>
            Data absensi <b>{pendingDelete?.user?.name ?? pendingDelete?.user_id}</b> tanggal {pendingDelete?.date} akan dihapus.
          </>
        }
        confirmLabel="Hapus"
        destructive
        onClose={(ok) => {
          setPendingDelete(null)
          if (ok) void handleDelete()
        }}
      />
    </div>
  )
}

// ─── Tab: Rekap ──────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  hadir: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  terlambat: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  izin: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
  sakit: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
  cuti: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20",
  tanpa_keterangan: "bg-destructive/10 text-destructive border-destructive/20",
  libur: "bg-muted text-muted-foreground border-border",
  belum_absen: "bg-muted text-muted-foreground border-border",
}

function RekapTab() {
  const [rows, setRows] = useState<AttendanceDay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [date, setDate] = useState("")
  const [status, setStatus] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await attendanceApi.list({
        date: date || undefined,
        status: status || undefined,
      })
      setRows(resp.attendance ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat rekap")
    } finally {
      setLoading(false)
    }
  }, [date, status])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rekap Kehadiran</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-40" />
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm"
          >
            <option value="">Semua status</option>
            {Object.entries(ATTENDANCE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tanggal</TableHead>
              <TableHead>Karyawan</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Masuk</TableHead>
              <TableHead>Keluar</TableHead>
              <TableHead>Durasi</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Belum ada data kehadiran.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="tabular-nums">{a.date}</TableCell>
                  <TableCell className="font-medium">{a.user?.name ?? "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {a.shift?.name ?? "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {a.check_in_at ? new Date(a.check_in_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {a.check_out_at ? new Date(a.check_out_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "—"}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {a.work_duration_minutes > 0
                      ? `${formatNumber(Math.floor(a.work_duration_minutes / 60))}j ${formatNumber(a.work_duration_minutes % 60)}m`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={STATUS_COLORS[a.status] ?? ""}>
                      {ATTENDANCE_STATUS_LABELS[a.status] ?? a.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

// ─── Tab: Shift ──────────────────────────────────────────────────────────────

// ─── Tab: Rekap Gaji ──────────────────────────────────────────────────────────

function SalaryTab() {
  const [rows, setRows] = useState<SalaryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [from, setFrom] = useState(() => new Date().toISOString().slice(0, 8) + "01")
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await attendanceApi.report(from || undefined, to || undefined)
      setRows(resp.report ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat rekap gaji")
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => {
    void load()
  }, [load])

  const totals = rows.reduce(
    (acc, r) => {
      acc.base += r.base_pay
      acc.allow += r.allowance_total
      acc.total += r.total_salary
      acc.days += r.work_days
      return acc
    },
    { base: 0, allow: 0, total: 0, days: 0 },
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Rekap Gaji Karyawan</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor="salary-from" className="sr-only">Dari</Label>
          <Input id="salary-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-40" />
          <Label htmlFor="salary-to" className="sr-only">Sampai</Label>
          <Input id="salary-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-40" />
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead className="text-right">Gaji Pokok/hari</TableHead>
              <TableHead className="text-right">Tunjangan/hari</TableHead>
              <TableHead className="text-right">Hari</TableHead>
              <TableHead className="text-right">Gaji Pokok</TableHead>
              <TableHead className="text-right">Tunjangan</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Belum ada data gaji.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell className="font-medium">{r.name || `User #${r.user_id}`}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(r.daily_wage)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(r.daily_allowance)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatNumber(r.work_days)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(r.base_pay)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatRupiah(r.allowance_total)}</TableCell>
                  <TableCell className="text-right tabular-nums font-semibold">{formatRupiah(r.total_salary)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {rows.length > 0 && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Hari</p>
              <p className="font-semibold tabular-nums">{formatNumber(totals.days)}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Gaji Pokok</p>
              <p className="font-semibold tabular-nums">{formatRupiah(totals.base)}</p>
            </div>
            <div className="rounded-xl border bg-muted/30 p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Tunjangan</p>
              <p className="font-semibold tabular-nums">{formatRupiah(totals.allow)}</p>
            </div>
            <div className="rounded-xl border bg-primary/10 p-3 text-center">
              <p className="text-xs text-muted-foreground">Total Pengeluaran</p>
              <p className="font-semibold tabular-nums text-primary">{formatRupiah(totals.total)}</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ShiftTab() {
  const { hasPermission } = useAuth()
  const canWrite = hasPermission("shifts:write")
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await shiftsApi.list()
      setShifts(resp.shifts ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat shift")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Shift Kerja</CardTitle>
          <CardDescription>Jam kerja & toleransi keterlambatan.</CardDescription>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
              <UserCheck className="h-4 w-4" /> Atur Jadwal
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <CalendarPlus className="h-4 w-4" /> Tambah Shift
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        {loading ? (
          <div className="flex justify-center py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : shifts.length === 0 ? (
          <p className="text-sm text-muted-foreground">Belum ada shift. Tambahkan shift kerja terlebih dahulu.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {shifts.map((s) => (
              <div key={s.id} className="rounded-xl border p-4">
                <div className="flex items-center justify-between">
                  <p className="font-medium">{s.name}</p>
                  {s.is_default && <Badge variant="outline">Default</Badge>}
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {s.start_time} – {s.end_time}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Toleransi terlambat: {formatNumber(s.late_tolerance_minutes)} menit
                  {s.allow_overtime && " • Lembur: aktif"}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <CreateShiftModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); void load() }} />
      <AssignShiftModal open={assignOpen} shifts={shifts} onClose={() => setAssignOpen(false)} onSaved={() => setAssignOpen(false)} />
    </Card>
  )
}

function CreateShiftModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ name: "", start_time: "08:00", end_time: "17:00", tolerance: "15" })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setError(null)
    if (!form.name.trim()) {
      setError("Nama shift wajib diisi")
      return
    }
    setSaving(true)
    try {
      await shiftsApi.create({
        name: form.name.trim(),
        start_time: form.start_time,
        end_time: form.end_time,
        late_tolerance_minutes: Number(form.tolerance) || 15,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan shift")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Tambah Shift"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </>
      }
    >
      {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="sh-name">Nama Shift *</Label>
          <Input id="sh-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Pagi / Siang / Malam" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sh-tol">Toleransi Terlambat (menit)</Label>
          <Input id="sh-tol" type="number" value={form.tolerance} onChange={(e) => setForm({ ...form, tolerance: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sh-start">Jam Mulai</Label>
          <Input id="sh-start" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="sh-end">Jam Selesai</Label>
          <Input id="sh-end" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
        </div>
      </div>
    </ModalShell>
  )
}

function AssignShiftModal({
  open,
  shifts,
  onClose,
  onSaved,
}: {
  open: boolean
  shifts: Shift[]
  onClose: () => void
  onSaved: () => void
}) {
  const [users, setUsers] = useState<User[]>([])
  const [userId, setUserId] = useState("")
  const [shiftId, setShiftId] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setUserId("")
    setShiftId("")
    setError(null)
    void usersApi.list().then((r) => setUsers(r.users ?? [])).catch(() => setUsers([]))
  }, [open])

  const handleSave = async () => {
    setError(null)
    if (!userId || !shiftId) {
      setError("Pilih karyawan dan shift")
      return
    }
    setSaving(true)
    try {
      await shiftsApi.assign({ user_id: Number(userId), shift_id: Number(shiftId) })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menetapkan jadwal")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Atur Jadwal Shift Karyawan"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </>
      }
    >
      {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="as-user">Karyawan *</Label>
          <select
            id="as-user"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">— Pilih karyawan —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="as-shift">Shift *</Label>
          <select
            id="as-shift"
            value={shiftId}
            onChange={(e) => setShiftId(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            <option value="">— Pilih shift —</option>
            {shifts.map((s) => (
              <option key={s.id} value={s.id}>{s.name} ({s.start_time}–{s.end_time})</option>
            ))}
          </select>
        </div>
      </div>
    </ModalShell>
  )
}

// ─── Tab: Izin / Cuti ────────────────────────────────────────────────────────

function LeaveTab() {
  const { hasPermission } = useAuth()
  const canApprove = hasPermission("leaves:approve")
  const [leaves, setLeaves] = useState<LeaveRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [pendingDecide, setPendingDecide] = useState<{ leave: LeaveRequest; approve: boolean } | null>(null)
  const [approving, setApproving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const resp = await leavesApi.list()
      setLeaves(resp.leaves ?? [])
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat izin")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async () => {
    if (!pendingDecide) return
    setApproving(true)
    setError(null)
    try {
      await leavesApi.decide(pendingDecide.leave.id, pendingDecide.approve)
      setPendingDecide(null)
      void load()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memproses")
    } finally {
      setApproving(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">Izin / Cuti</CardTitle>
          <CardDescription>Pengajuan izin, sakit, dan cuti karyawan.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <CalendarPlus className="h-4 w-4" /> Ajukan Izin
        </Button>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>
        )}
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Karyawan</TableHead>
              <TableHead>Jenis</TableHead>
              <TableHead>Tanggal</TableHead>
              <TableHead>Alasan</TableHead>
              <TableHead>Status</TableHead>
              {canApprove && <TableHead className="text-right">Aksi</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={canApprove ? 6 : 5} className="py-8 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : leaves.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canApprove ? 6 : 5} className="py-8 text-center text-muted-foreground">
                  Belum ada pengajuan izin/cuti.
                </TableCell>
              </TableRow>
            ) : (
              leaves.map((l) => (
                <TableRow key={l.id}>
                  <TableCell className="font-medium">{l.user?.name ?? "—"}</TableCell>
                  <TableCell>{LEAVE_TYPE_LABELS[l.type] ?? l.type}</TableCell>
                  <TableCell className="tabular-nums text-xs">
                    {l.start_date} → {l.end_date}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-48 truncate">
                    {l.reason || "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        l.status === "disetujui"
                          ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                          : l.status === "ditolak"
                          ? "bg-destructive/10 text-destructive border-destructive/20"
                          : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20"
                      }
                    >
                      {l.status === "disetujui" ? "Disetujui" : l.status === "ditolak" ? "Ditolak" : "Menunggu"}
                    </Badge>
                  </TableCell>
                  {canApprove && l.status === "menunggu" && (
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="outline" size="icon-sm" title="Setujui" disabled={approving} onClick={() => setPendingDecide({ leave: l, approve: true })}>
                          <Check className="h-3.5 w-3.5" />
                        </Button>
                        <Button variant="outline" size="icon-sm" title="Tolak" disabled={approving} className="text-destructive hover:text-destructive" onClick={() => setPendingDecide({ leave: l, approve: false })}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <CreateLeaveModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={() => { setCreateOpen(false); void load() }} />
      <ConfirmDialog
        open={!!pendingDecide}
        title={pendingDecide?.approve ? "Setujui pengajuan?" : "Tolak pengajuan?"}
        description={
          <>
            <b>{pendingDecide?.leave.user?.name}</b> mengajukan{" "}
            <b>{pendingDecide ? LEAVE_TYPE_LABELS[pendingDecide.leave.type] : ""}</b> pada{" "}
            {pendingDecide?.leave.start_date} → {pendingDecide?.leave.end_date}.
          </>
        }
        confirmLabel={pendingDecide?.approve ? "Setujui" : "Tolak"}
        destructive={!pendingDecide?.approve}
        onClose={(ok) => {
          setPendingDecide(null)
          if (ok) void decide()
        }}
      />
    </Card>
  )
}

function CreateLeaveModal({
  open,
  onClose,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState({ type: "izin", start: "", end: "", reason: "" })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setForm({ type: "izin", start: "", end: "", reason: "" })
      setError(null)
    }
  }, [open])

  const handleSave = async () => {
    setError(null)
    if (!form.start || !form.end) {
      setError("Tanggal mulai dan selesai wajib diisi")
      return
    }
    setSaving(true)
    try {
      await leavesApi.create({ type: form.type, start_date: form.start, end_date: form.end, reason: form.reason })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal mengajukan izin")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title="Ajukan Izin / Cuti"
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Ajukan
          </Button>
        </>
      }
    >
      {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="lv-type">Jenis</Label>
          <select
            id="lv-type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value })}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {Object.entries(LEAVE_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lv-start">Mulai</Label>
            <Input id="lv-start" type="date" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lv-end">Selesai</Label>
            <Input id="lv-end" type="date" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="lv-reason">Alasan</Label>
        <textarea
          id="lv-reason"
          rows={3}
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
          placeholder="Alasan pengajuan izin/cuti..."
          className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm"
        />
      </div>
    </ModalShell>
  )
}
// ─── Modal input absensi manual (admin) ───────────────────────────────────────

function ManualInputModal({
  open,
  edit,
  users,
  today,
  onClose,
  onSaved,
}: {
  open: boolean
  edit: AttendanceDay | null
  users: User[]
  today: string
  onClose: () => void
  onSaved: () => void
}) {
  const [userId, setUserId] = useState("")
  const [date, setDate] = useState(today)
  const [status, setStatus] = useState("hadir")
  const [checkIn, setCheckIn] = useState("08:00")
  const [checkOut, setCheckOut] = useState("17:00")
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setUserId(edit ? String(edit.user_id) : "")
    setDate(edit?.date ?? today)
    setStatus(edit?.status ?? "hadir")
    setCheckIn(edit?.check_in_at ? new Date(edit.check_in_at).toTimeString().slice(0, 5) : "08:00")
    setCheckOut(edit?.check_out_at ? new Date(edit.check_out_at).toTimeString().slice(0, 5) : "17:00")
    setNote(edit?.note ?? "")
    setError(null)
  }, [open, edit, today])

  const handleSave = async () => {
    setError(null)
    if (!userId) {
      setError("Pilih karyawan")
      return
    }
    setSaving(true)
    try {
      await attendanceApi.upsert({
        user_id: Number(userId),
        date,
        status,
        check_in_time: checkIn || undefined,
        check_out_time: checkOut || undefined,
        note: note || undefined,
      })
      onSaved()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan")
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={edit ? "Edit Absensi" : "Input Absensi Manual"}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Simpan
          </Button>
        </>
      }
    >
      {error && <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="mi-user">Karyawan *</Label>
          <select
            id="mi-user"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
            disabled={!!edit}
          >
            <option value="">— Pilih karyawan —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mi-date">Tanggal *</Label>
          <Input id="mi-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="mi-status">Status</Label>
          <select
            id="mi-status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm"
          >
            {Object.entries(ATTENDANCE_STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="mi-in">Masuk</Label>
            <Input id="mi-in" type="time" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mi-out">Keluar</Label>
            <Input id="mi-out" type="time" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="mi-note">Keterangan</Label>
        <Input id="mi-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Catatan (opsional)" />
      </div>
    </ModalShell>
  )
}
