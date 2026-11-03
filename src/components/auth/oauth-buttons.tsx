import { getTranslations } from 'next-intl/server'
import { startOAuthAction } from '@/server/actions/oauth'
import { PROVIDER_NAME, type OAuthProvider } from '@/lib/auth/oauth'
import styles from './auth.module.css'

// "Continue with Google / GitHub" above the email form
// (specs/features/oauth-sign-in.md, AC1, AC2, AC4). Renders nothing when no
// provider is switched on. Plain forms posting to a server action, so they work
// before any JavaScript loads.
export async function OAuthButtons({
	providers,
	next,
	error
}: {
	providers: readonly OAuthProvider[]
	next: string | null
	error: string | null
}) {
	if (providers.length === 0) {
		return error == null ? null : (
			<p role="alert" className="text-danger text-sm">
				{error}
			</p>
		)
	}
	const t = await getTranslations('Auth.oauth')
	return (
		<div className={styles.oauth}>
			{error != null && (
				<p role="alert" className="text-danger text-sm">
					{error}
				</p>
			)}
			{providers.map((provider) => (
				<form key={provider} action={startOAuthAction}>
					<input type="hidden" name="provider" value={provider} />
					{next != null && <input type="hidden" name="next" value={next} />}
					<button type="submit" className={styles.oauthButton}>
						{t('continueWith', { provider: PROVIDER_NAME[provider] })}
					</button>
				</form>
			))}
			<p className={styles.oauthOr}>
				<span>{t('or')}</span>
			</p>
		</div>
	)
}
