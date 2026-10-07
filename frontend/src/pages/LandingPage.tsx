import { Link } from "react-router"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/context/AuthContext"
import {
  ArrowRight,
  BookOpen,
  Menu,
  X,
  Tags,
  Receipt,
  FileBarChart,
  ShieldCheck,
  Star,
  Wallet,
  Sparkles,
  Layers,
  LineChart,
  Tv,
} from "lucide-react"
import { useState } from "react"
import { authApi } from "@/lib/api"

// Daftar langsung lewat Google: satu klik ke halaman akun Google, tanpa
// melewati form di /register. Akun baru tetap otomatis dibuat di callback
// backend dan pemiliknya langsung jadi Admin masjid.
function startGoogleSignup() {
  window.location.href = authApi.googleAuthUrl()
}

/** Logo Google untuk menandai tombol yang memakai akun Google. */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M21.35 11.1H12v3.2h5.36c-.45 2.28-2.46 3.6-5.36 3.6-3.2 0-5.8-2.6-5.8-5.8s2.6-5.8 5.8-5.8c1.5 0 2.9.55 3.97 1.46l2.4-2.4A9.1 9.1 0 0 0 12 3.2c-4.9 0-8.8 3.9-8.8 8.8s3.9 8.8 8.8 8.8c5.1 0 8.4-3.6 8.4-8.8 0-.6-.05-1.1-.15-1.5z" />
    </svg>
  )
}

const navLinks = [
  { href: "#fitur", label: "Fitur" },
  { href: "#cara-kerja", label: "Cara Kerja" },
  { href: "#faq", label: "FAQ" },
]

const features = [
  {
    icon: Tv,
    title: "Public Display (Layar TV Masjid)",
    description:
      "Tampilan layar TV masjid modern: jam digital, jadwal 5 waktu sholat & hitung mundur, petugas Jumat, dan transparansi kas.",
  },
  {
    icon: BookOpen,
    title: "Buku Catatan Kas",
    description:
      "Setiap kegiatan punya buku kas terpisah: pembangunan, operasional, Ramadan, kajian — laporan tidak tercampur.",
  },
  {
    icon: Tags,
    title: "Kategori Pemasukan & Pengeluaran",
    description:
      "Kelompokkan donasi, kotak amal, listrik, air, dan kegiatan lain agar laporan mudah dibaca jamaah.",
  },
  {
    icon: Receipt,
    title: "Input Pemasukan & Pengeluaran",
    description:
      "Bendahara cukup masukkan transaksi harian — saldo kas masjid otomatis ter-update setiap saat.",
  },
  {
    icon: FileBarChart,
    title: "Laporan Bulanan, Kategori & Mingguan",
    description:
      "Laporan kas otomatis: bulanan dengan saldo awal/akhir, rekap per kategori, dan rekap per pekan.",
  },
  {
    icon: Wallet,
    title: "Transparansi untuk Jamaah",
    description:
      "Laporan bisa dipantau pengurus dan jamaah, meningkatkan kepercayaan terhadap dana infak masjid.",
  },
  {
    icon: ShieldCheck,
    title: "Multi-Peran & Aman",
    description:
      "Admin, bendahara, dan jamaah — setiap peran punya akses yang tepat. Data aman & ter-audit.",
  },
]

const steps = [
  {
    icon: Sparkles,
    step: "01",
    title: "Daftar Gratis",
    description:
      "Buat akun, dan Anda otomatis menjadi Admin masjid Anda. Tidak perlu kartu kredit.",
  },
  {
    icon: Layers,
    step: "02",
    title: "Atur Buku & Kategori",
    description:
      "Buat buku kas per kegiatan dan kategori pemasukan/pengeluaran sesuai kebutuhan masjid.",
  },
  {
    icon: LineChart,
    step: "03",
    title: "Catat & Pantau",
    description:
      "Input transaksi rutin, dan laporan kas otomatis tersaji setiap saat untuk jamaah.",
  },
]

