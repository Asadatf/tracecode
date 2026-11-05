# 0009. In-app-only notifications for the hackathon

Date: 2026-11-05
Status: Accepted (Umair, explicit release requirements)
Supersedes: ADR-0004 email enablement and visible reminder preference controls for this release only.

## Context

The hackathon release has no verified sending domain. Environment-only gating
could accidentally enable reminder emails for existing opted-in learners.

## Decision

Disable both reminder email channels with a shared code-controlled release policy
and hide all reminder preference controls. In-app reminders are always active,
including for learners who previously opted out. Keep the daily cron, in-app notifications, saved
preferences, delivery tables and Resend implementation. Supabase Auth emails are
outside this policy and unchanged. Re-enabling reminder email requires a code change.

## Alternatives considered

- Rely on missing environment configuration: cannot guarantee this release stays in-app only.
- Remove email integration or clear opt-ins: unnecessary loss of future functionality and data.

## Consequences

No new infrastructure, environment variables or migrations. Historical email
delivery slots remain untouched; in-app reminder creation continues independently.
