import { pipe } from "@effect-ts/core"
import { Tagged } from "@effect-ts/core/Case"
import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import type { Either } from "@effect-ts/core/Either"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"
import type { _A } from "@effect-ts/core/Utils"
import { matchTag } from "@effect-ts/core/Utils"
import * as Q from "@effect-ts/query/Query"
import * as MO from "@effect-ts/schema"
import * as Parser from "@effect-ts/schema/Parser"
import * as React from "react"

import { createApp as createApp } from "../goods/appEnvironmet"

export const makeCalculator = T.succeedWith(() => {
  return {
    add: (x: number, y: number) => T.succeedWith(() => x + y)
  } as const
})

export interface Calculator extends _A<typeof makeCalculator> {}
export const Calculator = tag<Calculator>()
export const LiveCalculator = L.fromEffect(Calculator)(makeCalculator)

export const App = createApp<Has<Calculator> & T.DefaultEnv>()

export class HttpError extends Tagged("HttpError")<{
  readonly error: unknown
}> {}

export function httpFetch(input: RequestInfo, init?: Omit<RequestInit, "signal">) {
  const cotroller = new AbortController()
  const signal = cotroller.signal
  const params = {
    signal,
    ...init
  }

  return T.tryCatchPromise(
    () => fetch(input, params).then((data): Promise<unknown> => data.json()),
    (error) => new HttpError({ error })
  )
}

const CommitBody = MO.struct({
  required: {
    message: MO.string
  }
})

const Commit = MO.struct({
  required: {
    commit: CommitBody
  }
})

const Commits = MO.chunk(Commit)

const parseCommits = Parser.for(Commits)["|>"](MO.condemnFail)

export function Autocomplete() {
  const [page, setPage] = React.useState(0)

  const commits = App.useQuery(
    () =>
      Q.gen(function* (_) {
        const response = yield* _(
          httpFetch(`https://api.github.com/repos/Effect-TS/core/commits?page=${page}`)
        )

        return yield* _(parseCommits(response))
      }),
    [page]
  )

  const renderDone: (
    _: Either<HttpError | MO.CondemnException, MO.ParsedShapeOf<typeof Commits>>
  ) => JSX.Element = matchTag({
    Right: (_) => (
      <div>
        {Chunk.map_(_.right, (_) => (
          <p>{_.commit.message}</p>
        ))}
      </div>
    ),
    Left: (_) =>
      _.left["|>"](
        matchTag({
          CondemnException: (_) => (
            <div>
              {_.message.split("\n").map((s) => (
                <>
                  {s}
                  <br />
                </>
              ))}
            </div>
          ),
          HttpError: () => <div>Error</div>
        })
      )
  })

  return (
    <div>
      {commits["|>"](
        matchTag({
          Done: (_) => _.current["|>"](renderDone),
          Loading: () => <div>Loading...</div>,
          Refreshing: (_) => <div>Loading...</div>
        })
      )}
      <div>
        <button
          onClick={() => {
            setPage((_) => _ + 1)
          }}
        >
          Previous
        </button>
      </div>
    </div>
  )
}

function Home() {
  return (
    <App.Provider layer={LiveCalculator["+++"](L.identity<T.DefaultEnv>())}>
      <Autocomplete />
    </App.Provider>
  )
}

export default Home
