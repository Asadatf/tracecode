// The Python side of the engine: a self-contained program that compiles the
// learner's source, calls the entry function with POSITIONAL args, and records
// an execution trace with sys.settrace — FACTS ONLY. It emits values already
// shaped as the contract's tagged `Value`, so the TS boundary only has to
// JSON.parse and Zod-validate. No explanations, no inferred intent.
//
// Globals it reads (one JSON blob set by the worker): REQUEST_JSON =
// { source, entry, args, maxSteps, maxItems, maxEntries, maxStringLength, maxReprLength }.
// It returns (as its last expression) a JSON string shaped like a TraceResult.
//
// Only frames whose co_filename is '<learner>' are traced: the learner's code is
// compiled with that filename, and it is compiled/exec'd BEFORE settrace is
// armed, so the module body, the harness, Pyodide and the stdlib never appear.
// `depth` counts learner frames only (0 = the entry function).
export const TRACE_PROGRAM = String.raw`
import sys, json, copy

req = json.loads(REQUEST_JSON)
SOURCE = req['source']
ENTRY = req['entry']
ARGS = req['args']
MAX_STEPS = req['maxSteps']
MAX_ITEMS = req['maxItems']
MAX_ENTRIES = req['maxEntries']
MAX_STR = req['maxStringLength']
MAX_REPR = req['maxReprLength']
SAFE_INT = 2 ** 53

steps = []
state = {'truncated': False}

def safe(v):
    if v is None:
        return {'kind': 'none'}
    if isinstance(v, bool):
        return {'kind': 'bool', 'value': v}
    if isinstance(v, int):
        if -SAFE_INT <= v <= SAFE_INT:
            return {'kind': 'int', 'value': v}
        return {'kind': 'other', 'repr': repr(v)[:MAX_REPR]}
    if isinstance(v, float):
        return {'kind': 'float', 'value': v}
    if isinstance(v, str):
        return {'kind': 'str', 'value': v[:MAX_STR]}
    if isinstance(v, (list, tuple)):
        kind = 'list' if isinstance(v, list) else 'tuple'
        out = {'kind': kind, 'items': [safe(x) for x in list(v)[:MAX_ITEMS]]}
        if len(v) > MAX_ITEMS:
            out['truncated'] = True
        return out
    if isinstance(v, dict):
        out = {'kind': 'dict', 'entries': [[safe(k), safe(val)] for k, val in list(v.items())[:MAX_ENTRIES]]}
        if len(v) > MAX_ENTRIES:
            out['truncated'] = True
        return out
    return {'kind': 'other', 'repr': repr(v)[:MAX_REPR]}

def depth_of(frame):
    d = -1
    f = frame
    while f is not None:
        if f.f_code.co_filename == '<learner>':
            d += 1
        f = f.f_back
    return d

def snapshot(frame):
    return {k: safe(val) for k, val in frame.f_locals.items() if not k.startswith('__')}

def record(event, frame, arg):
    if state['truncated']:
        return
    if len(steps) >= MAX_STEPS:
        state['truncated'] = True
        return
    step = {
        'index': len(steps),
        'event': event,
        'line': frame.f_lineno,
        'func': frame.f_code.co_name,
        'depth': depth_of(frame),
        'locals': snapshot(frame),
    }
    if event == 'return':
        step['returnValue'] = safe(arg)
    elif event == 'exception':
        step['exception'] = {'type': arg[0].__name__, 'message': str(arg[1])}
    steps.append(step)

def local_tracer(frame, event, arg):
    record(event, frame, arg)
    return local_tracer

def global_tracer(frame, event, arg):
    if frame.f_code.co_filename != '<learner>':
        return None
    record('call', frame, arg)
    return local_tracer

result = None
try:
    compiled = compile(SOURCE, '<learner>', 'exec')
except SyntaxError as e:
    result = {
        'status': 'syntax_error',
        'syntaxError': {'message': e.msg or 'syntax error', 'line': e.lineno or 1, 'column': max(0, (e.offset or 1) - 1)},
    }

fn = None
if result is None:
    namespace = {}
    try:
        exec(compiled, namespace)
        fn = namespace.get(ENTRY)
        if not callable(fn):
            result = {
                'status': 'engine_error',
                'error': {'type': 'entry_not_found', 'message': 'No function named ' + ENTRY, 'line': 1},
            }
    except BaseException as e:
        result = {
            'status': 'engine_error',
            'error': {'type': type(e).__name__, 'message': str(e), 'line': getattr(e, 'lineno', 1) or 1},
        }

if result is None:
    source_lines = SOURCE.split('\n')
    call_args = copy.deepcopy(ARGS)
    sys.settrace(global_tracer)
    try:
        returned = fn(*call_args)
        result = {
            'status': 'completed',
            'actual': safe(returned),
            'trace': {'source': source_lines, 'steps': steps, 'truncated': state['truncated']},
        }
    except BaseException as e:
        tb = e.__traceback__
        line = 1
        while tb is not None:
            if tb.tb_frame.f_code.co_filename == '<learner>':
                line = tb.tb_lineno
            tb = tb.tb_next
        result = {
            'status': 'completed',
            'error': {'type': type(e).__name__, 'message': str(e), 'line': line},
            'trace': {'source': source_lines, 'steps': steps, 'truncated': state['truncated']},
        }
    finally:
        sys.settrace(None)

json.dumps(result)
`

