import { resolveEmailConfig, type EmailConfig, type EmailEnv } from './email-config'

// Hackathon release policy: changing environment settings cannot enable reminder email.
// Auth emails are managed separately by Supabase and never use this policy.
export const REMINDER_EMAIL_ENABLED = false

export function resolveReminderEmailConfig(env: EmailEnv): EmailConfig {
	if (!REMINDER_EMAIL_ENABLED) return { enabled: false, reason: 'release_disabled' }
	return resolveEmailConfig(env)
}
