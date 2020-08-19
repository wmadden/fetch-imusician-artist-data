import { SpotifyClient } from "./spotify";

async function main(argv: string[]) {
  const clientId = argv[2];
  const clientSecret = argv[3];
  const artistIds = argv.slice(4);

  const spotify = new SpotifyClient();
  await spotify.authenticate(clientId, clientSecret);
  const artists = await spotify.getArtists(artistIds);

  console.log("id\tname\tpopularity (0-100)\tfollowers");
  artists.forEach((artist) => {
    console.log(
      [artist.id, artist.name, artist.popularity, artist.followers.total].join(
        "\t"
      )
    );
  });
}

main(process.argv);
