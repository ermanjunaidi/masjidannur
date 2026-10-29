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

type ThemeKey = "teal" | "pearl" | "emerald" | "midnight" | "royal"

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
  // "teal" matches the reference mock display.png in the repo root:
  // solid teal #1f6f6a background, light #d9dad4 header band with the green
  // #0c9344 logo, and light prayer-time cards with a dark "next prayer" card.
  const [theme, setTheme] = useState<ThemeKey>("teal")

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

  // Auto-fullscreen the countdown card when the next prayer is imminent
  // (within 10 minutes): overlay covers the whole screen so jamaah can see
  // the countdown from far away, without needing to enter browser
  // fullscreen (which often requires a user gesture anyway).
  // The 10-minute window is intentional spare time for sunnah prayers
  // (qabliyah / tahiyatul masjid) before the fard prayer starts.
  const [countdownOverlay, setCountdownOverlay] = useState(false)
  useEffect(() => {
    if (nextPrayer.isImminent && !countdownOverlay) {
      setCountdownOverlay(true)
    } else if (!nextPrayer.isImminent && countdownOverlay) {
      // Prayer time reached/passed — drop the overlay automatically.
      setCountdownOverlay(false)
    }
  }, [nextPrayer.isImminent, countdownOverlay])

  // Theme palettes — every color goes through these tokens so each theme
  // (including the light "pearl" one) renders coherently.
  const darkCommon = {
    text: "text-white",
    subtitle: "text-slate-300",
    muted: "text-slate-400",
    faint: "text-slate-500",
    subtle: "text-slate-300",
    quote: "text-slate-200",
    divider: "border-white/10",
    tile: "bg-white/5 border border-white/10",
    tileSoft: "bg-white/5",
    rowTile: "bg-white/5 border border-white/5",
    chip: "bg-white/5 border border-white/10",
    pill: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30",
    iconBg: "bg-white/5 text-emerald-400",
    accentSafe: "text-emerald-400",
    decoSoft: "text-emerald-400/90",
    warm: "text-amber-400",
    warmStrong: "text-amber-300",
    warmBadge: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    incomeText: "text-emerald-400",
    expenseText: "text-rose-400",
    incomeIcon: "bg-emerald-500/20 text-emerald-400",
    expenseIcon: "bg-rose-500/20 text-rose-400",
    cashIcon: "bg-amber-500/20 text-amber-400",
    cashText: "text-amber-300",
    cashCard: "bg-emerald-950/60 ring-1 ring-emerald-500/30",
    imam: "text-sky-400",
    incomeDot: "bg-emerald-400",
    expenseDot: "bg-rose-400",
    controlBtn: "bg-white/5 hover:bg-white/10 text-white",
    tabInactive: "w-2 bg-white/20 hover:bg-white/40",
    prayerIdle: "text-slate-300 hover:border-white/20",
    nextLabel: "text-amber-300",
    ctrlBar: "bg-slate-950/80 border border-white/10",
    ctrlBtn: "text-slate-300 hover:text-white hover:bg-white/10",
    swatchRing: "ring-white",
    imminent: "bg-rose-950/50 border-rose-500/50 shadow-[0_0_30px_rgba(244,63,94,0.3)] animate-pulse",
    logoBg: "bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-lg shadow-emerald-500/20",
    logoRing: "ring-2 ring-white/20",
    clockGlow: "drop-shadow-[0_0_20px_rgba(255,255,255,0.2)]",
    // Header band / brand / finance-card overrides — empty = legacy look.
    headerBand: "",
    brandText: "text-white",
    brandMuted: "text-slate-400",
    cardLabel: "text-slate-400",
    financeCard: "",
    prayerCard: "",
  }

  const themeStyles = {
    pearl: {
      bg: "bg-stone-50",
      gradient: "from-white via-stone-50 to-emerald-50/70",
      card: "bg-white/85 border-stone-200/80 backdrop-blur-md",
      accentBg: "bg-emerald-600",
      glow: "shadow-[0_10px_40px_-12px_rgba(15,23,42,0.15)]",
      activePrayer: "bg-emerald-600 border-emerald-600 shadow-[0_10px_30px_-8px_rgba(5,150,105,0.5)] text-white",
      text: "text-stone-900",
      subtitle: "text-stone-600",
      muted: "text-stone-500",
      faint: "text-stone-400",
      subtle: "text-stone-600",
      quote: "text-stone-700",
      divider: "border-stone-200",
      tile: "bg-stone-50/80 border border-stone-200/80",
      tileSoft: "bg-stone-100/80",
      rowTile: "bg-stone-50/80 border border-stone-200/60",
      chip: "bg-stone-100 border border-stone-200",
      pill: "bg-emerald-100 text-emerald-700 border border-emerald-200",
      iconBg: "bg-emerald-100 text-emerald-700",
      accentSafe: "text-emerald-600",
      decoSoft: "text-emerald-700/90",
      warm: "text-amber-600",
      warmStrong: "text-amber-700",
      warmBadge: "bg-amber-100 text-amber-700 border border-amber-200",
      incomeText: "text-emerald-600",
      expenseText: "text-rose-600",
      incomeIcon: "bg-emerald-100 text-emerald-700",
      expenseIcon: "bg-rose-100 text-rose-700",
      cashIcon: "bg-amber-100 text-amber-700",
      cashText: "text-amber-600",
      cashCard: "ring-1 ring-emerald-200/80",
      imam: "text-sky-600",
      incomeDot: "bg-emerald-500",
      expenseDot: "bg-rose-500",
      controlBtn: "bg-stone-100 hover:bg-stone-200 text-stone-700",
      tabInactive: "w-2 bg-stone-300 hover:bg-stone-400",
      prayerIdle: "text-stone-500 hover:border-stone-300",
      nextLabel: "text-white/90",
      ctrlBar: "bg-white/80 border border-stone-200 shadow-lg",
      ctrlBtn: "text-stone-500 hover:text-stone-900 hover:bg-stone-100",
      swatchRing: "ring-stone-800",
      imminent: "bg-rose-50 border-rose-300 shadow-[0_0_30px_rgba(244,63,94,0.25)] animate-pulse",
      logoBg: "bg-gradient-to-tr from-emerald-600 to-teal-400 shadow-lg shadow-emerald-600/25",
      logoRing: "ring-2 ring-white/60",
      clockGlow: "",
      headerBand: "",
      brandText: "text-stone-900",
      brandMuted: "text-stone-500",
      cardLabel: "text-stone-500",
      financeCard: "",
      prayerCard: "",
    },
    // Theme matched to the display.png mock in the repo root.
    teal: {
      bg: "bg-[#1f6f6a]",
      gradient: "from-[#227a74] via-[#1f6f6a] to-[#1b5f5a]",
      card: "bg-white/10 border-white/15 backdrop-blur-sm",
      accentBg: "bg-[#0c9344]",
      glow: "shadow-[0_10px_40px_-15px_rgba(0,35,35,0.5)]",
      activePrayer: "bg-[#00373f] border-[#00373f] text-white shadow-[0_10px_30px_-8px_rgba(0,55,63,0.7)]",
      text: "text-white",
      subtitle: "text-[#d9ead8]",
      muted: "text-[#b9dfdb]",
      faint: "text-[#a3cfca]",
      subtle: "text-[#cfe8e5]",
      quote: "text-[#eaf4f2]",
      divider: "border-white/15",
      tile: "bg-white/10 border border-white/15",
      tileSoft: "bg-white/10",
      rowTile: "bg-white/10 border border-white/10",
      chip: "bg-white/10 border border-white/15",
      pill: "bg-[#0c9344]/25 text-[#d9f2e5] border border-[#0c9344]/50",
      iconBg: "bg-[#0369a1] text-white",
      accentSafe: "text-[#8fe3c0]",
      decoSoft: "text-[#b9dfdb]",
      warm: "text-[#ffd57e]",
      warmStrong: "text-[#ffe4a8]",
      warmBadge: "bg-[#ffd57e]/15 text-[#ffd57e] border border-[#ffd57e]/40",
      incomeText: "text-[#0c7a43]",
      expenseText: "text-[#b3374b]",
      incomeIcon: "bg-[#0c9344] text-white",
      expenseIcon: "bg-[#b3374b] text-white",
      cashIcon: "bg-[#0369a1] text-white",
      cashText: "text-[#0369a1]",
      cashCard: "ring-1 ring-[#0369a1]/50",
      imam: "text-[#a8d8ff]",
      incomeDot: "bg-[#0c9344]",
      expenseDot: "bg-[#b3374b]",
      controlBtn: "bg-white/10 hover:bg-white/20 text-white",
      tabInactive: "w-2 bg-white/25 hover:bg-white/40",
      prayerIdle: "hover:border-white/40",
      nextLabel: "text-white/90",
      ctrlBar: "bg-[#0b3f3b]/85 border border-white/15",
      ctrlBtn: "text-[#d9ead8] hover:text-white hover:bg-white/10",
      swatchRing: "ring-white",
      imminent: "bg-[#ffd57e]/15 border-[#ffd57e]/60 shadow-[0_0_30px_rgba(255,213,126,0.3)] animate-pulse",
      logoBg: "bg-[#0c9344] shadow-lg",
      logoRing: "ring-2 ring-white/30",
      clockGlow: "drop-shadow-[0_0_20px_rgba(255,255,255,0.18)]",
      headerBand: "bg-[#d9dad4] shadow-lg",
      brandText: "text-[#123f3c]",
      brandMuted: "text-[#5b7370]",
      cardLabel: "text-[#5b7370]",
      financeCard: "bg-white/70 border-white/40",
      prayerCard: "bg-[#d9dad4] border-transparent text-[#123f3c]",
    },
    emerald: {
      ...darkCommon,
      bg: "bg-slate-950",
      gradient: "from-emerald-900/30 via-slate-900/80 to-slate-950",
      card: "bg-emerald-950/40 border-emerald-500/20 backdrop-blur-md",
      accentBg: "bg-emerald-500",
      glow: "shadow-[0_0_25px_rgba(16,185,129,0.15)]",
      activePrayer: "bg-emerald-500/25 border-emerald-400 shadow-[0_0_20px_rgba(16,185,129,0.4)] text-emerald-200",
    },
    midnight: {
      ...darkCommon,
      bg: "bg-zinc-950",
      gradient: "from-amber-950/20 via-zinc-900/80 to-zinc-950",
      card: "bg-zinc-900/70 border-zinc-700/40 backdrop-blur-md",
      accentBg: "bg-amber-500",
      glow: "shadow-[0_0_25px_rgba(251,191,36,0.12)]",
      activePrayer: "bg-amber-500/20 border-amber-400 shadow-[0_0_20px_rgba(251,191,36,0.3)] text-amber-200",
    },
    royal: {
      ...darkCommon,
      bg: "bg-slate-950",
      gradient: "from-sky-900/30 via-slate-900/80 to-slate-950",
      card: "bg-sky-950/40 border-sky-500/20 backdrop-blur-md",
      accentBg: "bg-sky-500",
      glow: "shadow-[0_0_25px_rgba(56,189,248,0.15)]",
      activePrayer: "bg-sky-500/25 border-sky-400 shadow-[0_0_20px_rgba(56,189,248,0.4)] text-sky-200",
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
      className={`min-h-screen w-full flex flex-col justify-between select-none ${themeStyles.text} ${themeStyles.bg} bg-gradient-to-b ${themeStyles.gradient} p-4 md:p-6 overflow-hidden`}
    >
      {/* ─── HEADER: MASJID INFO & FINANCIAL BADGE ─────────────────────── */}
      <header className={`flex flex-col md:flex-row items-center justify-between gap-4 rounded-2xl px-5 py-3 border ${themeStyles.headerBand || `border-b ${themeStyles.divider}`} pb-4`}>
        {/* Left: Masjid Brand */}
        <div className="flex items-center gap-4 self-start pr-32 text-left md:self-auto md:pr-0">
          <div className={`w-14 h-14 rounded-2xl ${themeStyles.logoBg} flex items-center justify-center ${themeStyles.logoRing}`}>
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className={`text-2xl md:text-3xl font-bold tracking-tight ${themeStyles.brandText} drop-shadow`}>
              {data?.masjid.name || "Masjid Annur"}
            </h1>
            <p className={`text-xs md:text-sm ${themeStyles.brandMuted} line-clamp-1`}>
              {data?.masjid.address || "Jl. Masjid No. 1, Indonesia"}
            </p>
          </div>
        </div>

        {/* Right: Financial Transparency Bar */}
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:items-center md:gap-4 md:overflow-x-auto md:max-w-full">
          <div className={`min-w-0 px-3 md:px-4 py-2 rounded-xl border ${themeStyles.card} flex items-center gap-3`}>
            <div className={`p-2 rounded-lg ${themeStyles.incomeIcon}`}>
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <p className={`text-[10px] uppercase font-semibold ${themeStyles.cardLabel}`}>Pemasukan Bulan Ini</p>
              <p className={`text-sm md:text-base font-bold ${themeStyles.incomeText}`}>
                {formatRupiah(data?.finance.income || 0)}
              </p>
            </div>
          </div>

          <div className={`min-w-0 px-3 md:px-4 py-2 rounded-xl border ${themeStyles.card} ${themeStyles.financeCard} flex items-center gap-3`}>
            <div className={`p-2 rounded-lg ${themeStyles.expenseIcon}`}>
              <TrendingDown className="w-4 h-4" />
            </div>
            <div>
              <p className={`text-[10px] uppercase font-semibold ${themeStyles.cardLabel}`}>Pengeluaran Bulan Ini</p>
              <p className={`text-sm md:text-base font-bold ${themeStyles.expenseText}`}>
                {formatRupiah(data?.finance.expense || 0)}
              </p>
            </div>
          </div>

          <div className={`min-w-0 px-3 md:px-4 py-2 rounded-xl border ${themeStyles.card} ${themeStyles.financeCard} ${themeStyles.glow} ${themeStyles.cashCard} col-span-2 flex items-center gap-3`}>
            <div className={`p-2 rounded-lg ${themeStyles.cashIcon}`}>
              <Wallet className="w-4 h-4" />
            </div>
            <div>
              <p className={`text-[10px] uppercase font-semibold ${themeStyles.cardLabel}`}>Saldo Kas Masjid</p>
              <p className={`text-sm md:text-base font-bold ${themeStyles.cashText}`}>
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
            <div className={`flex items-center gap-2 text-xs md:text-sm font-medium ${themeStyles.muted} mb-1`}>
              <Calendar className={`w-4 h-4 ${themeStyles.accentSafe}`} />
              <span>{formattedDateMasehi}</span>
            </div>
            <div className={`text-sm md:text-base font-semibold ${themeStyles.decoSoft} mb-3 tracking-wide`}>
              {hijriDate}
            </div>

            <div className={`font-mono text-5xl md:text-6xl 2xl:text-7xl font-extrabold tracking-wider ${themeStyles.text} ${themeStyles.clockGlow}`}>
              {formattedTime}
            </div>
            <div className={`text-[11px] uppercase tracking-widest ${themeStyles.faint} mt-2`}>
              Waktu Indonesia Barat (WIB)
            </div>
          </div>

          {/* Next Prayer Countdown Card */}
          <div
            className={`p-5 rounded-3xl border transition-all duration-300 ${
              nextPrayer.isImminent
                ? themeStyles.imminent
                : `${themeStyles.card} ${themeStyles.glow}`
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Clock className={`w-5 h-5 ${themeStyles.warm}`} />
                <span className={`text-xs font-bold uppercase tracking-wider ${themeStyles.subtitle}`}>
                  Menuju Waktu Sholat
                </span>
              </div>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${themeStyles.warmBadge}`}>
                {nextPrayer.name} ({nextPrayer.time})
              </span>
            </div>

            <div className="text-center py-2">
              <div className={`font-mono text-3xl md:text-4xl font-bold ${themeStyles.warm} tracking-tight`}>
                - {nextPrayer.countdown}
              </div>
              <p className={`text-xs ${themeStyles.muted} mt-1`}>
                Persiapkan diri untuk mengambil wudhu dan sholat berjamaah
              </p>
            </div>
          </div>

          {/* Running Message / Donation Info */}
          <div className={`p-4 rounded-2xl border ${themeStyles.card} flex items-center gap-3 text-xs ${themeStyles.subtle}`}>
            <div className={`p-2 rounded-xl ${themeStyles.iconBg} shrink-0`}>
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
            <div className={`flex items-center justify-between border-b ${themeStyles.divider} pb-3 mb-4`}>
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${themeStyles.accentBg} animate-ping`} />
                <span className={`text-xs md:text-sm font-bold uppercase tracking-widest ${themeStyles.subtitle}`}>
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
                      activeSlide === idx ? `w-8 ${themeStyles.accentBg}` : themeStyles.tabInactive
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
                      <span className={`px-3 py-1 rounded-full text-xs font-bold ${themeStyles.pill}`}>
                        Jumat Pekan Ini • {fridayLecturings[0].date}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className={`p-4 rounded-2xl ${themeStyles.tile} text-center`}>
                        <p className={`text-xs uppercase font-semibold ${themeStyles.muted} mb-1`}>Khatib</p>
                        <p className={`text-base md:text-lg font-bold ${themeStyles.accentSafe}`}>
                          {fridayLecturings[0].lecturer_name || "-"}
                        </p>
                      </div>

                      <div className={`p-4 rounded-2xl ${themeStyles.tile} text-center`}>
                        <p className={`text-xs uppercase font-semibold ${themeStyles.muted} mb-1`}>Imam</p>
                        <p className={`text-base md:text-lg font-bold ${themeStyles.imam}`}>
                          {fridayLecturings[0].imam_name || fridayLecturings[0].lecturer_name || "-"}
                        </p>
                      </div>

                      <div className={`p-4 rounded-2xl ${themeStyles.tile} text-center`}>
                        <p className={`text-xs uppercase font-semibold ${themeStyles.muted} mb-1`}>Muadzin / Bilal</p>
                        <p className={`text-base md:text-lg font-bold ${themeStyles.warm}`}>
                          {fridayLecturings[0].muadzin_name || "-"}
                        </p>
                      </div>
                    </div>

                    {fridayLecturings[0].title && (
                      <div className={`mt-4 p-4 rounded-2xl ${themeStyles.tileSoft} text-center`}>
                        <p className={`text-xs ${themeStyles.muted}`}>Tema Khutbah</p>
                        <p className={`text-sm md:text-base font-semibold ${themeStyles.text}`}>
                          "{fridayLecturings[0].title}"
                        </p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`text-center py-12 ${themeStyles.muted}`}>
                    <BookOpen className={`w-12 h-12 mx-auto mb-3 opacity-30 ${themeStyles.accentSafe}`} />
                    <p className="text-base font-medium">Jadwal Khatib Jumat Segera Diperbarui</p>
                    <p className={`text-xs ${themeStyles.faint} mt-1`}>
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
                        className={`p-4 rounded-2xl ${themeStyles.tile} flex flex-col justify-between`}
                      >
                        <div>
                          <div className={`flex items-center justify-between text-xs ${themeStyles.muted} mb-1`}>
                            <span>{lec.date}</span>
                            <span className={`font-semibold ${themeStyles.accentSafe}`}>
                              {lec.time_text || `${lec.start_time || ""} WIB`}
                            </span>
                          </div>
                          <h4 className={`text-base font-bold ${themeStyles.text} line-clamp-1`}>
                            {lec.title || lec.book_title || "Kajian Rutin"}
                          </h4>
                          <p className={`text-xs ${themeStyles.subtle} line-clamp-1 mt-1`}>
                            Pemateri: <span className={`font-semibold ${themeStyles.warmStrong}`}>{lec.lecturer_name}</span>
                          </p>
                        </div>
                        {lec.book_title && (
                          <div className={`text-[11px] ${themeStyles.muted} mt-2 italic`}>
                            Kitab: {lec.book_title}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className={`text-center py-12 ${themeStyles.muted}`}>
                    <Users className={`w-12 h-12 mx-auto mb-3 opacity-30 ${themeStyles.accentSafe}`} />
                    <p className="text-base font-medium">Tidak ada jadwal pengajian terdekat</p>
                    <p className={`text-xs ${themeStyles.faint} mt-1`}>
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
                  <p className={`text-xs ${themeStyles.muted} font-semibold uppercase tracking-wider`}>
                    Catatan Transaksi Kas Terakhir
                  </p>
                  <div className="space-y-2">
                    {data?.recent_transactions && data.recent_transactions.length > 0 ? (
                      data.recent_transactions.slice(0, 4).map((tx) => (
                        <div
                          key={tx.id}
                          className={`flex items-center justify-between p-3 rounded-xl ${themeStyles.rowTile} text-xs md:text-sm`}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-2 h-2 rounded-full ${
                                tx.type === "pemasukan" ? themeStyles.incomeDot : themeStyles.expenseDot
                              }`}
                            />
                            <div>
                              <p className={`font-semibold ${themeStyles.text} line-clamp-1`}>
                                {tx.description || tx.partner_name || "Transaksi Kas"}
                              </p>
                              <p className={`text-[11px] ${themeStyles.muted}`}>{tx.date}</p>
                            </div>
                          </div>
                          <span
                            className={`font-mono font-bold ${
                              tx.type === "pemasukan" ? themeStyles.incomeText : themeStyles.expenseText
                            }`}
                          >
                            {tx.type === "pemasukan" ? "+" : "-"} {formatRupiah(tx.amount)}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className={`text-center py-8 ${themeStyles.muted} text-sm`}>
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
                <p className={`text-xs uppercase font-bold tracking-widest ${themeStyles.accentSafe} mb-2`}>
                  Adab Masuk Masjid & Berjamaah
                </p>
                <blockquote className={`text-lg md:text-xl font-serif italic ${themeStyles.quote} max-w-2xl mx-auto leading-relaxed mb-4`}>
                  "Barangsiapa membangun masjid karena Allah, maka Allah akan membangunkan baginya semisal itu di surga."
                </blockquote>
                <p className={`text-xs ${themeStyles.muted} font-medium`}>
                  (HR. Bukhari no. 450 & Muslim no. 533)
                </p>
                <div className={`flex items-center justify-center gap-4 mt-6 text-xs ${themeStyles.muted}`}>
                  <span className={`px-3 py-1 rounded-full ${themeStyles.chip}`}>
                    📱 Harap Nonaktifkan HP
                  </span>
                  <span className={`px-3 py-1 rounded-full ${themeStyles.chip}`}>
                    🧹 Jaga Kebersihan Masjid
                  </span>
                  <span className={`px-3 py-1 rounded-full ${themeStyles.chip}`}>
                    👥 Luruskan & Rapatkan Shaf
                  </span>
                </div>
              </div>
            )}

            {/* Bottom Controls inside Card */}
            <div className={`flex items-center justify-between pt-3 border-t ${themeStyles.divider} mt-4 text-xs ${themeStyles.muted}`}>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setActiveSlide((prev) => (prev - 1 + totalSlides) % totalSlides)}
                  className={`p-1 rounded-lg ${themeStyles.controlBtn}`}
                  title="Slide Sebelumnya"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className={`p-1 rounded-lg ${themeStyles.controlBtn}`}
                  title={isPaused ? "Lanjutkan Slide" : "Jeda Slide"}
                >
                  {isPaused ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setActiveSlide((prev) => (prev + 1) % totalSlides)}
                  className={`p-1 rounded-lg ${themeStyles.controlBtn}`}
                  title="Slide Selanjutnya"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3">
                <span>Tema Tampilan:</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setTheme("pearl")}
                    className={`w-4 h-4 rounded-full bg-white border border-stone-300 ring-2 ${
                      theme === "pearl" ? themeStyles.swatchRing : "ring-transparent opacity-60"
                    }`}
                    title="Pearl White"
                  />
                  <button
                    onClick={() => setTheme("emerald")}
                    className={`w-4 h-4 rounded-full bg-emerald-500 ring-2 ${
                      theme === "emerald" ? themeStyles.swatchRing : "ring-transparent opacity-60"
                    }`}
                    title="Emerald Theme"
                  />
                  <button
                    onClick={() => setTheme("midnight")}
                    className={`w-4 h-4 rounded-full bg-amber-500 ring-2 ${
                      theme === "midnight" ? themeStyles.swatchRing : "ring-transparent opacity-60"
                    }`}
                    title="Midnight Amber"
                  />
                  <button
                    onClick={() => setTheme("royal")}
                    className={`w-4 h-4 rounded-full bg-sky-500 ring-2 ${
                      theme === "royal" ? themeStyles.swatchRing : "ring-transparent opacity-60"
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
                : themeStyles.prayerCard || `${themeStyles.card} ${themeStyles.prayerIdle}`
            }`}
          >
            <span className="text-[11px] uppercase font-bold tracking-wider opacity-80 mb-0.5">
              {prayer.label}
            </span>
            <span className="font-mono text-xl md:text-2xl font-black tracking-tight">
              {prayer.time}
            </span>
            {prayer.isNext && (
              <span className={`text-[9px] uppercase tracking-widest font-extrabold ${themeStyles.nextLabel} mt-0.5 animate-pulse`}>
                Berikutnya
              </span>
            )}
          </div>
        ))}
      </footer>

      {/* ─── FULLSCREEN COUNTDOWN OVERLAY ──────────────────────────── */}
      {/* Shown automatically during the final 10 minutes before the next
          prayer. Covers the entire viewport so the countdown is readable
          from anywhere in the musholla; tap/click to dismiss early. */}
      {countdownOverlay && (
        <div
          className={`fixed inset-0 z-[60] flex flex-col items-center justify-center gap-6 cursor-pointer ${themeStyles.bg} bg-gradient-to-b ${themeStyles.gradient} animate-in fade-in duration-500`}
          onClick={() => setCountdownOverlay(false)}
          title="Ketuk untuk menutup"
        >
          <div className="flex items-center gap-3 text-[#ffd57e]">
            <Clock className="w-8 h-8 md:w-10 md:h-10 animate-pulse" />
            <span className="text-xl md:text-3xl font-bold uppercase tracking-[0.3em]">
              Menjelang Sholat {nextPrayer.name}
            </span>
          </div>

          <div className="font-mono text-[18vw] md:text-[14vw] leading-none font-black tracking-tight text-white drop-shadow-[0_0_40px_rgba(255,255,255,0.25)]">
            {nextPrayer.countdown}
          </div>

          <div className="flex flex-col items-center gap-3">
            <div className={`flex items-center gap-3 text-base md:text-xl font-semibold ${themeStyles.subtitle}`}>
              <span className={`px-4 py-1.5 rounded-full ${themeStyles.warmBadge}`}>
                Sholat {nextPrayer.name} pukul {nextPrayer.time} WIB
              </span>
            </div>
            <p className="text-lg md:text-2xl font-bold text-[#8fe3c0]">
              Gunakan waktu ± 10 menit ini untuk sholat sunnah
            </p>
          </div>

          <p className={`text-xs md:text-sm ${themeStyles.faint} mt-2`}>
            Persiapkan wudhu, sholat sunnah qabliyah, dan luruskan shaf — ketuk layar untuk kembali
          </p>
        </div>
      )}

      {/* ─── FLOATING TOP-RIGHT UTILITY CONTROLS ────────────────────────── */}
      <div className={`fixed top-4 right-4 flex items-center gap-2 z-50 ${themeStyles.ctrlBar} backdrop-blur-md p-1.5 rounded-2xl opacity-40 hover:opacity-100 transition-opacity`}>
        <button
          onClick={() => setAudioEnabled(!audioEnabled)}
          className={`p-2 rounded-xl ${themeStyles.ctrlBtn}`}
          title={audioEnabled ? "Matikan Bunyi Adhan" : "Aktifkan Bunyi Adhan"}
        >
          {audioEnabled ? <Volume2 className={`w-4 h-4 ${themeStyles.accentSafe}`} /> : <VolumeX className="w-4 h-4" />}
        </button>

        <button
          onClick={toggleFullscreen}
          className={`p-2 rounded-xl ${themeStyles.ctrlBtn}`}
          title="Mode Layar Penuh (Fullscreen)"
        >
          {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
        </button>

        <Link
          to="/"
          className={`p-2 rounded-xl ${themeStyles.ctrlBtn}`}
          title="Kembali ke Beranda"
        >
          <Home className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
