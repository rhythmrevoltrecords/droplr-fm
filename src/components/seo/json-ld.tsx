import { jsonLdHtml } from "@/lib/structured-data";

/**
 * Renders structured data. A server component on purpose: the JSON goes into the HTML once and
 * never becomes a client prop. The escaping lives in jsonLdHtml, which is the only safe way in.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdHtml(data) }} />;
}
