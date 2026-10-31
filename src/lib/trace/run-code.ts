import {
	DEFAULT_LIMITS,
	workerResponseSchema,
	type RunRequest,
	type RunResult,
	type TraceRequest,
	type TraceResult,
	type WorkerRequest,
	type WorkerResponse
} from './contract'
import { buildWorkerSource } from './worker-source'

// Main-thread engine wrapper: owns the worker's lifecycle and the two separate
// timeouts. Pyodide init (the ~10 MB first download) is bounded by initTimeoutMs
// and is NOT charged against execution time; execution is bounded by the
// request's timeoutMs, measured only once the worker reports `running`. A
// healthy worker is reused across BOTH run and trace calls so Pyodide loads
// once; a timeout or an unrecoverable error terminates it and the next call
// recreates it. Calls are single-flight (one Pyodide, one operation at a time).

// The subset of the DOM Worker this engine uses — so tests can inject a fake.
export interface WorkerLike {
	postMessage(data: unknown): void
	terminate(): void
	onmessage: ((event: { data: unknown }) => void) | null
	onerror: ((event: unknown) => void) | null
}

export interface TraceEngineOptions {
	createWorker?: () => WorkerLike
	initTimeoutMs?: number
}

// Per-call options — e.g. a status callback so a UI can show "loading runtime"
// vs "running" without the caller knowing about the worker protocol.
export interface EngineCallOptions {
	onStatus?: (phase: 'loading_runtime' | 'running') => void
}

function defaultCreateWorker(): WorkerLike {
	const url = URL.createObjectURL(
		new Blob([buildWorkerSource()], { type: 'application/javascript' })
	)
	const worker = new Worker(url)
	// The worker has its source by the time construction returns; free the URL.
	setTimeout(() => URL.revokeObjectURL(url), 0)
	return worker as unknown as WorkerLike
}

interface ExecuteSpec<T> {
	message: WorkerRequest
	executionTimeoutMs: number
	// Pull the result out of a matching worker response, else undefined (ignore).
	extract: (response: WorkerResponse) => T | undefined
	onTimeout: () => T
	onEngineError: (message: string) => T
	onStatus?: (phase: 'loading_runtime' | 'running') => void
}

export class TraceEngine {
	readonly #createWorker: () => WorkerLike
	readonly #initTimeoutMs: number
	#worker: WorkerLike | null = null
	#booted = false
	#queue: Promise<unknown> = Promise.resolve()

	constructor(options: TraceEngineOptions = {}) {
		this.#createWorker = options.createWorker ?? defaultCreateWorker
		this.#initTimeoutMs = options.initTimeoutMs ?? DEFAULT_LIMITS.initTimeoutMs
	}

	// Run every official test, untraced, against the exact submitted source.
	runCode(request: RunRequest, options?: EngineCallOptions): Promise<RunResult> {
		return this.#enqueue(() =>
			this.#execute<RunResult>({
				message: { type: 'run', request },
				executionTimeoutMs: request.limits.timeoutMs,
				extract: (response) => (response.type === 'run_result' ? response.result : undefined),
				onTimeout: () => ({ status: 'timeout', tests: [] }),
				onEngineError: (message) => ({
					status: 'engine_error',
					error: { type: 'engine', message },
					tests: []
				}),
				onStatus: options?.onStatus
			})
		)
	}

	// Trace one input (a chosen passing or failing test, or a custom input).
	traceCode(request: TraceRequest, options?: EngineCallOptions): Promise<TraceResult> {
		return this.#enqueue(() =>
			this.#execute<TraceResult>({
				message: { type: 'trace', request },
				executionTimeoutMs: request.limits.timeoutMs,
				extract: (response) => (response.type === 'trace_result' ? response.result : undefined),
				onTimeout: () => ({ status: 'timeout' }),
				onEngineError: (message) => ({
					status: 'engine_error',
					error: { type: 'engine', message, line: 1 }
				}),
				onStatus: options?.onStatus
			})
		)
	}

	dispose(): void {
		this.#recycle()
	}

	#enqueue<T>(task: () => Promise<T>): Promise<T> {
		const result = this.#queue.then(task, task)
		// Keep the chain alive regardless of this call's outcome.
		this.#queue = result.then(
			() => undefined,
			() => undefined
		)
		return result
	}

	#recycle(): void {
		if (this.#worker != null) this.#worker.terminate()
		this.#worker = null
		this.#booted = false
	}

	#execute<T>(spec: ExecuteSpec<T>): Promise<T> {
		return new Promise<T>((resolve) => {
			let settled = false
			let initTimer: ReturnType<typeof setTimeout> | null = null
			let execTimer: ReturnType<typeof setTimeout> | null = null

			const clearTimers = () => {
				if (initTimer != null) clearTimeout(initTimer)
				if (execTimer != null) clearTimeout(execTimer)
				initTimer = null
				execTimer = null
			}

			if (this.#worker == null) this.#worker = this.#createWorker()
			const worker = this.#worker

			const settle = (result: T, options: { shouldRecycle: boolean }) => {
				if (settled) return
				settled = true
				clearTimers()
				worker.onmessage = null
				worker.onerror = null
				if (options.shouldRecycle) this.#recycle()
				resolve(result)
			}

			const armExecTimer = () => {
				clearTimers()
				execTimer = setTimeout(
					() => settle(spec.onTimeout(), { shouldRecycle: true }),
					spec.executionTimeoutMs
				)
			}

			worker.onmessage = (event) => {
				const parsed = workerResponseSchema.safeParse(event.data)
				if (!parsed.success) return
				const response = parsed.data
				if (response.type === 'status') {
					spec.onStatus?.(response.phase)
					if (response.phase === 'running') armExecTimer()
					return
				}
				const result = spec.extract(response)
				if (result !== undefined) {
					this.#booted = true
					settle(result, { shouldRecycle: false })
				}
			}

			worker.onerror = (event) => {
				const message =
					typeof event === 'object' && event != null && 'message' in event
						? String((event as { message: unknown }).message)
						: 'worker error'
				settle(spec.onEngineError(message), { shouldRecycle: true })
			}

			if (this.#booted) {
				// Pyodide already loaded: only execution time applies.
				armExecTimer()
			} else {
				initTimer = setTimeout(
					() =>
						settle(
							spec.onEngineError(`Pyodide did not initialize within ${this.#initTimeoutMs}ms`),
							{ shouldRecycle: true }
						),
					this.#initTimeoutMs
				)
			}

			worker.postMessage(spec.message)
		})
	}
}

let singleton: TraceEngine | null = null

function sharedEngine(): TraceEngine {
	if (singleton == null) singleton = new TraceEngine()
	return singleton
}

// Run all official tests on the shared engine (lazy worker, reused while healthy).
export function runCode(request: RunRequest, options?: EngineCallOptions): Promise<RunResult> {
	return sharedEngine().runCode(request, options)
}

// Trace one input on the shared engine (lazy worker, reused while healthy).
export function traceCode(
	request: TraceRequest,
	options?: EngineCallOptions
): Promise<TraceResult> {
	return sharedEngine().traceCode(request, options)
}
