package service

import (
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/xuri/excelize/v2"

	"backend/internal/models"
	"backend/internal/repository"
)

// MaxExportRows bounds one Excel export so a single request cannot exhaust
// the server's memory. Larger data sets are exported per date range.
const MaxExportRows = 50000

// ErrExportTooLarge is returned when the filters match more rows than
// MaxExportRows.
var ErrExportTooLarge = fmt.Errorf("data terlalu besar untuk satu file (lebih dari %d transaksi); persempit dengan filter buku kas atau rentang tanggal", MaxExportRows)

// ExportTransactionsInput holds the (all optional) export filters.
type ExportTransactionsInput struct {
	BookID uint
	Type   string // pemasukan | pengeluaran
	From   string // YYYY-MM-DD
	To     string // YYYY-MM-DD
	Search string
}

// ExportFile is a generated download.
type ExportFile struct {
	Name string
	Data []byte
	Rows int
}

// ExportTransactions builds the "Laporan Transaksi Kas" workbook: a
// print-ready ledger sheet plus a per-category summary sheet. masjid may
// be nil.
func (s *TransactionService) ExportTransactions(sc repository.Scope, in ExportTransactionsInput, masjid *models.MasjidSettings) (*ExportFile, error) {
	if in.Type != "" && in.Type != "pemasukan" && in.Type != "pengeluaran" {
		return nil, ErrInvalidType
	}
	if (in.From != "" && !isValidDate(in.From)) || (in.To != "" && !isValidDate(in.To)) {
		return nil, ErrInvalidDate
	}
	in.Search = strings.TrimSpace(in.Search)
	txs, err := s.repo.ListForExport(sc, in.BookID, in.Type, in.From, in.To, in.Search, MaxExportRows+1)
	if err != nil {
		return nil, err
	}
	if len(txs) > MaxExportRows {
		return nil, ErrExportTooLarge
	}
	bookName := ""
	if in.BookID > 0 {
		book, err := s.bookRepo.FindByID(in.BookID, sc)
		if err != nil {
			return nil, err
		}
		if book != nil {
			bookName = book.Name
		}
	}
	data, err := buildTransactionWorkbook(txs, in, bookName, masjid, time.Now())
	if err != nil {
		return nil, err
	}
	name := "transaksi-kas"
	if slug := fileSlug(bookName); slug != "" {
		name += "-" + slug
	}
	name += "-" + time.Now().Format("2006-01-02") + ".xlsx"
	return &ExportFile{Name: name, Data: data, Rows: len(txs)}, nil
}

// ─── Workbook ─────────────────────────────────────────────────────────────────

const (
	xlGreen     = "047857"
	xlGreenSoft = "ECFDF5"
	xlRed       = "BE123C"
	xlZebra     = "F8FAFC"
	xlBorder    = "CBD5E1"
	xlMuted     = "64748B"
	xlMoney     = `#,##0;[Red]-#,##0;"-"`
	xlDate      = "dd/mm/yyyy"
	xlHeaderRow = 6
)

// xlStyle describes one cell style; styles are created once and reused.
type xlStyle struct {
	bold, italic, wrap bool
	size               float64
	color, fill        string
	align, valign      string
	numFmt             string
	border             bool
}

type xlBook struct {
	f      *excelize.File
	styles map[xlStyle]int
	err    error
}

func (b *xlBook) style(st xlStyle) int {
	if id, ok := b.styles[st]; ok {
		return id
	}
	if st.size == 0 {
		st.size = 10
	}
	if st.valign == "" {
		st.valign = "center"
	}
	style := &excelize.Style{
		Font:      &excelize.Font{Family: "Calibri", Size: st.size, Bold: st.bold, Italic: st.italic, Color: st.color},
		Alignment: &excelize.Alignment{Horizontal: st.align, Vertical: st.valign, WrapText: st.wrap},
	}
	if st.fill != "" {
		style.Fill = excelize.Fill{Type: "pattern", Pattern: 1, Color: []string{st.fill}}
	}
	if st.border {
		for _, side := range []string{"left", "right", "top", "bottom"} {
			style.Border = append(style.Border, excelize.Border{Type: side, Color: xlBorder, Style: 1})
		}
	}
	if st.numFmt != "" {
		nf := st.numFmt
		style.CustomNumFmt = &nf
	}
	id, err := b.f.NewStyle(style)
	b.keep(err)
	b.styles[st] = id
	return id
}

