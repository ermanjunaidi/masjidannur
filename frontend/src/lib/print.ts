// Cetak dokumen HTML mandiri lewat iframe tersembunyi: tidak kena popup
// blocker dan tidak terpengaruh CSS cetak halaman admin.

/** Escape teks untuk disisipkan ke HTML. */
export function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** Membuka dialog cetak browser untuk dokumen HTML lengkap. */
export function printHtml(html: string): void {
  const frame = document.createElement("iframe")
  frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;"
  frame.setAttribute("aria-hidden", "true")
  document.body.appendChild(frame)
  const win = frame.contentWindow
  if (!win) {
    frame.remove()
    return
  }
  win.document.open()
  win.document.write(html)
  win.document.close()
  win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500))
  // Beri waktu layout selesai sebelum dialog cetak muncul.
  setTimeout(() => {
    win.focus()
    win.print()
  }, 150)
}
