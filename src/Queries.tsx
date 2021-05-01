import * as Q from "@effect-ts/query/Query"
import * as RQ from "@effect-ts/react/Query"
import type * as MO from "@effect-ts/schema"

import { ArtworkDataSource } from "./DataSources"
import type { ArtworkApiLink } from "./Domain"
import { Artwork, Artworks } from "./Domain"
import { GetArtwork, GetArtworks } from "./Requests"

//
// Queries
//

export const getArtwork = RQ.query(
  (url: ArtworkApiLink) =>
    Q.gen(function* (_) {
      const { artworkDataSource } = yield* _(ArtworkDataSource)
      return yield* _(Q.fromRequest(new GetArtwork({ url }), artworkDataSource))
    }),
  RQ.successCodec(Artwork.Model, (url) => `getArtwork(${url})`)
)

export const getArtworks = RQ.query(
  (page: MO.Int) =>
    Q.gen(function* (_) {
      const { artworkDataSource } = yield* _(ArtworkDataSource)
      return yield* _(Q.fromRequest(new GetArtworks({ page }), artworkDataSource))
    }),
  RQ.successCodec(Artworks.Model, (page) => `getArtworks(${page})`)
)