// The untraced correctness program: compile the learner source once, call the
// entry with each test's POSITIONAL args, and compare the real return value to
// the expected JSON. Facts only — per-test runtime errors are captured, never
// narrated. Returns a JSON string shaped like a RunResult. No sys.settrace, so
// it is fast enough to run every official test; a replay re-runs one input
// through TRACE_PROGRAM using the same source and args.
export const RUN_PROGRAM = String.raw`
import json, copy

req = json.loads(REQUEST_JSON)
SOURCE = req['source']
ENTRY = req['entry']
TESTS = req['tests']
MAX_ITEMS = req['maxItems']
MAX_ENTRIES = req['maxEntries']
MAX_STR = req['maxStringLength']
MAX_REPR = req['maxReprLength']
SAFE_INT = 2 ** 53

def safe(v):
    if v is None:
        return {'kind': 'none'}
    if isinstance(v, bool):
        return {'kind': 'bool', 'value': v}
    if isinstance(v, int):
        if -SAFE_INT <= v <= SAFE_INT:
            return {'kind': 'int', 'value': v}
        return {'kind': 'other', 'repr': repr(v)[:MAX_REPR]}
    if isinstance(v, float):
        return {'kind': 'float', 'value': v}
    if isinstance(v, str):
        return {'kind': 'str', 'value': v[:MAX_STR]}
    if isinstance(v, (list, tuple)):
        kind = 'list' if isinstance(v, list) else 'tuple'
        out = {'kind': kind, 'items': [safe(x) for x in list(v)[:MAX_ITEMS]]}
        if len(v) > MAX_ITEMS:
            out['truncated'] = True
        return out
    if isinstance(v, dict):
        out = {'kind': 'dict', 'entries': [[safe(k), safe(val)] for k, val in list(v.items())[:MAX_ENTRIES]]}
        if len(v) > MAX_ENTRIES:
            out['truncated'] = True
        return out
    return {'kind': 'other', 'repr': repr(v)[:MAX_REPR]}

result = None
try:
    compiled = compile(SOURCE, '<learner>', 'exec')
except SyntaxError as e:
    result = {'status': 'syntax_error', 'syntaxError': {'message': e.msg or 'syntax error', 'line': e.lineno or 1, 'column': max(0, (e.offset or 1) - 1)}, 'tests': []}

fn = None
if result is None:
    namespace = {}
    try:
        exec(compiled, namespace)
        fn = namespace.get(ENTRY)
        if not callable(fn):
            result = {'status': 'engine_error', 'error': {'type': 'entry_not_found', 'message': 'No function named ' + ENTRY}, 'tests': []}
    except BaseException as e:
        result = {'status': 'engine_error', 'error': {'type': 'engine', 'message': str(e)}, 'tests': []}

if result is None:
    tests_out = []
    for test in TESTS:
        expected = test['expected']
        try:
            returned = fn(*copy.deepcopy(test['args']))
            tests_out.append({'testId': test['id'], 'passed': bool(returned == expected), 'actual': safe(returned), 'expected': safe(expected)})
        except BaseException as e:
            tb = e.__traceback__
            line = 1
            while tb is not None:
                if tb.tb_frame.f_code.co_filename == '<learner>':
                    line = tb.tb_lineno
                tb = tb.tb_next
            tests_out.append({'testId': test['id'], 'passed': False, 'expected': safe(expected), 'error': {'type': type(e).__name__, 'message': str(e), 'line': line}})
    result = {'status': 'completed', 'tests': tests_out}

json.dumps(result)
`

export const PYODIDE_VERSION = '0.27.7'
export const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/v${PYODIDE_VERSION}/full/`
export const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`
