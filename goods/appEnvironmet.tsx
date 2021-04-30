import { pipe } from "@effect-ts/core"
import { Case } from "@effect-ts/core/Case"
import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import type { Tuple } from "@effect-ts/core/Collections/Immutable/Tuple"
import * as Tp from "@effect-ts/core/Collections/Immutable/Tuple"
import * as T from "@effect-ts/core/Effect"
import * as S from "@effect-ts/core/Effect/Experimental/Stream"
import * as F from "@effect-ts/core/Effect/Fiber"
import * as H from "@effect-ts/core/Effect/Hub"
import * as L from "@effect-ts/core/Effect/Layer"
import * as Prom from "@effect-ts/core/Effect/Promise"
import * as Queue from "@effect-ts/core/Effect/Queue"
import * as E from "@effect-ts/core/Either"
import type { Lazy } from "@effect-ts/core/Function"
import type { Option } from "@effect-ts/core/Option"
import * as O from "@effect-ts/core/Option"
import { matchTag } from "@effect-ts/core/Utils"
import * as CRM from "@effect-ts/query/CompletedRequestMap"
import * as DS from "@effect-ts/query/DataSource"
import * as Q from "@effect-ts/query/Query"
import type * as Req from "@effect-ts/query/Request"
import * as MO from "@effect-ts/schema"
import * as Encoder from "@effect-ts/schema/Encoder"
import * as Parser from "@effect-ts/schema/Parser"
import * as React from "react"

export type AnyRef = unknown

export type QueryResult<E, A> = Loading | Refreshing<E, A> | Done<E, A>

export class Loading extends Case<{}> {
  readonly _tag = "Loading"
}

export class Done<E, A> extends Case<{ readonly current: E.Either<E, A> }> {
  readonly _tag = "Done"
}

export class Refreshing<E, A> extends Case<{ readonly current: E.Either<E, A> }> {
  readonly _tag = "Refreshing"
}

export interface CacheCodec<A extends readonly unknown[], E, B> {
  to: (args: A, res: E.Either<E, B>) => Option<Tuple<[string, string]>>
  from: (args: A, map: Record<string, string>) => Option<E.Either<E, B>>
}

export interface AppEnvironment<R> {
  Provider: React.FC<{
    layer: L.Layer<T.DefaultEnv, never, R>
    initial?: string
    sources: Iterable<Ticked<R, any>>
  }>

  useEffect: (self: Lazy<T.RIO<R, void>>, deps: AnyRef[]) => void
  useHub<A>(): UseHub<A>
  useSubscribe<A>(
    initial: A,
    subscribe: Lazy<S.Stream<unknown, never, A>>,
    deps: AnyRef[]
  ): [A]
  useQuery: <A extends unknown[], E, B>(
    f: (...args: A) => Q.Query<R, E, B>,
    ...args: A
  ) => QueryResult<E, B>
  query: <A extends unknown[], E, B>(
    f: (...args: A) => Q.Query<R, E, B>,
    cache?: CacheCodec<A, E, B>
  ) => (...args: A) => Q.Query<R, E, B>
  querySuccessCodec: <A extends readonly unknown[], E, Self extends MO.SchemaUPI>(
    model: Self,
    key: (...args: A) => string
  ) => CacheCodec<A, E, MO.ParsedShapeOf<Self>>
  collectPrefetch: <R, E, A>(query: Q.Query<R, E, A>) => T.Effect<R, never, string>
  hydrate: (initial?: string | undefined) => void
}

export interface ServiceContext<R> {
  readonly provide: <E, A>(self: T.Effect<R, E, A>) => T.Effect<unknown, E, A>
}

export type UseHub<A> = [Lazy<S.Stream<unknown, never, A>>, (a: A) => void]

export const prefetchSymbol = Symbol.for("@effect-ts/react/query/prefetch")

export interface PrefetchContext {
  [prefetchSymbol]: {
    map: Record<string, string>
  }
}

export function isPrefetchContext(u: unknown): u is PrefetchContext {
  return typeof u === "object" && u != null && prefetchSymbol in u
}

