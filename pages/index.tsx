import * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import { flow, pipe } from "@effect-ts/core/Function"
import * as O from "@effect-ts/core/Option"
import { matchTag } from "@effect-ts/core/Utils"
import * as Q from "@effect-ts/query/Query"
import * as RQ from "@effect-ts/react/Query"
import * as MO from "@effect-ts/schema"
import * as Parser from "@effect-ts/schema/Parser"
import type { NextPageContext } from "next"
import Link from "next/link"
import { useRouter } from "next/router"
import * as React from "react"

import { App, ClientEnv } from "../src/AppEnv"
import { artworkClientDataSource } from "../src/DataSources"
import type { ArtworkApiLink } from "../src/Domain"
import { getArtwork, getArtworks } from "../src/Queries"
import { serverRuntime } from "../src/Server"

//
// Components
//

export function ArtworkView({ url }: { url: ArtworkApiLink }) {
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

export const getPage = flow(
  Parser.for(
    MO.required({
      page: MO.stringInt
    })
  ),
  ({ effect }): MO.Int =>
    pipe(
      effect,
      O.fromEither,
      O.map(({ tuple: [{ page }] }) => page),
      O.getOrElse(() => 1 as MO.Int)
    )
)

export function ArtworksView() {
  const router = useRouter()
  const page = getPage(router.query)
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
                      Chunk.map(({ api_link }) => (
                        <ArtworkView url={api_link} key={api_link} />
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
          <>
            <Link
              href={{
                pathname: "/",
                query: { page: page - 1 }
              }}
            >
              <a>Prev</a>
            </Link>{" "}
          </>
        )}
        <Link
          href={{
            pathname: "/",
            query: { page: page + 1 }
          }}
        >
          <a>Next</a>
        </Link>
      </div>
    </div>
  )
}

export async function getServerSideProps(ctx: NextPageContext) {
  const prefetch = await pipe(
    Q.gen(function* (_) {
      const page = yield* _(getArtworks(getPage(ctx.query)))
      yield* _(Q.collectAllPar(Chunk.map_(page.data, (_) => getArtwork(_.api_link))))
    }),
    RQ.prefetch,
    serverRuntime.runPromise
  )
  return {
    props: {
      prefetch
    }
  }
}

export function HomeView({ prefetch }: { prefetch: string }) {
  return (
    <App.Provide
      prefetch={prefetch}
      layer={ClientEnv}
      sources={[artworkClientDataSource]}
    >
      <ArtworksView />
    </App.Provide>
  )
}

export default HomeView
