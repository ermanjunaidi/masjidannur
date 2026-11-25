package models

import (
	"time"

	"gorm.io/gorm"
)

// Book represents one cash book ("buku catatan kas"). Each masjid activity
// (pembangunan, operasional, PHBI, ...) keeps its own book so reports
// stay separate — mirrors buku-masjid's core concept.
type Book struct {
	ID             uint   `gorm:"primaryKey" json:"id"`
	OrganizationID uint   `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint   `gorm:"index;default:0" json:"branch_id"`
	Name           string `gorm:"size:255;not null" json:"name"`
	Description    string `gorm:"size:1000" json:"description"`
	IsActive       bool   `gorm:"default:true" json:"is_active"`
	// IsPHBI marks a book for one PHBI event (peringatan hari besar). Each
	// event keeps its own book so its data stands alone, it has a
	// "pembagian ke warga" recipient list, and the book can be closed by
	// handing the remaining balance over to the bendahara (BookSettlement).
	IsPHBI       bool           `gorm:"not null;default:false" json:"is_phbi"`
	Transactions []Transaction  `gorm:"foreignKey:BookID" json:"transactions,omitempty"`
	CreatedAt    time.Time      `json:"created_at"`
	UpdatedAt    time.Time      `json:"updated_at"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`
}

// Category groups income/expense records inside a book (e.g. "Donasi",
// "Kotak Amal", "Listrik", "Pembangunan"). Uniqueness is per organization,
// enforced loosely in the service layer (see CategoryService).
type Category struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	OrganizationID uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint           `gorm:"index;default:0" json:"branch_id"`
	BookID         uint           `gorm:"not null;index" json:"book_id"`
	Name           string         `gorm:"size:255;not null" json:"name"`
	Group          string         `gorm:"size:20;not null;default:pendapatan" json:"group"` // pendapatan | pengeluaran
	Description    string         `gorm:"size:1000" json:"description"`
	Book           *Book          `gorm:"foreignKey:BookID" json:"book,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// Transaction is one cash movement (pemasukan or pengeluaran) inside a
// book/category. Amount is always stored non-negative; the direction is in
// the Category.Group + Type fields.
type Transaction struct {
	ID             uint    `gorm:"primaryKey" json:"id"`
	OrganizationID uint    `gorm:"index;default:0" json:"organization_id"`
	BranchID       uint    `gorm:"index;default:0" json:"branch_id"`
	BookID         uint    `gorm:"not null;index" json:"book_id"`
	CategoryID     uint    `gorm:"not null;index" json:"category_id"`
	Date           string  `gorm:"size:10;not null;index" json:"date"` // YYYY-MM-DD
	Type           string  `gorm:"size:20;not null" json:"type"`       // pemasukan | pengeluaran
	Amount         float64 `gorm:"not null" json:"amount"`
	// IsDistribution marks a "pembagian ke warga" row: a pengeluaran of a
	// PHBI book handed to one resident (PartnerName, RT, RW).
	// IsSettlement marks a ledger entry created by a PHBI book's handover
	// of its remaining balance to the bendahara. Such rows are changed
	// only by cancelling the settlement, never through the ledger.
	IsDistribution bool           `gorm:"not null;default:false;index" json:"is_distribution"`
	IsSettlement   bool           `gorm:"not null;default:false;index" json:"is_settlement"`
	RT             string         `gorm:"size:10" json:"rt"`
	RW             string         `gorm:"size:10" json:"rw"`
	Description    string         `gorm:"size:1000" json:"description"`
	PartnerName    string         `gorm:"size:255" json:"partner_name"` // nama donatur / vendor
	RefNo          string         `gorm:"size:100" json:"ref_no"`       // no bukti/kwitansi
	Book           *Book          `gorm:"foreignKey:BookID" json:"book,omitempty"`
	Category       *Category      `gorm:"foreignKey:CategoryID" json:"category,omitempty"`
	CreatedBy      uint           `json:"created_by"`
	Creator        *User          `gorm:"foreignKey:CreatedBy" json:"creator,omitempty"`
	CreatedAt      time.Time      `json:"created_at"`
	UpdatedAt      time.Time      `json:"updated_at"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`
}

// BookSettlement is the closing record of a PHBI book. After the event its
// remaining balance is handed to the bendahara, recorded here with its own
// date, recipient and note. The handover writes two ledger entries: a
// pengeluaran in the PHBI book (always) and a pemasukan in the destination
// book (when one is chosen), so no balance is counted twice.
type BookSettlement struct {
	ID                   uint           `gorm:"primaryKey" json:"id"`
	OrganizationID       uint           `gorm:"index;default:0" json:"organization_id"`
	BranchID             uint           `gorm:"index;default:0" json:"branch_id"`
	BookID               uint           `gorm:"not null;index" json:"book_id"`
	DestinationBookID    uint           `gorm:"not null;default:0" json:"destination_book_id"`
	Date                 string         `gorm:"size:10;not null" json:"date"` // YYYY-MM-DD
	Amount               float64        `gorm:"not null" json:"amount"`
	HandedTo             string         `gorm:"size:255" json:"handed_to"`
	Note                 string         `gorm:"size:1000" json:"note"`
	ExpenseTransactionID uint           `json:"expense_transaction_id"`
	IncomeTransactionID  uint           `json:"income_transaction_id"`
	CreatedBy            uint           `json:"created_by"`
	Book                 *Book          `gorm:"foreignKey:BookID" json:"book,omitempty"`
	DestinationBook      *Book          `gorm:"foreignKey:DestinationBookID" json:"destination_book,omitempty"`
	CreatedAt            time.Time      `json:"created_at"`
	UpdatedAt            time.Time      `json:"updated_at"`
	DeletedAt            gorm.DeletedAt `gorm:"index" json:"-"`
}

// MasjidSettings holds the masjid profile and TV display configuration.
// Multi-tenant: each organization has its own settings and unique public slug.
type MasjidSettings struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	OrganizationID uint      `gorm:"index;default:0" json:"organization_id"`
	Slug           string    `gorm:"size:100;index" json:"slug"`
	Name           string    `gorm:"size:255;not null;default:Masjid" json:"name"`
	Address        string    `gorm:"size:500" json:"address"`
	CityName       string    `gorm:"size:100" json:"city_name"`
	Latitude       float64   `gorm:"default:-6.2088" json:"latitude"`
	Longitude      float64   `gorm:"default:106.8456" json:"longitude"`
	Phone          string    `gorm:"size:30" json:"phone"`
	Email          string    `gorm:"size:255" json:"email"`
	CurrencyCode   string    `gorm:"size:10;default:Rp" json:"currency_code"`
	ReportFooter   string    `gorm:"size:500" json:"report_footer"`
	UpdatedBy      uint      `json:"updated_by"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
}
