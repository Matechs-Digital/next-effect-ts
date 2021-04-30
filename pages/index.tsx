import { pipe } from "@effect-ts/core"
import { Tagged } from "@effect-ts/core/Case"
import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import { flow } from "@effect-ts/core/Function"
import type { Has } from "@effect-ts/core/Has"
import { tag } from "@effect-ts/core/Has"
import type { _A } from "@effect-ts/core/Utils"
import { matchTag } from "@effect-ts/core/Utils"
import * as CRM from "@effect-ts/query/CompletedRequestMap"
import * as DS from "@effect-ts/query/DataSource"
import * as Q from "@effect-ts/query/Query"
import * as Req from "@effect-ts/query/Request"
import * as MO from "@effect-ts/schema"
import * as Parser from "@effect-ts/schema/Parser"
import * as React from "react"

import { appDataSource, createApp } from "../goods/appEnvironmet"

//
// Http Utilities
//

export class HttpError extends Tagged("HttpError")<{
  readonly error: unknown
}> {}

export function httpFetch(input: RequestInfo, init?: Omit<RequestInit, "signal">) {
  return T.effectAsyncInterrupt<unknown, HttpError, unknown>((cb) => {
    const cotroller = new AbortController()

    fetch(input, {
      signal: cotroller.signal,
      ...init
    })
      .then((data): Promise<unknown> => data.json())
      .then(
        (out) => {
          cb(T.succeed(out))
        },
        (error) => {
          cb(T.fail(new HttpError({ error })))
        }
      )

    return T.succeedWith(() => {
      cotroller.abort()
    })
  })
}

//
// Domain
//

export const ArtworkEntry_ = MO.required({
  api_link: MO.string
})
export interface ArtworkEntry extends MO.ParsedShapeOf<typeof ArtworkEntry_> {}
export const ArtworkEntry = MO.opaque<ArtworkEntry>()(ArtworkEntry_)

export const Artworks_ = MO.required({
  data: MO.chunk(ArtworkEntry)
})
export interface Artworks extends MO.ParsedShapeOf<typeof Artworks_> {}
export const Artworks = MO.opaque<Artworks>()(Artworks_)

export const Artwork_ = MO.required({
  data: MO.required({
    title: MO.string
  })
})
export interface Artwork extends MO.ParsedShapeOf<typeof Artwork_> {}
export const Artwork = MO.opaque<Artwork>()(Artwork_)

//
// Decoders
//

export class ParseArtworksError extends Tagged("ParseArtworksError")<{
  readonly error: MO.CondemnException
}> {}

export const parseArtworks = flow(
  Parser.for(Artworks)["|>"](MO.condemnFail),
  T.mapError((_) => new ParseArtworksError({ error: _ }))
)

export class ParseArtworkError extends Tagged("ParseArtworkError")<{
  readonly error: MO.CondemnException
}> {}

export const parseArtwork = flow(
  Parser.for(Artwork)["|>"](MO.condemnFail),
  T.mapError((_) => new ParseArtworkError({ error: _ }))
)

//
// Repositories
//

export const makeArtworkRepo = T.succeedWith(() => {
  function getArtworks(page: number) {
    return pipe(
      httpFetch(`https://api.artic.edu/api/v1/artworks?page=${page}`),
      T.chain(parseArtworks)
    )
  }
  function getArtwork(url: string) {
    return pipe(httpFetch(url), T.chain(parseArtwork))
  }
  return {
    getArtworks,
    getArtwork
  } as const
})

export interface ArtworkRepo extends _A<typeof makeArtworkRepo> {}
export const ArtworkRepo = tag<ArtworkRepo>()
export const LiveArtworkRepo = L.fromEffect(ArtworkRepo)(makeArtworkRepo)

export const App = createApp<Has<ArtworkRepo> & T.DefaultEnv>()

//
// Requests
//

export class GetArtworks extends Req.Static<
  { readonly page: number },
  HttpError | ParseArtworksError,
  MO.ParsedShapeOf<typeof Artworks>
> {
  readonly _tag = "GetArtworks"
}

export class GetArtwork extends Req.Static<
  { readonly url: string },
  HttpError | ParseArtworkError,
  MO.ParsedShapeOf<typeof Artwork>
> {
  readonly _tag = "GetArtwork"
}

//
// Data Sources
//

export const articMuseumDS = DS.makeBatched("ArticMuseum")(
  (requests: Chunk.Chunk<GetArtworks | GetArtwork>) =>
    T.gen(function* (_) {
      const { getArtwork, getArtworks } = yield* _(ArtworkRepo)

      yield* _(
        T.succeedWith(() => {
          console.log(`processing ${requests.length} requests`)
        })
      )

      let crm = CRM.empty

      yield* _(
        T.forEachPar_(
          requests,
          T.matchTag({
            GetArtwork: ({ url }, r) =>
              pipe(
                getArtwork(url),
                T.either,
                T.chain((res) =>
                  T.succeedWith(() => {
                    crm = CRM.insert_(crm, r, res)
                  })
                )
              ),
            GetArtworks: ({ page }, r) =>
              pipe(
                getArtworks(page),
                T.either,
                T.chain((res) =>
                  T.succeedWith(() => {
                    crm = CRM.insert_(crm, r, res)
                  })
                )
              )
          })
        )
      )

      return crm
    })
)["|>"](appDataSource)

//
// Queries
//

export function getArtwork(url: string) {
  return Q.fromRequest(new GetArtwork({ url }), articMuseumDS)
}

export function getArtworks(page: number) {
  return Q.fromRequest(new GetArtworks({ page }), articMuseumDS)
}

//
// Components
//

export function ArtworkView({ url }: { url: string }) {
  const commit = App.useQuery(() => getArtwork(url), [url])

  return <div>{JSON.stringify(commit)}</div>
}

export function ArtworksView() {
  const [page, setPage] = React.useState(1)

  const commits = App.useQuery(() => getArtworks(page), [page])

  return (
    <div>
      {commits["|>"](
        matchTag({
          Loading: () => <div>Loading...</div>,
          Refreshing: (_) => <div>Loading...</div>,
          Done: (_) =>
            _.current["|>"](
              matchTag({
                Right: (_) => (
                  <div>
                    {pipe(
                      _.right.data,
                      Chunk.zipWithIndex,
                      Chunk.map(({ tuple: [{ api_link }, i] }) => (
                        <ArtworkView url={api_link} key={i} />
                      ))
                    )}
                  </div>
                ),
                Left: (_) =>
                  _.left["|>"](
                    matchTag({
                      ParseArtworksError: (_) => (
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
            )
        })
      )}
      <div>
        {page > 1 && (
          <button
            onClick={() => {
              setPage((_) => _ - 1)
            }}
          >
            Previous
          </button>
        )}
        <button
          onClick={() => {
            setPage((_) => _ + 1)
          }}
        >
          Next
        </button>
      </div>
    </div>
  )
}

//
// Live Init
//

function Home() {
  return (
    <App.Provider layer={LiveArtworkRepo["+++"](L.identity<T.DefaultEnv>())}>
      <App.DataSourceProvider sources={[articMuseumDS]}>
        <ArtworksView />
      </App.DataSourceProvider>
    </App.Provider>
  )
}

export default Home