func (b *xlBook) keep(err error) {
	if b.err == nil && err != nil {
		b.err = err
	}
}

func cellRef(col, row int) string {
	name, _ := excelize.CoordinatesToCellName(col, row)
	return name
}

// set writes one styled cell.
func (b *xlBook) set(sheet string, col, row int, value any, st xlStyle) {
	ref := cellRef(col, row)
	b.keep(b.f.SetCellValue(sheet, ref, value))
	b.keep(b.f.SetCellStyle(sheet, ref, ref, b.style(st)))
}

// formula writes one styled formula cell.
func (b *xlBook) formula(sheet string, col, row int, formula string, st xlStyle) {
	ref := cellRef(col, row)
	b.keep(b.f.SetCellFormula(sheet, ref, formula))
	b.keep(b.f.SetCellStyle(sheet, ref, ref, b.style(st)))
}

// band merges a row range into one styled cell.
func (b *xlBook) band(sheet string, row, fromCol, toCol int, value any, st xlStyle) {
	from, to := cellRef(fromCol, row), cellRef(toCol, row)
	b.keep(b.f.SetCellValue(sheet, from, value))
	b.keep(b.f.SetCellStyle(sheet, from, to, b.style(st)))
	b.keep(b.f.MergeCell(sheet, from, to))
}

func ptr[T any](v T) *T { return &v }

