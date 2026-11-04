import { createTutorRoute } from '@/server/api/tutor-route'

// The tutor endpoint is server-side (docs/rules/ai-usage.md). The OpenAI key
// is read inside askOpenAI(), never returned, and never shipped to the
// browser bundle (this file is a server-only route).
export const POST = createTutorRoute()
export const runtime = 'nodejs'
