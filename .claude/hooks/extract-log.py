#!/usr/bin/env python3
"""Extract clean conversation logs from Claude Code sessions."""

import json
import os
import re
import subprocess
import sys
from pathlib import Path
from datetime import datetime
from typing import List, Optional, Tuple, Dict, Any


# ---------------------------------------------------------------------------
# Redaction. These logs are committed with the work, so every line passes
# through redact() before it is written. Keep in sync with
# scripts/check-secrets.mjs.
# ---------------------------------------------------------------------------

_SECRET_CHARS = r'[A-Za-z0-9_\-]'

# A Supabase project ref is 20 lowercase alphanumerics. It is only treated as one
# where its position says so (connection-string user, API/DB host, dashboard
# URL); a bare 20-character token is never guessed at. A ref learned from one of
# these positions is then redacted wherever it appears bare (see discover_refs).
REF_PLACEHOLDER = '[SUPABASE_REF REDACTED]'
_REF = r'[a-z0-9]{20}'
STRUCTURED_REF_PATTERNS: List[re.Pattern] = [
    re.compile(r'\bpostgres\.(' + _REF + r')(?![a-z0-9])(?=:)'),
    re.compile(r'(?<![A-Za-z0-9])(' + _REF + r')\.supabase\.(?:co|com)\b'),
    re.compile(r'supabase\.com/dashboard/project/(' + _REF + r')(?![a-z0-9])'),
]

REDACTIONS: List[Tuple[re.Pattern, str]] = [
    # Supabase API keys (new format) and personal access tokens
    (re.compile(r'sb_(secret|publishable)_' + _SECRET_CHARS + r'{4,}'), r'sb_\1_[REDACTED]'),
    (re.compile(r'sbp_[A-Za-z0-9]{20,}'), 'sbp_[REDACTED]'),
    # JWTs (Supabase legacy anon/service_role keys, session tokens)
    (re.compile(r'eyJ' + _SECRET_CHARS + r'{10,}\.eyJ' + _SECRET_CHARS + r'{10,}\.' + _SECRET_CHARS + r'{10,}'),
     '[JWT REDACTED]'),
    # Anthropic, OpenAI, OpenRouter, Stripe
    (re.compile(r'sk-ant-' + _SECRET_CHARS + r'{12,}'), 'sk-ant-[REDACTED]'),
    (re.compile(r'sk-or-' + _SECRET_CHARS + r'{12,}'), 'sk-or-[REDACTED]'),
    (re.compile(r'sk-(?:proj-|live_|test_)' + _SECRET_CHARS + r'{12,}'), 'sk-[REDACTED]'),
    # Resend
    (re.compile(r'\bre_[A-Za-z0-9_]{20,}'), 're_[REDACTED]'),
    # GitHub tokens
    (re.compile(r'\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}'), r'\1_[REDACTED]'),
    (re.compile(r'github_pat_[A-Za-z0-9_]{20,}'), 'github_pat_[REDACTED]'),
    # AWS, Google, Slack
    (re.compile(r'\bAKIA[0-9A-Z]{16}\b'), 'AKIA[REDACTED]'),
    (re.compile(r'\bAIza[0-9A-Za-z_\-]{30,}'), 'AIza[REDACTED]'),
    (re.compile(r'\bxox[baprs]-[A-Za-z0-9\-]{10,}'), 'xox-[REDACTED]'),
    # Connection strings with embedded passwords
    (re.compile(r'((?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp)://[A-Za-z0-9._%\-]+:)[A-Za-z0-9._%+!$*#~\-]{4,}@'),
     r'\1[REDACTED]@'),
    # Private key blocks
    (re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)', re.DOTALL),
     '[PRIVATE KEY REDACTED]'),
    # SECRET=value style assignments (KEY, TOKEN, SECRET, PASSWORD, ...)
    (re.compile(r'(?im)^(\s*(?:export\s+)?[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|DATABASE_URL|DIRECT_URL)[A-Z0-9_]*\s*[=:]\s*)(?!\[REDACTED)["\']?[^\s"\']{6,}["\']?'),
     r'\1[REDACTED]'),
]

# The final label must be alphabetic, so package pins like pnpm@10.6.2 or
# pyodide@0.27.7 are not mistaken for addresses.
EMAIL_RE = re.compile(r'[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}(?![A-Za-z0-9\-])')


