package main

import (
	"sort"
	"testing"

	"gorm.io/driver/sqlite"
	"gorm.io/gorm"

	"backend/internal/models"
	"backend/internal/repository"
)

// When the per-menu permissions are introduced, existing roles keep the
// menus they could already open, and a second start changes nothing.
func TestSidebarPermissionMigration(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("open db: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Role{}, &models.Permission{}, &models.Organization{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// A database from before this release: old catalog, custom tenant roles.
	added := map[string]bool{
		"distributions:read": true, "distributions:write": true, "distributions:delete": true,
		"display:read": true, "security:read": true,
	}
	old := map[string]*models.Permission{}
	for _, p := range defaultPermissionCatalog {
		if added[p.Key] {
			continue
		}
		perm := models.Permission{Key: p.Key, Name: p.Name}
		if err := db.Create(&perm).Error; err != nil {
			t.Fatalf("seed permission: %v", err)
		}
		old[p.Key] = &perm
	}
	mkRole := func(name string, keys ...string) *models.Role {
		role := &models.Role{OrganizationID: 7, Name: name}
		for _, k := range keys {
			role.Permissions = append(role.Permissions, *old[k])
		}
		if err := db.Create(role).Error; err != nil {
			t.Fatalf("seed role: %v", err)
		}
		return role
	}
	kasir := mkRole("kasir", "transactions:read", "transactions:write")
	viewer := mkRole("pembaca", "reports:read")
	empty := mkRole("kosong")

	permRepo, roleRepo := repository.NewPermissionRepository(db), repository.NewRoleRepository(db)
	keysOf := func(id uint) []string {
		var role models.Role
		if err := db.Preload("Permissions").First(&role, id).Error; err != nil {
			t.Fatalf("load role: %v", err)
		}
		out := []string{}
		for _, p := range role.Permissions {
			out = append(out, p.Key)
		}
		sort.Strings(out)
		return out
	}
	equal := func(got []string, want ...string) bool {
		sort.Strings(want)
		if len(got) != len(want) {
			return false
		}
		for i := range got {
			if got[i] != want[i] {
				return false
			}
		}
		return true
	}

	if err := bootstrapRBAC(db, permRepo, roleRepo); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}
	if got := keysOf(kasir.ID); !equal(got, "transactions:read", "transactions:write",
		"distributions:read", "distributions:write", "dashboard:read", "display:read", "security:read") {
		t.Fatalf("kasir = %v", got)
	}
	if got := keysOf(viewer.ID); !equal(got, "reports:read", "dashboard:read", "display:read", "security:read") {
		t.Fatalf("pembaca = %v", got)
	}
	if got := keysOf(empty.ID); len(got) != 0 {
		t.Fatalf("empty role gained %v", got)
	}

	// An admin removes a menu; the next start must not put it back.
	var display models.Permission
	db.Where("key = ?", "display:read").First(&display)
	if err := db.Model(viewer).Association("Permissions").Delete(&display); err != nil {
		t.Fatalf("remove: %v", err)
	}
	if err := bootstrapRBAC(db, permRepo, roleRepo); err != nil {
		t.Fatalf("second bootstrap: %v", err)
	}
	if got := keysOf(viewer.ID); !equal(got, "reports:read", "dashboard:read", "security:read") {
		t.Fatalf("pembaca after restart = %v", got)
	}
}
