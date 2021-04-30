// tracing: off

import { pipe } from "@effect-ts/core"
import type * as Chunk from "@effect-ts/core/Collections/Immutable/Chunk"
import * as T from "@effect-ts/core/Effect"
import * as L from "@effect-ts/core/Effect/Layer"
import * as Ref from "@effect-ts/core/Effect/Ref"
import { tag } from "@effect-ts/core/Has"
import type { _A } from "@effect-ts/core/Utils"
import * as CRM from "@effect-ts/query/CompletedRequestMap"
import * as DS from "@effect-ts/query/DataSource"

import { clientDataSource } from "../goods/appEnvironmet"
import { ArtworkRepo } from "./Repositories"
import type { GetArtwork, GetArtworks } from "./Requests"

//
// Data Sources
//

export const artworkServerDataSource = DS.makeBatched("ArticMuseum")(
  (requests: Chunk.Chunk<GetArtworks | GetArtwork>) =>
    T.gen(function* (_) {
      const { getArtwork, getArtworks } = yield* _(ArtworkRepo)

      const crm = yield* _(Ref.makeRef(CRM.empty))

      yield* _(
        T.forEachPar_(
          requests,
          T.matchTag({
            GetArtwork: ({ url }, r) =>
              pipe(
                getArtwork(url),
                T.either,
                T.chain((res) => Ref.update_(crm, CRM.insert(r, res)))
              ),
            GetArtworks: ({ page }, r) =>
              pipe(
                getArtworks(page),
                T.either,
                T.chain((res) => Ref.update_(crm, CRM.insert(r, res)))
              )
          })
        )
      )

      return yield* _(Ref.get(crm))
    })
)

export const artworkClientDataSource = artworkServerDataSource["|>"](clientDataSource)

export const makeArtworkClientDataSource = T.succeedWith(() => {
  return {
    artworkDataSource: artworkClientDataSource as typeof artworkServerDataSource
  }
})

export interface ArtworkDataSource extends _A<typeof makeArtworkClientDataSource> {}
export const ArtworkDataSource = tag<ArtworkDataSource>()
export const ClientArtworkDataSource = L.fromEffect(ArtworkDataSource)(
  makeArtworkClientDataSource
)
