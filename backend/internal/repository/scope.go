package repository

import "gorm.io/gorm"

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