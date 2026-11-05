import 'server-only'

// The only import path to the hidden grading suites for application code. `server-only`
// makes any attempt to pull them into a client bundle a build error.
export {
	HIDDEN_SUITES,
	ELIGIBLE_SLUGS,
	type HiddenCase,
	type HiddenSuite
} from './hidden-suites.data'
