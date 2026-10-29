import { test } from 'node:test'
import assert from 'node:assert/strict'
import { scanText } from './check-secrets.mjs'

// Every rule id scanText fires on a piece of text. This whole file is on the
// scanner's SKIP_PATHS list, so the example secrets below never trip
// `check:secrets --all` against the repo itself.
function ids(text) {
	return scanText(text).map((finding) => finding.ruleId)
}

function flags(text) {
	return scanText(text).length > 0
}

test('flags a connection string with a real inline password', () => {
	const url = 'postgresql://prod_user:Xk9vQ2mZr7SdF3pLw8bN@db.abcdefgh.supabase.co:5432/postgres'
	assert.ok(ids(`DATABASE_URL="${url}"`).includes('url-credentials'))
})

test('ignores a connection string whose password is a placeholder', () => {
	for (const url of [
		'postgresql://user:password@host:6543/postgres',
		'postgresql://postgres:postgres@localhost:5432/postgres',
		'postgresql://placeholder:placeholder@localhost:5432/placeholder',
		'postgresql://user:s3cr3t@db.example.com:5432/postgres'
	]) {
		assert.equal(flags(url), false, url)
	}
})

test('flags provider-format keys', () => {
	assert.ok(ids('AKIAIOSFODNN7EXAMPLE').includes('aws-access-key-id'))
	assert.ok(ids('ghp_' + 'a'.repeat(36) + '9').includes('github-token'))
	assert.ok(ids(['xoxb', '123456789012', 'abcdefghijkl'].join('-')).includes('slack-token'))
	assert.ok(ids('AIza' + 'b'.repeat(35)).includes('google-api-key'))
	assert.ok(ids('sk-ant-' + 'c'.repeat(40)).includes('openai-anthropic-key'))
})

test('flags a PEM private-key header', () => {
	assert.ok(ids('-----BEGIN OPENSSH PRIVATE KEY-----').includes('private-key'))
})

test('flags a JWT such as a legacy Supabase service-role key', () => {
	const jwt =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc123def456ghi789jkl012mno345pqr678'
	assert.ok(ids(`SUPABASE_SERVICE_ROLE_KEY=${jwt}`).includes('jwt'))
})

test('flags a Supabase sb_secret_ key but not the public sb_publishable_ key', () => {
	assert.ok(
		ids('SUPABASE_SECRET_KEY=sb_secret_Xk9vQ2mZr7SdF3pLw8bNqA1cE5hJ').includes(
			'supabase-secret-key'
		)
	)
	assert.equal(
		flags('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_2UKBETne05Ty4D5otSqBqw_l5imAkfv'),
		false
	)
	assert.equal(flags('SUPABASE_SECRET_KEY=sb_secret_<your-key>'), false)
})

test('flags a high-entropy Bearer token but not a placeholder or env reference', () => {
	const real = 'Authorization: Bearer 8Fq2Xy9KpQ7mNvR2tLwE5sHfGjD8cU1o'
	assert.ok(ids(real).includes('auth-header'))
	assert.equal(flags('Authorization: Bearer sk-or-not-a-real-key'), false)
	assert.equal(flags('Authorization: Bearer $CRON_SECRET'), false)
})

test('flags a secret-shaped value on a credential-named key, base64 or hex', () => {
	assert.ok(ids('API_KEY=aB3xYz9KpQ7mNvR2tLwE5sHfGjD8cU1oZ4iX6yA').includes('sensitive-assignment'))
	assert.ok(
		ids('MY_CUSTOM_TOKEN=9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1908').includes('sensitive-assignment')
	)
})

test('does not fire the assignment rule on non-credential keys or ordinary code', () => {
	// A 40-char git SHA on a non-credential key.
	assert.equal(flags('GITHUB_SHA=9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1908'), false)
	// A per-request HMAC signature is derived, not a reusable credential.
	assert.equal(
		flags('x-app-signature: 1788517056488.VMLQiJtI7kwwhrrbYRRB5ipRyaPsjHIgLLzYzSgFWQQ'),
		false
	)
	// Ordinary source: a schema declaration and a property reference.
	assert.equal(flags('const secret = z.string().min(1)'), false)
	assert.equal(flags('const apiKey = opts.apiKey'), false)
	// An empty or clearly-templated value.
	assert.equal(flags('SUPABASE_SERVICE_ROLE_KEY=""'), false)
	assert.equal(flags('API_KEY=${OPENAI_API_KEY}'), false)
})

test('an inline `allowlist secret` comment suppresses the line', () => {
	const line = 'API_KEY=aB3xYz9KpQ7mNvR2tLwE5sHfGjD8cU1oZ4iX6yA // allowlist secret'
	assert.equal(flags(line), false)
})

test('reports the same secret once even when two rules match it', () => {
	// A service-role JWT is both a `jwt` and a credential assignment; dedup by
	// masked value keeps one finding per secret.
	const jwt =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.abc123def456ghi789jkl012mno345pqr678'
	const found = scanText(`SERVICE_ROLE_KEY=${jwt}`)
	assert.equal(found.length, 1)
	assert.equal(found[0].ruleId, 'jwt')
})

