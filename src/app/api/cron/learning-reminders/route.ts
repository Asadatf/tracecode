import { learningRemindersCron } from '@/server/api/learning-reminders-cron'

// Vercel caps a function's duration (300s is the Fluid compute default and Hobby maximum).
// Each step stops starting new work well before this — the reminders at RUN_BUDGET_MS
// (45s), challenge grading at CRON_GRADING_BUDGET_MS — and the headroom lets a grading
// already in its sandbox (up to about 2 minutes) finish instead of being cut off.
export const maxDuration = 300

export const GET = learningRemindersCron