func buildTransactionWorkbook(txs []models.Transaction, in ExportTransactionsInput, bookName string, masjid *models.MasjidSettings, now time.Time) ([]byte, error) {
	f := excelize.NewFile()
	defer f.Close()
	b := &xlBook{f: f, styles: map[xlStyle]int{}}

	masjidName := "Masjid"
	footer := ""
	if masjid != nil {
		if strings.TrimSpace(masjid.Name) != "" {
			masjidName = masjid.Name
		}
		footer = strings.TrimSpace(masjid.ReportFooter)
	}
	period := exportPeriod(txs, in)

	// ─── Sheet 1: Transaksi ───────────────────────────────────────────────
	const sheet = "Transaksi"
	b.keep(f.SetSheetName("Sheet1", sheet))
	columns := []struct {
		title string
		width float64
		align string
	}{
		{"No", 6, "center"}, {"Tanggal", 13, "left"}, {"Buku Kas", 22, "left"},
		{"Tipe", 13, "left"}, {"Kategori", 22, "left"}, {"Keterangan", 40, "left"},
		{"Donatur / Vendor", 24, "left"}, {"No. Bukti", 15, "left"},
		{"Pemasukan (Rp)", 18, "right"}, {"Pengeluaran (Rp)", 18, "right"},
	}
	last := len(columns)
	for i, c := range columns {
		col, _ := excelize.ColumnNumberToName(i + 1)
		b.keep(f.SetColWidth(sheet, col, col, c.width))
	}

	// Kop
	filters := []string{"Buku kas: " + orDefault(bookName, "Semua buku")}
	switch in.Type {
	case "pemasukan":
		filters = append(filters, "Tipe: Pemasukan")
	case "pengeluaran":
		filters = append(filters, "Tipe: Pengeluaran")
	default:
		filters = append(filters, "Tipe: Semua tipe")
	}
	if in.Search != "" {
		filters = append(filters, fmt.Sprintf("Pencarian: %q", in.Search))
	}
	filters = append(filters, "Dicetak: "+longDateID(now)+" "+now.Format("15:04"))
	b.band(sheet, 1, 1, last, masjidName, xlStyle{bold: true, size: 16, color: xlGreen})
	b.band(sheet, 2, 1, last, "LAPORAN TRANSAKSI KAS", xlStyle{bold: true, size: 12})
	b.band(sheet, 3, 1, last, "Periode: "+period, xlStyle{})
	b.band(sheet, 4, 1, last, strings.Join(filters, "   •   "), xlStyle{size: 9, color: xlMuted})
	b.keep(f.SetRowHeight(sheet, 1, 26))
	b.keep(f.SetRowHeight(sheet, 2, 20))

	// Header tabel
	for i, c := range columns {
		b.set(sheet, i+1, xlHeaderRow, c.title, xlStyle{bold: true, color: "FFFFFF", fill: xlGreen, align: c.align, border: true})
	}
	b.keep(f.SetRowHeight(sheet, xlHeaderRow, 24))

	// Data
	for i, t := range txs {
		row := xlHeaderRow + 1 + i
		isIncome := t.Type == "pemasukan"
		fill := ""
		if i%2 == 1 {
			fill = xlZebra
		}
		cell := func(st xlStyle) xlStyle {
			st.fill, st.border, st.valign = fill, true, "top"
			return st
		}
		var date any = t.Date
		if d, err := time.Parse("2006-01-02", t.Date); err == nil {
			date = d
		}
		typeLabel, typeColor := "Pengeluaran", xlRed
		var in, out any
		if isIncome {
			typeLabel, typeColor = "Pemasukan", xlGreen
			in = t.Amount
		} else {
			out = t.Amount
		}
		b.set(sheet, 1, row, i+1, cell(xlStyle{align: "center"}))
		b.set(sheet, 2, row, date, cell(xlStyle{align: "left", numFmt: xlDate}))
		b.set(sheet, 3, row, bookNameOf(t), cell(xlStyle{}))
		b.set(sheet, 4, row, typeLabel, cell(xlStyle{color: typeColor}))
		b.set(sheet, 5, row, categoryNameOf(t), cell(xlStyle{}))
		b.set(sheet, 6, row, t.Description, cell(xlStyle{wrap: true}))
		b.set(sheet, 7, row, t.PartnerName, cell(xlStyle{wrap: true}))
		b.set(sheet, 8, row, t.RefNo, cell(xlStyle{}))
		b.set(sheet, 9, row, in, cell(xlStyle{align: "right", numFmt: xlMoney}))
		b.set(sheet, 10, row, out, cell(xlStyle{align: "right", numFmt: xlMoney, color: xlRed}))
	}
	firstData, lastData := xlHeaderRow+1, xlHeaderRow+len(txs)

	// Total & selisih. Formulas keep the totals right when rows are edited
	// in Excel; with no rows they are written as plain zeros.
	total := xlStyle{bold: true, fill: xlGreenSoft, border: true}
	money := xlStyle{bold: true, fill: xlGreenSoft, border: true, align: "right", numFmt: xlMoney}
	totalRow, netRow := lastData+1, lastData+2
	b.band(sheet, totalRow, 1, 8, fmt.Sprintf("TOTAL (%d transaksi)", len(txs)), total)
	if len(txs) > 0 {
		b.formula(sheet, 9, totalRow, fmt.Sprintf("SUM(I%d:I%d)", firstData, lastData), money)
		b.formula(sheet, 10, totalRow, fmt.Sprintf("SUM(J%d:J%d)", firstData, lastData), money)
	} else {
		b.set(sheet, 9, totalRow, 0, money)
		b.set(sheet, 10, totalRow, 0, money)
	}
	b.band(sheet, netRow, 1, 8, "SELISIH (Pemasukan − Pengeluaran)", total)
	b.band(sheet, netRow, 9, 10, nil, money)
	b.keep(f.SetCellFormula(sheet, cellRef(9, netRow), fmt.Sprintf("I%d-J%d", totalRow, totalRow)))
	b.keep(f.SetRowHeight(sheet, totalRow, 20))
	b.keep(f.SetRowHeight(sheet, netRow, 20))
	if footer != "" {
		b.band(sheet, netRow+2, 1, last, footer, xlStyle{size: 9, italic: true, color: xlMuted, wrap: true, valign: "top"})
	}

	// Tampilan & cetak: header beku, filter per kolom, A4 mendatar selebar
	// satu halaman, header tabel berulang di tiap halaman.
	b.keep(f.SetPanes(sheet, &excelize.Panes{
		Freeze: true, YSplit: xlHeaderRow, TopLeftCell: cellRef(1, xlHeaderRow+1), ActivePane: "bottomLeft",
	}))
	if len(txs) > 0 {
		b.keep(f.AutoFilter(sheet, cellRef(1, xlHeaderRow)+":"+cellRef(last, lastData), nil))
	}
	b.keep(f.SetSheetView(sheet, 0, &excelize.ViewOptions{ShowGridLines: ptr(false)}))
	b.keep(f.SetSheetProps(sheet, &excelize.SheetPropsOptions{FitToPage: ptr(true)}))
	b.keep(f.SetPageLayout(sheet, &excelize.PageLayoutOptions{
		Size: ptr(9), Orientation: ptr("landscape"), FitToWidth: ptr(1), FitToHeight: ptr(0),
	}))
	b.keep(f.SetPageMargins(sheet, &excelize.PageLayoutMarginsOptions{
		Left: ptr(0.4), Right: ptr(0.4), Top: ptr(0.5), Bottom: ptr(0.6), Header: ptr(0.3), Footer: ptr(0.3),
	}))
	b.keep(f.SetHeaderFooter(sheet, &excelize.HeaderFooterOptions{
		OddFooter: "&L&8" + strings.ReplaceAll(masjidName, "&", "&&") + "&R&8Halaman &P dari &N",
	}))
	b.keep(f.SetDefinedName(&excelize.DefinedName{
		Name: "_xlnm.Print_Titles", Scope: sheet,
		RefersTo: fmt.Sprintf("%s!$%d:$%d", sheet, xlHeaderRow, xlHeaderRow),
	}))

	// ─── Sheet 2: Ringkasan per kategori ──────────────────────────────────
	const sum = "Ringkasan"
	_, err := f.NewSheet(sum)
	b.keep(err)
	for i, w := range []float64{6, 30, 24, 12, 20} {
		col, _ := excelize.ColumnNumberToName(i + 1)
		b.keep(f.SetColWidth(sum, col, col, w))
	}
	b.band(sum, 1, 1, 5, masjidName, xlStyle{bold: true, size: 14, color: xlGreen})
	b.band(sum, 2, 1, 5, "Ringkasan per kategori — "+period, xlStyle{color: xlMuted})
	b.keep(f.SetRowHeight(sum, 1, 24))

	row := 4
	section := func(title, txType, color string) string {
		type group struct {
			category, book string
			count          int
			total          float64
		}
		type key struct{ book, category uint }
		groups := map[key]*group{}
		for _, t := range txs {
			if t.Type != txType {
				continue
			}
			k := key{t.BookID, t.CategoryID}
			g := groups[k]
			if g == nil {
				g = &group{category: orDefault(categoryNameOf(t), "(tanpa kategori)"), book: bookNameOf(t)}
				groups[k] = g
			}
			g.count++
			g.total += t.Amount
		}
		list := make([]*group, 0, len(groups))
		for _, g := range groups {
			list = append(list, g)
		}
		sort.Slice(list, func(i, j int) bool {
			if list[i].total != list[j].total {
				return list[i].total > list[j].total
			}
			return list[i].category+list[i].book < list[j].category+list[j].book
		})

		b.band(sum, row, 1, 5, title, xlStyle{bold: true, size: 11, color: color})
		row++
		for i, h := range []string{"No", "Kategori", "Buku Kas", "Transaksi", "Total (Rp)"} {
			align := "left"
			if i == 0 {
				align = "center"
			} else if i >= 3 {
				align = "right"
			}
			b.set(sum, i+1, row, h, xlStyle{bold: true, color: "FFFFFF", fill: color, align: align, border: true})
		}
		row++
		first := row
		for i, g := range list {
			fill := ""
			if i%2 == 1 {
				fill = xlZebra
			}
			b.set(sum, 1, row, i+1, xlStyle{align: "center", fill: fill, border: true})
			b.set(sum, 2, row, g.category, xlStyle{fill: fill, border: true})
			b.set(sum, 3, row, g.book, xlStyle{fill: fill, border: true})
			b.set(sum, 4, row, g.count, xlStyle{align: "right", fill: fill, border: true})
			b.set(sum, 5, row, g.total, xlStyle{align: "right", numFmt: xlMoney, fill: fill, border: true})
			row++
		}
		b.band(sum, row, 1, 3, "Total", total)
		count := xlStyle{bold: true, fill: xlGreenSoft, border: true, align: "right"}
		if len(list) > 0 {
			b.formula(sum, 4, row, fmt.Sprintf("SUM(D%d:D%d)", first, row-1), count)
			b.formula(sum, 5, row, fmt.Sprintf("SUM(E%d:E%d)", first, row-1), money)
		} else {
			b.set(sum, 4, row, 0, count)
			b.set(sum, 5, row, 0, money)
		}
		totalCell := cellRef(5, row)
		row += 2
		return totalCell
	}
	incomeCell := section("PEMASUKAN", "pemasukan", xlGreen)
	expenseCell := section("PENGELUARAN", "pengeluaran", xlRed)
	b.band(sum, row, 1, 4, "SELISIH (Pemasukan − Pengeluaran)", xlStyle{bold: true, size: 11, border: true})
	b.formula(sum, 5, row, incomeCell+"-"+expenseCell, xlStyle{bold: true, size: 11, border: true, align: "right", numFmt: xlMoney})
	b.keep(f.SetSheetView(sum, 0, &excelize.ViewOptions{ShowGridLines: ptr(false)}))
	b.keep(f.SetSheetProps(sum, &excelize.SheetPropsOptions{FitToPage: ptr(true)}))
	b.keep(f.SetPageLayout(sum, &excelize.PageLayoutOptions{
		Size: ptr(9), Orientation: ptr("portrait"), FitToWidth: ptr(1), FitToHeight: ptr(0),
	}))

	if b.err != nil {
		return nil, b.err
	}
	buf, err := f.WriteToBuffer()
	if err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func bookNameOf(t models.Transaction) string {
	if t.Book != nil {
		return t.Book.Name
	}
	return ""
}

func categoryNameOf(t models.Transaction) string {
	if t.Category != nil {
		return t.Category.Name
	}
	return ""
}

func orDefault(s, fallback string) string {
	if strings.TrimSpace(s) == "" {
		return fallback
	}
	return s
}

// exportPeriod describes the covered dates: the requested range when
// given, otherwise the first and last transaction dates (txs are sorted
// oldest first).
func exportPeriod(txs []models.Transaction, in ExportTransactionsInput) string {
	from, to := in.From, in.To
	if len(txs) > 0 {
		if from == "" {
			from = txs[0].Date
		}
		if to == "" {
			to = txs[len(txs)-1].Date
		}
	}
	switch {
	case from == "" && to == "":
		return "-"
	case from == "":
		return "s.d. " + longDateStr(to)
	case to == "":
		return "sejak " + longDateStr(from)
	case from == to:
		return longDateStr(from)
	}
	return longDateStr(from) + " s.d. " + longDateStr(to)
}

var monthsID = [...]string{"Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"}

func longDateID(t time.Time) string {
	return fmt.Sprintf("%d %s %d", t.Day(), monthsID[t.Month()-1], t.Year())
}

func longDateStr(day string) string {
	t, err := time.Parse("2006-01-02", day)
	if err != nil {
		return day
	}
	return longDateID(t)
}

var fileSlugRe = regexp.MustCompile(`[^a-z0-9]+`)

// fileSlug makes a name safe for a download filename.
func fileSlug(s string) string {
	return strings.Trim(fileSlugRe.ReplaceAllString(strings.ToLower(s), "-"), "-")
}
