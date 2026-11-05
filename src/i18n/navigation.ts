import { createNavigation } from 'next-intl/navigation'
import { routing } from './locales'

// The plain locale-aware navigation primitives. Feature code does not import this:
// it imports from '@/i18n/routing', which swaps this Link for the one that shows the
// navigation curtain.
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
