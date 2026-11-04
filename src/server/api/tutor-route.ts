import 'server-only'
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { tutorRequestSchema } from '@/lib/tutor/types'
import { currentUserIdSafe } from '@/server/auth/session'
import { handleTutorStreamRequest } from '@/server/tutor/handler'
import { captureError } from '@/lib/observability/capture-error'

// Streaming tutor endpoint. Returns NDJSON: one `{"type": "..."}` event
// per line, terminated with `\n`. On a precondition failure (auth,
// validation, rate-limit, unknown problem) returns a plain JSON object
// with the right HTTP status instead of a stream — the client treats a
// non-text/plain `content-type` as a terminal failure.

export function createTutorRoute() {
	return async function POST(req: NextRequest) {
		try {
			const userId = await currentUserIdSafe()
			if (userId == null) {
				return NextResponse.json(
					{ ok: false, reason: 'unavailable', message: 'Sign in to use the tutor.' },
					{ status: 401 }
				)
			}
			const raw = (await req.json().catch(() => null)) as unknown
			if (raw == null) {
				return NextResponse.json(
					{ ok: false, reason: 'invalid', message: 'Invalid request body.' },
					{ status: 400 }
				)
			}
			const input = tutorRequestSchema.parse(raw)
			const outcome = await handleTutorStreamRequest(userId, input, req.signal)
			if (!outcome.ok) {
				return NextResponse.json(outcome.response, { status: outcome.httpStatus })
			}
			return new Response(outcome.stream, {
				status: 200,
				headers: {
					'content-type': 'application/x-ndjson; charset=utf-8',
					// Disable intermediary buffering so each NDJSON line
					// reaches the client as it is produced.
					'cache-control': 'no-cache, no-transform',
					'x-accel-buffering': 'no'
				}
			})
		} catch (error) {
			if (error instanceof z.ZodError) {
				return NextResponse.json(
					{ ok: false, reason: 'invalid', message: 'Invalid tutor request.' },
					{ status: 400 }
				)
			}
			const { userMessage, status } = captureError(error)
			return NextResponse.json(
				{ ok: false, reason: 'unavailable', message: userMessage },
				{ status }
			)
		}
	}
}