test('reads a word-shaped Slack token as the test double it is', () => {
	// The real-shaped tokens are joined at runtime so no full token sits in the
	// file for a push-protection scanner to flag.
	// Real tokens carry a numeric team/app id; `xoxb-<words>` is a fixture.
	assert.equal(flags("token: 'xoxb-slack-token'"), false)
	assert.equal(flags("PAYMENTS_BOT_TOKEN: 'xoxb-payments-token'"), false)
	assert.ok(
		ids(['xoxb', '292461728594', '2938471625093', 'Rv8QmZp2Lk4XcTy6Bn0Wd3Hs'].join('-')).includes(
			'slack-token'
		)
	)
	// Legacy workspace tokens put a short version marker before the team id.
	assert.ok(
		ids(['xoxa', '2', '123456789012', 'abcdefghijklmnopqrstuv'].join('-')).includes('slack-token')
	)
})

test('leaves a fixture to declare itself rather than inferring one', () => {
	// A value that merely spells `test` or `sentinel` is not exempt: a staging
	// password reads that way too, and that is a credential worth catching.
	assert.ok(ids("const VALID_KEY = 'test-lookup-key-0123456789'").length > 0)
	assert.ok(ids('API_KEY=aB3xYzLatest7mNvR2tLwE5sHfGjD8cU1oZ4iX').includes('sensitive-assignment'))
	// The fixture says so itself, which also documents it for the next reader.
	assert.equal(flags("const VALID_KEY = 'test-lookup-key-0123456789' // allowlist secret"), false)
	// Nor is a short token exempt for spelling `value`: that is the same
	// inference, and the annotation is how a fixture opts out.
	assert.ok(ids('API_KEY=Z7qP-value-H9nX3mK2rT6w').includes('sensitive-assignment'))
	assert.equal(flags('API_KEY=Z7qP-value-H9nX3mK2rT6w // allowlist secret'), false)
})

test('does not read an object key as a credential', () => {
	// The exemption is read off the field, not the value.
	assert.equal(flags("objectKey: 'post-videos/clips/7106594312292453675.mp4'"), false)
	assert.equal(flags("videoObjectKey: 'uploads/2026/09/20/creator-4821/avatar.png'"), false)
	assert.equal(flags("demoVideoObjectKey: 'other-bucket-prefix/abc.mp4'"), false)
	// A credential-named field never gets it, however the value is spelled —
	// as one blob, as one long segment, or chopped into path-shaped pieces.
	assert.ok(
		ids("API_KEY='aB3xYz9KpQ7m/NvR2tLwE5sHfGjD8cU1o.aB12'").includes('sensitive-assignment')
	)
	assert.ok(
		ids("API_KEY='AbC9xY2Q7mNvR2tLwE5sHfGjD8cU1oZ4iX6yA/path.mp4'").includes('sensitive-assignment')
	)
	assert.ok(
		ids("API_KEY='aBcDeFgHiJkLmNoPqR/StuVwXyZ0123456789/path.mp4'").includes('sensitive-assignment')
	)
	assert.ok(
		ids("API_KEY='uploads/aB3xYz9KpQ7m+/NvR2tLwE5sHfG=/clip.mp4'").includes('sensitive-assignment')
	)
	assert.ok(
		ids("API_KEY='aBcDeFgHi1/JkLmNoPq2/RsTuVwXyZ3/path.mp4'").includes('sensitive-assignment')
	)
	// And a credential with a slash in it is still a credential.
	assert.ok(
		ids("Authorization: 'Bearer Rv8QmZp2Lk4XcTy6Bn0Wd3Hs/Jf5Gx1Pq'").includes('auth-header')
	)
	// `key` is the only credential word a storage field may carry: a capability
	// URL is shaped exactly like a path, and that is what makes it a credential.
	assert.ok(
		ids("secretVideoUrl: 'xJ8mQ2vNpR7tK4wL9cF3sD6hG1jY5uI2oP4/clip.mp4'").includes(
			'sensitive-assignment'
		)
	)
	assert.ok(
		ids("API_TOKEN_PATH='xJ8mQ2vNpR7tK4wL9cF3sD6hG1jY5uI2oP4/clip.mp4'").includes(
			'sensitive-assignment'
		)
	)
})

test('does not read a presigned-URL signature as a credential', () => {
	const signature = 'b35b3a2c0396897ee938f599ac4df09930de2528048015f1680eb01c7d4a92c8'
	assert.equal(flags(`https://r2.internal/clip.mp4?X-Amz-Signature=${signature}`), false)
	// The reusable half of a real presigned URL is still caught.
	const credential = 'AKIA4ZQ7XW2LMNPRTV6B%2F20260920%2Fus-east-1%2Fs3%2Faws4_request'
	assert.ok(
		ids(`https://bucket.s3.amazonaws.com/clip.mp4?X-Amz-Credential=${credential}`).includes(
			'aws-access-key-id'
		)
	)
	// Only the named presigned parameters are exempt — `?signature=` on any
	// other callback URL carries no such guarantee.
	assert.ok(
		ids(`https://callback.internal/hook?signature=${signature}`).includes('sensitive-query-param')
	)
})
