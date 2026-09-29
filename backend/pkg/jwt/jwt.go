package jwt

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Claims contains the JWT claims for authentication. Roles and the
// flattened permissions snapshot are embedded at login time, so the
// middleware layer can perform stateless permission checks against
// the in-memory slice without hitting the database.
//
// OrganizationID is 0 for platform-level superadmins; all other users
// are scoped to their organization's data.
type Claims struct {
	UserID         uint     `json:"user_id"`
	OrganizationID uint     `json:"organization_id"`
	BranchID       uint     `json:"branch_id"`
	Roles          []string `json:"roles"`
	Permissions    []string `json:"permissions"`
	jwt.RegisteredClaims
}

// GenerateToken creates a signed JWT token for the given user + flattened
// permission set. The slice arguments are not mutated.
func GenerateToken(userID, orgID, branchID uint, roles, permissions []string, secret string) (string, error) {
	rolesCopy := append([]string{}, roles...)
	permsCopy := append([]string{}, permissions...)
	claims := Claims{
		UserID:         userID,
		OrganizationID: orgID,
		BranchID:       branchID,
		Roles:          rolesCopy,
		Permissions:    permsCopy,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}

// ValidateToken parses and validates a JWT token string and returns its
// Claims when signature and expiry checks pass. Caller is responsible
// for any domain-level authorization.
func ValidateToken(tokenString, secret string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	})
	if err != nil {
		return nil, err
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, jwt.ErrSignatureInvalid
	}

	return claims, nil
}
