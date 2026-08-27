-- Feature 13 (tonight's mood): the youngest viewer in the room is a
-- room-wide fact the host states once at session start, not something each
-- participant reports about themselves, so it lives on `sessions` rather
-- than in `session_participants.constraints`.
alter table sessions
  add column youngest_viewer_age smallint;
