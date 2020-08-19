import axios, { AxiosInstance } from "axios";
import * as querystring from "querystring";

export type SpotifyAccessTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: string;
  scope: string;
};

export type ExternalUrlObject = {
  "{key}": string;
  "{value}": string;
};

export type FollowersObject = {
  href: string;
  total: number;
};

export type ImageObject = {
  height: number;
  url: string;
  width: number;
};

export type ArtistObject = {
  id: string;
  external_urls: ExternalUrlObject[];
  followers: FollowersObject;
  genres: string[];
  href: string;
  images: ImageObject[];
  name: string;
  popularity: number;
  type: "artist";
  uri: string;
};

export type SimplifiedArtistObject = Pick<
  ArtistObject,
  "id" | "external_urls" | "uri" | "name" | "type" | "href"
>;

export type SimplifiedAlbumObject = {
  album_group: string;
  album_type: string;
  artists: ArtistObject[];
  available_markets: string[];
  external_urls: ExternalUrlObject[];
  href: string;
  id: string;
  images: ImageObject[];
  name: string;
  release_date: string;
  release_date_precision: string;
  total_tracks: number;
  type: "album";
  uri: string;
};

type PagingObject<Resource> = {
  items: Resource[];
  limit: number;
  next: string | null;
  offset: number;
  previous: string | null;
  total: number;
  href: string;
};

async function getAuthToken(
  clientId: string,
  clientSecret: string
): Promise<SpotifyAccessTokenResponse> {
  const base64EncodedClientIdAndSecret = Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64");

  const basicAuthHeader = `Basic ${base64EncodedClientIdAndSecret}`;

  const body = querystring.stringify({ grant_type: "client_credentials" });

  const response = await axios.post<SpotifyAccessTokenResponse>(
    "https://accounts.spotify.com/api/token",
    body,
    {
      headers: { Authorization: basicAuthHeader },
    }
  );

  return response.data;
}

const TOO_MANY_REQUESTS = 429;
const MAX_RETRIES = 10;

async function retryAfterRateLimitApplied<T>(
  innerFn: () => Promise<T>,
  previousRetries: number = 0
): Promise<T> {
  try {
    return await innerFn();
  } catch (error) {
    if (
      error.response?.status !== TOO_MANY_REQUESTS ||
      previousRetries >= MAX_RETRIES
    ) {
      throw error;
    }

    const secondsToWait: number = parseInt(
      error.response.headers["retry-after"],
      10
    );

    console.log(
      `Rate limit reached, waiting ${secondsToWait} seconds before continuing (retry ${
        previousRetries + 1
      })...`
    );

    await new Promise((resolve) => setTimeout(resolve, secondsToWait * 1000));

    return await retryAfterRateLimitApplied(innerFn, previousRetries + 1);
  }
}

export class SpotifyClient {
  private accessToken?: SpotifyAccessTokenResponse;
  private client?: AxiosInstance;

  async authenticate(clientId: string, clientSecret: string) {
    this.accessToken = await getAuthToken(clientId, clientSecret);
    this.client = axios.create({
      baseURL: "https://api.spotify.com/v1",
      headers: {
        Authorization: `Bearer ${this.accessToken.access_token}`,
      },
    });
  }

  async getArtists(ids: string[]): Promise<ArtistObject[]> {
    const response = await retryAfterRateLimitApplied(() =>
      this.assertClient().get<{ artists: ArtistObject[] }>("artists", {
        params: { ids: ids.join(",") },
      })
    );

    return response.data.artists;
  }

  async getLatestAlbum(
    artistId: string
  ): Promise<SimplifiedAlbumObject | undefined> {
    const response = await retryAfterRateLimitApplied(() =>
      this.assertClient().get<PagingObject<SimplifiedAlbumObject>>(
        `artists/${artistId}/albums`,
        {
          params: { limit: 1 },
        }
      )
    );
    return response.data.items[0];
  }

  private assertClient(): AxiosInstance {
    if (!this.client) throw new Error("Not authenticated");
    return this.client;
  }
}
