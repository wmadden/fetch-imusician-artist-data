# fetch-spotify-artist-data

You must have NodeJS 14+ installed.

## Installation

1. Clone the repository
2. `npm install`
3. `npm run build`

## Authenticating with the Spotify API

1. Go to https://developer.spotify.com/dashboard/applications
2. Register an app
3. Copy the "Client ID" in the upper left corner
4. Click "Show client secret" and copy the client secret

## Usage

Run the following on the command line, replacing the elements in CAPS:

```
node out/index.js CLIENT_ID CLIENT_SECRET ARTIST_ID_1 ARTIST_ID_2 ...
```
