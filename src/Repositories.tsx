// tracing: off

import { pipe } from "@effect-ts/core"
import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import { tag } from "@effect-ts/core/Has"

import { parseArtwork, parseArtworks } from "./Domain"
import { httpFetch } from "./Http"

//
// Repositories
//

export function makeArtworkRepo() {
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
}

export interface ArtworkRepo extends ReturnType<typeof makeArtworkRepo> {}
export const ArtworkRepo = tag<ArtworkRepo>()
export const LiveArtworkRepo = L.fromEffect(ArtworkRepo)(T.succeedWith(makeArtworkRepo))
