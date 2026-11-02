// The Python side of the `ast` worker message (M7.1): parse the learner's source
// with ast.parse and walk the tree with an ast.NodeVisitor, returning a bounded
// structural summary (see code-features.ts for what each field means).
//
// PARSE ONLY. This program never calls exec, eval or compile and never imports
// the learner's code: ast.parse builds a syntax tree without running anything,
// so a module-level `while True:` or `os.system(...)` in the source is just
// nodes here. ast-program.test.mts asserts that, and fails if one of those
// calls ever appears in this file.
//
// Globals it reads (one JSON blob set by the worker): REQUEST_JSON =
// { source, maxSourceChars, maxCount, builtinAllowlist }. Its last expression is
// a JSON string shaped like an AstResult. Everything lives inside functions and
// a class with `_trace_` names, so it adds nothing the run/trace programs read.
export const AST_PROGRAM = String.raw`
import ast, json

_TRACE_DICT_CALLS = frozenset(['dict', 'defaultdict', 'Counter', 'OrderedDict'])
_TRACE_SET_CALLS = frozenset(['set', 'frozenset'])

class _TraceFeatureVisitor(ast.NodeVisitor):
    def __init__(self, allowlist):
        self.allowlist = allowlist
        self.for_loops = 0
        self.while_loops = 0
        self.depth = 0
        self.max_depth = 0
        self.comprehensions = 0
        self.branches = 0
        self.returns = 0
        self.defs = 0
        self.nodes = 0
        self.recursion = False
        self.uses_dict = False
        self.uses_set = False
        self.uses_sorted = False
        self.calls = set()
        self.enclosing_defs = []

    # Every node passes through here exactly once, whichever visit_* handles it.
    def visit(self, node):
        self.nodes += 1
        return super().visit(node)

    def _loop(self, node):
        self.depth += 1
        self.max_depth = max(self.max_depth, self.depth)
        self.generic_visit(node)
        self.depth -= 1

    def visit_For(self, node):
        self.for_loops += 1
        self._loop(node)

    def visit_AsyncFor(self, node):
        self.for_loops += 1
        self._loop(node)

    def visit_While(self, node):
        self.while_loops += 1
        self._loop(node)

    def visit_ListComp(self, node):
        self.comprehensions += 1
        self.generic_visit(node)

    def visit_GeneratorExp(self, node):
        self.comprehensions += 1
        self.generic_visit(node)

    def visit_SetComp(self, node):
        self.comprehensions += 1
        self.uses_set = True
        self.generic_visit(node)

    def visit_DictComp(self, node):
        self.comprehensions += 1
        self.uses_dict = True
        self.generic_visit(node)

    def visit_Dict(self, node):
        self.uses_dict = True
        self.generic_visit(node)

    def visit_Set(self, node):
        self.uses_set = True
        self.generic_visit(node)

    def visit_If(self, node):
        self.branches += 1
        self.generic_visit(node)

    def visit_Return(self, node):
        self.returns += 1
        self.generic_visit(node)

    def _def(self, node):
        self.defs += 1
        self.enclosing_defs.append(node.name)
        self.generic_visit(node)
        self.enclosing_defs.pop()

    def visit_FunctionDef(self, node):
        self._def(node)

    def visit_AsyncFunctionDef(self, node):
        self._def(node)

    def visit_Call(self, node):
        func = node.func
        if isinstance(func, ast.Name):
            name = func.id
            if name in self.allowlist:
                self.calls.add(name)
            if name in _TRACE_DICT_CALLS:
                self.uses_dict = True
            if name in _TRACE_SET_CALLS:
                self.uses_set = True
            if name == 'sorted':
                self.uses_sorted = True
            if name in self.enclosing_defs:
                self.recursion = True
        elif isinstance(func, ast.Attribute) and func.attr == 'sort':
            self.uses_sorted = True
        self.generic_visit(node)

def _trace_line_count(source):
    lines = source.replace('\r\n', '\n').replace('\r', '\n').split('\n')
    if lines and lines[-1] == '':
        lines.pop()
    return len(lines)

def _trace_analyze(req):
    source = req['source']
    cap = req['maxCount']
    if not isinstance(source, str):
        return {'status': 'analysis_error', 'permanent': True, 'message': 'source must be a string'}
    if len(source) > req['maxSourceChars']:
        return {'status': 'analysis_error', 'permanent': True, 'message': 'source too large to analyze'}
    try:
        tree = ast.parse(source, filename='<learner>', mode='exec')
    except SyntaxError as e:
        return {'status': 'syntax_error', 'syntaxError': {'message': (e.msg or 'syntax error')[:200], 'line': e.lineno or 1, 'column': max(0, (e.offset or 1) - 1)}}
    except (ValueError, RecursionError, MemoryError, OverflowError) as e:
        return {'status': 'analysis_error', 'permanent': True, 'message': 'could not parse source (' + type(e).__name__ + ')'}
    visitor = _TraceFeatureVisitor(frozenset(req['builtinAllowlist']))
    try:
        visitor.visit(tree)
    except RecursionError:
        return {'status': 'analysis_error', 'permanent': True, 'message': 'source is nested too deeply to analyze'}
    return {'status': 'ok', 'features': {
        'v': 1,
        'loops': {'for': min(visitor.for_loops, cap), 'while': min(visitor.while_loops, cap), 'maxDepth': min(visitor.max_depth, cap)},
        'comprehensions': min(visitor.comprehensions, cap),
        'branches': min(visitor.branches, cap),
        'returns': min(visitor.returns, cap),
        'defs': min(visitor.defs, cap),
        'recursion': visitor.recursion,
        'usesDict': visitor.uses_dict,
        'usesSet': visitor.uses_set,
        'usesSorted': visitor.uses_sorted,
        'builtinCalls': sorted(visitor.calls),
        'nodeCount': min(visitor.nodes, cap),
        'lineCount': min(_trace_line_count(source), cap),
    }}

json.dumps(_trace_analyze(json.loads(REQUEST_JSON)), sort_keys=True)
`
