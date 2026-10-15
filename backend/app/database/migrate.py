import sqlite3
import os

db_paths = [
    os.path.abspath("fraudscope.db"),
    os.path.abspath("backend/fraudscope.db")
]

for db_p in db_paths:
    if os.path.exists(db_p):
        print(f"Migrating database: {db_p}")
        conn = sqlite3.connect(db_p)
        cur = conn.cursor()

        # Check advertisements table
        cur.execute("PRAGMA table_info(advertisements)")
        ad_cols = [r[1] for r in cur.fetchall()]
        print(f"  Existing ad cols: {ad_cols}")

        if "is_demo" not in ad_cols:
            cur.execute("ALTER TABLE advertisements ADD COLUMN is_demo BOOLEAN DEFAULT 0")
            print("  + Added column 'is_demo' to advertisements")
        if "data_source" not in ad_cols:
            cur.execute("ALTER TABLE advertisements ADD COLUMN data_source VARCHAR(32) DEFAULT 'LIVE_SCAN'")
            print("  + Added column 'data_source' to advertisements")
        if "advertiser_name" not in ad_cols:
            cur.execute("ALTER TABLE advertisements ADD COLUMN advertiser_name VARCHAR(128)")
            print("  + Added column 'advertiser_name' to advertisements")
        if "external_id" not in ad_cols:
            cur.execute("ALTER TABLE advertisements ADD COLUMN external_id VARCHAR(128)")
            print("  + Added column 'external_id' to advertisements")
        if "raw_metadata" not in ad_cols:
            cur.execute("ALTER TABLE advertisements ADD COLUMN raw_metadata TEXT")
            print("  + Added column 'raw_metadata' to advertisements")

        # Check users table
        cur.execute("PRAGMA table_info(users)")
        user_cols = [r[1] for r in cur.fetchall()]
        if "avatar_url" not in user_cols:
            cur.execute("ALTER TABLE users ADD COLUMN avatar_url VARCHAR(512)")
            print("  + Added column 'avatar_url' to users")

        # Check analysis_results table
        cur.execute("PRAGMA table_info(analysis_results)")
        res_cols = [r[1] for r in cur.fetchall()]
        if "model_score" not in res_cols:
            cur.execute("ALTER TABLE analysis_results ADD COLUMN model_score FLOAT")
            print("  + Added column 'model_score' to analysis_results")
        if "model_version" not in res_cols:
            cur.execute("ALTER TABLE analysis_results ADD COLUMN model_version VARCHAR(64)")
            print("  + Added column 'model_version' to analysis_results")
        if "model_class" not in res_cols:
            cur.execute("ALTER TABLE analysis_results ADD COLUMN model_class VARCHAR(32)")
            print("  + Added column 'model_class' to analysis_results")

        # Update existing demo records
        cur.execute("UPDATE advertisements SET is_demo = 1, data_source = 'SYNTHETIC_DEMO' WHERE custom_id LIKE 'AD-DEMO-%'")
        cur.execute("UPDATE advertisements SET is_demo = 1, data_source = 'SYNTHETIC_DATASET' WHERE custom_id LIKE 'DEMO-%'")

        conn.commit()
        cur.execute("SELECT is_demo, data_source, count(id) FROM advertisements GROUP BY is_demo, data_source")
        print(f"  Distribution: {cur.fetchall()}")
        conn.close()
        print(f"Successfully migrated {db_p}\n")

if __name__ == "__main__":
    print("Database schema migration completed successfully.")
