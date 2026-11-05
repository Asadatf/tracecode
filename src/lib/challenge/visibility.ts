// The Daily Learning Challenge is a personal learning exercise, not a competition
// (specs/features/daily-challenge.md). The leaderboard, its navigation and its opt-in
// setting are built but hidden behind this one switch; the tables and server code stay
// in place so it can be brought back deliberately. The same switch also keeps the weekly
// standings archive from running (closeFinishedWeeks), so nothing ranks anyone while hidden.
// Bringing it back needs a spec change; `challenge_server_grading` is a separate switch.
export const LEADERBOARD_VISIBLE = false
