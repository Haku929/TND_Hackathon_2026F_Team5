create table if not exists researcher_chunks (
  researcher_id text not null references researchers(id),
  project_id    text not null,
  chunk_index   integer not null check (chunk_index >= 0),
  content       text not null,
  embedding     vector(384) not null,
  primary key (researcher_id, project_id, chunk_index)
);
