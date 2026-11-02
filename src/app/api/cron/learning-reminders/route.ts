import { learningRemindersCron } from '@/server/api/learning-reminders-cron'

// Vercel Hobby caps a function's duration; the run stops starting new learners
// well before this (RUN_BUDGET_MS) and reports `truncated` if it had to.
export const maxDuration = 60

export const GET = learningRemindersCron
