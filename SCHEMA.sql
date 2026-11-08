-- VAYNORIX RP Logs: run once through phpMyAdmin in the EXISTING game database.
-- No CREATE USER, GRANT, game-table changes or external services.
-- Compatible with MariaDB 10.5 and InnoDB.
CREATE TABLE IF NOT EXISTS `vaynorix_logs_users` (
  `slot` TINYINT UNSIGNED NOT NULL,
  `role` ENUM('owner','admin') NOT NULL,
  `username` VARCHAR(24) NOT NULL,
  `password_hash` VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `version` CHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`slot`),
  UNIQUE KEY `unique_login` (`username`),
  CONSTRAINT `vaynorix_logs_roles_chk` CHECK ((`slot`=0 AND `role`='owner') OR (`slot` IN (1,2) AND `role`='admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `vaynorix_logs_login_attempts` (
  `fingerprint` CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `attempts` INT UNSIGNED NOT NULL DEFAULT 0,
  `expires_at` DATETIME NOT NULL,
  PRIMARY KEY (`fingerprint`),
  KEY `expires_at_idx` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional housekeeping, run occasionally from phpMyAdmin:
-- DELETE FROM `vaynorix_logs_login_attempts` WHERE `expires_at` < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY);