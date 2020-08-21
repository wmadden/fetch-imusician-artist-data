import { SpotifyClient, ArtistObject, SimplifiedAlbumObject } from "./spotify";
import * as yargs from "yargs";
import { CastingContext } from "csv-parse";
const csvParse = require("csv-parse");
const csvStringify = require("csv-stringify");
import { readFile, writeFile } from "fs";
import { uniq, chunk, flatten } from "lodash";
import { promisify } from "util";

type RemoteIds = { spotify?: { id: string | null } };

type InputRecord = {
  originalInput: { [key: string]: string | number | Date | undefined };
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

type CsvInputRow = {
  shop_artist_ids: string;
};
async function parseInputCsv(file: string): Promise<InputRecord[]> {
  const fileContent = await promisify(readFile)(file, "utf8");

  function onRecord(record: CsvInputRow, context: CastingContext): InputRecord {
    return {
      originalInput: record,
      shop_artist_ids: record.shop_artist_ids
        ? JSON.parse(record.shop_artist_ids)
        : null,
    };
  }

  return await new Promise<InputRecord[]>((resolve, reject) => {
    csvParse(
      fileContent,
      { columns: true, on_record: onRecord },
      (err: any, data: InputRecord[]) => {
        if (err) reject(err);
        else resolve(data);
      }
    );
  });
}

async function parseInputJson(file: string): Promise<InputRecord[]> {
  const fileContent = await promisify(readFile)(file, "utf8");

  const parsedJson: { shop_artist_ids: string }[] = JSON.parse(fileContent);

  return parsedJson.map((value) => {
    return {
      originalInput: value,
      shop_artist_ids: value.shop_artist_ids
        ? JSON.parse(value.shop_artist_ids)
        : null,
    };
  });
}

type OutputRecord = {
  [key: string]: string | number | Date | undefined;
  spotifyId: string | undefined;
  artistName: string | undefined;
  popularity: number | undefined;
  followers: number | undefined;
  latestAlbumName: string | undefined;
  latestAlbumReleaseDate: string | undefined;
};

function prepareOutputData(
  inputRecords: InputRecord[],
  spotifyIdToArtistObject: { [key: string]: ArtistObject },
  artistIdToLatestAlbumDict: {
    [key: string]: SimplifiedAlbumObject | undefined;
  }
): OutputRecord[] {
  return inputRecords.map(
    ({ originalInput, shop_artist_ids }): OutputRecord => {
      const spotifyId = shop_artist_ids?.spotify?.id || undefined;
      const spotifyArtist = spotifyId
        ? spotifyIdToArtistObject[spotifyId]
        : undefined;
      const latestAlbum = spotifyId
        ? artistIdToLatestAlbumDict[spotifyId]
        : undefined;

      return {
        ...originalInput,
        spotifyId: spotifyId,
        artistName: spotifyArtist?.name,
        popularity: spotifyArtist?.popularity,
        followers: spotifyArtist?.followers.total,
        latestAlbumName: latestAlbum?.name,
        latestAlbumReleaseDate: latestAlbum?.release_date,
      };
    }
  );
}

async function writeOutputCsv(
  path: string,
  outputRecords: OutputRecord[]
): Promise<unknown> {
  const outputString = await promisify(csvStringify)(outputRecords, {
    header: true,
  });
  return promisify(writeFile)(path, outputString);
}

function writeOutputJson(
  path: string,
  outputRecords: OutputRecord[]
): Promise<unknown> {
  return promisify(writeFile)(path, JSON.stringify(outputRecords));
}

async function main({
  clientId,
  clientSecret,
  input,
  output,
  inputFormat,
  outputFormat,
}: Options) {
  const inputRecords = await (inputFormat === "json"
    ? parseInputJson(input)
    : parseInputCsv(input));

  let spotifyIds: string[] = [];
  inputRecords.forEach((artistData) => {
    if (artistData.shop_artist_ids?.spotify?.id) {
      spotifyIds.push(artistData.shop_artist_ids.spotify.id);
    }
  });
  spotifyIds = uniq(spotifyIds);

  const spotifyClient = new SpotifyClient();
  await spotifyClient.authenticate(clientId, clientSecret);

  const spotifyIdToArtistObjectDict: { [key: string]: ArtistObject } = {};
  const artistIdToLatestAlbumDict: {
    [key: string]: SimplifiedAlbumObject | undefined;
  } = {};
  let outputRecords: OutputRecord[] = [];

  try {
    const spotifyIdsInChunksOf50 = chunk(spotifyIds, 50);

    await Promise.all([
      chunkRequests(spotifyIdsInChunksOf50, async (idsChunk, index) => {
        console.log(
          `Fetching artists ${index * 50} - ${index * 50 + 50} / ${
            spotifyIds.length
          }...`
        );
        const artistsChunk = await spotifyClient.getArtists(idsChunk);
        artistsChunk.forEach(
          (artist) => (spotifyIdToArtistObjectDict[artist.id] = artist)
        );
      }),
      chunkRequests(spotifyIds, async (spotifyId, i) => {
        console.log(
          `Fetching latest album for artist ${i} / ${spotifyIds.length}`
        );
        artistIdToLatestAlbumDict[
          spotifyId
        ] = await spotifyClient.getLatestAlbum(spotifyId);
      }),
    ]);

    outputRecords = prepareOutputData(
      inputRecords,
      spotifyIdToArtistObjectDict,
      artistIdToLatestAlbumDict
    );
  } finally {
    console.log(`Writing result to '${output}' as ${outputFormat}...`);

    if (outputFormat === "json") {
      await writeOutputJson(output, outputRecords);
    } else {
      await writeOutputCsv(output, outputRecords);
    }
    console.log(`✅ Done!`);
  }
}

type Options = {
  clientId: string;
  clientSecret: string;
  input: string;
  output: string;
  inputFormat: "json" | "csv";
  outputFormat: "json" | "csv";
};

const options = yargs
  .options({
    clientId: {
      required: true,
      description: "Client ID of your Spotify app",
      type: "string",
    },
    clientSecret: {
      required: true,
      description: "Client secret of your Spotify app",
      type: "string",
    },
    input: {
      description: "File containing artist data",
      default: "input.json",
    },
    inputFormat: {
      description: "Input file format",
      choices: ["json", "csv"],
      default: "json",
    },
    outputFormat: {
      description: "Output file format",
      choices: ["json", "csv"],
      default: "csv",
    },
    output: {
      description: "File to write result data to",
      default: "out.csv",
    },
  })
  .usage(
    `Usage: $0 --clientId=ID --clientSecret=SECRET --input=FILE --output=FILE
  
  See README for how to obtain Spotify credentials`
  ).argv as Options;

main(options);
