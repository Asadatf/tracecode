#!/usr/bin/env python3
"""Regression tests for extract-log.py's redaction. Run: python3 -B .claude/hooks/test_extract_log.py

Every project ref below is synthetic and assembled at runtime, so no
ref-shaped literal sits in this file for check:secrets to trip over.
"""

import contextlib
import importlib.util
import io
import json
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

sys.dont_write_bytecode = True


def scrub_git_env() -> None:
    """Drop repo-local GIT_* variables (GIT_DIR, GIT_WORK_TREE, ...) that git exports to hooks.

    The pre-push hook runs these tests with GIT_DIR pointing at the real repo, which would make
    every temp clone below resolve to the real .git and its ref cache. Each test must see only
    its own temporary repository.
    """
    names = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_PREFIX']
    try:
        out = subprocess.run(['git', 'rev-parse', '--local-env-vars'], capture_output=True, text=True, timeout=5)
        if out.returncode == 0:
            names += out.stdout.split()
    except (OSError, subprocess.TimeoutExpired):
        pass
    for name in names:
        os.environ.pop(name, None)


scrub_git_env()

HOOK = Path(__file__).with_name('extract-log.py')
spec = importlib.util.spec_from_file_location('extract_log', HOOK)
hook = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hook)

REF = 'qrstuvwxyz' + '0123456789'
OTHER_REF = 'zyxwvutsrq' + '9876543210'
PLACEHOLDER = '[SUPABASE_REF REDACTED]'


def make_clone(root: Path) -> Path:
    """A fresh clone: a .git directory and nothing else (no .env files, no cache)."""
    (root / '.git').mkdir()
    return root


class GitHookEnvironmentTest(unittest.TestCase):
    """The suite must pass when run by a git hook, with GIT_DIR/GIT_WORK_TREE inherited."""

    def test_suite_passes_with_git_hook_environment_variables_set(self):
        if os.environ.get('EXTRACT_LOG_NESTED_RUN'):
            self.skipTest('nested run')
        if subprocess.run(['git', '--version'], capture_output=True).returncode != 0:
            self.skipTest('git unavailable')
        with tempfile.TemporaryDirectory() as tmp:
            subprocess.run(['git', 'init', '-q', tmp], check=True)
            env = dict(os.environ, GIT_DIR=str(Path(tmp) / '.git'), GIT_WORK_TREE=tmp, EXTRACT_LOG_NESTED_RUN='1')
            result = subprocess.run(
                [sys.executable, '-B', str(Path(__file__)), '-k', 'RedactionTest'],
                capture_output=True, text=True, env=env,
            )
        self.assertEqual(result.returncode, 0, result.stderr[-2000:])