def _redact_email(match: re.Match) -> str:
    email = match.group(0)
    if email.lower().endswith('@users.noreply.github.com'):
        return email
    return '[EMAIL REDACTED]'


_ENV_FILES = ('.env.local', '.env')
_ENV_NAME_RE = re.compile(r'SUPABASE|DATABASE_URL|DIRECT_URL|POSTGRES', re.IGNORECASE)
_ENV_BARE_REF_RE = re.compile(
    r'(?im)^\s*(?:export\s+)?(?:NEXT_PUBLIC_)?SUPABASE_(?:PROJECT_REF|PROJECT_ID|REF)\s*=\s*["\']?(' + _REF + r')["\']?\s*$'
)
_CACHE_NAME = 'claude-log-refs'
_CACHE_MAX_BYTES = 64 * 1024
_CACHE_LINE_RE = re.compile(r'^' + _REF + r'$')


def find_structured_refs(text: str) -> set:
    """Refs that appear in a connection string, host or dashboard URL."""
    return {m.group(1) for pattern in STRUCTURED_REF_PATTERNS for m in pattern.finditer(text)}


def env_refs(cwd: Path, environ: Optional[Dict[str, str]] = None) -> set:
    """Refs named by the repo's env files and the process environment. Values are read, never printed."""
    environ = os.environ if environ is None else environ
    texts = []
    for name in _ENV_FILES:
        try:
            texts.append((cwd / name).read_text())
        except (OSError, UnicodeDecodeError):
            continue
    texts.extend(f"{key}={value}" for key, value in environ.items() if _ENV_NAME_RE.search(key))
    refs = set()
    for text in texts:
        refs |= find_structured_refs(text)
        refs |= {m.group(1) for m in _ENV_BARE_REF_RE.finditer(text)}
    return refs


def git_common_dir(cwd: Path) -> Optional[Path]:
    """The real .git directory, shared by every worktree (a worktree's own .git is a file)."""
    try:
        result = subprocess.run(
            ['git', 'rev-parse', '--git-common-dir'],
            capture_output=True, text=True, timeout=5, cwd=cwd,
        )
        if result.returncode == 0 and result.stdout.strip():
            path = Path(result.stdout.strip())
            path = path if path.is_absolute() else cwd / path
            if path.is_dir():
                return path.resolve()
    except (subprocess.TimeoutExpired, FileNotFoundError, OSError):
        pass
    fallback = cwd / '.git'
    return fallback if fallback.is_dir() else None


def cache_path(cwd: Path) -> Optional[Path]:
    git_dir = git_common_dir(cwd)
    return git_dir / _CACHE_NAME if git_dir else None


def load_cached_refs(path: Optional[Path]) -> set:
    """Refs saved by earlier sessions. Anything malformed is ignored, never fatal."""
    if path is None or path.is_symlink() or not path.is_file():
        return set()
    try:
        with path.open('rb') as handle:
            raw = handle.read(_CACHE_MAX_BYTES)
        lines = raw.decode('utf-8', errors='ignore').splitlines()
    except OSError:
        return set()
    return {line.strip() for line in lines if _CACHE_LINE_RE.match(line.strip())}


def save_cached_refs(path: Optional[Path], refs: set) -> None:
    """Write the cache owner-only, via a temp file so a crash never leaves it half-written."""
    if path is None or not refs:
        return
    tmp = path.with_name(f"{path.name}.{os.getpid()}.tmp")
    try:
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, 'w') as handle:
            handle.write('\n'.join(sorted(refs)) + '\n')
        os.replace(tmp, path)
    except OSError:
        try:
            tmp.unlink()
        except OSError:
            pass


def discover_refs(text: str, cwd: Path, environ: Optional[Dict[str, str]] = None) -> List[str]:
    """First pass: every ref this log can be tied to, from its own structured URLs, the env, and the cache."""
    cache = cache_path(cwd)
    cached = load_cached_refs(cache)
    learned = find_structured_refs(text) | env_refs(cwd, environ)
    if not learned <= cached:
        save_cached_refs(cache, cached | learned)
    return sorted(cached | learned)


