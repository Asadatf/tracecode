'use client'

import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Link } from '@/i18n/routing'
import { signOutAction } from '@/server/actions/auth'
import { Avatar } from '@/components/avatar'
import styles from './application.module.css'

export function AccountMenu({
	email,
	labels,
	isSettings = false
}: {
	email: string | null
	isSettings?: boolean
	labels: {
		account: string
		signedInAs: string
		settings: string
		signOut: string
	}
}) {
	return (
		<DropdownMenu.Root>
			<DropdownMenu.Trigger className={styles.avatar} aria-label={labels.account}>
				<Avatar email={email} />
			</DropdownMenu.Trigger>
			<DropdownMenu.Portal>
				<DropdownMenu.Content
					className={styles.menu}
					align="end"
					sideOffset={10}
					collisionPadding={16}
				>
					<DropdownMenu.Label className={styles.menuLabel}>
						<span>{labels.signedInAs}</span>
						<span className={styles.email}>{email ?? labels.account}</span>
					</DropdownMenu.Label>
					<DropdownMenu.Separator className={styles.separator} />
					<DropdownMenu.Item asChild>
						<Link
							href="/settings"
							aria-current={isSettings ? 'page' : undefined}
							className={styles.menuItem}
						>
							{labels.settings}
						</Link>
					</DropdownMenu.Item>
					<DropdownMenu.Item
						className={styles.menuItem}
						onSelect={() => {
							void signOutAction()
						}}
					>
						{labels.signOut}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Portal>
		</DropdownMenu.Root>
	)
}