class RedactionTest(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.cwd = make_clone(Path(tmp.name))
        self.cache = self.cwd / '.git' / 'claude-log-refs'

    def run_log(self, text, environ=None):
        return hook.redact_log(text, self.cwd, environ if environ is not None else {})

    # -- discovery ---------------------------------------------------------

    def test_fresh_clone_learns_ref_from_a_connection_string(self):
        out = self.run_log(f'url postgresql://postgres.{REF}:[PASSWORD]@h:6543/postgres')
        self.assertNotIn(REF, out)
        self.assertIn(f'postgres.{PLACEHOLDER}:', out)

    def test_structured_forms_are_all_recognised(self):
        text = f'db.{REF}.supabase.co {REF}.supabase.com supabase.com/dashboard/project/{REF}/settings'
        out = self.run_log(text)
        self.assertNotIn(REF, out)
        self.assertEqual(out.count(PLACEHOLDER), 3)

    def test_two_pass_redacts_a_bare_ref_before_its_url(self):
        text = f'Project ID: `{REF}`\nlater: db.{REF}.supabase.co\nand again {REF}.'
        out = self.run_log(text)
        self.assertNotIn(REF, out)
        self.assertTrue(out.startswith(f'Project ID: `{PLACEHOLDER}`'))

    def test_bare_ref_with_no_structured_source_is_not_guessed(self):
        text = f'a 20-char token {REF} and a hash 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b'
        self.assertEqual(self.run_log(text), text)

    def test_ref_inside_a_longer_token_is_left_alone(self):
        self.run_log(f'db.{REF}.supabase.co')
        longer = f'x{REF}y and {REF}0 and sha-{REF}z'
        self.assertEqual(self.run_log(longer), longer)

    # -- cache -------------------------------------------------------------

    def test_cache_is_written_owner_only_and_reused_by_a_later_session(self):
        self.run_log(f'postgres.{REF}:[PASSWORD]')
        self.assertEqual(self.cache.read_text().split(), [REF])
        if os.name == 'posix':
            self.assertEqual(stat.S_IMODE(self.cache.stat().st_mode), 0o600)
        later = self.run_log(f'prose only, Project ID: {REF}')
        self.assertEqual(later, f'prose only, Project ID: {PLACEHOLDER}')

    def test_cache_accumulates_refs_without_dropping_old_ones(self):
        self.run_log(f'db.{REF}.supabase.co')
        self.run_log(f'db.{OTHER_REF}.supabase.co')
        self.assertEqual(set(self.cache.read_text().split()), {REF, OTHER_REF})

    def test_malformed_cache_is_ignored_not_fatal(self):
        for garbage in [b'\xff\xfe\x00\x01', b'not a ref\n' * 50, b'A' * 200_000, b'', REF.encode() + b'extra\n']:
            self.cache.write_bytes(garbage)
            self.assertEqual(self.run_log('nothing to see'), 'nothing to see')

    def test_valid_lines_survive_among_malformed_ones(self):
        self.cache.write_text(f'junk\n{REF}\n\x00\n{REF.upper()}\n')
        self.assertEqual(hook.load_cached_refs(self.cache), {REF})
        self.assertNotIn(REF, self.run_log(f'bare {REF}'))

    def test_cache_that_is_a_directory_or_symlink_is_ignored(self):
        self.cache.mkdir()
        self.assertEqual(self.run_log(f'bare {REF}'), f'bare {REF}')
        self.cache.rmdir()
        target = self.cwd / 'elsewhere'
        target.write_text(REF + '\n')
        self.cache.symlink_to(target)
        self.assertEqual(self.run_log(f'bare {REF}'), f'bare {REF}')

    def test_unwritable_git_dir_does_not_break_redaction(self):
        no_git = self.cwd / 'sub'
        no_git.mkdir()
        (self.cwd / '.git').rename(self.cwd / '.git-moved')
        out = hook.redact_log(f'db.{REF}.supabase.co and {REF}', no_git, {})
        self.assertNotIn(REF, out)

    def test_cache_lives_in_the_common_git_dir_of_a_worktree(self):
        if subprocess.run(['git', '--version'], capture_output=True).returncode != 0:
            self.skipTest('git unavailable')
        with tempfile.TemporaryDirectory() as tmp:
            main = Path(tmp) / 'main'
            tree = Path(tmp) / 'tree'
            git = ['git', '-C', str(main), '-c', 'user.name=t', '-c', 'user.email=t@t.invalid']
            subprocess.run(['git', 'init', '-q', str(main)], check=True)
            subprocess.run(git + ['commit', '-q', '--allow-empty', '-m', 'init'], check=True)
            subprocess.run(git + ['worktree', 'add', '-q', str(tree)], check=True)
            self.assertTrue((tree / '.git').is_file())
            hook.redact_log(f'postgres.{REF}:x', tree, {})
            self.assertTrue((main / '.git' / 'claude-log-refs').is_file())

    # -- env sources -------------------------------------------------------

    def test_missing_env_files_and_empty_environment_are_fine(self):
        self.assertEqual(self.run_log('plain text'), 'plain text')
        self.assertEqual(hook.env_refs(self.cwd, {}), set())

    def test_env_files_supply_refs(self):
        (self.cwd / '.env.local').write_text(f'DATABASE_URL="postgresql://postgres.{REF}:pw@h/db"\n')
        (self.cwd / '.env').write_text(f'SUPABASE_PROJECT_REF={OTHER_REF}\n')
        out = self.run_log(f'one {REF} two {OTHER_REF}')
        self.assertEqual(out, f'one {PLACEHOLDER} two {PLACEHOLDER}')

    def test_process_environment_supplies_refs_only_from_relevant_names(self):
        environ = {'NEXT_PUBLIC_SUPABASE_URL': f'https://{REF}.supabase.co', 'UNRELATED': f'{OTHER_REF}.supabase.co'}
        self.assertEqual(hook.env_refs(self.cwd, environ), {REF})

    def test_undecodable_env_file_is_skipped(self):
        (self.cwd / '.env.local').write_bytes(b'\xff\xfe\x00')
        self.assertEqual(hook.env_refs(self.cwd, {}), set())

    def test_learned_refs_are_never_printed(self):
        (self.cwd / '.env.local').write_text(f'SUPABASE_PROJECT_REF={REF}\n')
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            self.run_log('nothing')
        self.assertNotIn(REF, out.getvalue() + err.getvalue())

    # -- emails and pins ---------------------------------------------------

    def test_emails_are_redacted_but_github_noreply_is_kept(self):
        out = self.run_log('a.b@corp.io, x@sub.example.com. 115396574+someone@users.noreply.github.com')
        self.assertEqual(out.count('[EMAIL REDACTED]'), 2)
        self.assertIn('115396574+someone@users.noreply.github.com', out)

    def test_package_pins_are_not_emails(self):
        text = 'pnpm@10.6.2 pyodide@0.27.7 next@16.0.0-beta.1 react@19'
        self.assertEqual(self.run_log(text), text)

    def test_masked_email_is_not_redacted_again(self):
        self.assertEqual(self.run_log('git_email: ' + hook.mask_email('someone@gmail.com')), 'git_email: s***@gmail.com')

    # -- end to end --------------------------------------------------------

    def test_hook_run_writes_a_redacted_log_for_a_fresh_clone(self):
        with tempfile.TemporaryDirectory() as home:
            project_dir = Path(home) / '.claude' / 'projects' / str(self.cwd).replace('/', '-')
            project_dir.mkdir(parents=True)
            rows = [
                {'type': 'user', 'timestamp': '2026-01-01T00:00:00Z', 'message': {'content': f'ref {REF} then db.{REF}.supabase.co'}},
                {'type': 'assistant', 'timestamp': '2026-01-01T00:00:01Z', 'message': {'content': [{'type': 'text', 'text': f'ok {REF}'}]}},
            ]
            (project_dir / 'sess.jsonl').write_text('\n'.join(json.dumps(r) for r in rows))
            env = dict(os.environ, HOME=home, CLAUDE_CWD=str(self.cwd))
            subprocess.run([sys.executable, '-B', str(HOOK)], input='{"session_id":"sess"}', text=True, env=env, check=True)
            log = next((self.cwd / '.claude-logs').glob('*_sess.md')).read_text()
            self.assertNotIn(REF, log)
            self.assertIn(PLACEHOLDER, log)


if __name__ == '__main__':
    unittest.main()
