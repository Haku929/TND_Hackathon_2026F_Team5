create extension if not exists vector;

-- 分野カード
create table fields (
  id            text primary key,          -- 'philosophy'
  name          text not null,
  summary       text not null,
  misconception text not null,
  embedding     vector(384) not null       -- name + summary + 用語から作る
);

-- 分野ごとの専門用語（「あなたの問いの、この分野での呼び名」）
create table terms (
  id          serial primary key,
  field_id    text not null references fields(id),
  term        text not null,
  description text not null,
  embedding   vector(384) not null
);

-- 先生（KAKEN の研究者）
create table researchers (
  id          text primary key,            -- KAKEN の研究者番号
  name        text not null,
  affiliation text not null,               -- 学部・学科
  theme       text not null,               -- 画面に出す研究テーマ
  kaken_url   text not null,
  embedding   vector(384) not null
);

-- 先生と分野の対応（1 人が複数分野に属することがある）
create table researcher_fields (
  researcher_id text not null references researchers(id),
  field_id      text not null references fields(id),
  primary key (researcher_id, field_id)
);