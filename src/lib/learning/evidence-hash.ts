import { createHash } from 'node:crypto'
import type { RecommendationEvidence } from './recommendation-evidence'

// The evidence fingerprint (M7.2): a content-addressed hash of everything in a
// RecommendationEvidence that is MEANINGFUL, so the recommendation cache (M7.3) and
// the AI diagnosis (M7.4) can tell whether what they were built from still holds.
//
// - Same meaningful content -> same hash, whatever order arrays or keys arrived in
//   (keys are sorted when serialised; the evidence builder already sorts every
//   list it emits).
// - It covers the outcomes AND the structural fingerprints, so a backfill that
//   fills a previously missing fingerprint changes the hash even though the attempt
//   ids and the fingerprint schema version are unchanged. A new attempt, a changed
//   outcome, a new hint or replay, or a different catalog entry change it too.
// - It excludes the one volatile field, `generatedAt`.
// - It is versioned. Bump EVIDENCE_FINGERPRINT_VERSION when the evidence shape or
//   this canonicalisation changes in a way that should invalidate everything
//   cached, and old hashes can never be mistaken for new ones.
//
// Server-side only: it uses node:crypto, so do not import it from a client component.

export const EVIDENCE_FINGERPRINT_VERSION = 1

// JSON with object keys sorted at every level and `undefined` members dropped.
// Arrays keep their order (order is meaningful and already normalised upstream).
// A non-finite number has no JSON form, so it is an error rather than a silent null.
export function canonicalJson(value: unknown): string {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') {
		return JSON.stringify(value)
	}
	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number')
		return JSON.stringify(value)
	}
	if (Array.isArray(value)) {
		return `[${value.map((item) => canonicalJson(item === undefined ? null : item)).join(',')}]`
	}
	if (typeof value === 'object') {
		const members = Object.entries(value)
			.filter(([, member]) => member !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
			.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`)
		return `{${members.join(',')}}`
	}
	throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`)
}

// The evidence minus its volatile fields: exactly what the hash covers. Fields are
// listed one by one, and the return type is Omit<..., 'generatedAt'>, so a field
// added to RecommendationEvidence later fails to compile here until it is
// consciously included in the fingerprint.
export function fingerprintView(
	evidence: RecommendationEvidence
): Omit<RecommendationEvidence, 'generatedAt'> {
	return {
		v: evidence.v,
		hasActivity: evidence.hasActivity,
		totals: evidence.totals,
		problems: evidence.problems,
		concepts: evidence.concepts,
		insights: evidence.insights
	}
}

export function computeEvidenceHash(evidence: RecommendationEvidence): string {
	const digest = createHash('sha256')
		.update(
			canonicalJson({
				fingerprint: EVIDENCE_FINGERPRINT_VERSION,
				evidence: fingerprintView(evidence)
			})
		)
		.digest('hex')
	return `ev${EVIDENCE_FINGERPRINT_VERSION}:${digest}`
}