export function createApp<R extends T.DefaultEnv>(): AppEnvironment<R> {
  const MissingContext = T.die(
    "service context not provided, wrap your app in LiveServiceContext"
  )

  const ServiceContext = React.createContext<ServiceContext<R>>({
    provide: () => MissingContext
  })

  const queries = new Map()

  let cache: {} | undefined = undefined

  const DataSourceProvider: React.FC<{ sources: Iterable<Ticked<R, any>> }> = ({
    children,
    sources
  }) => {
    useEffect(
      () =>
        T.forever(
          T.forEach_(sources, ({ tick }) => T.fork(tick))["|>"](T.zipRight(T.sleep(0)))
        )["|>"](T.awaitAllChildren),
      []
    )
    return <>{children}</>
  }

  const Provider: React.FC<{
    layer: L.Layer<T.DefaultEnv, never, R>
    sources: Iterable<Ticked<R, any>>
  }> = ({ children, layer, sources }) => {
    const provider = React.useMemo(() => L.unsafeMainProvider(layer), [])

    React.useEffect(() => {
      const cancel = T.runCancel(provider.allocate)
      return () => {
        T.run(cancel)
        T.run(provider.release)
      }
    }, [])

    return (
      <ServiceContext.Provider value={{ provide: provider.provide }}>
        <DataSourceProvider sources={sources}>{children}</DataSourceProvider>
      </ServiceContext.Provider>
    )
  }

  function useHub<A>(): UseHub<A> {
    const deps: never[] = []
    const hub = React.useMemo(() => H.unsafeMakeUnbounded<A>(), deps)
    const subscribe = React.useCallback(() => S.fromHub(hub), deps)
    const publisher = React.useCallback((a) => {
      T.run(H.publish_(hub, a))
    }, deps)
    return [subscribe, publisher]
  }

  function useSubscribe<A>(
    initial: A,
    subscribe: Lazy<S.Stream<unknown, never, A>>,
    deps?: AnyRef[]
  ): [A] {
    const [state, updateState] = React.useState(initial)
    useEffect(
      () =>
        pipe(
          subscribe(),
          S.mapM((a) =>
            T.succeedWith(() => {
              updateState(a)
            })
          ),
          S.runDrain,
          T.onInterrupt(() =>
            T.succeedWith(() => {
              updateState(initial)
            })
          )
        ),
      deps
    )
    return [state]
  }

  function useEffect(self: Lazy<T.RIO<R, void>>, deps?: AnyRef[]) {
    const { provide } = React.useContext(ServiceContext)
    React.useEffect(() => {
      const fiber = T.runFiber(provide(self()))
      return () => {
        T.run(F.interrupt(fiber))
      }
    }, deps)
  }

  function initial<A extends unknown[], E, B>(
    f: (...args: A) => Q.Query<R, E, B>,
    args: A
  ): QueryResult<E, B> {
    if (queries.has(f) && cache) {
      const codecCache = queries.get(f) as CacheCodec<any, any, any>
      const cached = codecCache.from(args, cache)
      if (cached._tag === "Some") {
        return new Done({ current: cached.value })
      }
    }
    return new Loading()
  }

  function useQuery<A extends unknown[], E, B>(
    f: (...args: A) => Q.Query<R, E, B>,
    ...args: A
  ): QueryResult<E, B> {
    const cnt = React.useRef(0)
    const [state, updateState] = React.useState<QueryResult<E, B>>(initial(f, args))

    useEffect(() => {
      cnt.current = cnt.current + 1
      if (cnt.current === 1 && state._tag === "Done") {
        return T.unit
      }
      return pipe(
        T.succeedWith(() => {
          updateState(
            state["|>"](
              matchTag({
                Done: (_) => new Refreshing({ current: _.current }),
                Refreshing: (_) => _,
                Loading: (_) => _
              })
            )
          )
        }),
        T.zipRight(T.suspend(() => Q.run(f(...args)))),
        T.either,
        T.chain((done) =>
          T.succeedWith(() => {
            updateState((_) => new Done({ current: done }))
          })
        )
      )
    }, args)

    return state
  }

  function query<A extends unknown[], E, B>(
    f: (...args: A) => Q.Query<R, E, B>,
    cacheCodec?: CacheCodec<A, E, B>
  ) {
    if (cacheCodec) {
      const patched = (...args: A) =>
        Q.chain_(Q.fromEffect(T.environment()), (env) =>
          isPrefetchContext(env)
            ? Q.chain_(Q.either(f(...args)), (res) => {
                const toMap = cacheCodec.to(args, res)
                if (toMap._tag === "Some") {
                  env[prefetchSymbol].map[toMap.value.get(0)] = toMap.value.get(1)
                }
                return Q.fromEither(res)
              })
            : f(...args)
        )

      queries.set(patched, cacheCodec)

      return patched
    }
    return f
  }

  function collectPrefetch<R, E, A>(
    query: Q.Query<R, E, A>
  ): T.Effect<R, never, string> {
    return Q.run(
      Q.chain_(Q.fromEffect(T.succeedWith(() => ({}))), (map) =>
        Q.map_(
          Q.provideSome_(Q.either(query), "CollectPrefetch", (r: R) => ({
            ...r,
            [prefetchSymbol]: {
              map
            }
          })),
          () => JSON.stringify(map)
        )
      )
    )
  }

  function querySuccessCodec<
    A extends readonly unknown[],
    E,
    Self extends MO.SchemaUPI
  >(
    model: Self,
    key: (...args: A) => string
  ): CacheCodec<A, E, MO.ParsedShapeOf<Self>> {
    return {
      from: (args, map) => fromCache(map, key(...args), model),
      to: (args, res) => toCache(model, key(...args), res)
    }
  }

  function toCache<E, Self extends MO.SchemaUPI>(
    model: Self,
    key: string,
    res: E.Either<E, MO.ParsedShapeOf<Self>>
  ): O.Option<Tp.Tuple<[string, string]>> {
    return res._tag === "Right"
      ? O.some(Tp.tuple(key, JSON.stringify(Encoder.for(model)(res.right))))
      : O.none
  }

  function fromCache<E, Self extends MO.SchemaUPI>(
    map: Record<string, string>,
    key: string,
    model: Self
  ): O.Option<E.Either<E, MO.ParsedShapeOf<Self>>> {
    return map[key]
      ? pipe(JSON.parse(map[key]!), Parser.for(model)["|>"](MO.unsafe), E.right, O.some)
      : O.none
  }

  function hydrate(initial?: string) {
    if (initial) {
      cache = JSON.parse(initial)
    }
  }

  return {
    Provider,
    useEffect,
    useHub,
    useSubscribe,
    useQuery,
    query,
    querySuccessCodec,
    collectPrefetch,
    hydrate
  }
}

