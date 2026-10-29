import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Crate Control Tower" },
      { name: "description", content: "Unify crate deliveries and returns across depots with a service-oriented control tower." },
      { property: "og:title", content: "Crate Control Tower" },
      { property: "og:description", content: "Reverse-logistics for reusable crates: gateway, registry, event bus and live balances." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  beforeLoad: () => { throw redirect({ to: "/auth" }); },
});
