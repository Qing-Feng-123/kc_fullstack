-- 为 UPSERT 添加唯一约束：每用户每舰队/每舰船只保留最新一条
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deck_raw_user_fleet_unique') THEN
        ALTER TABLE deck_raw ADD CONSTRAINT deck_raw_user_fleet_unique UNIQUE (user_id, api_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ship2_raw_user_ship_unique') THEN
        ALTER TABLE ship2_raw ADD CONSTRAINT ship2_raw_user_ship_unique UNIQUE (user_id, api_id);
    END IF;
END $$;
