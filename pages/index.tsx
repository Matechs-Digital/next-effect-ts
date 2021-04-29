import { pipe } from "@effect-ts/core"
import { Tagged } from "@effect-ts/core/Case"
import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import type { Either } from "@effect-ts/core/Either"
import { flow } from "@effect-ts/core/Function"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"
import type { _A } from "@effect-ts/core/Utils"
import { matchTag } from "@effect-ts/core/Utils"
import * as Q from "@effect-ts/query/Query"
import * as MO from "@effect-ts/schema"
import * as Parser from "@effect-ts/schema/Parser"
import { Schema } from "node:inspector"
import * as React from "react"

import { createApp } from "../goods/appEnvironmet"

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

export class ParseCommitError extends Tagged("ParseCommitError")<{
  readonly error: MO.CondemnException
}> {}

const parseCommits = flow(
  Parser.for(Commits)["|>"](MO.condemnFail),
  T.mapError((_) => new ParseCommitError({ error: _ }))
)

export const makeCommitRepo = T.succeedWith(() => {
  return {
    getPage: (page: number) =>
      T.gen(function* (_) {
        const response = yield* _(
          httpFetch(`https://api.github.com/repos/Effect-TS/core/commits?page=${page}`)
        )

        return yield* _(parseCommits(response))
      })
  } as const
})

export interface CommitRepo extends _A<typeof makeCommitRepo> {}
export const CommitRepo = tag<CommitRepo>()
export const LiveCommitRepo = L.fromEffect(CommitRepo)(makeCommitRepo)

export const App = createApp<Has<CommitRepo> & T.DefaultEnv>()

export function Autocomplete() {
  const [page, setPage] = React.useState(0)

  const commits = App.useQuery(
    () =>
      Q.gen(function* (_) {
        const { getPage } = yield* _(CommitRepo)

        return yield* _(getPage(page))
      }),
    [page]
  )

  const renderDone: (
    _: Either<HttpError | ParseCommitError, MO.ParsedShapeOf<typeof Commits>>
  ) => JSX.Element = matchTag({
    Right: (_) => (
      <div>
        {pipe(
          _.right,
          Chunk.zipWithIndex,
          Chunk.map(({ tuple: [{ commit: { message } }, i] }) => (
            <p key={i}>{message}</p>
          ))
        )}
      </div>
    ),
    Left: (_) =>
      _.left["|>"](
        matchTag({
          ParseCommitError: (_) => (
            <div>
              {_.error.message.split("\n").map((s) => (
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
    <App.Provider layer={LiveCommitRepo["+++"](L.identity<T.DefaultEnv>())}>
      <Autocomplete />
    </App.Provider>
  )
}

export default Home
