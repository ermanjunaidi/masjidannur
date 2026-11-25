package repository

import "gorm.io/gorm"

// Scope is the data visibility of the current request.
//
//   - OrgID == 0 (platform superadmin): sees everything.
//   - BranchID > 0: only that branch of the organization.
//   - BookIDs non-empty: the user is locked to those cash books; books,
//     categories, transactions and reports outside the list do not exist
//     for them. Empty = every book of the organization.
type Scope struct {
	OrgID    uint
	BranchID uint
	BookIDs  []uint
}

// BookLocked reports whether the scope is restricted to selected books.
func (s Scope) BookLocked() bool { return len(s.BookIDs) > 0 }

// AllowsBook reports whether the scope may touch the given book.
func (s Scope) AllowsBook(bookID uint) bool {
	if !s.BookLocked() {
		return true
	}
	for _, id := range s.BookIDs {
		if id == bookID {
			return true
		}
	}
	return false
}

// scopeOrg applies tenant isolation to a query. When orgID > 0 the query
// is restricted to that organization's rows; orgID == 0 (platform-level
// superadmin) sees all rows.
func scopeOrg(db *gorm.DB, orgID uint) *gorm.DB {
	if orgID > 0 {
		return db.Where("organization_id = ?", orgID)
	}
	return db
}

// scopeBranch applies branch isolation on top of organization isolation.
//   - orgID == 0 (superadmin): sees everything.
//   - orgID > 0, branchID == 0: sees all branches of the organization.
//   - orgID > 0, branchID > 0: sees only that branch.
func scopeBranch(db *gorm.DB, orgID, branchID uint) *gorm.DB {
	query := scopeOrg(db, orgID)
	if orgID > 0 && branchID > 0 {
		query = query.Where("branch_id = ?", branchID)
	}
	return query
}

// scopeBooks applies org/branch isolation plus the user's book lock.
// bookCol is the column holding the book id: "id" on the books table,
// "book_id" on categories and transactions.
func scopeBooks(db *gorm.DB, sc Scope, bookCol string) *gorm.DB {
	query := scopeBranch(db, sc.OrgID, sc.BranchID)
	if sc.BookLocked() {
		query = query.Where(bookCol+" IN ?", sc.BookIDs)
	}
	return query
}
