package config

import (
	"log"
	"os"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// NewDatabase initializes a GORM database connection using the provided Env config.
func NewDatabase(env *Env) *gorm.DB {
	dsn := env.DSN()

	// Log connection target (mask password for security).
	log.Printf("[database] Connecting to PostgreSQL: host=%s port=%s db=%s user=%s",
		env.DBHost, env.DBPort, env.DBName, env.DBUser)

	newLogger := logger.New(
		log.New(os.Stdout, "\r\n", log.LstdFlags),
		logger.Config{
			SlowThreshold:             time.Second,
			LogLevel:                  logger.Warn,
			IgnoreRecordNotFoundError: true,
			Colorful:                  true,
		},
	)

	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: newLogger,
	})
	if err != nil {
		log.Fatalf("[database] Failed to connect to %s:%s/%s as %s: %v",
			env.DBHost, env.DBPort, env.DBName, env.DBUser, err)
	}

	sqlDB, err := db.DB()
	if err != nil {
		log.Fatalf("[database] Failed to get underlying sql.DB: %v", err)
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	log.Printf("[database] Connected to PostgreSQL successfully: %s:%s/%s",
		env.DBHost, env.DBPort, env.DBName)
	return db
}
