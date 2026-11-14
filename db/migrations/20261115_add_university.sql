-- 先生が所属する大学。既存の先生（立命館大学）は、既定値で埋める。
-- 他大学のデータを入れる前に、このファイルを実行する（追加だけ。既存のデータは消さない）。
alter table researchers
  add column if not exists university_id text not null default 'ritsumei';

create index if not exists researchers_university_id_idx
  on researchers (university_id);