class Ticked<R, A extends Req.Request<any, any>> extends DS.DataSource<R, A> {
  private queue = Queue.unsafeMakeUnbounded<
    Tp.Tuple<
      [Chunk.Chunk<Chunk.Chunk<A>>, Prom.Promise<never, CRM.CompletedRequestMap>]
    >
  >()

  constructor(readonly ds: DS.DataSource<R, A>) {
    super(`Ticked(${ds.identifier})`, (requests: Chunk.Chunk<Chunk.Chunk<A>>) => {
      const queue = this.queue

      return T.gen(function* (_) {
        const promise = yield* _(Prom.make<never, CRM.CompletedRequestMap>())

        yield* _(queue["|>"](Queue.offer(Tp.tuple(requests, promise))))

        return yield* _(Prom.await(promise))
      })
    })
  }

  readonly tick = pipe(
    this.queue,
    Queue.takeAll,
    T.chain((batches) =>
      pipe(
        batches,
        Q.forEachPar(({ tuple: [r, p] }) =>
          pipe(
            r,
            Q.forEach(
              Q.forEachPar((a) =>
                pipe(
                  Q.fromRequest(a, this.ds),
                  Q.either,
                  Q.map((res) => Tp.tuple(a, res))
                )
              )
            ),
            Q.chain((as) =>
              pipe(
                p,
                Prom.succeed(
                  pipe(
                    as,
                    Chunk.reduce(CRM.empty, (crm, ser) =>
                      pipe(
                        ser,
                        Chunk.reduce(crm, (crm, { tuple: [a, res] }) =>
                          CRM.insert_(crm, a, res)
                        )
                      )
                    )
                  )
                ),
                Q.fromEffect
              )
            )
          )
        ),
        Q.run,
        T.asUnit
      )
    )
  )
}

export function clientDataSource<R, A extends Req.Request<any, any>>(
  ds: DS.DataSource<R, A>
) {
  return new Ticked(ds)
}
