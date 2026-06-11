-- ============================================================================
-- Chess Game Analyzer — Schema
-- ============================================================================
-- Database: local_chess / Neon production
-- Naming: txx_name (tables), xx_column (columns)
-- ============================================================================

-- tpl_players: player profiles and ratings
CREATE TABLE IF NOT EXISTS tpl_players (
  pl_plid         SERIAL PRIMARY KEY,
  pl_username     VARCHAR(64) NOT NULL UNIQUE,
  pl_avatar       TEXT,
  pl_display_name VARCHAR(128),
  pl_rating_blitz INTEGER
);

-- tplr_player_ratings: latest rating per player per time class
CREATE TABLE IF NOT EXISTS tplr_player_ratings (
  plr_plrid      INTEGER PRIMARY KEY,
  plr_username   VARCHAR(64) NOT NULL,
  plr_time_class VARCHAR(16) NOT NULL,
  plr_rating     INTEGER     NOT NULL,
  UNIQUE(plr_username, plr_time_class)
);

CREATE INDEX IF NOT EXISTS idx_tplr_username ON tplr_player_ratings(plr_username);

-- tgr_gamesraw: raw chess.com API response per game
CREATE TABLE IF NOT EXISTS tgr_gamesraw (
  gr_grid            SERIAL PRIMARY KEY,
  gr_player_username VARCHAR(64) NOT NULL,
  gr_chesscom_uuid   VARCHAR(64) NOT NULL UNIQUE,
  gr_raw_data        JSONB NOT NULL,
  gr_pgn             TEXT,
  gr_end_time        INTEGER NOT NULL,
  gr_time_class      VARCHAR(16)
);

CREATE INDEX IF NOT EXISTS idx_tgr_player   ON tgr_gamesraw(gr_player_username);
CREATE INDEX IF NOT EXISTS idx_tgr_end_time ON tgr_gamesraw(gr_end_time DESC);
CREATE INDEX IF NOT EXISTS idx_tgr_has_pgn  ON tgr_gamesraw(gr_grid) WHERE gr_pgn IS NOT NULL;

-- tsa_savedanalyses: user-saved analysis branches from /analyze
CREATE TABLE IF NOT EXISTS tsa_savedanalyses (
  sa_said          SERIAL PRIMARY KEY,
  sa_grid          INTEGER,
  sa_save_type     VARCHAR(16) NOT NULL,
  sa_title         VARCHAR(256),
  sa_notes         TEXT,
  sa_line_pgn      TEXT,
  sa_line_moves    JSONB,
  sa_starting_fen  TEXT,
  sa_starting_ply  INTEGER,
  sa_tree_data     JSONB,
  sa_eco_code      VARCHAR(8),
  sa_opening_name  TEXT
);

CREATE INDEX IF NOT EXISTS idx_tsa_game ON tsa_savedanalyses(sa_grid);

-- tgd_gamesdecon: deconstructed game data extracted from raw
CREATE TABLE IF NOT EXISTS tgd_gamesdecon (
  gd_gdid              SERIAL PRIMARY KEY,
  gd_grid              INTEGER NOT NULL,
  gd_white_username    VARCHAR(64) NOT NULL,
  gd_black_username    VARCHAR(64) NOT NULL,
  gd_white_rating      INTEGER NOT NULL,
  gd_black_rating      INTEGER NOT NULL,
  gd_player_username   VARCHAR(64) NOT NULL,
  gd_player_color      VARCHAR(5) NOT NULL,
  gd_player_result     VARCHAR(8) NOT NULL,
  gd_opponent_username VARCHAR(64) NOT NULL,
  gd_opponent_rating   INTEGER NOT NULL,
  gd_time_class        VARCHAR(16) NOT NULL,
  gd_time_control      VARCHAR(32),
  gd_is_rated          BOOLEAN NOT NULL DEFAULT TRUE,
  gd_termination       VARCHAR(64),
  gd_end_time          INTEGER NOT NULL,
  gd_eco_code          VARCHAR(8),
  gd_opening_name      TEXT,
  gd_game_url          TEXT,
  gd_opening_moves     TEXT
);

CREATE UNIQUE INDEX idx_tgd_grid     ON tgd_gamesdecon(gd_grid);
CREATE INDEX idx_tgd_player          ON tgd_gamesdecon(gd_player_username);
CREATE INDEX idx_tgd_end_time        ON tgd_gamesdecon(gd_end_time DESC);
CREATE INDEX idx_tgd_eco             ON tgd_gamesdecon(gd_eco_code);
CREATE INDEX idx_tgd_opponent        ON tgd_gamesdecon(gd_opponent_username);
CREATE INDEX idx_tgd_result          ON tgd_gamesdecon(gd_player_result);
CREATE INDEX idx_tgd_time_class      ON tgd_gamesdecon(gd_time_class);

-- tec_ecoreference: ECO code to opening name lookup
CREATE TABLE IF NOT EXISTS tec_ecoreference (
  ec_ecid          SERIAL PRIMARY KEY,
  ec_eco_code      VARCHAR(8) NOT NULL,
  ec_opening_name  TEXT NOT NULL,
  UNIQUE(ec_eco_code, ec_opening_name)
);

CREATE INDEX idx_tec_code ON tec_ecoreference(ec_eco_code);

-- tgev_game_evals: per-move Stockfish evaluations from the /analyze single-game page
CREATE TABLE IF NOT EXISTS tgev_game_evals (
  gev_gevid          SERIAL      PRIMARY KEY,
  gev_game_ref       VARCHAR(64) NOT NULL,
  gev_player         VARCHAR(64) NOT NULL,
  gev_move_num       SMALLINT    NOT NULL,
  gev_san            TEXT        NOT NULL,
  gev_fen_before     TEXT        NOT NULL,
  gev_fen_after      TEXT        NOT NULL,
  gev_cp             INTEGER,
  gev_cp_before      INTEGER,
  gev_cp_loss        INTEGER,
  gev_best_move      TEXT,
  gev_best_move_san  TEXT,
  gev_best_line      JSONB,
  gev_classification VARCHAR(12),
  gev_depth          SMALLINT,
  UNIQUE(gev_game_ref, gev_player, gev_move_num)
);

CREATE INDEX IF NOT EXISTS idx_tgev_game   ON tgev_game_evals(gev_game_ref);
CREATE INDEX IF NOT EXISTS idx_tgev_player ON tgev_game_evals(gev_player);
