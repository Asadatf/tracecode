// The only file in this project allowed to import an icon library.
// `no-restricted-imports` in eslint.config.mjs enforces that — everything
// else imports from '@/components/ui/icons'. See docs/rules/icons.md for
// the why; this file is the how.
//
// Swapping provider (phosphor -> lucide, heroicons, tabler, ...) is three
// edits, all inside this file:
//   1. the import below,
//   2. `Glyph`'s body, so the provider's own prop names get the same
//      IconProps shape mapped onto them,
//   3. the export list, mapping each name to the new provider's equivalent.
// Nothing outside this file changes — that's the entire point of it.
//
// Imported from phosphor's `/ssr` entry, not its root, deliberately: the
// root entry's icons read their defaults from a React context, which makes
// them Client Components, and the package ships no 'use client' directive
// to say so — a Server Component rendering one fails at request time. The
// `/ssr` build takes its props directly and renders in both. Keep this
// import path if you stay on phosphor.
import {
	ArrowCounterClockwise,
	ArrowRight,
	ArrowsClockwise,
	ArrowsIn,
	ArrowsOut,
	ArrowSquareOut,
	Bell,
	Fire,
	Calendar,
	CaretDown,
	CaretLeft,
	CaretRight,
	CaretUp,
	ChartLineUp,
	Check,
	CheckCircle,
	CircleNotch,
	Code,
	Copy,
	DotsThreeVertical,
	DownloadSimple,
	Eye,
	EyeSlash,
	FunnelSimple,
	Gear,
	GithubLogo,
	Info,
	Lightbulb,
	List,
	ListChecks,
	Lock,
	MagnifyingGlass,
	Minus,
	Pause,
	PaperPlaneRight,
	PencilSimple,
	Play,
	Plus,
	SidebarSimple,
	SignOut,
	Sparkle,
	Sliders,
	SquaresFour,
	TextIndent,
	Timer,
	Trash,
	Question,
	User,
	Warning,
	X
} from '@phosphor-icons/react/ssr'
import type { Icon } from '@phosphor-icons/react'
import { cn } from '@/lib/cn'

// Deliberately narrower than the provider's own props: a call site can set
// size and classes, and nothing else. Provider-specific props (phosphor's
// `weight` and `mirrored`, lucide's `strokeWidth`) stay out so a swap can't
// break call sites — set those once in `Glyph` below if this project wants
// a different house style.
export type IconProps = {
	// Pixels. 16 pairs with `text-sm`; bump per call site, don't change the
	// default without checking the components that rely on it.
	size?: number
	className?: string
}

const DEFAULT_SIZE = 16

function Glyph({ source: Source, size = DEFAULT_SIZE, className }: IconProps & { source: Icon }) {
	return (
		<Source
			size={size}
			className={className}
			// Every icon here is decorative — it sits next to a text label, or
			// inside a control that carries its own aria-label. Hiding it stops
			// a screen reader announcing the same thing twice. An icon-only
			// button labels the *button*, never the glyph (see DESIGN.md's
			// accessibility baseline), so there is no per-icon label prop.
			aria-hidden
			// Icons inherit the text color of whatever they sit in — that's why
			// no color token appears anywhere in this file.
			color="currentColor"
			// The house stroke weight, in one place. 'regular' is phosphor's own
			// default; change it here to restyle every icon at once.
			weight="regular"
		/>
	)
}