const testimonials = [
  {
    name: "Ust. Ahmad Fauzi",
    role: "Ketua DKM — Masjid Ar-Rahman",
    quote:
      "Laporan kas bulanan yang dulu harus disusun manual sekarang otomatis. Jamaah makin percaya karena bisa lihat laporan langsung.",
    stars: 5,
  },
  {
    name: "Hj. Siti Maryam",
    role: "Bendahara — Masjid Al-Ikhlas",
    quote:
      "Catat kotak amal dan pengeluaran harian hanya butuh hitungan detik. Saldo kas selalu akurat dan mudah dicek.",
    stars: 5,
  },
  {
    name: "Bpk. Abdul Karim",
    role: "Sekretaris — Mushalla An-Nur",
    quote:
      "Buku kas pembangunan terpisah dari operasional membuat laporan kegiatan jauh lebih rapi dan jelas.",
    stars: 5,
  },
]

const faqs = [
  {
    q: "Apakah data keuangan masjid kami aman?",
    a: "Ya. Setiap masjid memiliki ruang data sendiri, semua akses dilindungi login, dan setiap perubahan penting tercatat (audit trail).",
  },
  {
    q: "Apakah bisa dipakai di banyak perangkat sekaligus?",
    a: "Bisa. Karena berbasis web, pengurus dan bendahara bisa memakainya dari laptop, tablet, atau HP secara bersamaan.",
  },
  {
    q: "Apakah cocok untuk mushalla kecil?",
    a: "Sangat cocok. Cukup satu buku kas pun bisa langsung dipakai. Buku tambahan bisa dibuat kapan saja saat kegiatan bertambah.",
  },
]

