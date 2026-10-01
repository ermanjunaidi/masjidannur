import { useState, useEffect, useMemo } from "react"
import { Link, useParams } from "react-router"
import {
  Maximize2,
  Minimize2,
  Clock,
  Calendar,
  Wallet,
  TrendingUp,
  TrendingDown,
  Volume2,
  VolumeX,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  Sparkles,
  BookOpen,
  Users,
  Mic,
  Home,
} from "lucide-react"
import { publicApi, masjidSettingsApi } from "@/lib/api"
import type { PublicDisplayData, Lecturing } from "@/lib/types"
import { formatRupiah } from "@/lib/types"
import { calculatePrayerTimes, getHijriDate } from "@/lib/prayerTimes"

export default function PublicDisplayPage() {
  const { slug: slugParam } = useParams<{ slug?: string }>()
  // Resolve the slug for the LOGGED-IN admin's masjid (via
  // /api/masjid-settings) so the TV always shows THEIR masjid, not the
  // first tenant row in the database. Anonymous visitors (TV in kiosk
  // mode) either use the URL slug or fall back to the server default.
  const [slug, setSlug] = useState<string | undefined>(slugParam)
  useEffect(() => {
    if (slugParam) {
      setSlug(slugParam)
      return
    }
    let cancelled = false
    masjidSettingsApi
      .get()
      .then((settings) => {
        if (!cancelled && settings?.slug) setSlug(settings.slug)
      })
      .catch(() => {
        // Not logged in (public kiosk) — keep server-side default.
      })
    return () => {
      cancelled = true
    }
  }, [slugParam])
  const [data, setData] = useState<PublicDisplayData | null>(null)
  const [now, setNow] = useState(new Date())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [activeSlide, setActiveSlide] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(false)
  const [theme, setTheme] = useState<"emerald" | "midnight" | "royal">("emerald")

  // Fetch public display data
  const fetchData = async () => {
    try {
      const res = await publicApi.getDisplay(slug)
      setData(res)
    } catch (err) {
      console.error("Gagal memuat data display:", err)
    }
  }

  useEffect(() => {
    fetchData()
    const dataInterval = setInterval(fetchData, 60000) // refresh every 60s
    return () => clearInterval(dataInterval)
  }, [slug])

  // Clock ticker every second
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Calculate prayer times for today
  const prayerTimesMap = useMemo(() => {
    const lat = data?.masjid?.latitude || -6.2
    const lng = data?.masjid?.longitude || 106.816666
    return calculatePrayerTimes(now, lat, lng)
  }, [now.getDate(), now.getMonth(), now.getFullYear(), data?.masjid?.latitude, data?.masjid?.longitude])

  const prayerList = useMemo(() => {
    const list = [
      { key: "imsak", label: "Imsak", time: prayerTimesMap.imsak },
      { key: "subuh", label: "Subuh", time: prayerTimesMap.subuh },
      { key: "terbit", label: "Terbit", time: prayerTimesMap.terbit },
      { key: "dzuhur", label: "Dzuhur", time: prayerTimesMap.dzuhur },
      { key: "ashar", label: "Ashar", time: prayerTimesMap.ashar },
      { key: "maghrib", label: "Maghrib", time: prayerTimesMap.maghrib },
      { key: "isya", label: "Isya", time: prayerTimesMap.isya },
    ]

    const curHour = now.getHours()
    const curMin = now.getMinutes()
    const curSec = now.getSeconds()
    const curTotalSec = curHour * 3600 + curMin * 60 + curSec

    let nextIdx = -1
    for (let i = 0; i < list.length; i++) {
      const [ph, pm] = list[i].time.split(":").map(Number)
      const pTotalSec = ph * 3600 + pm * 60
      if (pTotalSec > curTotalSec) {
        nextIdx = i
        break
      }
    }
    if (nextIdx === -1) {
      nextIdx = 0 // wraps to Imsak/Subuh next day
    }

    return list.map((item, idx) => ({
      ...item,
      isNext: idx === nextIdx,
    }))
  }, [prayerTimesMap, now])

  // Next prayer item & countdown
  const nextPrayer = useMemo(() => {
    const next = prayerList.find((p) => p.isNext) || prayerList[0]
    const [ph, pm] = next.time.split(":").map(Number)
    const target = new Date(now)
    target.setHours(ph, pm, 0, 0)
    if (target.getTime() <= now.getTime()) {
      target.setDate(target.getDate() + 1)
    }
    const diffSec = Math.max(0, Math.floor((target.getTime() - now.getTime()) / 1000))
    const h = Math.floor(diffSec / 3600)
    const m = Math.floor((diffSec % 3600) / 60)
    const s = diffSec % 60
    const countdown = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`

    return {
      name: next.label,
      time: next.time,
      countdown,
      isImminent: diffSec <= 600, // within 10 min
    }
  }, [prayerList, now])

  // Sound beep on prayer time match
  useEffect(() => {
    if (!audioEnabled) return
    const curTimeStr = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`
    const isMatching = prayerList.some((p) => p.time === curTimeStr && now.getSeconds() === 0)
    if (isMatching) {
      try {
        const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
        const osc = audioCtx.createOscillator()
        const gain = audioCtx.createGain()
        osc.connect(gain)
        gain.connect(audioCtx.destination)
        osc.frequency.setValueAtTime(800, audioCtx.currentTime)
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime)
        osc.start()
        osc.stop(audioCtx.currentTime + 1.5)
      } catch {
        // audio context blocked by browser policy
      }
    }
  }, [now.getMinutes(), now.getSeconds(), audioEnabled, prayerList])

  // Separate friday vs public lecturings
  const fridayLecturings = useMemo(() => {
    return data?.lecturings?.filter((l) => l.audience === "friday") || []
  }, [data])

  const routineLecturings = useMemo(() => {
    return data?.lecturings?.filter((l) => l.audience !== "friday") || []
  }, [data])

  // Slides configuration
  const totalSlides = 4
  useEffect(() => {
    if (isPaused) return
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % totalSlides)
    }, 9000)
    return () => clearInterval(timer)
  }, [isPaused, totalSlides])

  // Fullscreen handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      document.exitFullscreen().catch(() => {})
      setIsFullscreen(false)
    }
  }

  // Theme palettes
  const themeStyles = {
    emerald: {
      bg: "bg-slate-950",
      card: "bg-emerald-950/40 border-emerald-500/20 backdrop-blur-md",
      accent: "text-emerald-400",
      accentBg: "bg-emerald-500",
      glow: "shadow-[0_0_25px_rgba(16,185,129,0.15)]",
      activePrayer: "bg-emerald-500/25 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] text-emerald-200",
      gradient: "from-emerald-900/30 via-slate-900/80 to-slate-950",
    },
    midnight: {
      bg: "bg-zinc-950",
      card: "bg-zinc-900/70 border-zinc-700/40 backdrop-blur-md",
      accent: "text-amber-400",
      accentBg: "bg-amber-500",
      glow: "shadow-[0_0_25px_rgba(251,191,36,0.12)]",
      activePrayer: "bg-amber-500/20 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.3)] text-amber-200",
      gradient: "from-amber-950/20 via-zinc-900/80 to-zinc-950",
    },
    royal: {
      bg: "bg-slate-950",
      card: "bg-sky-950/40 border-sky-500/20 backdrop-blur-md",
      accent: "text-sky-400",
      accentBg: "bg-sky-500",
      glow: "shadow-[0_0_25px_rgba(56,189,248,0.15)]",
      activePrayer: "bg-sky-500/25 border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.4)] text-sky-200",
      gradient: "from-sky-900/30 via-slate-900/80 to-slate-950",
    },
  }[theme]

  const formattedDateMasehi = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(now)

  const formattedTime = now.toLocaleTimeString("id-ID", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })

  const hijriDate = getHijriDate(now)

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between select-none text-white ${themeStyles.bg} bg-gradient-to-b ${themeStyles.gradient} p-4 md:p-6 overflow-hidden`}
    >
      {/* ─── HEADER: MASJID INFO & FINANCIAL BADGE ─────────────────────── */}
      <header className="flex flex-col md:flex-row items-center justify-between gap-4 border-b border-white/10 pb-4">
        {/* Left: Masjid Brand */}
        <div className="flex items-center gap-4 text-center md:text-left">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg shadow-emerald-500/20 ring-2 ring-white/20">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white drop-shadow">
              {data?.masjid.name || "Masjid Annur"}
            </h1>
            <p className="text-xs md:text-sm text-slate-400 line-clamp-1">
              {data?.masjid.address || "Jl. Masjid No. 1, Indonesia"}
            </p>
          </div>
        </div>

        {/* Right: Financial Transparency Bar */}
        <div className="flex items-center gap-2 md:gap-4 overflow-x-auto max-w-full">
          <div className={`px-4 py-2 rounded-xl border ${themeStyles.card} flex items-center gap-3`}>
            <div className="p-2 rounded-lg bg-emerald-500/20 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Pemasukan Bulan Ini</p>
              <p className="text-sm md:text-base font-bold text-emerald-400">
                {formatRupiah(data?.finance.income || 0)}
              </p>
            </div>
          </div>

          <div className={`px-4 py-2 rounded-xl border ${themeStyles.card} flex items-center gap-3`}>
            <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400">
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-400">Pengeluaran Bulan Ini</p>
              <p className="text-sm md:text-base font-bold text-rose-400">
                {formatRupiah(data?.finance.expense || 0)}
              </p>
            </div>
          </div>

          <div className={`px-4 py-2 rounded-xl border ${themeStyles.card} ${themeStyles.glow} flex items-center gap-3 bg-emerald-950/60 ring-1 ring-emerald-500/30`}>
            <div className="p-2 rounded-lg bg-amber-500/20 text-amber-400">
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] uppercase font-semibold text-slate-300">Saldo Kas Masjid</p>
              <p className="text-sm md:text-base font-bold text-amber-300">
                {formatRupiah(data?.finance.current_cash || 0)}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* ─── MAIN CONTENT: CLOCK + CAROUSEL ────────────────────────────── */}
      <main className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-auto py-4">
        {/* Left Column (4 cols): Digital Clock & Next Prayer Countdown */}
        <section className="lg:col-span-4 flex flex-col gap-4 justify-between">
          {/* Giant Real-time Clock */}
          <div className={`p-6 rounded-3xl border ${themeStyles.card} ${themeStyles.glow} text-center flex flex-col justify-center items-center relative overflow-hidden`}>
            <div className="flex items-center gap-2 text-xs md:text-sm font-medium text-slate-400 mb-1">
              <Calendar className="w-4 h-4 text-emerald-400" />
              <span>{formattedDateMasehi}</span>
            </div>
            <div className="text-sm md:text-base font-semibold text-emerald-400/90 mb-3 tracking-wide">
              {hijriDate}
            </div>

            <div className="font-mono text-5xl md:text-6xl 2xl:text-7xl font-extrabold tracking-wider text-white drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]">
              {formattedTime}
            </div>
            <div className="text-[11px] uppercase tracking-widest text-slate-500 mt-2">
              Waktu Indonesia Barat (WIB)
            </div>
          </div>

          {/* Next Prayer Countdown Card */}
          <div
            className={`p-5 rounded-3xl border transition-all duration-300 ${
              nextPrayer.isImminent
                ? "bg-rose-950/50 border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.3)] animate-pulse"
                : `${themeStyles.card} ${themeStyles.glow}`
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-amber-400" />
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Menuju Waktu Sholat
                </span>
              </div>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {nextPrayer.name} ({nextPrayer.time})
              </span>
            </div>

            <div className="text-center py-2">
              <div className="font-mono text-3xl md:text-4xl font-bold text-amber-400 tracking-tight">
                - {nextPrayer.countdown}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Persiapkan diri untuk mengambil wudhu dan sholat berjamaah
              </p>
            </div>
          </div>

          {/* Running Message / Donation Info */}
          <div className={`p-4 rounded-2xl border ${themeStyles.card} flex items-center gap-3 text-xs text-slate-300`}>
            <div className="p-2 rounded-xl bg-white/5 text-emerald-400 shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <p className="line-clamp-2 leading-relaxed">
              {data?.masjid.report_footer ||
                "Mari makmurkan masjid dengan shalat berjamaah dan menjaga kebersihan rumah Allah."}
            </p>
          </div>
        </section>

        {/* Right Column (8 cols): Slideshow Carousel */}
        <section className="lg:col-span-8 flex flex-col">
          <div className={`flex-1 min-h-[380px] p-6 rounded-3xl border ${themeStyles.card} ${themeStyles.glow} relative flex flex-col justify-between overflow-hidden`}>
            {/* Slide Header Indicator */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${themeStyles.accentBg} animate-ping`} />
                <span className="text-xs md:text-sm font-bold uppercase tracking-widest text-slate-300">
                  {activeSlide === 0 && "Jadwal Sholat Jumat"}
                  {activeSlide === 1 && "Jadwal Pengajian Rutin"}
                  {activeSlide === 2 && "Transparansi Kas Masjid"}
                  {activeSlide === 3 && "Adab & Mutiara Hikmah"}
                </span>
              </div>

              {/* Progress Tabs */}
              <div className="flex items-center gap-1.5">
                {[0, 1, 2, 3].map((idx) => (
                  <button
                    key={idx}
                    onClick={() => setActiveSlide(idx)}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      activeSlide === idx ? `w-8 ${themeStyles.accentBg}` : "w-2 bg-white/20 hover:bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* ─── SLIDE 0: KHATIB JUMAT ─── */}
            {activeSlide === 0 && (
              <div className="flex-1 flex flex-col justify-center animate-in fade-in duration-500">
                {fridayLecturings.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-center mb-4">
                      <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Jumat Pekan Ini • {fridayLecturings[0].date}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <p className="text-xs uppercase font-semibold text-slate-400 mb-1">Khatib</p>
                        <p className="text-base md:text-lg font-bold text-emerald-400">
                          {fridayLecturings[0].lecturer_name || "-"}
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <p className="text-xs uppercase font-semibold text-slate-400 mb-1">Imam</p>
                        <p className="text-base md:text-lg font-bold text-sky-400">
                          {fridayLecturings[0].imam_name || fridayLecturings[0].lecturer_name || "-"}
                        </p>
                      </div>

                      <div className="p-4 rounded-2xl bg-white/5 border border-white/10 text-center">
                        <p className="text-xs uppercase font-semibold text-slate-400 mb-1">Muadzin / Bilal</p>
                        <p className="text-base md:text-lg font-bold text-amber-400">
                          {fridayLecturings[0].muadzin_name || "-"}
                        </p>
                      </div>
                    </div>

                    {fridayLecturings[0].title && (
                      <div className="mt-4 p-4 rounded-2xl bg-white/5 text-center">
                        <p className="text-xs text-slate-400">Tema Khutbah</p>
                        <p className="text-sm md:text-base font-semibold text-white">
                          "{fridayLecturings[0].title}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-400" />
                    <p className="text-base font-medium">Jadwal Khatib Jumat Segera Diperbarui</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Silakan hubungi pengurus DKM untuk jadwal terbaru
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ─── SLIDE 1: PENGAJIAN RUTIN ─── */}
            {activeSlide === 1 && (
              <div className="flex-1 flex flex-col justify-center animate-in fade-in duration-500">
                {routineLecturings.length > 0 ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {routineLecturings.slice(0, 4).map((lec: Lecturing) => (
                      <div
                        key={lec.id}
                        className="p-4 rounded-2xl bg-white/5 border border-white/10 flex flex-col justify-between"
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                            <span>{lec.date}</span>
                            <span className="font-semibold text-emerald-400">
                              {lec.time_text || `${lec.start_time || ""} WIB`}
                            </span>
                          </div>
                          <h4 className="text-base font-bold text-white line-clamp-1">
                            {lec.title || lec.book_title || "Kajian Rutin"}
                          </h4>
                          <p className="text-xs text-slate-300 line-clamp-1 mt-1">
                            Pemateri: <span className="font-semibold text-amber-300">{lec.lecturer_name}</span>
                          </p>
                        </div>
                        {lec.book_title && (
                          <div className="text-[11px] text-slate-400 mt-2 italic">
                            Kitab: {lec.book_title}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30 text-emerald-400" />
                    <p className="text-base font-medium">Tidak ada jadwal pengajian terdekat</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Kajian rutin diadakan setiap pekan ba'da Maghrib & Subuh
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* ─── SLIDE 2: TRANSPARANSI KAS TERKINI ─── */}
            {activeSlide === 2 && (
              <div className="flex-1 flex flex-col justify-center animate-in fade-in duration-500">
                <div className="space-y-3">
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">
                    Catatan Transaksi Kas Terakhir
                  </p>
                  <div className="space-y-2">
                    {data?.recent_transactions && data.recent_transactions.length > 0 ? (
                      data.recent_transactions.slice(0, 4).map((tx) => (
                        <div
                          key={tx.id}
                          className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 text-xs md:text-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                tx.type === "pemasukan" ? "bg-emerald-400" : "bg-rose-400"
                              }`}
                            />
                            <div>
                              <p className="font-semibold text-white line-clamp-1">
                                {tx.description || tx.partner_name || "Transaksi Kas"}
                              </p>
                              <p className="text-[11px] text-slate-400">{tx.date}</p>
                            </div>
                          </div>
                          <span
                            className={`font-mono font-bold ${
                              tx.type === "pemasukan" ? "text-emerald-400" : "text-rose-400"
                            }`}
                          >
                            {tx.type === "pemasukan" ? "+" : "-"} {formatRupiah(tx.amount)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        Belum ada transaksi tercatat bulan ini
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ─── SLIDE 3: ADAB & HADITS ─── */}
            {activeSlide === 3 && (
              <div className="flex-1 flex flex-col justify-center text-center p-4 animate-in fade-in duration-500">
                <p className="text-xs uppercase font-bold tracking-widest text-emerald-400 mb-2">
                  Adab Masuk Masjid & Berjamaah
                </p>
                <blockquote className="text-lg md:text-xl font-serif italic text-slate-200 max-w-2xl mx-auto leading-relaxed mb-4">
                  "Barangsiapa membangun masjid karena Allah, maka Allah akan membangunkan baginya semisal itu di surga."
                </blockquote>
                <p className="text-xs text-slate-400 font-medium">
                  (HR. Bukhari no. 450 & Muslim no. 533)
                </p>
                <div className="flex items-center justify-center gap-4 mt-6 text-xs text-slate-400">
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    📱 Harap Nonaktifkan HP
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    🧹 Jaga Kebersihan Masjid
                  </span>
                  <span className="px-3 py-1 rounded-full bg-white/5 border border-white/10">
                    👥 Luruskan & Rapatkan Shaf
                  </span>
                </div>
              </div>
            )}

            {/* Bottom Controls inside Card */}
            <div className="flex items-center justify-between pt-3 border-t border-white/10 mt-4 text-xs text-slate-400">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveSlide((prev) => (prev - 1 + totalSlides) % totalSlides)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white"
                  title="Slide Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white"
                  title={isPaused ? "Lanjutkan Slide" : "Jeda Slide"}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setActiveSlide((prev) => (prev + 1) % totalSlides)}
                  className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-white"
                  title="Slide Selanjutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span>Tema Tampilan:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setTheme("emerald")}
                    className={`w-4 h-4 rounded-full bg-emerald-500 ring-2 ${
                      theme === "emerald" ? "ring-white" : "ring-transparent opacity-60"
                    }`}
                    title="Emerald Theme"
                  />
                  <button
                    onClick={() => setTheme("midnight")}
                    className={`w-4 h-4 rounded-full bg-amber-500 ring-2 ${
                      theme === "midnight" ? "ring-white" : "ring-transparent opacity-60"
                    }`}
                    title="Midnight Amber"
                  />
                  <button
                    onClick={() => setTheme("royal")}
                    className={`w-4 h-4 rounded-full bg-sky-500 ring-2 ${
                      theme === "royal" ? "ring-white" : "ring-transparent opacity-60"
                    }`}
                    title="Royal Blue"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ─── BOTTOM BAR: 7 PRAYER TIMES ────────────────────────────────── */}
      <footer className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2 md:gap-3 pt-2">
        {prayerList.map((prayer) => (
          <div
            key={prayer.key}
            className={`p-3 rounded-2xl border text-center transition-all duration-300 flex flex-col justify-center items-center ${
              prayer.isNext
                ? themeStyles.activePrayer
                : `${themeStyles.card} text-slate-300 hover:border-white/20`
            }`}
          >
            <span className="text-[11px] uppercase font-bold tracking-wider opacity-80 mb-0.5">
              {prayer.label}
            </span>
            <span className="font-mono text-xl md:text-2xl font-black tracking-tight">
              {prayer.time}
            </span>
            {prayer.isNext && (
              <span className="text-[9px] uppercase tracking-widest font-extrabold text-amber-300 mt-0.5 animate-pulse">
                Berikutnya
              </span>
            )}
          </div>
        ))}
      </footer>

      {/* ─── FLOATING TOP-RIGHT UTILITY CONTROLS ────────────────────────── */}
      <div className="fixed top-4 right-4 flex items-center gap-2 z-50 bg-slate-950/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 opacity-40 hover:opacity-100 transition-opacity">
        <button
          onClick={() => setAudioEnabled(!audioEnabled)}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10"
          title={audioEnabled ? "Matikan Bunyi Adhan" : "Aktifkan Bunyi Adhan"}
        >
          {audioEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleFullscreen}
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10"
          title="Mode Layar Penuh (Fullscreen)"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <Link
          to="/"
          className="p-2 rounded-xl text-slate-300 hover:text-white hover:bg-white/10"
          title="Kembali ke Beranda"
        >
          <Home className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