// One line per icon, named for its role where the project has one
// (SpinnerIcon, not CircleNotchIcon) — a rename here should never cascade
// through call sites, same rule as the design tokens in DESIGN.md. It also
// means the next provider's spelling (phosphor's CaretDown vs. lucide's
// ChevronDown) stays behind this file.
//
// Add an icon when a component actually needs it; don't mirror the
// provider's whole catalog here. Keep the list alphabetical.
export const AlertIcon = (props: IconProps) => <Glyph source={Warning} {...props} />
export const ArrowRightIcon = (props: IconProps) => <Glyph source={ArrowRight} {...props} />
export const BellIcon = (props: IconProps) => <Glyph source={Bell} {...props} />
export const FlameIcon = (props: IconProps) => <Glyph source={Fire} {...props} />
export const CalendarIcon = (props: IconProps) => <Glyph source={Calendar} {...props} />
export const ChartIcon = (props: IconProps) => <Glyph source={ChartLineUp} {...props} />
export const CheckIcon = (props: IconProps) => <Glyph source={Check} {...props} />
export const ChevronDownIcon = (props: IconProps) => <Glyph source={CaretDown} {...props} />
export const ChevronLeftIcon = (props: IconProps) => <Glyph source={CaretLeft} {...props} />
export const ChevronRightIcon = (props: IconProps) => <Glyph source={CaretRight} {...props} />
export const ChevronUpIcon = (props: IconProps) => <Glyph source={CaretUp} {...props} />
export const CloseIcon = (props: IconProps) => <Glyph source={X} {...props} />
export const CodeIcon = (props: IconProps) => <Glyph source={Code} {...props} />
export const CopyIcon = (props: IconProps) => <Glyph source={Copy} {...props} />
export const DashboardIcon = (props: IconProps) => <Glyph source={SquaresFour} {...props} />
export const DownloadIcon = (props: IconProps) => <Glyph source={DownloadSimple} {...props} />
export const EditIcon = (props: IconProps) => <Glyph source={PencilSimple} {...props} />
export const ExternalLinkIcon = (props: IconProps) => <Glyph source={ArrowSquareOut} {...props} />
export const EyeIcon = (props: IconProps) => <Glyph source={Eye} {...props} />
export const EyeOffIcon = (props: IconProps) => <Glyph source={EyeSlash} {...props} />
export const FilterIcon = (props: IconProps) => <Glyph source={FunnelSimple} {...props} />
export const ExpandIcon = (props: IconProps) => <Glyph source={ArrowsOut} {...props} />
export const FormatIcon = (props: IconProps) => <Glyph source={TextIndent} {...props} />
export const HelpIcon = (props: IconProps) => <Glyph source={Question} {...props} />
export const PauseIcon = (props: IconProps) => <Glyph source={Pause} {...props} />
export const PlayIcon = (props: IconProps) => <Glyph source={Play} {...props} />
export const PlanIcon = (props: IconProps) => <Glyph source={ListChecks} {...props} />
export const GitHubIcon = (props: IconProps) => <Glyph source={GithubLogo} {...props} />

// Google's multicolour "G". Not a provider glyph: Google's sign-in branding
// guidelines require these exact colours on a "Continue with Google" button, so
// it can't inherit currentColor like every other icon here. Decorative, like
// the rest (the button carries the label).
export function GoogleIcon({ size = DEFAULT_SIZE, className }: IconProps) {
	return (
		<svg width={size} height={size} viewBox="0 0 48 48" className={className} aria-hidden="true">
			<path
				fill="#FFC107"
				d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
			/>
			<path
				fill="#FF3D00"
				d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
			/>
			<path
				fill="#4CAF50"
				d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
			/>
			<path
				fill="#1976D2"
				d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
			/>
		</svg>
	)
}
export const ResetIcon = (props: IconProps) => <Glyph source={ArrowCounterClockwise} {...props} />
export const ShrinkIcon = (props: IconProps) => <Glyph source={ArrowsIn} {...props} />
export const TimerIcon = (props: IconProps) => <Glyph source={Timer} {...props} />
export const InfoIcon = (props: IconProps) => <Glyph source={Info} {...props} />
export const LightbulbIcon = (props: IconProps) => <Glyph source={Lightbulb} {...props} />
export const LockIcon = (props: IconProps) => <Glyph source={Lock} {...props} />
export const MenuIcon = (props: IconProps) => <Glyph source={List} {...props} />
export const MinusIcon = (props: IconProps) => <Glyph source={Minus} {...props} />
export const MoreIcon = (props: IconProps) => <Glyph source={DotsThreeVertical} {...props} />
export const PlusIcon = (props: IconProps) => <Glyph source={Plus} {...props} />
export const RefreshIcon = (props: IconProps) => <Glyph source={ArrowsClockwise} {...props} />
export const SearchIcon = (props: IconProps) => <Glyph source={MagnifyingGlass} {...props} />
export const SendIcon = (props: IconProps) => <Glyph source={PaperPlaneRight} {...props} />
export const SettingsIcon = (props: IconProps) => <Glyph source={Gear} {...props} />
export const SidebarIcon = (props: IconProps) => <Glyph source={SidebarSimple} {...props} />
export const SignOutIcon = (props: IconProps) => <Glyph source={SignOut} {...props} />
export const SlidersIcon = (props: IconProps) => <Glyph source={Sliders} {...props} />
export const SparkleIcon = (props: IconProps) => <Glyph source={Sparkle} {...props} />
export const SuccessIcon = (props: IconProps) => <Glyph source={CheckCircle} {...props} />
export const TrashIcon = (props: IconProps) => <Glyph source={Trash} {...props} />
export const UserIcon = (props: IconProps) => <Glyph source={User} {...props} />

// The spinner is the one icon that carries its own behaviour — every call
// site was animating it by hand, so it does it here instead. `motion-reduce`
// honours prefers-reduced-motion (DESIGN.md).
export const SpinnerIcon = ({ className, ...props }: IconProps) => (
	<Glyph
		source={CircleNotch}
		className={cn('animate-spin motion-reduce:animate-none', className)}
		{...props}
	/>
)
