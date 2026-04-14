-- ============================================================================
-- Chess Game Analyzer — Phase 1 Schema (Raw Storage)
-- ============================================================================
-- Database: chessdb
-- Naming: txx_name (tables), xx_column (columns)
-- IDs: xx_yid where yid is consistent across tables (e.g. gr_grid, sa_grid)
-- Run with: npm run migrate
-- ============================================================================

-- tpl_players: player profiles and ratings
CREATE TABLE IF NOT EXISTS tpl_players (
  pl_plid         SERIAL PRIMARY KEY,
  pl_username     VARCHAR(64) NOT NULL UNIQUE,
  pl_avatar       TEXT,
  pl_display_name VARCHAR(128),
  pl_joined       INTEGER,
  pl_last_online  INTEGER,
  pl_url          TEXT,
  pl_rating_rapid    INTEGER,
  pl_rating_blitz    INTEGER,
  pl_rating_bullet   INTEGER,
  pl_rating_daily    INTEGER,
  pl_is_primary   BOOLEAN NOT NULL DEFAULT FALSE,
  pl_last_synced  TIMESTAMPTZ,
  pl_created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  pl_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tgr_gamesraw: raw chess.com API response per game + analysis
CREATE TABLE IF NOT EXISTS tgr_gamesraw (
  gr_grid            SERIAL PRIMARY KEY,
  gr_player_username VARCHAR(64) NOT NULL,
  gr_chesscom_uuid   VARCHAR(64) NOT NULL UNIQUE,
  gr_raw_data        JSONB NOT NULL,
  gr_end_time        INTEGER NOT NULL,
  gr_time_class      VARCHAR(16),
  gr_evaluations     JSONB,
  gr_is_analyzed     BOOLEAN NOT NULL DEFAULT FALSE,
  gr_synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  gr_created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tgr_player ON tgr_gamesraw(gr_player_username);
CREATE INDEX IF NOT EXISTS idx_tgr_end_time ON tgr_gamesraw(gr_end_time DESC);

-- tsa_savedanalyses: user-saved analysis branches
CREATE TABLE IF NOT EXISTS tsa_savedanalyses (
  sa_said          SERIAL PRIMARY KEY,
  sa_grid          INTEGER REFERENCES tgr_gamesraw(gr_grid) ON DELETE CASCADE,
  sa_save_type     VARCHAR(16) NOT NULL,
  sa_title         VARCHAR(256),
  sa_notes         TEXT,
  sa_line_pgn      TEXT,
  sa_line_moves    JSONB,
  sa_starting_fen  TEXT,
  sa_starting_ply  INTEGER,
  sa_tree_data     JSONB,
  sa_eco_code      VARCHAR(8),
  sa_opening_name  TEXT,
  sa_created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sa_updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tsa_game ON tsa_savedanalyses(sa_grid);

-- tsl_synclog: download progress tracking
CREATE TABLE IF NOT EXISTS tsl_synclog (
  sl_slid            SERIAL PRIMARY KEY,
  sl_player_username VARCHAR(64) NOT NULL,
  sl_sync_type       VARCHAR(16) NOT NULL,
  sl_status          VARCHAR(16) NOT NULL DEFAULT 'pending',
  sl_archives_total  INTEGER DEFAULT 0,
  sl_archives_done   INTEGER DEFAULT 0,
  sl_games_total     INTEGER DEFAULT 0,
  sl_games_inserted  INTEGER DEFAULT 0,
  sl_games_skipped   INTEGER DEFAULT 0,
  sl_error_message   TEXT,
  sl_started_at      TIMESTAMPTZ,
  sl_completed_at    TIMESTAMPTZ,
  sl_created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tsl_player ON tsl_synclog(sl_player_username, sl_created_at DESC);

-- tgd_gamesdecon: deconstructed game data extracted from raw
DROP TABLE IF EXISTS tgd_gamesdecon CASCADE;
CREATE TABLE tgd_gamesdecon (
  gd_gdid             SERIAL PRIMARY KEY,
  gd_grid             INTEGER NOT NULL REFERENCES tgr_gamesraw(gr_grid) ON DELETE CASCADE,
  gd_chesscom_uuid    VARCHAR(64) NOT NULL,
  gd_pgn              TEXT NOT NULL,
  gd_white_username   VARCHAR(64) NOT NULL,
  gd_black_username   VARCHAR(64) NOT NULL,
  gd_white_rating     INTEGER NOT NULL,
  gd_black_rating     INTEGER NOT NULL,
  gd_player_username  VARCHAR(64) NOT NULL,
  gd_player_color     VARCHAR(5) NOT NULL,
  gd_player_result    VARCHAR(8) NOT NULL,
  gd_opponent_username VARCHAR(64) NOT NULL,
  gd_opponent_rating  INTEGER NOT NULL,
  gd_time_class       VARCHAR(16) NOT NULL,
  gd_time_control     VARCHAR(32),
  gd_is_rated         BOOLEAN NOT NULL DEFAULT TRUE,
  gd_termination      VARCHAR(64),
  gd_end_time         INTEGER NOT NULL,
  gd_played_date      DATE,
  gd_move_count       INTEGER,
  gd_eco_code         VARCHAR(8),
  gd_opening_name     TEXT,
  gd_eco_url          TEXT,
  gd_game_url         TEXT,
  gd_created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_tgd_grid ON tgd_gamesdecon(gd_grid);
CREATE INDEX idx_tgd_player ON tgd_gamesdecon(gd_player_username);
CREATE INDEX idx_tgd_end_time ON tgd_gamesdecon(gd_end_time DESC);
CREATE INDEX idx_tgd_eco ON tgd_gamesdecon(gd_eco_code);
CREATE INDEX idx_tgd_opponent ON tgd_gamesdecon(gd_opponent_username);
CREATE INDEX idx_tgd_result ON tgd_gamesdecon(gd_player_result);
CREATE INDEX idx_tgd_time_class ON tgd_gamesdecon(gd_time_class);

-- tec_ecoreference: ECO code to opening name lookup
DROP TABLE IF EXISTS tec_ecoreference CASCADE;
CREATE TABLE tec_ecoreference (
  ec_ecid          SERIAL PRIMARY KEY,
  ec_eco_code      VARCHAR(8) NOT NULL,
  ec_opening_name  TEXT NOT NULL,
  UNIQUE(ec_eco_code, ec_opening_name)
);

CREATE INDEX idx_tec_code ON tec_ecoreference(ec_eco_code);

-- tus_users: authenticated users
CREATE TABLE IF NOT EXISTS tus_users (
  us_usid         SERIAL PRIMARY KEY,
  us_name         VARCHAR(128) NOT NULL,
  us_email        VARCHAR(256) NOT NULL UNIQUE,
  us_created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tup_userspwd: hashed passwords for credential login
CREATE TABLE IF NOT EXISTS tup_userspwd (
  up_upid         SERIAL PRIMARY KEY,
  up_email        VARCHAR(256) NOT NULL UNIQUE,
  up_hash         TEXT NOT NULL,
  up_created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- tlg_logging: required by nextjs-shared write_Logging
CREATE TABLE IF NOT EXISTS tlg_logging (
  lg_lgid         SERIAL PRIMARY KEY,
  lg_datetime     TIMESTAMPTZ,
  lg_msg          TEXT,
  lg_functionname VARCHAR(128),
  lg_caller       VARCHAR(128),
  lg_severity     VARCHAR(4)
);
