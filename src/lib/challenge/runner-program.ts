// The Python that runs INSIDE the grading sandbox (ADR-0007). Two stdlib-only files:
//
//   runner.py  reads job.json ({code, entry, cases:[{id,args}], caseTimeoutSeconds}),
//              runs each case in its own fresh `python3 -I` subprocess with a timeout,
//              and prints one JSON line: [{id, ok, actual?|error?}].
//   case.py    executes the learner's code once, calls the entry with one case's args,
//              and prints the return value as JSON on the last line.
//
// Only test INPUTS are ever written into the sandbox. The expected answers stay on the
// server, which judges these outputs (src/lib/challenge/grading.ts). Each case is a
// separate process, so an infinite loop, a crash or a memory blow-up in one case costs
// only that case. Learner prints are captured and discarded, never parsed as a result.
//
// Hardening: the runner deletes job.json before any learner code runs (a case only ever
// sees its own arguments, on stdin); each case runs in its own session with a wall-clock
// timeout that kills the whole process group, CPU / memory / file-size limits, an empty
// environment, and its stdout going to a size-limited file rather than an unbounded pipe.
// Learner code shares a process with the case harness, so it could print a forged result
// line, but it never holds an expected answer, so a forgery cannot beat computing one.

export const RUNNER_VERSION = 'sandbox-runner-v3'

export const CASE_PY = `import io, json, sys
try:
    import resource
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
except Exception:
    pass
job = json.loads(sys.stdin.read())
real_out = sys.stdout
sys.stdout = io.StringIO()
sys.stderr = io.StringIO()
ns = {'__name__': '__main__'}
try:
    exec(compile(job['code'], 'solution.py', 'exec'), ns)
    result = ns[job['entry']](*job['args'])
    payload = json.dumps({'ok': True, 'actual': result})
except RecursionError:
    payload = json.dumps({'ok': False, 'error': 'recursion'})
except MemoryError:
    payload = json.dumps({'ok': False, 'error': 'memory'})
except KeyError:
    payload = json.dumps({'ok': False, 'error': 'entry_not_found'})
except Exception:
    payload = json.dumps({'ok': False, 'error': 'exception'})
sys.stdout = real_out
if len(payload) > 1_000_000:
    payload = json.dumps({'ok': False, 'error': 'output_too_large'})
real_out.write('\\n' + payload + '\\n')
real_out.flush()
`

export const RUNNER_PY = `import json, os, resource, signal, subprocess, sys, tempfile
with open('job.json') as handle:
    job = json.load(handle)
os.remove('job.json')
MAX_OUT = 3 * 1024 * 1024
MAX_RESULT = 100000

def limits():
    resource.setrlimit(resource.RLIMIT_CPU, (job['caseTimeoutSeconds'] + 1, job['caseTimeoutSeconds'] + 1))
    resource.setrlimit(resource.RLIMIT_FSIZE, (MAX_OUT, MAX_OUT))
    resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))

out = []
for case in job['cases']:
    with tempfile.TemporaryFile() as sink:
        proc = subprocess.Popen(
            [sys.executable, '-I', 'case.py'],
            stdin=subprocess.PIPE, stdout=sink, stderr=subprocess.DEVNULL,
            env={'PYTHONHASHSEED': '0'}, start_new_session=True, preexec_fn=limits)
        try:
            proc.communicate(
                json.dumps({'code': job['code'], 'entry': job['entry'], 'args': case['args']}).encode(),
                timeout=job['caseTimeoutSeconds'])
            timed_out = False
        except subprocess.TimeoutExpired:
            timed_out = True
        except Exception:
            timed_out = False
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except Exception:
            pass
        proc.wait()
        if timed_out:
            result = {'ok': False, 'error': 'timeout'}
        else:
            sink.seek(0)
            text = sink.read(MAX_OUT + 1).decode('utf-8', 'replace')
            lines = [line for line in text.splitlines() if line.strip()]
            try:
                result = json.loads(lines[-1]) if lines else {'ok': False, 'error': 'no_output'}
            except Exception:
                result = {'ok': False, 'error': 'bad_output'}
            if not isinstance(result, dict) or 'ok' not in result:
                result = {'ok': False, 'error': 'bad_output'}
            elif len(json.dumps(result)) > MAX_RESULT:
                result = {'ok': False, 'error': 'output_too_large'}
    out.append({'id': case['id'], **result})
print(json.dumps(out))
`
