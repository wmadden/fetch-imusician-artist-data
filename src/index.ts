import { SpotifyClient, ArtistObject, SimplifiedAlbumObject } from "./spotify";
import * as yargs from "yargs";
import { readFile, writeFile, write } from "fs";
import { uniq, chunk, flatten } from "lodash";

type RemoteIds = { spotify?: { id: string | null } };

type ArtistData = {
  shop_artist_ids: RemoteIds | null;
};

async function chunkRequests<InputElement, Result>(
  inputArray: InputElement[],
  requestFn: (value: InputElement, i: number) => Promise<Result>,
  concurrentRequests: number = 10
): Promise<Result[]> {
  const chunks = chunk(inputArray, concurrentRequests);
  const result: Result[][] = [];

  for (let i = 0; i < chunks.length; i += 1) {
    result.push(
      await Promise.all(
        chunks[i].map((value, index) =>
          requestFn(value, i * concurrentRequests + index)
        )
      )
    );
  }

  return flatten(result);
}

async function parseInputFile(file: string): Promise<ArtistData[]> {
  return new Promise((resolve, reject) => {
    readFile(file, "utf8", (err, data) => {
      if (err) reject(err);
      const parsedJson: { shop_artist_ids: string }[] = JSON.parse(data);

      const artistDataArray = parsedJson.map((value) => {
        return {
          ...value,
          shop_artist_ids: JSON.parse(value.shop_artist_ids),
        };
      });

      resolve(artistDataArray);
    });
  });
}

function writeOutput(
  artists: ArtistObject[],
  artistIdToLatestAlbumDict: {
    [key: string]: SimplifiedAlbumObject | undefined;
  },
  output: string
) {
  console.log(`Writing result to '${output}'...`);

  const csvData =
    `spotifyId,name,popularity,followers,latest album name,latest album release date\n` +
    artists
      .map(({ id, name, popularity, followers: { total: followers } }) =>
        [
          id,
          name,
          popularity,
          followers,
          artistIdToLatestAlbumDict[id]?.name,
          artistIdToLatestAlbumDict[id]?.release_date,
        ].join(",")
      )
      .join("\n");

  writeFile(output, csvData, (err) => {
    if (err) throw err;
    console.log(`✅ Done!`);
  });
}

async function main({
  clientId,
  clientSecret,
  input,
  output,
}: {
  clientId: string;
  clientSecret: string;
  input: string;
  output: string;
}) {
  const artistDataArray = await parseInputFile(input);

  let spotifyIds: string[] = [];
  artistDataArray.forEach((artistData) => {
    if (artistData.shop_artist_ids?.spotify?.id) {
      spotifyIds.push(artistData.shop_artist_ids.spotify.id);
    }
  });
  spotifyIds = uniq(spotifyIds);

  const spotifyClient = new SpotifyClient();
  await spotifyClient.authenticate(clientId, clientSecret);

  let artists: ArtistObject[] = [];
  let artistIdToLatestAlbumDict: {
    [key: string]: SimplifiedAlbumObject | undefined;
  } = {};

  try {
    const spotifyIdsInChunksOf50 = chunk(spotifyIds, 50);

    const chunkedArtists = await chunkRequests(
      spotifyIdsInChunksOf50,
      async (idsChunk, index) => {
        console.log(
          `Fetching artists ${index * 50} - ${index * 50 + 50} / ${
            spotifyIds.length
          }...`
        );
        return await spotifyClient.getArtists(idsChunk);
      }
    );
    artists = flatten(chunkedArtists);

    await chunkRequests(artists, async (artist, i) => {
      console.log(`Fetching latest album for artist ${i} / ${artists.length}`);
      artistIdToLatestAlbumDict[artist.id] = await spotifyClient.getLatestAlbum(
        artist.id
      );
    });
  } finally {
    writeOutput(artists, artistIdToLatestAlbumDict, output);
  }
}

const options = yargs
  .usage(
    `Usage: $0 --clientId=ID --clientSecret=SECRET --input=FILE --output=FILE
  
  See README for how to obtain Spotify credentials`
  )
  .describe("clientId", "Client ID of your Spotify app")
  .string("clientId")
  .describe("clientSecret", "Client secret of your Spotify app")
  .string("clientSecret")
  .describe("input", "JSON file containing artist data")
  .default("input", "input.json")
  .describe("output", "File to write result data to")
  .default("output", "out.csv")
  .demandOption(["clientId", "clientSecret"]).argv;

main(options);
