-- 同步探针：验证 GitHub → Supabase 迁移链路（下一步随即删除）
create table if not exists public._sync_probe (id int);
