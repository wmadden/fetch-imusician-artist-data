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
  type: string;
  uri: string;
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
    return (
      await this.assertClient().get<{ artists: ArtistObject[] }>("artists", {
        params: { ids: ids.join(",") },
      })
    ).data.artists;
  }

  private assertClient(): AxiosInstance {
    if (!this.client) throw new Error("Not authenticated");
    return this.client;
  }
}