def redact(text: str, extra_literals: Tuple[str, ...] = ()) -> str:
    """Strip credential-shaped strings and email addresses (except GitHub noreply)."""
    for pattern, replacement in REDACTIONS:
        text = pattern.sub(replacement, text)
    for pattern in STRUCTURED_REF_PATTERNS:
        text = pattern.sub(lambda m: m.group(0).replace(m.group(1), REF_PLACEHOLDER), text)
    for literal in extra_literals:
        # Whole-token only, so a ref-shaped substring of a longer hash is left alone.
        text = re.sub(r'(?<![A-Za-z0-9])' + re.escape(literal) + r'(?![A-Za-z0-9])', REF_PLACEHOLDER, text)
    return EMAIL_RE.sub(_redact_email, text)


def redact_log(text: str, cwd: Path, environ: Optional[Dict[str, str]] = None) -> str:
    """Two passes: discover refs over the whole text, then redact them everywhere, including before their URL."""
    return redact(text, tuple(discover_refs(text, cwd, environ)))


def mask_email(email: str) -> str:
    """Mask the local part of an email: jane.doe@x.com -> j***@x.com."""
    local, sep, domain = email.partition('@')
    if not sep or not local:
        return email
    return f"{local[0]}***@{domain}"


def get_git_author() -> str:
    """Get the author for attribution. Checks CLAUDE_AUTHOR env var first, then git config."""
    if author := os.environ.get('CLAUDE_AUTHOR'):
        return author
    try:
        result = subprocess.run(
            ['git', 'config', 'user.name'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return 'unknown'


def get_github_user() -> str:
    """Get the authenticated GitHub login via `gh`. Returns 'unknown' if unavailable."""
    if login := os.environ.get('GITHUB_USER'):
        return login
    try:
        result = subprocess.run(
            ['gh', 'api', 'user', '--jq', '.login'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return 'unknown'


def get_git_email() -> str:
    """Get the git config user.email for attribution."""
    try:
        result = subprocess.run(
            ['git', 'config', 'user.email'],
            capture_output=True,
            text=True,
            timeout=5
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return 'unknown'


def get_project_session_dir(cwd: Path) -> Path:
    """Get the session directory for a project."""
    claude_dir = Path.home() / '.claude' / 'projects'
    project_hash = str(cwd).replace('/', '-')
    return claude_dir / project_hash


_CONTEXT_BLOCK_RE = re.compile(
    r'<(system-reminder|ide_opened_file|ide_selection|ide_diagnostics|pasted_content)\b[^>]*>.*?</\1>',
    re.DOTALL,
)
_HARNESS_PREFIXES = (
    '<command-name>', '<command-message>', '<local-command', 'Caveat:',
    '<task-notification', '<teammate-message', '<ci-monitor-event',
    '<bash-input>', '<bash-stdout>', '<user-prompt-submit-hook',
)


def user_text(entry: dict) -> Optional[str]:
    """Return what the human typed in a user entry, or None for tool results and harness events."""
    if entry.get('type') != 'user':
        return None
    if entry.get('isMeta') or entry.get('isSidechain'):
        return None

    content = entry.get('message', {}).get('content', '')
    if isinstance(content, list):
        if any(isinstance(c, dict) and c.get('type') == 'tool_result' for c in content):
            return None
        content = '\n'.join(
            c.get('text', '') for c in content
            if isinstance(c, dict) and c.get('type') == 'text'
        )
    if not isinstance(content, str):
        return None

    return clean_prompt(content)


def clean_prompt(content: str) -> Optional[str]:
    """Strip IDE/harness context from a prompt; None if nothing typed remains."""
    content = _CONTEXT_BLOCK_RE.sub('', content).strip()
    if not content or content.startswith(_HARNESS_PREFIXES):
        return None
    return content


def is_user_prompt(entry: dict) -> bool:
    """Check if entry is a real user prompt (not meta/command/tool result/harness event)."""
    return user_text(entry) is not None


def extract_assistant_text(entry: dict) -> Optional[str]:
    """Extract text content from assistant message."""
    if entry.get('type') != 'assistant':
        return None
    if entry.get('isSidechain'):
        return None

    content = entry.get('message', {}).get('content', [])

    if isinstance(content, str):
        return content if content.strip() else None

    if isinstance(content, list):
        texts = []
        for block in content:
            if block.get('type') == 'text':
                text = block.get('text', '').strip()
                if text:
                    texts.append(text)
        return '\n\n'.join(texts) if texts else None

    return None


def extract_clean_log(jsonl_path: Path) -> List[Tuple[str, str, str]]:
    """Extract conversation entries from a JSONL file."""
    entries = []

    for line in jsonl_path.read_text().strip().split('\n'):
        if not line.strip():
            continue
        try:
            entry = json.loads(line)
        except json.JSONDecodeError:
            continue

        timestamp = entry.get('timestamp', '')

        if (text := user_text(entry)) is not None:
            entries.append((timestamp, 'user', text))

        elif entry.get('type') == 'assistant':
            text = extract_assistant_text(entry)
            if text:
                entries.append((timestamp, 'assistant', text))

    return entries


def extract_handback(entry: dict) -> Optional[str]:
    """A subagent hands its report back through a SubagentHandback tool call, not a text block."""
    content = entry.get('message', {}).get('content', [])
    if not isinstance(content, list):
        return None
    for block in content:
        if isinstance(block, dict) and block.get('name') == 'SubagentHandback':
            message = block.get('input', {}).get('message')
            if isinstance(message, str) and message.strip():
                return message.strip()
    return None


def extract_subagents(session_dir: Path, session_id: str) -> List[Dict[str, Any]]:
    """Read each subagent transcript: the prompts it was sent and the report it returned."""
    sub_dir = session_dir / session_id / 'subagents'
    if not sub_dir.is_dir():
        return []

    agents = []
    for jsonl in sub_dir.glob('agent-*.jsonl'):
        prompts: List[Tuple[str, str]] = []
        report: Optional[Tuple[str, str]] = None
        for line in jsonl.read_text().split('\n'):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            timestamp = entry.get('timestamp', '')
            # Subagent files are all sidechain; user_text() skips those, so read directly.
            if entry.get('type') == 'user' and not entry.get('isMeta'):
                msg = dict(entry, isSidechain=False)
                if (text := user_text(msg)) is not None:
                    prompts.append((timestamp, text))
            elif entry.get('type') == 'assistant':
                text = extract_handback(entry) or extract_assistant_text(dict(entry, isSidechain=False))
                if text:
                    report = (timestamp, text)  # last one wins: the final report

        if not prompts and not report:
            continue

        meta: Dict[str, Any] = {}
        meta_path = jsonl.with_suffix('.meta.json')
        if meta_path.exists():
            try:
                meta = json.loads(meta_path.read_text())
            except json.JSONDecodeError:
                pass

        agents.append({
            'id': jsonl.stem.removeprefix('agent-'),
            'type': meta.get('agentType') or meta.get('subagent_type') or 'unknown',
            'description': meta.get('description') or '',
            'prompts': prompts,
            'report': report,
            'start': (prompts[0][0] if prompts else report[0]) if (prompts or report) else '',
        })

    return sorted(agents, key=lambda a: a['start'])


def format_timestamp(iso_timestamp: str) -> str:
    try:
        dt = datetime.fromisoformat(iso_timestamp.replace('Z', '+00:00'))
        return dt.strftime('%Y-%m-%d %H:%M')
    except (ValueError, AttributeError):
        return ''


def dedupe_entries(entries: List[Tuple[str, str, str]]) -> List[Tuple[str, str, str]]:
    """Keep only the final assistant response before each user prompt."""
    if not entries:
        return []

    result = []
    pending_assistant = None

    for timestamp, role, content in entries:
        if role == 'user':
            if pending_assistant:
                result.append(pending_assistant)
                pending_assistant = None
            result.append((timestamp, role, content))
        elif role == 'assistant':
            pending_assistant = (timestamp, role, content)

    if pending_assistant:
        result.append(pending_assistant)

    return result


def detect_paste_indicators(content: str) -> Dict[str, bool]:
    """Detect heuristic indicators that content was pasted."""
    indicators = {
        'has_code_block': '```' in content,
        'has_file_paths': bool(re.search(r'[\w\-/]+\.(ts|js|py|tsx|jsx|json|md|txt|yml|yaml):\d+', content)) or
                         bool(re.search(r'(?:^|[\s\(])/[\w\-/]+\.[\w]+', content, re.MULTILINE)),
        'has_urls': bool(re.search(r'https?://', content)),
        'is_long': len(content) > 500,
        'has_stack_trace': bool(re.search(r'at \w+.*:\d+:\d+', content)) or
                          bool(re.search(r'File ".*", line \d+', content)),
        'has_structured_data': bool(re.search(r'^[\s]*[{\[]', content, re.MULTILINE)) and
                              ('{' in content and '}' in content),
    }

    indicator_count = sum(indicators.values())
    indicators['likely_pasted'] = indicator_count >= 2 or indicators['is_long']

    return indicators


def parse_iso_timestamp(timestamp: str) -> Optional[datetime]:
    try:
        return datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


def calculate_session_stats(entries: List[Tuple[str, str, str]]) -> Dict[str, Any]:
    """Calculate comprehensive session statistics."""
    if not entries:
        return {}

    prompts = [(ts, content) for ts, role, content in entries if role == 'user']
    responses = [(ts, content) for ts, role, content in entries if role == 'assistant']

    if not prompts:
        return {}

    stats = {}

    first_prompt_dt = parse_iso_timestamp(prompts[0][0])
    last_prompt_dt = parse_iso_timestamp(prompts[-1][0])

    stats['first_prompt_time'] = prompts[0][0]
    stats['last_prompt_time'] = prompts[-1][0]

    if first_prompt_dt and last_prompt_dt:
        duration = (last_prompt_dt - first_prompt_dt).total_seconds() / 60
        stats['session_duration_minutes'] = round(duration, 1)

        if len(prompts) > 1:
            avg_gap = duration / (len(prompts) - 1)
            stats['avg_time_between_prompts_minutes'] = round(avg_gap, 1)

    prompt_chars = [len(content) for _, content in prompts]
    prompt_words = [len(content.split()) for _, content in prompts]

    stats['total_prompt_chars'] = sum(prompt_chars)
    stats['total_prompt_words'] = sum(prompt_words)
    stats['avg_prompt_length_chars'] = round(sum(prompt_chars) / len(prompts), 1)
    stats['avg_prompt_length_words'] = round(sum(prompt_words) / len(prompts), 1)
    stats['longest_prompt_words'] = max(prompt_words)
    stats['shortest_prompt_words'] = min(prompt_words)

    if responses:
        response_chars = [len(content) for _, content in responses]
        stats['total_response_chars'] = sum(response_chars)
        stats['avg_response_length_chars'] = round(sum(response_chars) / len(responses), 1)

        if stats['total_prompt_chars'] > 0:
            stats['response_to_prompt_ratio'] = round(
                stats['total_response_chars'] / stats['total_prompt_chars'], 2
            )

    paste_data = [detect_paste_indicators(content) for _, content in prompts]
    stats['prompts_with_code_blocks'] = sum(1 for p in paste_data if p['has_code_block'])
    stats['prompts_with_file_paths'] = sum(1 for p in paste_data if p['has_file_paths'])
    stats['prompts_with_urls'] = sum(1 for p in paste_data if p['has_urls'])
    stats['prompts_with_long_content'] = sum(1 for p in paste_data if p['is_long'])
    stats['likely_pasted_count'] = sum(1 for p in paste_data if p['likely_pasted'])

    return stats


def read_hook_session_id() -> Optional[str]:
    """The hook payload on stdin names the session; absent when run by hand."""
    if sys.stdin.isatty():
        return None
    try:
        return json.loads(sys.stdin.read() or '{}').get('session_id')
    except (json.JSONDecodeError, OSError, AttributeError):
        return None


def main():
    cwd = Path(os.environ.get('CLAUDE_CWD', os.getcwd()))
    session_dir = get_project_session_dir(cwd)

    if not session_dir.exists():
        return

    session_files = [
        f for f in session_dir.glob('*.jsonl')
        if not f.name.startswith('agent-')
    ]

    if not session_files:
        return

    latest = max(session_files, key=lambda p: p.stat().st_mtime)
    hook_session = read_hook_session_id()
    if hook_session and (session_dir / f"{hook_session}.jsonl").exists():
        latest = session_dir / f"{hook_session}.jsonl"
    session_id = latest.stem

    entries = extract_clean_log(latest)
    entries = dedupe_entries(entries)
    subagents = extract_subagents(session_dir, session_id)

    if not entries:
        return

    session_stats = calculate_session_stats(entries)

    output_dir = cwd / '.claude-logs'
    output_dir.mkdir(parents=True, exist_ok=True)

    existing_files = list(output_dir.glob(f"*_{session_id}.md"))
    date = datetime.now().strftime('%Y-%m-%d')
    if existing_files:
        output_path = existing_files[0]
    else:
        timestamp = datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
        filename = f"{timestamp}_{session_id}.md"
        output_path = output_dir / filename

    last_entry_type = entries[-1][1] if entries else 'unknown'
    session_status = 'complete' if last_entry_type == 'assistant' else 'awaiting_response'

    author = get_git_author()
    github_user = get_github_user()
    git_email = mask_email(get_git_email())
    lines = ["---"]
    lines.append(f"session_id: {session_id}")
    lines.append(f"date: {date}")
    lines.append(f"author: {author}")
    lines.append(f"github_user: {github_user}")
    lines.append(f"git_email: {git_email}")
    lines.append(f"project: {cwd.name}")
    lines.append(f"session_status: {session_status}")
    lines.append(f"last_entry_type: {last_entry_type}")
    lines.append(f"total_exchanges: {len([e for e in entries if e[1] == 'user'])}")
    lines.append(f"generated_at: {datetime.now().isoformat()}")

    for key, value in session_stats.items():
        lines.append(f"{key}: {value}")

    lines.append("---\n")
    lines.append(f"# Claude Session Log - {date}\n")
    lines.append(f"Session: `{session_id}` | Project: `{cwd.name}` | Author: `{author}` | GitHub: `{github_user}`\n")
    lines.append("---\n")

    prompts_data = []
    for timestamp, role, content in entries:
        if role == 'user':
            paste_indicators = detect_paste_indicators(content)
            prompts_data.append({
                'timestamp': timestamp,
                'content': content,
                'chars': len(content),
                'words': len(content.split()),
                'paste_indicators': paste_indicators,
            })

    exchange_num = 0
    prompt_index = 0

    for i, (timestamp, role, content) in enumerate(entries):
        time_str = format_timestamp(timestamp)

        if role == 'user':
            exchange_num += 1
            prompt_data = prompts_data[prompt_index]
            indicators = prompt_data['paste_indicators']

            lines.append(f"\n[CLAUDE_LOG_ENTRY type=PROMPT num={exchange_num} session={session_id}]")
            lines.append(f"timestamp: {timestamp}")
            lines.append(f"time: {time_str}")
            lines.append(f"chars: {prompt_data['chars']}")
            lines.append(f"words: {prompt_data['words']}")
            lines.append(f"has_code_block: {indicators['has_code_block']}")
            lines.append(f"has_file_paths: {indicators['has_file_paths']}")
            lines.append(f"has_urls: {indicators['has_urls']}")
            lines.append(f"likely_pasted: {indicators['likely_pasted']}")
            lines.append(f"\n{content}\n")

            prompt_index += 1
        else:
            lines.append(f"\n[CLAUDE_LOG_ENTRY type=RESPONSE num={exchange_num} session={session_id}]")
            lines.append(f"timestamp: {timestamp}")
            lines.append(f"time: {time_str}")
            lines.append(f"chars: {len(content)}")
            lines.append(f"\n{content}\n")

    if subagents:
        lines.append("\n---\n")
        lines.append("# Subagents\n")
        for agent in subagents:
            label = f"agent={agent['id']} agent_type={agent['type']} session={session_id}"
            if agent['description']:
                lines.append(f"\n_Subagent {agent['id']}: {agent['description']}_")
            for n, (timestamp, content) in enumerate(agent['prompts'], 1):
                lines.append(f"\n[CLAUDE_LOG_ENTRY type=SUBAGENT_PROMPT num={n} {label}]")
                lines.append(f"timestamp: {timestamp}")
                lines.append(f"chars: {len(content)}")
                lines.append(f"\n{content}\n")
            if agent['report']:
                timestamp, content = agent['report']
                lines.append(f"\n[CLAUDE_LOG_ENTRY type=SUBAGENT_RESPONSE {label}]")
                lines.append(f"timestamp: {timestamp}")
                lines.append(f"chars: {len(content)}")
                lines.append(f"\n{content}\n")

    output_path.write_text(redact_log('\n'.join(lines), cwd))


if __name__ == '__main__':
    main()