export default function LandingPage() {
  const { isAuthenticated } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(0)

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* ─── Navigation ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <BookOpen className="h-4.5 w-4.5" />
            </span>
            <span>
              Masjid<span className="text-primary">Hub</span>
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-7">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {l.label}
              </a>
            ))}
            {/* Layar TV hanya tampil saat SUDAH login (akses display
                terikat akun admin masjid, sesuai aturan multi-tenant). */}
            {isAuthenticated && (
              <Link
                to="/display"
                className="text-sm font-medium text-emerald-600 hover:text-emerald-500 transition-colors flex items-center gap-1.5"
              >
                <Tv className="h-4 w-4" />
                Layar TV
              </Link>
            )}
          </nav>

          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <Link to="/admin">
                <Button>Buka Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost">Masuk</Button>
                </Link>
                <Button className="gap-2" onClick={startGoogleSignup}>
                  <GoogleIcon className="h-4 w-4" />
                  Daftar Gratis
                </Button>
              </>
            )}
          </div>

          {/* Mobile toggle */}
          <button
            className="md:hidden"
            aria-label="Menu"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t bg-background px-4 py-4 space-y-2">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="block py-2 text-sm text-muted-foreground hover:text-foreground"
                onClick={() => setMobileMenuOpen(false)}
              >
                {l.label}
              </a>
            ))}
            {/* Layar TV hanya tampil saat SUDAH login (mobile). */}
            {isAuthenticated && (
              <Link
                to="/display"
                className="flex items-center gap-2 py-2 text-sm font-medium text-emerald-600 hover:text-emerald-500"
                onClick={() => setMobileMenuOpen(false)}
              >
                <Tv className="h-4 w-4" />
                Layar TV
              </Link>
            )}
            <div className="flex flex-col gap-2 pt-2">
              {isAuthenticated ? (
                <Link to="/admin" onClick={() => setMobileMenuOpen(false)}>
                  <Button className="w-full">Buka Dashboard</Button>
                </Link>
              ) : (
                <>
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)}>
                    <Button variant="outline" className="w-full">Masuk</Button>
                  </Link>
                  <Button
                    className="w-full gap-2"
                    onClick={() => {
                      setMobileMenuOpen(false)
                      startGoogleSignup()
                    }}
                  >
                    <GoogleIcon className="h-4 w-4" />
                    Daftar Gratis
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* ─── Hero ───────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-primary/5" />
        <div className="pointer-events-none absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-20 sm:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <Badge variant="outline" className="mb-6 px-3 py-1 text-xs">
              <Sparkles className="mr-1.5 h-3 w-3 text-primary" />
              Sistem keuangan masjid berbasis cloud
            </Badge>
            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl leading-tight">
              Kelola Kas Masjid{" "}
              <span className="bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
                Transparan
              </span>
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              Dari buku catatan kas, kategori, transaksi harian, hingga laporan
              bulanan — semua dalam satu aplikasi web yang bisa diakses dari
              mana saja. Tingkatkan kepercayaan jamaah dengan laporan yang
              terbuka.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" className="gap-2" onClick={startGoogleSignup}>
                <GoogleIcon className="h-4 w-4" />
                Coba Gratis Sekarang <ArrowRight className="h-4 w-4" />
              </Button>
              <a href="#fitur">
                <Button variant="outline" size="lg">
                  Lihat Fitur
                </Button>
              </a>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Tanpa kartu kredit • Setup 5 menit • Untuk masjid & mushalla
            </p>
          </div>

          {/* Hero mockup */}
          <div className="mx-auto mt-16 max-w-5xl">
            <div className="rounded-2xl border bg-card p-2 shadow-2xl shadow-primary/5">
              <div className="flex items-center gap-1.5 border-b px-4 py-2.5">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                <span className="ml-3 rounded bg-muted px-3 py-0.5 text-[10px] text-muted-foreground">
                  masjidhub.app/dashboard
                </span>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-4">
                {[
                  { label: "Saldo Kas", value: "Rp 84.500.000", icon: Wallet, tone: "text-primary" },
                  { label: "Pemasukan Bulan Ini", value: "Rp 12.300.000", icon: BookOpen, tone: "text-emerald-600 dark:text-emerald-400" },
                  { label: "Pengeluaran Bulan Ini", value: "Rp 6.750.000", icon: Receipt, tone: "text-rose-600 dark:text-rose-400" },
                  { label: "Buku Kas Aktif", value: "4", icon: FileBarChart, tone: "text-blue-600 dark:text-blue-400" },
                ].map((s) => (
                  <div key={s.label} className="rounded-xl border bg-muted/30 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted-foreground">{s.label}</p>
                      <s.icon className={`h-4 w-4 ${s.tone}`} />
                    </div>
                    <p className="mt-2 text-lg font-bold tabular-nums">{s.value}</p>
                  </div>
                ))}
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                <div className="rounded-xl border p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Transaksi Terakhir</p>
                  <div className="space-y-2">
                    {[
                      { d: "Donasi pembangunan", t: "+ Rp 2.500.000", in: true },
                      { d: "Pembayaran listrik", t: "− Rp 450.000", in: false },
                      { d: "Kotak amal Jumat", t: "+ Rp 1.150.000", in: true },
                    ].map((r, i) => (
                      <div key={i} className="flex items-center justify-between rounded-lg bg-muted/40 px-3 py-2 text-xs">
                        <p className="font-medium">{r.d}</p>
                        <span
                          className={`font-semibold tabular-nums ${
                            r.in
                              ? "text-emerald-600 dark:text-emerald-400"
                              : "text-rose-600 dark:text-rose-400"
                          }`}
                        >
                          {r.t}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="rounded-xl border p-4">
                  <p className="mb-3 text-xs font-medium text-muted-foreground">Pemasukan Mingguan</p>
                  <div className="flex h-24 items-end gap-2">
                    {[40, 65, 50, 80, 60, 90, 75].map((h, i) => (
                      <div key={i} className="flex-1 rounded-t bg-primary/70" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                    <span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Stats bar ───────────────────────────────────────────────── */}
      <section className="border-y bg-muted/30">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-6 px-4 py-10 sm:px-6 lg:grid-cols-4 lg:px-8">
          {[
            { v: "500+", l: "Masjid & mushalla" },
            { v: "50rb+", l: "Transaksi tercatat" },
            { v: "99,9%", l: "Waktu aktif server" },
            { v: "4.8/5", l: "Rating pengguna" },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <p className="text-2xl font-bold sm:text-3xl">{s.v}</p>
              <p className="mt-1 text-xs text-muted-foreground sm:text-sm">{s.l}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Features ────────────────────────────────────────────────── */}
      <section id="fitur" className="py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-14">
            <Badge variant="outline" className="mb-4 text-xs">Fitur Lengkap</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Semua yang masjid butuhkan, dalam satu aplikasi
            </h2>
            <p className="mt-4 text-muted-foreground">
              Tidak perlu catatan manual atau aplikasi terpisah. Buku kas,
              transaksi, dan laporan tersambung otomatis.
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-xl border bg-card p-6 transition-all hover:shadow-lg hover:-translate-y-0.5"
              >
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ────────────────────────────────────────────── */}
      <section id="cara-kerja" className="border-t bg-muted/30 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-14">
            <Badge variant="outline" className="mb-4 text-xs">Cara Kerja</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Mulai dalam 3 langkah mudah
            </h2>
          </div>
          <div className="grid gap-8 md:grid-cols-3">
            {steps.map((s) => (
              <div key={s.step} className="relative rounded-xl border bg-card p-6">
                <span className="absolute right-5 top-4 text-4xl font-bold text-primary/10">
                  {s.step}
                </span>
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <s.icon className="h-5 w-5" />
                </div>
                <h3 className="font-semibold mb-2">{s.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {s.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Testimonials ────────────────────────────────────────────── */}
      <section className="border-t bg-muted/30 py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center mb-14">
            <Badge variant="outline" className="mb-4 text-xs">Testimoni</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Dipercaya pengurus masjid
            </h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <div key={t.name} className="rounded-xl border bg-card p-6">
                <div className="flex gap-0.5 mb-4">
                  {Array.from({ length: t.stars }).map((_, i) => (
                    <Star key={i} className="h-4 w-4 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  "{t.quote}"
                </p>
                <div className="mt-5 border-t pt-4">
                  <p className="font-semibold text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">{t.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ─────────────────────────────────────────────────────── */}
      <section id="faq" className="py-20 sm:py-24">
        <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <Badge variant="outline" className="mb-4 text-xs">FAQ</Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Pertanyaan yang sering diajukan
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((f, i) => {
              const open = openFaq === i
              return (
                <div key={i} className="rounded-xl border bg-card overflow-hidden">
                  <button
                    className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium"
                    onClick={() => setOpenFaq(open ? null : i)}
                  >
                    {f.q}
                    <span className={`ml-4 text-muted-foreground transition-transform ${open ? "rotate-45" : ""}`}>
                      +
                    </span>
                  </button>
                  {open && (
                    <p className="px-5 pb-4 text-sm text-muted-foreground leading-relaxed">
                      {f.a}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ───────────────────────────────────────────────── */}
      <section className="border-t py-20">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-14 text-center text-primary-foreground">
            <div className="pointer-events-none absolute -top-20 right-0 h-56 w-56 rounded-full bg-white/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-20 left-0 h-56 w-56 rounded-full bg-black/10 blur-3xl" />
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
              Wujudkan transparansi kas masjid
            </h2>
            <p className="relative mx-auto mt-4 max-w-xl text-primary-foreground/90">
              Bergabunglah dengan ratusan masjid & mushalla yang laporannya
              rapi, terbuka, dan dipercaya jamaah. Gratis untuk memulai.
            </p>
            <div className="relative mt-8 flex flex-wrap justify-center gap-4">
              <Button
                size="lg"
                variant="secondary"
                className="gap-2"
                onClick={startGoogleSignup}
              >
                <GoogleIcon className="h-4 w-4" />
                Daftar Gratis <ArrowRight className="h-4 w-4" />
              </Button>
              <a href="#fitur">
                <Button
                  size="lg"
                  variant="outline"
                  className="border-white/40 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
                >
                  Pelajari Fitur
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Footer ──────────────────────────────────────────────────── */}
      <footer className="border-t py-10">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-6 sm:flex-row">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <BookOpen className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold">
                Masjid<span className="text-primary">Hub</span>
              </span>
            </div>
            <nav className="flex flex-wrap justify-center gap-6 text-sm text-muted-foreground">
              {navLinks.map((l) => (
                <a key={l.href} href={l.href} className="hover:text-foreground transition-colors">
                  {l.label}
                </a>
              ))}
            </nav>
            <div className="flex gap-6 text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground transition-colors">Privasi</a>
              <a href="#" className="hover:text-foreground transition-colors">Ketentuan</a>
              <a href="#" className="hover:text-foreground transition-colors">Kontak</a>
            </div>
          </div>
          <p className="mt-8 text-center text-xs text-muted-foreground/70">
            © {new Date().getFullYear()} MasjidHub. Semua hak dilindungi.
          </p>
        </div>
      </footer>
    </div>
  )
}
