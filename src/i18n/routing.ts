// Locale-aware Link/router/redirect — components that need navigation MUST
// import these instead of next/navigation, or locale switching breaks in
// production (client components resolve routes without the locale prefix
// otherwise).
//
// `Link` here is the locale-aware Link plus the navigation curtain
// (components/navigation); everything else is the plain next-intl primitive. The
// config lives in ./locales and the primitives in ./navigation so that wrapping Link
// does not make this file import itself.
export { routing } from './locales'
export { redirect, usePathname, useRouter, getPathname } from './navigation'
export { Link } from '@/components/navigation/curtain-link'
