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

export const RUNNER_VERSION = 'sandbox-runner-v1'

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
except TypeError as error:
    payload = json.dumps({'ok': False, 'error': 'exception'})
except Exception:
    payload = json.dumps({'ok': False, 'error': 'exception'})
sys.stdout = real_out
if len(payload) > 2_000_000:
    payload = json.dumps({'ok': False, 'error': 'output_too_large'})
real_out.write('\\n' + payload + '\\n')
real_out.flush()
`

export const RUNNER_PY = `import json, subprocess, sys
job = json.load(open('job.json'))
out = []
for case in job['cases']:
    try:
        proc = subprocess.run(
            [sys.executable, '-I', 'case.py'],
            input=json.dumps({'code': job['code'], 'entry': job['entry'], 'args': case['args']}),
            capture_output=True, text=True, timeout=job['caseTimeoutSeconds'])
        lines = [line for line in proc.stdout.splitlines() if line.strip()]
        try:
            result = json.loads(lines[-1]) if lines else {'ok': False, 'error': 'no_output'}
        except Exception:
            result = {'ok': False, 'error': 'bad_output'}
        if not isinstance(result, dict) or 'ok' not in result:
            result = {'ok': False, 'error': 'bad_output'}
    except subprocess.TimeoutExpired:
        result = {'ok': False, 'error': 'timeout'}
    out.append({'id': case['id'], **result})
print(json.dumps(out))
`
