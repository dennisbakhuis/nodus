/** Parties API (peer-radar organisation registry). */

import { request } from "./client";

export type PartyRead = {
  id: string;
  name: string;
  slug: string;
  url: string | null;
};

export async function listParties(): Promise<PartyRead[]> {
  return request<PartyRead[]>(`/parties`);
}

export async function createParty(payload: {
  name: string;
  url?: string | null;
}): Promise<PartyRead> {
  return request<PartyRead>(`/parties`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
