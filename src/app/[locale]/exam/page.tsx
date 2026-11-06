import type { Metadata } from 'next'
import { getLocale } from 'next-intl/server'
import { redirect } from '@/i18n/routing'
import { todayExamDate } from '@/server/exam/exam'

export async function generateMetadata(): Promise<Metadata> {
	return { title: 'Daily Exam | TraceCode', robots: { index: false, follow: false } }
}

// /exam goes to today's (UTC) exam.
export default async function ExamIndex() {
	redirect({ href: `/exam/${todayExamDate()}`, locale: await getLocale() })
	return null
}
