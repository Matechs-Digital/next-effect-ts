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

import { clientDataSource, createApp } from "../goods/appEnvironmet"

//
// Http Utilities
//

export class HttpError extends Tagged("HttpError")<{
  readonly error: unknown
}> {}

export function httpFetch(input: RequestInfo, init?: Omit<RequestInit, "signal">) {
  if (typeof AbortController === "undefined") {
    return T.tryCatchPromise(
      () =>
        fetch(input, init)
          .then((data): Promise<unknown> => data.json())
          .then(),
      (error) => new HttpError({ error })
    )
  }
  return T.effectAsyncInterrupt<unknown, HttpError, unknown>((cb) => {
    const controller = new AbortController()

    fetch(input, {
      signal: controller.signal,
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
      controller.abort()
    })
  })
}

//
// Domain
//

export class ArtworkEntry extends MO.Schemed(
  MO.required({
    api_link: MO.string
  })
) {
  static Model = MO.schema(ArtworkEntry)
}

export class Artworks extends MO.Schemed(
  MO.required({
    data: MO.chunk(ArtworkEntry.Model)
  })
) {
  static Model = MO.schema(Artworks)
}

export class Artwork extends MO.Schemed(
  MO.required({
    data: MO.required({
      title: MO.string
    })
  })
) {
  static Model = MO.schema(Artwork)
}

//
// Decoders
//

export class ParseArtworksError extends Tagged("ParseArtworksError")<{
  readonly error: MO.CondemnException
}> {}

export const parseArtworks = flow(
  Parser.for(Artworks.Model)["|>"](MO.condemnFail),
  T.mapError((_) => new ParseArtworksError({ error: _ }))
)

export class ParseArtworkError extends Tagged("ParseArtworkError")<{
  readonly error: MO.CondemnException
}> {}

export const parseArtwork = flow(
  Parser.for(Artwork.Model)["|>"](MO.condemnFail),
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

//
// Requests
//

export class GetArtworks extends Req.Static<
  { readonly page: number },
  HttpError | ParseArtworksError,
  Artworks
> {
  readonly _tag = "GetArtworks"
}

export class GetArtwork extends Req.Static<
  { readonly url: string },
  HttpError | ParseArtworkError,
  Artwork
> {
  readonly _tag = "GetArtwork"
}

//
// Data Sources
//

export const artworkDataSource = DS.makeBatched("ArticMuseum")(
  (requests: Chunk.Chunk<GetArtworks | GetArtwork>) =>
    T.gen(function* (_) {
      const { getArtwork, getArtworks } = yield* _(ArtworkRepo)

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
)

export const artworkClientDataSource = artworkDataSource["|>"](clientDataSource)

export const makeArtworkClientDataSource = T.succeedWith(() => {
  return {
    artworkDataSource: artworkClientDataSource as DS.DataSource<
      Has<ArtworkRepo>,
      GetArtworks | GetArtwork
    >
  }
})

export interface ArtworkDataSource extends _A<typeof makeArtworkClientDataSource> {}
export const ArtworkDataSource = tag<ArtworkDataSource>()
export const ClientArtworkDataSource = L.fromEffect(ArtworkDataSource)(
  makeArtworkClientDataSource
)

//
// App
//

export const App = createApp<Has<ArtworkRepo> & Has<ArtworkDataSource> & T.DefaultEnv>()

//
// Queries
//

export const getArtwork = App.query(
  (url: string) =>
    Q.gen(function* (_) {
      const { artworkDataSource } = yield* _(ArtworkDataSource)
      return yield* _(Q.fromRequest(new GetArtwork({ url }), artworkDataSource))
    }),
  App.querySuccessCodec(Artwork.Model, (url) => `getArtwork(${url})`)
)

export const getArtworks = App.query(
  (page: number) =>
    Q.gen(function* (_) {
      const { artworkDataSource } = yield* _(ArtworkDataSource)
      return yield* _(Q.fromRequest(new GetArtworks({ page }), artworkDataSource))
    }),
  App.querySuccessCodec(Artworks.Model, (page) => `getArtworks(${page})`)
)

//
// Components
//

export function ArtworkView({ url }: { url: string }) {
  const commit = App.useQuery(getArtwork, url)

  return <div>{JSON.stringify(commit)}</div>
}

export function ArtworksView() {
  const [page, setPage] = React.useState(1)

  const commits = App.useQuery(getArtworks, page)

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

const HomeClientLayer = L.identity<T.DefaultEnv>()["+++"](
  LiveArtworkRepo["+++"](ClientArtworkDataSource)
)

function Home({ initial }: { initial: string }) {
  return (
    <App.Provider
      sources={[artworkClientDataSource]}
      layer={HomeClientLayer}
      initial={initial}
    >
      <ArtworksView />
    </App.Provider>
  )
}

export async function getServerSideProps() {
  const initial = await pipe(
    Q.gen(function* (_) {
      const page = yield* _(getArtworks(1))
      yield* _(Q.collectAllPar(Chunk.map_(page.data, (_) => getArtwork(_.api_link))))
    }),
    App.collectPrefetch,
    T.provideServiceM(ArtworkRepo)(makeArtworkRepo),
    T.provideService(ArtworkDataSource)({ artworkDataSource }),
    T.runPromise
  )
  return {
    props: {
      initial
    }
  }
}

export default Home
