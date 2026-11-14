-- User explicitly approved these scoped backend permissions on 2026-11-15.
-- Account deletion deletes these rows; moderation also hides replies.
-- Existing private schema, RLS policies, and Data API grants remain unchanged.
GRANT DELETE ON attendance.coaching_questions, attendance.coaching_replies,
    attendance.weekly_promise_changes TO attendance_api;
GRANT UPDATE ON attendance.coaching_replies TO attendance_api;
