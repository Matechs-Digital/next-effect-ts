// tracing: off

import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import type * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import { pipe } from "@effect-ts/core/Function"
import { matchTag } from "@effect-ts/core/Utils"
import * as Q from "@effect-ts/query/Query"
import * as React from "react"

import { App } from "../src/App"
import { artworkClientDataSource, ClientArtworkDataSource } from "../src/DataSources"
import { getArtwork, getArtworks } from "../src/Queries"
import { LiveArtworkRepo } from "../src/Repositories"
import { serverRuntime } from "../src/Server"

//
// Components
//

export function ArtworkView({ url }: { url: string }) {
  const artwork = App.useQuery(getArtwork, url)

  return (
    <div>
      {artwork["|>"](
        matchTag({
          Done: (_) =>
            _.current["|>"](
              matchTag({
                Left: (_) => <div>Error...</div>,
                Right: (_) => <div>{_.right.data.title}</div>
              })
            ),
          Loading: (_) => <div>Loading...</div>,
          Refreshing: () => <div>Loading...</div>
        })
      )}
    </div>
  )
}

export function ArtworksView() {
  const [page, setPage] = React.useState(1)
  const artworks = App.useQuery(getArtworks, page)

  return (
    <div>
      {artworks["|>"](
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

export function HomeView({ initial }: { initial: string }) {
  return (
    <App.Provider
      initial={initial}
      sources={[artworkClientDataSource]}
      layer={L.identity<T.DefaultEnv>()["+++"](
        LiveArtworkRepo["+++"](ClientArtworkDataSource)
      )}
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
    serverRuntime.runPromise
  )
  return {
    props: {
      initial
    }
  }
}

export default HomeView
