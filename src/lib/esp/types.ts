// ESP (email service provider) sync — shared types.
//
// droplr collects fans two ways (pre-savers who ticked "news", and imported mailable contacts) and
// pushes them into the label's OWN audience in the tool they already use. v1 ships Mailchimp; the
// adapter shape below is what any future provider (Klaviyo, ActiveCampaign) implements.

export const ESP_PROVIDERS = ["mailchimp"] as const;
export type EspProvider = (typeof ESP_PROVIDERS)[number];
export const isEspProvider = (v: unknown): v is EspProvider =>
  typeof v === "string" && (ESP_PROVIDERS as readonly string[]).includes(v);

export const ESP_PROVIDER_LABEL: Record<EspProvider, string> = { mailchimp: "Mailchimp" };

/** One mailable fan, as droplr knows them. Everyone here has marketing consent by construction. */
export type AudienceMember = { email: string; name: string | null; country: string | null };

export type EspList = { id: string; name: string };

/** Result of pushing the audience to a provider. */
export type EspSyncResult = {
  attempted: number;
  upserted: number;
  failed: number;
  /** true when we stopped on the time budget and should be re-invoked. */
  stoppedEarly: boolean;
  error?: string;
};

export interface EspAdapter {
  provider: EspProvider;
  /** Confirm the key works and list the audiences the label can target. Throws EspAuthError on a bad key. */
  listAudiences(apiKey: string): Promise<EspList[]>;
  /** Idempotently upsert members into a list. Never resurrects someone who unsubscribed in the ESP. */
  upsertMembers(
    apiKey: string,
    listId: string,
    members: AudienceMember[],
    opts: { deadline: number; tag: string | null },
  ): Promise<EspSyncResult>;
}

/** A bad / revoked key, or no access to the account. Surfaced to the label as "reconnect". */
export class EspAuthError extends Error {}
/** The chosen list is gone. Surfaced as "pick an audience again". */
export class EspListError extends Error {}
